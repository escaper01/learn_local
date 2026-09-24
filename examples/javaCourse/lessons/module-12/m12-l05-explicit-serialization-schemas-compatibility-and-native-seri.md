# Explicit serialization schemas, compatibility, and native serialization risks

Java's built-in object serialization (`implements Serializable`, `ObjectOutputStream`, `ObjectInputStream`) can turn an entire object graph into bytes and back with almost no code at all — which is exactly what makes it dangerous to reach for by default. It quietly couples your wire format to your class's internal shape, it can silently break the moment that shape changes, and reading serialized bytes from a source you do not fully trust is one of the most well-documented remote-code-execution vectors in the Java ecosystem. This lesson covers how to keep native serialization compatible when you do use it, and how to defend against or avoid it when the data does not come from a source you control.

What you will learn:

- `serialVersionUID`: an explicit, chosen version number versus a JVM-computed one based on class shape
- Why adding a field to a `Serializable` class either works fine or throws `InvalidClassException`, entirely depending on whether `serialVersionUID` was declared explicitly
- `ObjectInputFilter`: restricting which classes `ObjectInputStream` is even allowed to construct, as a defense against native-deserialization attacks
- Why the safest, most explicit alternative is often to skip native serialization entirely and hand-write a small versioned wire format
- Why deserializing data from an untrusted source is fundamentally different, security-wise, from deserializing data your own application produced

## serialVersionUID: an explicit version, chosen by you

Every `Serializable` class has a `serialVersionUID` — either one you declare explicitly as a `private static final long`, or, if you omit it, one the JVM computes automatically from the class's fields, methods, and interfaces. `ObjectInputStream` refuses to deserialize a stream whose embedded `serialVersionUID` does not match the currently loaded class's `serialVersionUID`, throwing `InvalidClassException`. The critical difference: an explicit UID is a version *you* control, while a computed one changes — invisibly, without you asking it to — the moment the class's shape changes at all.

First, serializing an instance of a class that **declares** an explicit `serialVersionUID`:

```java
import java.io.Serializable;

public class PersonWithVersion implements Serializable {
    private static final long serialVersionUID = 1L;
    private final String name;
    private final int age;

    public PersonWithVersion(String name, int age) {
        this.name = name;
        this.age = age;
    }

    @Override
    public String toString() {
        return "PersonWithVersion{name=" + name + ", age=" + age + "}";
    }
}
```

```java
import java.io.FileOutputStream;
import java.io.ObjectOutputStream;

public class SerializeWithVersion {
    public static void main(String[] args) throws Exception {
        PersonWithVersion person = new PersonWithVersion("Ada", 30);
        try (ObjectOutputStream out = new ObjectOutputStream(new FileOutputStream("data.ser"))) {
            out.writeObject(person);
        }
        System.out.println("serialized: " + person);
    }
}
```

Output:

```text
serialized: PersonWithVersion{name=Ada, age=30}
```

Now, **without changing `serialVersionUID`**, add a new field (`email`) to the class and recompile — simulating a later version of the application reading data written by an earlier version:

```java
import java.io.Serializable;

public class PersonWithVersion implements Serializable {
    private static final long serialVersionUID = 1L;
    private final String name;
    private final int age;
    private String email;

    public PersonWithVersion(String name, int age) {
        this.name = name;
        this.age = age;
    }

    @Override
    public String toString() {
        return "PersonWithVersion{name=" + name + ", age=" + age + ", email=" + email + "}";
    }
}
```

```java
import java.io.FileInputStream;
import java.io.ObjectInputStream;

public class DeserializeWithVersion {
    public static void main(String[] args) throws Exception {
        try (ObjectInputStream in = new ObjectInputStream(new FileInputStream("data.ser"))) {
            PersonWithVersion person = (PersonWithVersion) in.readObject();
            System.out.println("deserialized with the newer class shape: " + person);
        }
    }
}
```

Output:

```text
deserialized with the newer class shape: PersonWithVersion{name=Ada, age=30, email=null}
```

