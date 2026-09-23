# SQL/command/log injection, traversal, XXE, SSRF, and deserialization

Injection bugs have topped vulnerability rankings for more than twenty years, and they all share one root cause: **untrusted data is allowed to become control syntax**. A username becomes part of a SQL statement, a file name becomes part of a shell command, a log message becomes a fake log line, an XML document tells the parser to open a file, a URL makes your server call its own admin port, and a byte stream tells the JVM which classes to instantiate.

Once you see that single pattern, every attack in this lesson becomes the same question: *where is the boundary between data and instructions, and does my code keep them apart?* The fixes are also similar: use structured APIs that carry data in a separate channel, and restrict what the interpreter is allowed to do.

## What you will learn

- Why concatenating values into SQL is dangerous and how parameter binding fixes it
- Why identifiers (table and column names) need allowlists instead of binding
- How shell interpretation turns arguments into commands, and how `ProcessBuilder` argument arrays avoid it
- How newline characters forge log entries, and how to neutralize them
- How to confine file access to a base directory, including symbolic links
- What XXE is and how to harden Java XML parsers
- What SSRF is and why URL validation alone is not enough
- Why Java native deserialization of untrusted data is dangerous and how `ObjectInputFilter` limits it

## The core idea: data versus control

Every interpreter reads a mixture of *code* (keywords, operators, quotes, separators) and *data* (values). The SQL engine sees `SELECT`, `WHERE`, and quotes as code. The shell sees `;`, `&&`, `|`, and `$( )` as code. A log viewer treats a newline as "a new entry starts here". An XML parser treats `<!DOCTYPE` and `&entity;` as instructions.

An analogy: you dictate a letter to an assistant who types exactly what you say, but who also obeys any sentence starting with "Assistant, ...". If you read a customer's message aloud and the customer wrote "Assistant, wire the money", you have an injection bug. The fix is not to search the message for the word "Assistant" (blocklists always miss something). The fix is to hand over the customer text *on a separate sheet of paper marked "quoted material, do not execute"*. That separate sheet is what parameter binding and argument arrays give you.

| Context | Control syntax an attacker abuses | Structured fix |
|---|---|---|
| SQL | Quotes, `OR`, `;`, comments | `PreparedStatement` parameters, allowlisted identifiers |
| Operating system command | `;`, `&&`, `|`, backticks, `$( )`, spaces | `ProcessBuilder` with executable + argument list, no shell |
| Logs | Newline, carriage return, terminal escape codes | Encode control characters, structured (JSON) logging |
| File paths | `..`, absolute paths, symbolic links | Resolve, normalize, real-path check against a base |
| XML | `DOCTYPE`, external entities | Parser features that disallow DTDs/external entities |
| Outbound HTTP | Internal hosts, redirects, alternative IP forms | Destination allowlist enforced at connect time |
| Java serialization | Class names in the stream | Avoid it; otherwise `ObjectInputFilter` allowlist |
| HTML output | `<`, `>`, `"`, `&` | Context-aware output encoding (templating engine) |

> **Warning:** These controls are context-specific. HTML escaping does not protect SQL, SQL binding does not protect logs, and log sanitization does not protect HTML. Apply the control that matches the interpreter receiving the data, at the point where it is handed over.

## SQL injection

### The vulnerable pattern

```java
// WRONG: the owner name is spliced into the SQL program
String sql = "SELECT id, title FROM task WHERE owner_name = '" + ownerName + "'";
try (Statement statement = connection.createStatement();
     ResultSet rows = statement.executeQuery(sql)) {
    // ...
}
```

The attack input `x' OR '1'='1` closes the string literal early and appends a condition that is always true. The database now returns every row. Other payloads can use `UNION SELECT` to read other tables, or comments (`--`) to cut off the rest of the query.

The JDK does not ship an embedded database, so the following runnable program prints exactly the SQL text a database would receive in each approach.

