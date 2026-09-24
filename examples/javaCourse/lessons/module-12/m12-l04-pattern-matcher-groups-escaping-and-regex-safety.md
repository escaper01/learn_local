# Pattern, Matcher, groups, escaping, and regex safety

Regular expressions let you describe a *shape* of text — "a sequence of digits," "a date followed by a colon and a message" — instead of hard-coding exact characters, and Java's `java.util.regex` package (`Pattern` and `Matcher`) is the standard way to compile and apply them. Used carelessly, though, regexes are also a common source of subtle bugs: forgetting that `.` matches almost any character, confusing `matches()` (the whole string) with `find()` (anywhere in the string), and compiling patterns built from untrusted input without ever thinking about what an adversarial input could do to them.

What you will learn:

- `Pattern.compile` and `Matcher`: compiling a regex once and reusing it, versus `String.matches` for one-off checks
- `matches()` versus `find()`: matching an entire string versus finding a match anywhere inside it
- Capturing groups, both numbered (`group(1)`) and named (`group("name")`), and optional groups that may not participate in a match
- Escaping special characters correctly, and using `Pattern.quote` to safely match literal, untrusted text
- Why some historically "catastrophic" regex patterns are less dangerous on a modern JVM than security folklore suggests — and why defensive habits are still worth keeping anyway

## Pattern and Matcher: compiling once, matching many times

`Pattern.compile(regex)` parses a regex string once into a reusable `Pattern` object; calling `.matcher(text)` against it produces a `Matcher` that can then be used to search that specific piece of text. `String.matches(regex)` is a convenience shortcut for a one-off check, but it silently recompiles the pattern every single time it is called — fine for a single use, wasteful inside a loop.

```java
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class PatternMatcherBasics {
    public static void main(String[] args) {
        Pattern digits = Pattern.compile("\\d+");

        String text = "Order 42 shipped, invoice 7781 issued";
        Matcher matcher = digits.matcher(text);
        while (matcher.find()) {
            System.out.println("found: " + matcher.group() + " at [" + matcher.start() + "," + matcher.end() + ")");
        }

        System.out.println("matches() on the whole text: " + digits.matcher(text).matches());
        System.out.println("matches() on just \"42\": " + digits.matcher("42").matches());

        System.out.println("String.matches (same as Pattern.matches): " + "42".matches("\\d+"));
        System.out.println("compiling once and reusing is preferred over repeated String.matches calls in a loop");
    }
}
```

Output:

```text
found: 42 at [6,8)
found: 7781 at [26,30)
matches() on the whole text: false
matches() on just "42": true
String.matches (same as Pattern.matches): true
compiling once and reusing is preferred over repeated String.matches calls in a loop
```

`\\d+` (a Java string literal containing the two-character regex `\d+`, "one or more digits") is compiled once into `digits`, then reused for every call. `matcher.find()` repeatedly searches forward through the text for the *next* match, so calling it in a `while` loop visits every occurrence, each one reporting its own `start()`/`end()` character positions. Note the difference in the last two lines: `digits.matcher(text).matches()` is `false` — because `matches()` demands the **entire** string be one match, and `"Order 42 shipped..."` is not entirely digits — while `digits.matcher("42").matches()` is `true`, because `"42"` on its own genuinely is nothing but digits from start to end.

## matches() versus find(): the single most common regex mistake in real code

This distinction is worth its own dedicated example, because confusing the two is one of the most common regex bugs in real applications: code that means "does this text *contain* a match" but accidentally writes `matches()` (demanding the whole string be the match), or code that means "is this whole string valid" but accidentally writes `find()` (which would accept a valid substring embedded inside otherwise-invalid text).

```java
import java.util.regex.Pattern;

public class MatchesVsFind {
    public static void main(String[] args) {
        Pattern courseCode = Pattern.compile("[A-Z]{2}-\\d{4}");

        String exact = "JV-0021";
        String embedded = "prefix JV-0021 suffix";

        System.out.println("exact input:");
        System.out.println("  matches(): " + courseCode.matcher(exact).matches());
        System.out.println("  find():    " + courseCode.matcher(exact).find());

        System.out.println("embedded in other text:");
        System.out.println("  matches(): " + courseCode.matcher(embedded).matches());
        System.out.println("  find():    " + courseCode.matcher(embedded).find());
    }
}
```

Output:

```text
exact input:
  matches(): true
  find():    true
embedded in other text:
  matches(): false
  find():    true
```

