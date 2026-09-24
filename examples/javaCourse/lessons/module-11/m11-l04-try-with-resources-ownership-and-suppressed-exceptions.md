# try-with-resources, ownership, and suppressed exceptions

A file handle, a database connection, a network socket — every one of these represents a limited external resource that must be explicitly released when you are done with it, or it leaks: the operating system's file-handle table fills up, the database's connection pool exhausts, the socket ties up a port. The obvious approach — call `close()` at the end of a method — has an obvious flaw the moment an exception can occur: if the code between opening and closing throws, `close()` never runs. This lesson covers **try-with-resources**, the language feature that closes this exact gap, and the subtler question it raises: what happens when both the main operation *and* the cleanup itself fail?

What you will learn:

- Why calling `close()` manually at the end of a method leaks the resource whenever an exception occurs first
- How try-with-resources guarantees `close()` runs, even when the body throws
- The order resources are closed in: reverse of the order they were opened
- What happens when both the try block's body and a resource's `close()` both throw: **suppressed exceptions**
- Reading `getSuppressed()` to recover a cleanup failure that would otherwise be silently lost
- Real file I/O using try-with-resources, tying this lesson back to Chapter 4's memory model

## The problem: a manual close is skipped by an exception

Calling `close()` as the very last line of a method looks correct — until something between opening and that line throws, and the JVM unwinds the stack (Chapter 4) straight past the `close()` call, skipping it entirely:

```java
public class ManualCloseLeak {
    static final class Resource implements AutoCloseable {
        final String name;
        boolean closed = false;
        Resource(String name) {
            this.name = name;
            System.out.println("opened " + name);
        }
        void use() {
            throw new RuntimeException("failure while using " + name);
        }
        public void close() {
            closed = true;
            System.out.println("closed " + name);
        }
    }

    public static void main(String[] args) {
        Resource r = new Resource("manual");
        r.use();
        r.close();
        System.out.println("never reached: close was skipped because use() threw");
    }
}
```

Output:

```text
opened manual
Exception in thread "main" java.lang.RuntimeException: failure while using manual
	at ManualCloseLeak$Resource.use(ManualCloseLeak.java:12)
	at ManualCloseLeak.main(ManualCloseLeak.java:22)
```