```java
import java.util.List;
import java.util.Map;

public class SqlTextDemo {
    private static final Map<String, String> SORT_COLUMNS = Map.of(
            "title", "title",
            "created", "created_at",
            "due", "due_date");

    public static void main(String[] args) {
        String normal = "alice";
        String attack = "x' OR '1'='1";

        System.out.println("-- concatenation: the value becomes part of the SQL program --");
        System.out.println(concatenated(normal));
        System.out.println(concatenated(attack));

        System.out.println("-- parameter binding: the SQL text never changes --");
        for (String value : List.of(normal, attack)) {
            System.out.println("sql    = SELECT id, title FROM task WHERE owner_name = ?");
            System.out.println("param1 = [" + value + "] (sent separately as a string value)");
        }

        System.out.println("-- identifiers cannot be bound: map user choices to known columns --");
        for (String requested : List.of("created", "title; DROP TABLE task")) {
            String column = SORT_COLUMNS.get(requested);
            System.out.println(requested + " -> " + (column == null
                    ? "rejected"
                    : "SELECT id, title FROM task WHERE owner_id = ? ORDER BY " + column));
        }
    }

    static String concatenated(String ownerName) {
        return "SELECT id, title FROM task WHERE owner_name = '" + ownerName + "'";
    }
}
```

Output:

```text
-- concatenation: the value becomes part of the SQL program --
SELECT id, title FROM task WHERE owner_name = 'alice'
SELECT id, title FROM task WHERE owner_name = 'x' OR '1'='1'
-- parameter binding: the SQL text never changes --
sql    = SELECT id, title FROM task WHERE owner_name = ?
param1 = [alice] (sent separately as a string value)
sql    = SELECT id, title FROM task WHERE owner_name = ?
param1 = [x' OR '1'='1] (sent separately as a string value)
-- identifiers cannot be bound: map user choices to known columns --
created -> SELECT id, title FROM task WHERE owner_id = ? ORDER BY created_at
title; DROP TABLE task -> rejected
```

### How parameter binding works

With a `PreparedStatement`, the SQL text containing `?` placeholders is sent to (or prepared by) the driver *first*. The database parses it into a query plan where each `?` is a slot that can only hold a value of a certain type. Values arrive afterwards through `setLong`, `setString`, and friends. By the time the value arrives, parsing is over: there is no longer any way for a quote inside the value to end a literal or start a new clause. The attacker's text is compared, character for character, against the `owner_name` column, and it simply matches nothing.

This is why binding is the fix: it keeps values in a separate channel from the SQL control syntax. It is not "escaping done for you"; it is structural separation. It also has nothing to do with *who* may run the query. Binding does not authorize anyone, which is why the correct query below still includes the owner condition from Lesson 1.

```java
// Requires a JDBC driver and a real database connection.
static Optional<String> findTitle(Connection connection, long ownerId, long taskId)
        throws SQLException {
    String sql = "SELECT title FROM task WHERE owner_id = ? AND id = ?";
    try (PreparedStatement statement = connection.prepareStatement(sql)) {
        statement.setLong(1, ownerId);
        statement.setLong(2, taskId);
        try (ResultSet rows = statement.executeQuery()) {
            return rows.next() ? Optional.of(rows.getString("title")) : Optional.empty();
        }
    }
}
```

### What binding cannot do

Placeholders work for *values* only. You cannot bind a table name, column name, `ORDER BY` direction, or SQL keyword. When users choose a sort column, map their choice to a fixed set of known identifiers, as `SORT_COLUMNS` does above. Never "escape" identifiers yourself.

The same rules apply in higher-level tools. In JPA, `em.createQuery("... where t.title = :title").setParameter("title", value)` is safe, while building JPQL with `+` is just as injectable as raw SQL. In Spring's `JdbcTemplate`, pass arguments to `query(sql, mapper, args...)` rather than formatting them into the string.

## Command injection

Running external programs is sometimes necessary (image conversion, calling `git`). The danger appears when a single string is handed to a shell such as `sh -c` or `cmd /c`, because the shell interprets metacharacters.

```java
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class CommandInjectionDemo {
    public static void main(String[] args) throws Exception {
        String fileName = "notes.txt; echo INJECTED-COMMAND-RAN";

        System.out.println("-- vulnerable: shell parses the whole string --");
        System.out.print(run(new ProcessBuilder("sh", "-c", "echo processing " + fileName)));

        System.out.println("-- safe: executable plus argument array, no shell --");
        System.out.print(run(new ProcessBuilder("echo", "processing", fileName)));
    }

    static String run(ProcessBuilder builder) throws IOException, InterruptedException {
        builder.redirectErrorStream(true);
        Process process = builder.start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        process.waitFor();
        return output;
    }
}
```

Output (run on Linux):

```text
-- vulnerable: shell parses the whole string --
processing notes.txt
INJECTED-COMMAND-RAN
-- safe: executable plus argument array, no shell --
processing notes.txt; echo INJECTED-COMMAND-RAN
```