`[A-Z]{2}-\d{4}` describes "two uppercase letters, a hyphen, four digits" — exactly matching `"JV-0021"`, so both `matches()` and `find()` agree there. Once that same valid code is *embedded* inside `"prefix JV-0021 suffix"`, though, `matches()` correctly reports `false` (the whole string is not just a course code), while `find()` still reports `true` (a course code exists *somewhere* inside the string). If you are **validating** a whole field — a form input, a configuration value, an entire line — you almost always want `matches()`; if you are **searching** for occurrences inside a larger body of text — scanning a log file, extracting tokens from a sentence — you want `find()`. Using the wrong one does not throw an exception or fail loudly; it simply accepts or rejects the wrong things, silently.

## Capturing groups: numbered, named, and optional

Parentheses in a regex create a **capturing group**, letting you pull out a specific piece of what matched rather than just knowing that a match occurred. Groups can be referenced by position (`group(1)`, `group(2)`, ...), given an explicit name (`group("name")`), or made optional with `?` on the group itself, in which case an unmatched optional group returns `null` rather than throwing.

```java
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class GroupsDemo {
    public static void main(String[] args) {
        Pattern logLine = Pattern.compile("(\\d{4}-\\d{2}-\\d{2}) (\\w+): (.+)");
        String line = "2024-06-15 ERROR: connection refused";

        Matcher matcher = logLine.matcher(line);
        if (matcher.matches()) {
            System.out.println("full match: " + matcher.group(0));
            System.out.println("date:       " + matcher.group(1));
            System.out.println("level:      " + matcher.group(2));
            System.out.println("message:    " + matcher.group(3));
        }

        Pattern named = Pattern.compile("(?<date>\\d{4}-\\d{2}-\\d{2}) (?<level>\\w+): (?<message>.+)");
        Matcher namedMatcher = named.matcher(line);
        if (namedMatcher.matches()) {
            System.out.println("named date:  " + namedMatcher.group("date"));
            System.out.println("named level: " + namedMatcher.group("level"));
        }

        Pattern optional = Pattern.compile("(\\d+)(?:\\.(\\d+))?");
        Matcher withDecimal = optional.matcher("42.5");
        Matcher withoutDecimal = optional.matcher("42");
        withDecimal.matches();
        withoutDecimal.matches();
        System.out.println("42.5 -> whole=" + withDecimal.group(1) + " fraction=" + withDecimal.group(2));
        System.out.println("42 -> whole=" + withoutDecimal.group(1) + " fraction=" + withoutDecimal.group(2));
    }
}
```

Output:

```text
full match: 2024-06-15 ERROR: connection refused
date:       2024-06-15
level:      ERROR
message:    connection refused
named date:  2024-06-15
named level: ERROR
42.5 -> whole=42 fraction=5
42 -> whole=42 fraction=null
```

`group(0)` (or plain `group()`) always means "the entire match," with numbered groups `group(1)`, `group(2)`, `group(3)` corresponding to the parentheses in left-to-right order of their opening `(`. `(?<date>...)` is a **named** group — functionally identical to a numbered one, but referenced by `group("date")` instead of a position, which is far more readable once a pattern has more than two or three groups. `(?:\.(\d+))?` combines two ideas at once: `(?:...)` is a **non-capturing** group (it groups for the `?` quantifier without producing its own numbered capture), and the trailing `?` makes the whole thing optional — so `"42"` (with no decimal part at all) still matches, and the inner capturing group `group(2)` correctly returns `null` rather than throwing, since a group that never participated in the match simply has no value to report.

## Escaping special characters and Pattern.quote

Characters like `.`, `*`, `+`, `(`, `)`, `[`, and `$` are regex metacharacters with special meaning; to match one of them **literally**, it must be escaped with a backslash — and because backslash is itself a Java string-escape character, a regex backslash inside a Java string literal needs to be written as `\\`.

```java
import java.util.regex.Pattern;

public class EscapingSpecialChars {
    public static void main(String[] args) {
        String price = "Total: $19.99 (tax included)";

        System.out.println("unescaped dot matches any char: " + price.matches(".*19.99.*"));
        System.out.println("unescaped dot also matches 19X99: " + "19X99".matches("19.99"));

        System.out.println("escaped dot matches only a literal dot: " + "19.99".matches("19\\.99"));
        System.out.println("escaped dot rejects 19X99: " + "19X99".matches("19\\.99"));

        String literalPrice = "$19.99";
        String escapedForRegex = Pattern.quote(literalPrice);
        System.out.println("Pattern.quote produces: " + escapedForRegex);
        System.out.println("matches the exact literal text: " + price.contains(literalPrice));
        System.out.println("using it safely in a regex: " + java.util.regex.Pattern.compile(escapedForRegex).matcher(price).find());
    }
}
```