Because `serialVersionUID` was kept at `1L` in both versions of the class, `ObjectInputStream` accepts the old bytes: the new field simply defaults to `null` (its type's default value), and the fields that did exist in the old data populate normally. This is exactly what "explicit versioning" buys you: the class's *shape* changed, but its *declared version* did not, and you decided that change was compatible.

## The same change, without an explicit version

Now repeat the identical experiment — add a field to a `Serializable` class, and read old data with the new class — except this time the class never declared `serialVersionUID` at all, relying on the JVM's computed default:

```java
import java.io.Serializable;

public class PersonNoVersion implements Serializable {
    private final String name;
    private final int age;

    public PersonNoVersion(String name, int age) {
        this.name = name;
        this.age = age;
    }

    @Override
    public String toString() {
        return "PersonNoVersion{name=" + name + ", age=" + age + "}";
    }
}
```

After serializing an instance of this class to `data.ser`, add the same `email` field (again with no explicit `serialVersionUID`) and attempt to read the old bytes:

```java
import java.io.FileInputStream;
import java.io.InvalidClassException;
import java.io.ObjectInputStream;

public class DeserializeNoVersion {
    public static void main(String[] args) throws Exception {
        try (ObjectInputStream in = new ObjectInputStream(new FileInputStream("data.ser"))) {
            PersonNoVersion person = (PersonNoVersion) in.readObject();
            System.out.println("deserialized: " + person);
        } catch (InvalidClassException e) {
            System.out.println("deserialization failed: " + e.getMessage());
        }
    }
}
```

Output:

```text
deserialization failed: PersonNoVersion; local class incompatible: stream classdesc serialVersionUID = 8110200849790284332, local class serialVersionUID = -3062730311219569082
```

Adding a single field — with no other change at all — was enough to change the JVM's *computed* `serialVersionUID` from one large, arbitrary-looking number to a completely different one, and `ObjectInputStream` correctly refuses to proceed once the stream's embedded UID no longer matches the currently loaded class's UID. Notice that this is the *identical* structural change (`name`, `age` becoming `name`, `age`, `email`) that worked perfectly in the previous example — the only difference is whether a human explicitly declared a version number, or left it to be silently derived from class shape. This is precisely why every `Serializable` class intended to persist or be transmitted across versions of an application should declare `serialVersionUID` explicitly: it converts an invisible, accidental compatibility break into a decision you make on purpose.

## ObjectInputFilter: restricting what a stream is allowed to construct

Native deserialization's most serious risk has nothing to do with compatibility: `ObjectInputStream.readObject()` will construct **any** class present on the classpath that the stream claims to contain, without asking your application whether that class was expected. Historically, attackers have exploited this by crafting malicious serialized bytes that, once deserialized, trigger a chain of otherwise-harmless classes' constructors and methods ("gadget chains") into executing arbitrary code — entirely through the act of deserializing untrusted bytes, no other vulnerability required. `ObjectInputFilter` (added in Java 9) lets you restrict, in advance, exactly which classes a specific `ObjectInputStream` is permitted to construct.

```java
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InvalidClassException;
import java.io.ObjectInputFilter;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;

public class ObjectInputFilterDemo {
    static class Point implements Serializable {
        int x;
        int y;

        Point(int x, int y) {
            this.x = x;
            this.y = y;
        }

        @Override
        public String toString() {
            return "Point(" + x + "," + y + ")";
        }
    }

    static class Payload implements Serializable {
        String label;

        Payload(String label) {
            this.label = label;
        }

        @Override
        public String toString() {
            return "Payload(" + label + ")";
        }
    }

    static byte[] serialize(Object value) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(value);
        }
        return bytes.toByteArray();
    }

    static Object deserializeWithFilter(byte[] data, String filterPattern) throws Exception {
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(data))) {
            in.setObjectInputFilter(ObjectInputFilter.Config.createFilter(filterPattern));
            return in.readObject();
        }
    }

    public static void main(String[] args) throws Exception {
        byte[] pointBytes = serialize(new Point(3, 4));
        byte[] payloadBytes = serialize(new Payload("secret"));

        String allowOnlyPoint = ObjectInputFilterDemo.class.getName() + "$Point;!*";

        Object allowed = deserializeWithFilter(pointBytes, allowOnlyPoint);
        System.out.println("allowed class deserialized: " + allowed);

        try {
            deserializeWithFilter(payloadBytes, allowOnlyPoint);
            System.out.println("this line should not print");
        } catch (InvalidClassException e) {
            System.out.println("rejected class blocked: " + e.getMessage());
        }
    }
}
```

Output:

```text
allowed class deserialized: Point(3,4)
rejected class blocked: filter status: REJECTED
```

`ObjectInputFilter.Config.createFilter("...$Point;!*")` builds a filter from a semicolon-separated pattern list, evaluated left to right: `...$Point` allow-lists exactly that one class, and the trailing `!*` rejects everything else that was not already explicitly matched. Setting this filter on the `ObjectInputStream` before calling `readObject()` means the `Payload` class is never even instantiated — the stream rejects it outright, regardless of what that class's constructor or fields might otherwise do. Whenever your application deserializes bytes that originated outside your own trusted process — a network message, a file a user uploaded, a message queue payload — an `ObjectInputFilter` allow-listing only the specific classes you expect is a critical, non-optional line of defense.

## The most explicit option: skip native serialization entirely

The safest, most explicit choice for any wire format you control end to end is often to not use `Serializable`/`ObjectOutputStream` at all — writing a small, self-describing format by hand gives you complete, auditable control over exactly what bytes mean, with no dependency on class shape and, since `ObjectInputStream.readObject()` is never called, no exposure to native-deserialization gadget-chain attacks in the first place.

```java
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;

public class ExplicitSchemaExample {
    record PersonV1(String name, int age) {}

    static byte[] writeV1(PersonV1 person) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.writeInt(1);
            out.writeUTF(person.name());
            out.writeInt(person.age());
        }
        return bytes.toByteArray();
    }

    static String describe(byte[] data) throws IOException {
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(data))) {
            int version = in.readInt();
            if (version == 1) {
                String name = in.readUTF();
                int age = in.readInt();
                return "schema v1: name=" + name + ", age=" + age;
            }
            throw new IOException("unknown schema version: " + version);
        }
    }

    public static void main(String[] args) throws IOException {
        byte[] data = writeV1(new PersonV1("Grace", 45));
        System.out.println("wire size: " + data.length + " bytes");
        System.out.println(describe(data));

        byte[] corruptedVersion = data.clone();
        corruptedVersion[3] = 9;
        try {
            describe(corruptedVersion);
        } catch (IOException e) {
            System.out.println("rejected unknown version: " + e.getMessage());
        }
    }
}
```

Output:

```text
wire size: 15 bytes
schema v1: name=Grace, age=45
rejected unknown version: unknown schema version: 9
```

The very first thing written is an explicit version number, read back and checked explicitly before anything else is interpreted — the exact same idea as `serialVersionUID`, but visible directly in your own code instead of hidden inside `ObjectOutputStream`'s machinery, and extensible on your own terms (a real version 2 could simply add an `if (version == 2)` branch reading a different, still fully explicit, set of fields). No class name, class hierarchy, or field-reflection metadata is ever embedded in the bytes, and reading them never constructs an object by any mechanism other than the explicit code you wrote and can fully audit. This is why many real systems that exchange data across trust boundaries — networked services, file formats meant to outlive a single application version, anything touching data from outside the process — prefer an explicit, hand-rolled or schema-based format (this same idea, formalized, is what tools like Protocol Buffers or a versioned JSON schema provide) over Java's native serialization.

## What happens under the hood

`ObjectOutputStream` walks an object graph reflectively, writing each `Serializable` field's value along with enough class metadata (`serialVersionUID`, field names and types) for `ObjectInputStream` to reconstruct compatible objects later — and, critically, `readObject()` reconstructs objects **without invoking a normal constructor** for the class itself, instead using low-level mechanisms that can trigger nearly any code reachable from an object's fields being set. `ObjectInputFilter` intercepts this process before construction happens, checking each candidate class (and stream-level limits like graph depth and array size) against the filter before `ObjectInputStream` is permitted to proceed.

## Common mistakes

**1. Implementing `Serializable` without declaring `serialVersionUID`.** Any later change to the class's shape can silently change the JVM-computed UID, breaking compatibility with previously serialized data in a way that only surfaces at runtime.

**2. Calling `ObjectInputStream.readObject()` on bytes from an untrusted source with no `ObjectInputFilter` in place.** This is one of the most well-documented remote-code-execution vectors in the Java ecosystem; never deserialize untrusted native Java serialization data unfiltered.

**3. Treating native serialization as a general-purpose persistence or wire format** for data that needs to outlive a specific class's internal field layout, rather than as a narrow tool for short-lived, same-application, same-version object transfer.

**4. Assuming an `ObjectInputFilter` allow-list is optional "extra" security** rather than a required control whenever the byte source is not fully trusted — the class-construction risk exists regardless of whether an attack is currently anticipated.

**5. Forgetting that adding a `transient` or `static` field never affects the ability to read old data**, since neither is included in the serialized form at all — only genuinely serialized instance fields interact with `serialVersionUID` compatibility at all.

## Best practices

- Declare `serialVersionUID` explicitly on every `Serializable` class you intend to persist or transmit across more than one version of your application.
- Never call `readObject()` on bytes that originate from outside your own trusted process without an `ObjectInputFilter` allow-listing exactly the classes you expect.
- Prefer an explicit, hand-rolled, or schema-based wire format over native Java serialization for anything crossing a trust boundary, a network connection, or a long-lived storage format.
- Treat a change to `serialVersionUID` itself as a deliberate, documented decision that this version of the class is no longer compatible with previously serialized data.
- Keep any wire-format version number as the very first thing read, and fail explicitly and loudly on an unrecognized version, rather than guessing.

## Summary

- `serialVersionUID` is either explicitly declared (a version you control) or silently computed from class shape; an undeclared UID means any structural change can invisibly break compatibility with previously serialized data.
- The identical structural change (adding a field) either succeeds gracefully or throws `InvalidClassException`, depending entirely on whether `serialVersionUID` was declared explicitly and kept stable.
- `ObjectInputFilter` restricts which classes an `ObjectInputStream` is permitted to construct, defending against the class of native-deserialization attacks where crafted bytes trigger unintended code execution during `readObject()`.
- Skipping native serialization in favor of an explicit, self-versioned wire format gives full, auditable control over the format and removes exposure to native-deserialization risks entirely.
- Never deserialize untrusted native Java serialization data without an `ObjectInputFilter` allow-list in place.

## Practice

Warm-up:

1. Create a `Serializable` class with an explicit `serialVersionUID`, serialize an instance to a byte array, and deserialize it back, confirming the values round-trip correctly.
2. Write a short explanation, in your own words, of the difference between an explicitly declared and a JVM-computed `serialVersionUID`.
3. Use `ObjectInputFilter.Config.createFilter` to build a filter allowing exactly one class and rejecting everything else, and test it against both an allowed and a rejected instance.

Core:

1. Reproduce this lesson's compatibility experiment yourself: serialize an instance of a class with an explicit `serialVersionUID`, add a field, and confirm old data still deserializes with the new field defaulting to its type's default value.
2. Design a small explicit wire-format writer and reader (using `DataOutputStream`/`DataInputStream`, similar to this lesson's example) for a record type of your choosing, including an explicit version number checked on read.
3. Write a method that deserializes a byte array using an `ObjectInputFilter` allow-listing a fixed, small set of expected classes, and explain, in a comment, why this differs meaningfully from validating the deserialized object's field values *after* construction.

Challenge:

1. Extend your explicit wire-format design to support two versions (`version == 1` and `version == 2`, where version 2 adds a field), demonstrating that a version-2 writer's output can be correctly read by version-aware reading logic while an unrecognized future version fails explicitly.
2. Research (and briefly document, in a comment) the difference between `ObjectInputFilter`'s process-wide default filter (configurable via a system property or `ObjectInputFilter.Config.setSerialFilter`) and a per-stream filter set with `setObjectInputFilter`, and explain a scenario where you would want both layers in place at once.

## Check your understanding

1. What is the practical difference between an explicitly declared `serialVersionUID` and one the JVM computes automatically?
2. Why did adding an identical new field to two structurally similar classes produce two different outcomes in this lesson's examples?
3. What is a native-deserialization "gadget chain" attack, at a conceptual level, and why does it not require any other vulnerability besides calling `readObject()` on untrusted bytes?
4. What does `ObjectInputFilter.Config.createFilter("com.example.Allowed;!*")` do, and why does the trailing `!*` matter?
5. Why might an explicit, hand-rolled wire format be a better choice than native Java serialization for data that crosses a network boundary or must outlive a specific class's field layout?
6. Do `transient` or `static` fields participate in `serialVersionUID` compatibility checks? Why or why not?