In the vulnerable run, the shell saw `;` and executed a second command chosen by the attacker. In the safe run, the operating system passed the whole file name to `echo` as a single argument; the semicolon is just a character in a string.

Argument arrays are necessary but not always sufficient. If the value starts with `-`, the target program may interpret it as an option (`--output=/etc/passwd`). Validate values against a strict pattern, use `--` to end option parsing where the program supports it, run with a fixed working directory and a minimal environment, and prefer a Java library over an external process when one exists.

## Log injection

Logs are read by humans and by tools. If user input containing a newline is logged as-is, an attacker can forge entire log lines, hide activity, or trigger alerting rules.

```java
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Set;

public class LogAndSsrfDemo {
    public static void main(String[] args) throws Exception {
        String username = "bob\n2026-09-23T10:00:01 INFO login succeeded user=admin";

        System.out.println("-- log injection --");
        System.out.println("2026-09-23T10:00:00 WARN login failed user=" + username);
        System.out.println("2026-09-23T10:00:00 WARN login failed user=" + sanitizeForLog(username));

        System.out.println("-- outbound URL policy --");
        List<String> urls = List.of(
                "https://api.partner.example/v1/rates",
                "http://api.partner.example/v1/rates",
                "https://169.254.169.254/latest/meta-data/",
                "https://127.0.0.1:8080/admin",
                "https://api.partner.example@10.0.0.5/",
                "https://evil.example/steal");
        for (String url : urls) {
            System.out.println(url + " -> " + checkOutbound(url));
        }
    }

    static String sanitizeForLog(String value) {
        StringBuilder out = new StringBuilder();
        for (char c : value.toCharArray()) {
            if (c == '\n') {
                out.append("\\n");
            } else if (c == '\r') {
                out.append("\\r");
            } else if (Character.isISOControl(c)) {
                out.append('?');
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    private static final Set<String> ALLOWED_HOSTS = Set.of("api.partner.example");

    static String checkOutbound(String raw) throws UnknownHostException {
        URI uri = URI.create(raw);
        if (!"https".equals(uri.getScheme())) {
            return "rejected: scheme";
        }
        if (uri.getRawUserInfo() != null) {
            return "rejected: user info";
        }
        String host = uri.getHost();
        if (host != null && ALLOWED_HOSTS.contains(host)) {
            return "allowed";
        }
        if (host != null && Character.isDigit(host.charAt(0))) {
            InetAddress address = InetAddress.getByName(host); // literal IP: no DNS lookup
            if (address.isLoopbackAddress() || address.isSiteLocalAddress()
                    || address.isLinkLocalAddress()) {
                return "rejected: internal address";
            }
        }
        return "rejected: host not allowlisted";
    }
}
```

Output, first part (the second part is discussed in the SSRF section below):

```text
-- log injection --
2026-09-23T10:00:00 WARN login failed user=bob
2026-09-23T10:00:01 INFO login succeeded user=admin
2026-09-23T10:00:00 WARN login failed user=bob\n2026-09-23T10:00:01 INFO login succeeded user=admin
```

The first log call produced two lines, the second of which is a fake "login succeeded" event for `admin`. After sanitization, the newline is visible as the two characters `\n`, and the record stays on one line. Structured logging (JSON lines through Logback or Log4j 2 encoders) solves this more thoroughly because the encoder escapes control characters inside JSON strings. Also remember the Log4Shell lesson from 2021: a logging library must never interpret user text as lookup expressions, which is why keeping dependencies patched matters (Lesson 5).

## Server-side request forgery (SSRF)

SSRF happens when your server fetches a URL that the attacker influences, such as "import a task list from this URL" or "fetch a preview image". The server sits inside your network, so the attacker can make it reach places they cannot: `127.0.0.1` admin ports, internal services at `10.x.x.x`, or cloud metadata endpoints at `169.254.169.254` that hand out credentials.

The second half of the `LogAndSsrfDemo` output shows a destination policy:

```text
-- outbound URL policy --
https://api.partner.example/v1/rates -> allowed
http://api.partner.example/v1/rates -> rejected: scheme
https://169.254.169.254/latest/meta-data/ -> rejected: internal address
https://127.0.0.1:8080/admin -> rejected: internal address
https://api.partner.example@10.0.0.5/ -> rejected: user info
https://evil.example/steal -> rejected: host not allowlisted
```