Output:

```text
unescaped dot matches any char: true
unescaped dot also matches 19X99: true
escaped dot matches only a literal dot: true
escaped dot rejects 19X99: false
Pattern.quote produces: \Q$19.99\E
matches the exact literal text: true
using it safely in a regex: true
```

An unescaped `.` matches *any single character*, which is why `"19X99".matches("19.99")` is `true` even though there is no literal dot in `"19X99"` — the `.` happily matched the `X`. Escaping it as `\.` (written `"\\."` in Java source) restricts it to matching only an actual dot character, correctly rejecting `"19X99"`. `Pattern.quote(text)` is the safe, general-purpose tool for the common real-world need of "I have a literal string — possibly typed by a user, possibly containing `$`, `.`, `(`, or any other metacharacter — and I need to search for it *literally* inside a regex-based API": it wraps the text in `\Q...\E`, a special "everything between here is literal" escape sequence, so every metacharacter inside it is treated as a plain character regardless of what it is.

> **Warning:** Never build a regex by concatenating raw, unescaped user- or course-supplied text directly into a pattern string. If that text needs to be matched literally, wrap it with `Pattern.quote` first; if it is meant to define pattern *syntax*, it must come from your own trusted code, never from external input.

## Regex safety: catastrophic backtracking, and what modern Java actually does about it

Backtracking regex engines — including `java.util.regex` — evaluate certain pathological patterns by trying an enormous number of ways to split the input among nested, overlapping quantifiers, a phenomenon commonly called "catastrophic backtracking" or ReDoS (regular expression denial of service). The textbook example taught for years is a nested quantifier like `(a+)+` followed by something that ultimately fails to match, forcing the engine to explore an exponential number of groupings before giving up.

```java
import java.util.regex.Pattern;

public class CatastrophicBackreference {
    static long timeMatch(String regex, String input, long timeoutMillis) throws InterruptedException {
        long start = System.currentTimeMillis();
        Thread worker = new Thread(() -> Pattern.matches(regex, input));
        worker.setDaemon(true);
        worker.start();
        worker.join(timeoutMillis);
        long elapsed = System.currentTimeMillis() - start;
        if (worker.isAlive()) {
            System.out.println("  still running after " + timeoutMillis + " ms, abandoning (this is the danger)");
            return -1;
        }
        return elapsed;
    }

    public static void main(String[] args) throws InterruptedException {
        String safeRegex = "a+b";
        String dangerousRegex = "(a+)+b";
        String input = "a".repeat(40) + "c";

        System.out.println("safe regex \"" + safeRegex + "\" on a non-matching input of size " + input.length() + ":");
        long safeTime = timeMatch(safeRegex, input, 3000);
        System.out.println("  finished in " + safeTime + " ms");

        System.out.println("dangerous-looking regex \"" + dangerousRegex + "\" on the identical input:");
        long dangerousTime = timeMatch(dangerousRegex, input, 3000);
        if (dangerousTime >= 0) {
            System.out.println("  finished in " + dangerousTime + " ms");
        }
    }
}
```

Output:

```text
safe regex "a+b" on a non-matching input of size 41:
  finished in 1 ms
dangerous-looking regex "(a+)+b" on the identical input:
  finished in 2 ms
```

This result is genuinely worth pausing on: `(a+)+b`, the canonical textbook example of catastrophic backtracking, finishes in about a millisecond on Java 21 — it does **not** hang, even though older regex-safety folklore (accurate for many other languages and older Java versions) says it should. Modern versions of the JDK's regex engine detect and short-circuit several classic "nested quantifier over a simple repeated group" shapes like this one, specifically to prevent exactly this kind of blowup. This is not a reason to stop caring about regex safety — it is a reason to be precise about what you actually know: a specific pattern being fine on today's JDK does not mean every nested-quantifier pattern is safe on every regex engine, every language runtime your code might later run on, or even a future Java version. The general defensive habits below cost nothing and remain worth keeping regardless of which specific patterns a given JVM happens to optimize away.

## What happens under the hood

`Pattern.compile` parses a regex string into an internal tree of match "nodes," then `matcher(text)` walks that tree against the input using backtracking: when a greedy quantifier's first attempt does not lead to an overall match, the engine backs up and tries a different split. Named groups, non-capturing groups, and alternation are all represented as different node types in that same tree; `Pattern.quote`'s `\Q...\E` is handled specially by disabling metacharacter interpretation entirely for everything between the two markers, rather than escaping each character individually.