`r.close()` never runs. The resource is leaked, silently — no exception says "and by the way, this resource was never released." A `try`/`finally` block (Chapter 7's exception-propagation lessons touched on `finally`) can fix this by moving the cleanup into a `finally` clause, which always runs regardless of whether the `try` block threw — but writing that correctly by hand for every resource, especially multiple resources at once, is exactly the kind of repetitive, error-prone boilerplate a language feature should handle for you.

## try-with-resources: guaranteed cleanup, automatically

Any class implementing `AutoCloseable` (a single-method interface declaring `close()`) can be declared inside a `try (...)` clause's parentheses. The JVM then guarantees `close()` is called when the block ends — normally or via an exception — with **no `finally` needed**:

```java
public class TryWithResourcesBasic {
    static final class Resource implements AutoCloseable {
        final String name;
        Resource(String name) {
            this.name = name;
            System.out.println("opened " + name);
        }
        void use() {
            System.out.println("using " + name);
        }
        public void close() {
            System.out.println("closed " + name);
        }
    }

    public static void main(String[] args) {
        try (Resource a = new Resource("A"); Resource b = new Resource("B")) {
            a.use();
            b.use();
        }
        System.out.println("both resources closed automatically, in reverse order of opening");
    }
}
```

Output:

```text
opened A
opened B
using A
using B
closed B
closed A
both resources closed automatically, in reverse order of opening
```

Two resources, declared and opened in order `A` then `B`, are closed in the **reverse** order: `B` first, then `A`. This mirrors exactly how stack frames unwind (Chapter 4): the most recently acquired resource is the first one released, because it is the one whose scope ends soonest as the `try` block exits — the same "last in, first out" discipline you have already seen for method calls and stack frames applies here to resource cleanup as well.

The guarantee this feature exists for is that `close()` runs **even when the body throws**:

```java
public class CloseRunsOnFailure {
    static final class Resource implements AutoCloseable {
        final String name;
        Resource(String name) {
            this.name = name;
            System.out.println("opened " + name);
        }
        void use() {
            System.out.println("using " + name + ", about to fail");
            throw new RuntimeException("failure while using " + name);
        }
        public void close() {
            System.out.println("closed " + name);
        }
    }

    public static void main(String[] args) {
        try (Resource r = new Resource("guaranteed")) {
            r.use();
        } catch (RuntimeException e) {
            System.out.println("caught: " + e.getMessage());
        }
        System.out.println("close ran even though use() threw");
    }
}
```

Output:

```text
opened guaranteed
using guaranteed, about to fail
closed guaranteed
caught: failure while using guaranteed
close ran even though use() threw
```

Compare this directly against `ManualCloseLeak`: the identical failure inside `use()` this time still results in `close()` running — printed *before* the `catch` block even executes, because the resource is closed as the `try` block is exited, which happens before control reaches any `catch` clause. This is the entire value proposition of try-with-resources in one example: **cleanup is guaranteed, regardless of how the block exits.**

## Suppressed exceptions: when both the body and close() fail

Here is the subtler question this lesson opened with, and exactly the chapter's concept-check scenario: what happens if the `try` block's body throws, *and then* the resource's own `close()` also throws while trying to clean up? Only one exception can actually propagate out of the `try` statement — which one, and what happens to the other?

```java
public class SuppressedException {
    static final class Resource implements AutoCloseable {
        Resource() {
            System.out.println("opened resource");
        }
        void use() {
            System.out.println("using resource, about to fail");
            throw new RuntimeException("body failure");
        }
        public void close() {
            System.out.println("closing resource, close itself fails");
            throw new IllegalStateException("close failure");
        }
    }

    public static void main(String[] args) {
        try (Resource r = new Resource()) {
            r.use();
        } catch (RuntimeException e) {
            System.out.println("primary exception caught: " + e.getMessage());
            Throwable[] suppressed = e.getSuppressed();
            System.out.println("suppressed count: " + suppressed.length);
            for (Throwable s : suppressed) {
                System.out.println("  suppressed: " + s.getClass().getSimpleName() + ": " + s.getMessage());
            }
        }
    }
}
```

Output:

```text
opened resource
using resource, about to fail
closing resource, close itself fails
primary exception caught: body failure
suppressed count: 1
  suppressed: IllegalStateException: close failure
```

This is exactly the chapter's concept-check answer: **the body's failure is primary, and the close failure is attached to it as a suppressed exception** — neither is silently discarded, and the close failure does not simply overwrite or replace the body's original, usually more diagnostically important, failure. The reasoning is sound: the body's exception is almost always the one that actually explains what went wrong from the caller's perspective (`"body failure"` tells you the real problem), while a failure during cleanup, though still worth knowing about, is usually a secondary concern triggered by the resource already being in a bad state from the first failure. `Throwable.getSuppressed()` returns every suppressed exception as an array, letting you recover this "secondary" information — which, notably, a printed stack trace shows too, under a `Suppressed:` heading beneath the primary exception, so you do not even need to call `getSuppressed()` explicitly just to *see* that a suppression occurred when debugging from a log.

## Real file I/O with try-with-resources

Every I/O resource in the standard library — file readers and writers, sockets, database connections — implements `AutoCloseable` specifically so it can be used this way. This ties directly back to Chapter 4's ownership discipline: a resource obtained inside a method should, in the overwhelming majority of cases, be closed by that same method, using try-with-resources to guarantee it:

```java
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class FileResourceDemo {
    public static void main(String[] args) throws IOException {
        Path file = Path.of("/work/demo.txt");
        Files.writeString(file, "line one\nline two\nline three\n", StandardCharsets.UTF_8);

        try (var reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            int count = 0;
            while ((line = reader.readLine()) != null) {
                count++;
                System.out.println(count + ": " + line);
            }
        }
        System.out.println("reader closed automatically after the loop");
    }
}
```

Output:

```text
1: line one
2: line two
3: line three
reader closed automatically after the loop
```

`Files.newBufferedReader` returns a `BufferedReader`, which implements `AutoCloseable`. Declaring it in the `try (...)` clause guarantees the underlying file handle is released the moment the block ends — whether the loop finishes normally, as it does here, or an `IOException` interrupts it partway through reading. Chapter 12 covers file I/O itself in full detail; the point here is specifically that **any** resource implementing `AutoCloseable` gets this same guarantee, with the identical syntax, regardless of what kind of resource it actually is.

## What happens under the hood

The compiler transforms a `try (Resource r = ...) { body }` statement into logic equivalent to a `try`/`finally` block, where the `finally` clause calls `r.close()` — but with one crucial refinement beyond what you would typically write by hand: if the body throws an exception and `close()` *also* throws while handling that unwind, the compiler-generated code catches the second exception and attaches it to the first via `addSuppressed(...)`, rather than letting the second exception silently replace the first (which is exactly what a naively hand-written `try`/`finally` **without** this refinement would do — the `finally` block's exception would simply overwrite the original one, permanently losing it). This is precisely why try-with-resources is preferred over manually written `try`/`finally` cleanup for anything beyond the simplest case: it gets this specific, easy-to-get-wrong edge case right, automatically, every time.

## Common mistakes

**1. Calling `close()` manually at the end of a method instead of using try-with-resources.** Any exception thrown before that final line skips the call entirely, leaking the resource.

**2. Assuming a close failure silently vanishes when the body also failed.** It does not disappear; it becomes a suppressed exception attached to the primary one, retrievable via `getSuppressed()`.

**3. Assuming a close failure replaces or takes priority over the body's original exception.** The body's exception remains primary; only the close failure is added as suppressed.

**4. Forgetting that resources close in reverse order of declaration.** For resources with dependencies on each other (one resource wrapping another), this order usually matters and is exactly what try-with-resources provides correctly by default.

**5. Writing a custom `close()` method that itself needs its own careful error handling but never testing what happens when the body *and* the close both fail together.** This is precisely the scenario `SuppressedException` demonstrates, and it is easy to overlook until it happens in production.

## Best practices

- Use try-with-resources for every `AutoCloseable` resource, rather than a manually written `finally` block, unless you have a specific reason the automatic suppression behavior is wrong for your case.
- Declare multiple related resources in one `try (...)` clause when their lifetimes are genuinely linked, relying on the guaranteed reverse-order closing.
- When catching an exception from a `try`-with-resources block, check `getSuppressed()` if a resource's `close()` method can itself fail meaningfully — do not assume a caught exception tells the complete story.
- Implement `close()` methods to be as failure-resistant as reasonably possible, since a failing `close()` complicates diagnosis even with suppression correctly capturing it.
- Remember this lesson's guarantee applies specifically to resources declared in the `try (...)` clause itself — a resource created and left uninvolved in that clause gets none of these guarantees.

## Summary

- Calling `close()` as a plain, final statement in a method skips cleanup entirely if an earlier exception is thrown, leaking the resource.
- try-with-resources guarantees `close()` runs when the block exits, whether normally or via an exception, for any type implementing `AutoCloseable`.
- Multiple resources declared in one `try (...)` clause are closed in the reverse order they were opened.
- When both the try block's body and a resource's `close()` throw, the body's exception is primary and the close's exception is attached to it as a suppressed exception — neither is silently lost.
- `Throwable.getSuppressed()` recovers any suppressed exceptions; a printed stack trace also displays them automatically under a `Suppressed:` heading.

## Practice

Warm-up:

1. Implement a small `AutoCloseable` class that prints when it opens and closes, and use it in a `try (...)` block that completes normally.
2. Modify that class so its body throws inside the `try` block, and confirm `close()` still runs by observing the print order.
3. Declare three resources in one `try (...)` clause and confirm they close in the exact reverse order of their declaration.

Core:

1. Reproduce `SuppressedException`'s scenario with a resource of your own design, catch the primary exception, and print every suppressed exception's message.
2. Write a method that reads a small text file using try-with-resources and `Files.newBufferedReader`, correctly declaring any checked exception it might throw, and test it with a file that exists and one that does not.
3. Design two resources where one wraps the other (a "connection" resource that itself creates and owns a "session" resource inside its constructor), and reason through, in writing, which resource's `close()` should be responsible for closing which, referencing Chapter 4's ownership vocabulary.

Challenge:

1. Write a custom `AutoCloseable` resource whose `close()` method can itself throw under a condition you control, and design a small test harness that exercises all four combinations: body succeeds/close succeeds, body succeeds/close fails, body fails/close succeeds, body fails/close fails — verifying the correct exception (and any suppression) in each case.
2. Implement a resource pool class (a simplified version of what a database connection pool does) that hands out `AutoCloseable` wrapper objects whose `close()` method returns the underlying resource to the pool rather than actually releasing it, and explain in a comment why this pattern lets try-with-resources syntax work naturally even though the "real" resource is not destroyed.

## Check your understanding

1. Why does calling `close()` as the last statement in a method fail to guarantee cleanup, in a way that try-with-resources does not?
2. If a `try (...)` block declares resources `X` then `Y`, in what order are they closed, and why does that order make sense?
3. If a `try` block's body throws `RuntimeException` and the resource's `close()` throws `IllegalStateException`, which exception actually propagates out of the statement, and what happens to the other one?
4. How do you retrieve a suppressed exception from a caught exception object?
5. Why does try-with-resources's handling of a body-and-close double failure differ from what a naively hand-written `try`/`finally` block (without suppression logic) would do?
6. Does a printed stack trace show suppressed exceptions automatically, or must you call `getSuppressed()` yourself to see them at all?