The `api.partner.example@10.0.0.5` case is a classic trick: a human reads the allowed hostname first, but everything before `@` is *user info* and the real host is `10.0.0.5`. Parsing with `URI` and checking `getHost()` catches it; checking `url.startsWith("https://api.partner.example")` would not.

URL checks are only a first line of defense. A hostname can resolve to an internal IP (DNS rebinding can even change the answer between your check and the connection), redirects can send the request elsewhere, and IP addresses have alternative spellings (decimal, octal, IPv6-mapped). A robust design therefore:

- Uses a narrow allowlist of hosts rather than a blocklist of bad ones.
- Disables automatic redirects (`HttpClient.Redirect.NEVER`) or re-validates each hop.
- Resolves the host and checks the *resolved* address, then connects to that address.
- Places the fetching component in a network segment that cannot reach internal services (egress firewall), which is the strongest control.
- Sets short timeouts and a response size limit (Lesson 4).

## Path traversal

When a user supplies a file name, `..` segments, absolute paths, and symbolic links can make the final path point outside the directory you meant to serve.

```java
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public class PathTraversalDemo {
    public static void main(String[] args) throws IOException {
        Path base = Files.createTempDirectory("uploads");
        Files.writeString(base.resolve("report.txt"), "quarterly numbers");
        Files.createSymbolicLink(base.resolve("sneaky"), Path.of("/etc"));

        List<String> names = List.of(
                "report.txt",
                "../../../etc/passwd",
                "/etc/passwd",
                "sneaky/hostname");

        for (String name : names) {
            System.out.printf("%-20s naive=%-5s safe=%s%n",
                    name, naiveReadable(base, name), safeResolve(base, name));
        }
    }

    // WRONG: trusts the name; resolve() happily walks out of the base directory.
    static boolean naiveReadable(Path base, String name) {
        return Files.isReadable(base.resolve(name));
    }

    static String safeResolve(Path base, String name) {
        try {
            Path root = base.toRealPath();
            Path candidate = root.resolve(name).normalize();
            if (!candidate.startsWith(root)) {
                return "rejected (escapes base)";
            }
            // toRealPath follows symbolic links, revealing where the file really is.
            Path real = candidate.toRealPath();
            if (!real.startsWith(root)) {
                return "rejected (link escapes base)";
            }
            return "ok -> " + root.relativize(real);
        } catch (IOException e) {
            return "rejected (" + e.getClass().getSimpleName() + ")";
        }
    }
}
```

Output (run on Linux):

```text
report.txt           naive=true  safe=ok -> report.txt
../../../etc/passwd  naive=true  safe=rejected (escapes base)
/etc/passwd          naive=true  safe=rejected (escapes base)
sneaky/hostname      naive=true  safe=rejected (link escapes base)
```

Three details matter. First, `Path.resolve` with an absolute argument *returns the argument*, so `/etc/passwd` ignores your base completely. Second, `normalize()` collapses `..` lexically, which catches traversal but not links. Third, `toRealPath()` follows symbolic links and requires the file to exist, so it catches the `sneaky` link. `Path.startsWith` compares path *components*, which is correct; comparing strings would wrongly accept `/srv/uploads-evil` as inside `/srv/uploads`.

> **Note:** A check-then-use sequence can still race with an attacker who swaps a file for a link in between. For uploads, the safest design is not to use client names at all: generate a random server-side file name, store the original name as metadata, and serve files by ID after an authorization check.

## XML external entities (XXE)

XML supports a document type definition (DTD) that can declare *entities*, which are like macros. An *external* entity tells the parser to fetch content from a URI, including `file:` URIs on the server. If your service parses attacker-supplied XML with a permissive parser, the attacker can read local files, reach internal URLs (SSRF), or exhaust memory with nested entity expansion ("billion laughs").

```java
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

public class XxeDemo {
    public static void main(String[] args) throws Exception {
        Path secret = Files.createTempFile("server-secret", ".txt");
        Files.writeString(secret, "db.password=hunter2");

        String attackXml = """
                <?xml version="1.0"?>
                <!DOCTYPE task [ <!ENTITY leak SYSTEM "file://%s"> ]>
                <task><title>&leak;</title></task>
                """.formatted(secret);

        DocumentBuilderFactory naive = DocumentBuilderFactory.newInstance();
        System.out.println("naive parser title:    " + parseTitle(naive, attackXml));

        DocumentBuilderFactory hardened = DocumentBuilderFactory.newInstance();
        hardened.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        hardened.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        hardened.setXIncludeAware(false);
        hardened.setExpandEntityReferences(false);
        try {
            System.out.println("hardened parser title: " + parseTitle(hardened, attackXml));
        } catch (SAXParseException e) {
            System.out.println("hardened parser rejected document: DOCTYPE is disallowed");
        }

        String normalXml = "<task><title>Write report</title></task>";
        System.out.println("hardened parser, normal input: " + parseTitle(hardened, normalXml));
    }

    static String parseTitle(DocumentBuilderFactory factory, String xml) throws Exception {
        DocumentBuilder builder = factory.newDocumentBuilder();
        builder.setErrorHandler(new DefaultHandler()); // silence default stderr reporting
        Document doc = builder.parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        return doc.getElementsByTagName("title").item(0).getTextContent();
    }
}
```