## Common mistakes

**1. Confusing `matches()` and `find()`.** `matches()` requires the entire string to match; `find()` succeeds if a match exists anywhere within it. Choose based on whether you are validating a whole value or searching within a larger text.

**2. Forgetting that `.` matches almost any character**, not a literal dot — use `\.` when a literal dot is actually intended.

**3. Concatenating untrusted or user-supplied text directly into a regex pattern string**, rather than using `Pattern.quote` for text that should be matched literally.

**4. Repeatedly calling `String.matches(regex)` inside a loop**, which recompiles the same pattern on every call; compile it once outside the loop with `Pattern.compile` instead.

**5. Assuming a specific nested-quantifier pattern is either universally dangerous or universally safe.** Behavior depends on the specific pattern, the specific engine, and the specific JDK version; when in doubt, bound input size and consider a timeout-guarded evaluation for regexes built from untrusted sources.

## Best practices

- Compile a `Pattern` once with `Pattern.compile` and reuse it, rather than repeatedly calling `String.matches` inside a loop.
- Choose `matches()` for whole-string validation and `find()` for searching within larger text; they are not interchangeable.
- Use named groups (`(?<name>...)`) once a pattern has more than two or three capturing groups, for readability at the call site.
- Wrap literal, untrusted text with `Pattern.quote` before using it inside a regex, rather than concatenating it raw.
- Never compile a regex pattern *string* that comes directly from untrusted input; if pattern syntax must vary, restrict it to a small, application-controlled set of known-safe options.
- For regexes evaluated against untrusted, unbounded-length input, consider bounding input length up front and, for genuinely user-controlled patterns, running the match with a timeout guard as defense in depth.

## Summary

- `Pattern.compile` produces a reusable compiled regex; `Matcher` applies it to a specific piece of text; `String.matches` is a convenient but less efficient one-off shortcut.
- `matches()` requires the whole string to match; `find()` looks for a match anywhere inside the string — mixing these up is one of the most common real-world regex bugs.
- Capturing groups can be numbered or named; non-capturing groups (`(?:...)`) group without producing a numbered capture; an optional group that does not participate returns `null`.
- Regex metacharacters must be escaped to be matched literally; `Pattern.quote` safely escapes an entire literal string for use inside a regex.
- Catastrophic backtracking is a real historical category of regex risk, but a specific pattern's actual danger depends on the specific engine and JDK version — verify rather than assume, and keep defensive habits (bounding input, avoiding untrusted pattern strings) regardless.

## Practice

Warm-up:

1. Write a regex that matches a simple US-style ZIP code (five digits, optionally followed by a hyphen and four more digits), and test it against both valid and invalid examples using `matches()`.
2. Write a program that uses `find()` in a loop to extract every word starting with an uppercase letter from a sentence of your choosing.
3. Use `Pattern.quote` to safely search for a literal string containing at least one regex metacharacter inside a larger body of text.

Core:

1. Write a regex with three named groups that parses a simple `"key=value; key=value"` configuration line into pairs, and print each key and value using `group("...")`.
2. Write a method `static boolean isValidEmail(String candidate)` using a reasonably strict (not necessarily fully RFC-compliant) email regex, and test it against at least five valid and five invalid examples, explaining any edge case your regex gets wrong.
3. Compare compiling a `Pattern` once outside a loop versus calling `String.matches` inside the same loop 100,000 times, and measure the difference using `System.nanoTime()`.

Challenge:

1. Design a small "template" renderer that finds `{{name}}` placeholders in a string using a regex with a named group, and replaces each one with a value looked up from a `Map<String, String>`, correctly leaving unrecognized placeholders untouched.
2. Research (and briefly document, in a comment) one nested-quantifier regex pattern that still exhibits genuinely slow behavior on your installed JDK version, following the same thread-plus-timeout measurement technique used in this lesson, and explain why it differs from the `(a+)+b` example shown here.

## Check your understanding

1. What is the difference between what `matches()` and `find()` each check, and what kind of bug results from using the wrong one?
2. What is the difference between a numbered capturing group, a named capturing group, and a non-capturing group?
3. Why does an optional capturing group that did not participate in a match return `null` instead of throwing an exception?
4. What does `Pattern.quote` do, and why is it necessary when searching for literal, untrusted text using a regex-based API?
5. Why did the "dangerous-looking" `(a+)+b` pattern not actually hang in this lesson's Java 21 example, and why does that result not mean nested-quantifier regex risk can be safely ignored in general?
6. Why is compiling a `Pattern` once outside a loop preferable to calling `String.matches` repeatedly inside one?