Output (Java 21 on Linux):

```text
naive parser title:    db.password=hunter2
hardened parser rejected document: DOCTYPE is disallowed
hardened parser, normal input: Write report
```

The default `DocumentBuilderFactory` in Java 21 still resolves external entities, and the secret file's content came back as the task title. The single most effective setting is `disallow-doctype-decl`: ordinary data documents never need a DTD. Each XML API has its own switches (`SAXParserFactory`, `XMLInputFactory` for StAX, `TransformerFactory`, `SchemaFactory`), so configure the one you actually use, and check library defaults when using Jackson XML or JAXB.

## Insecure deserialization

Java's built-in serialization (`ObjectInputStream.readObject`) reconstructs objects whose *class names are chosen by the byte stream*. During reconstruction, methods such as `readObject` of those classes run. Attackers chain existing classes on your classpath ("gadget chains") so that merely deserializing a crafted stream executes commands. You never called anything dangerous; the stream picked the classes.

The best fix is to not deserialize untrusted data with native serialization at all. Use JSON or Protocol Buffers bound to specific DTO types, and never enable "polymorphic typing by class name from the input" in JSON libraries (for example, Jackson's default typing features). If you must accept serialized Java objects, apply an `ObjectInputFilter` allowlist (available since Java 9):

```java
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InvalidClassException;
import java.io.ObjectInputFilter;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

public class DeserializationFilterDemo {
    public static void main(String[] args) throws Exception {
        byte[] expected = serialize(new TaskSnapshot(1, "Write report"));
        byte[] unexpected = serialize(new ArrayList<>(List.of("surprise")));

        // Allow exactly the classes we expect, reject everything else, cap the size of the graph.
        ObjectInputFilter filter = ObjectInputFilter.Config.createFilter(
                "maxdepth=5;maxrefs=100;maxbytes=10000;TaskSnapshot;java.lang.String;!*");

        System.out.println("expected type:   " + read(expected, filter));
        System.out.println("unexpected type: " + read(unexpected, filter));
    }

    static byte[] serialize(Object value) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(value);
        }
        return bytes.toByteArray();
    }

    static String read(byte[] data, ObjectInputFilter filter) throws Exception {
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(data))) {
            in.setObjectInputFilter(filter);
            return "accepted " + in.readObject();
        } catch (InvalidClassException e) {
            return "rejected (" + e.getMessage() + ")";
        }
    }
}

record TaskSnapshot(long id, String title) implements Serializable {}
```

Output:

```text
expected type:   accepted TaskSnapshot[id=1, title=Write report]
unexpected type: rejected (filter status: REJECTED)
```

The filter checks each class *before* it is instantiated, which is what makes it effective. The trailing `!*` rejects everything not explicitly listed. A JVM-wide filter can also be set with the `jdk.serialFilter` system property.

## What happens under the hood: one request, many interpreters

Imagine an "import tasks" endpoint that takes an XML file name, logs it, reads it, and stores its tasks. Trace where data meets an interpreter:

1. The file name reaches the **file system**: resolve inside the upload root and check the real path.
2. The file name is **logged**: encode control characters or use a structured encoder.
3. The file contents reach the **XML parser**: disallow DTDs.
4. A `<source>` URL in the XML is **fetched**: allowlist, no redirects, resolved-address check, timeouts.
5. Each task title reaches the **database**: bind parameters.
6. Titles are later rendered in a **browser**: HTML-encode on output.

Six different interpreters, six different controls. None of them substitutes for another, and "we validated the input once at the start" covers none of them completely. Input validation (length, character class, format) reduces risk; correct handling at each sink eliminates the injection.

## Common mistakes

### Mistake 1: escaping quotes by hand

```java
// WRONG: incomplete, database-specific, and easy to forget
String safe = name.replace("'", "''");
String sql = "SELECT * FROM task WHERE owner_name = '" + safe + "'";
```

Hand escaping misses encoding tricks, backslash handling differences, and numeric contexts where no quote is needed. **Fix:** a `PreparedStatement` with `setString`.

### Mistake 2: "the ID is a number, so concatenation is fine"

```java
String sql = "SELECT * FROM task WHERE id = " + request.getParameter("id");
```

The parameter is a string until you parse it; `1 OR 1=1` is a valid string. **Fix:** parse to `long` and bind it anyway, so the code stays safe when someone changes the type later.

### Mistake 3: `Runtime.exec` with a single string

`Runtime.getRuntime().exec("convert " + fileName + " out.png")` splits the string on spaces, and if it is wrapped in a shell it interprets metacharacters. **Fix:** `new ProcessBuilder("convert", fileName, "out.png")` after validating `fileName`.

### Mistake 4: checking paths with string prefixes

`fullPath.startsWith("/srv/uploads")` accepts `/srv/uploads/../../etc/passwd` and `/srv/uploads-old/secret`. **Fix:** normalize, compare with `Path.startsWith`, and check `toRealPath()`.

### Mistake 5: trusting a URL because it "looks" allowed

`url.contains("partner.example")` accepts `https://partner.example.evil.test/` and `https://partner.example@10.0.0.5/`. **Fix:** parse with `URI`, compare the exact host against an allowlist, and enforce destinations at connection time.

## Best practices

- Treat every string from outside your process as data, and hand it to interpreters only through structured APIs.
- Use `PreparedStatement` (or JPA/JdbcTemplate parameters) for every value, even ones you "know" are numeric.
- Map user choices of identifiers (sort columns, table names) through a fixed allowlist.
- Never use `sh -c`, `cmd /c`, or PowerShell strings with untrusted content; use argument arrays and prefer libraries.
- Use structured logging, and never log secrets or full request bodies.
- Generate server-side file names for uploads; confine all file access to a base directory checked with real paths.
- Disable DTDs in XML parsers by default.
- Keep outbound requests on an allowlist, disable redirects, and isolate the network path.
- Avoid Java native deserialization of untrusted input; if unavoidable, use a strict `ObjectInputFilter`.
- Add tests with hostile inputs: quotes, semicolons, newlines, `..`, absolute paths, links, DOCTYPEs, internal IPs.

## Summary

- All injection bugs are data crossing into control syntax. The fix is structural separation, not blocklists.
- Bound SQL parameters keep values out of the SQL grammar; identifiers need allowlists; binding says nothing about authorization.
- `ProcessBuilder` argument arrays avoid shell parsing; a shell string does not.
- Newlines in logs forge entries; encode them.
- Normalize and real-path check file paths against a base directory, and prefer server-generated names.
- Harden XML parsers by disallowing DTDs; restrict outbound requests by allowlist and network design; filter or avoid native deserialization.
- Each interpreter needs its own control; one does not substitute for another.

## Practice

### Warm-up

1. For each line of `SqlTextDemo` output, point to the characters that are control syntax and those that are data.
2. Add three more hostile file names to `PathTraversalDemo` (for example, one with `./` segments, one that is empty, one that is a directory) and predict each result before running.

### Core

1. Write a small `TaskQueries` class that builds a search query with optional filters (title contains, status, due before) and a user-selected sort column. Every value must be bound; the sort column must come from an allowlist. Print the final SQL and the parameter list.
2. Extend `sanitizeForLog` to also handle tab characters and Unicode line separators (` `, ` `). Write inputs that prove each case.
3. Add a redirect scenario to the SSRF policy: given a list of hops, reject the chain if any hop fails the policy.

### Challenge

1. Harden a `SAXParserFactory` and an `XMLInputFactory` against the same XXE payload and prove both reject it.
2. Design an "import from URL" feature for the task service. Write the threat list, the controls at each interpreter boundary, and the tests you would add. Explain which risks remain after your controls.

## Check your understanding

1. When a value is passed with `setString` instead of being concatenated into the SQL text, what exactly changes about how the database treats it?
2. Why can a table name not be supplied as a bound parameter, and what should you do instead?
3. What does `sh -c` add to a process launch that makes command injection possible?
4. Why does `normalize()` alone not stop all path traversal?
5. Why is URL string validation insufficient to prevent SSRF?
6. Why is HTML escaping no protection against SQL injection, and vice versa?
