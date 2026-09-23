# Catching, propagation, multi-catch, and reading stack traces

Throwing an exception is only half of the story. Somewhere, some code must decide what to do about it: ask the user again, retry, fall back to a default, translate it, or let the program stop with a clear report. That decision happens in `try`/`catch`/`finally` blocks, and *where* you place them matters as much as what you write inside them.

When things go wrong in production, the stack trace is usually your first and best evidence. Professional developers read traces quickly and precisely: the type, the message, the first relevant frame of their own code, and every `Caused by:` section. This lesson teaches both skills.

What you will learn:

- The exact control flow of `try`, `catch`, and `finally`
- How exceptions propagate through a chain of method calls
- How to order multiple `catch` blocks and when to use multi-catch
- Why try blocks should be as narrow as the failure they handle
- The traps of `return` inside `finally`
- How to read a stack trace, including `Caused by:` and `... N more`

## The try-catch-finally statement

A `try` statement has one `try` block, zero or more `catch` blocks, and an optional `finally` block (at least one `catch` or a `finally` is required).

```java
try {
    // code that might throw
} catch (SomeException e) {
    // runs only if SomeException (or a subclass) was thrown in the try block
} finally {
    // runs no matter how the try block ended
}
```

The rules for flow are:

- If the `try` block completes normally, all `catch` blocks are skipped and `finally` runs.
- If it throws an exception that matches a `catch` parameter type, the rest of the `try` block is skipped, the *first* matching `catch` runs, then `finally` runs, and execution continues after the whole statement.
- If it throws an exception that no `catch` matches, `finally` runs and then the exception continues propagating to the caller.

This program shows all three paths.

```java
public class FlowTrace {
    public static void main(String[] args) {
        for (String input : new String[] {"25", "abc", "0"}) {
            System.out.println("--- input: " + input);
            try {
                System.out.println("1. try starts");
                int divisor = Integer.parseInt(input);
                System.out.println("2. 100 / " + divisor + " = " + (100 / divisor));
            } catch (NumberFormatException e) {
                System.out.println("3. catch: " + e.getMessage());
            } finally {
                System.out.println("4. finally always runs");
            }
            System.out.println("5. after the try statement");
        }
    }
}
```

```text
--- input: 25
1. try starts
2. 100 / 25 = 4
4. finally always runs
5. after the try statement
--- input: abc
1. try starts
3. catch: For input string: "abc"
4. finally always runs
5. after the try statement
--- input: 0
1. try starts
4. finally always runs
Exception in thread "main" java.lang.ArithmeticException: / by zero
	at FlowTrace.main(FlowTrace.java:8)
```

Trace the third input carefully. `ArithmeticException` is not a `NumberFormatException`, so the `catch` does not match. `finally` still runs (line "4."), then the exception leaves `main` and the program ends. Step "5." never prints, and the loop never continues.

> **Note:** `finally` is skipped only in extreme cases: `System.exit` is called, the JVM crashes, or the thread is killed. For everything else, including `return`, `break`, and `continue` inside the `try`, it runs.

## Propagation through the call stack

When a method does not catch an exception, it ends abruptly and hands the exception to its caller, at the exact point of the call. This continues until a matching handler is found. Picture a stack of plates: each method call puts a plate on top; an exception removes plates one by one from the top until it reaches a method with a matching `catch`.

This behavior is what lets you place handlers **where a useful decision can be made**, not where the failure happened. A low-level parser has no idea whether to show a dialog, skip a record, or abort an import. The code that started the import does.

## Choosing where to catch

A handler is useful only if it can do one of these things:

- **Recover**: use a default, retry, or ask the user again.
- **Translate**: convert to an exception that fits the current abstraction, keeping the cause.
- **Report**: at the top of the application, log the failure once and show a safe message.

If a method can do none of these, it should not catch the exception at all. A `catch` that just prints and continues is usually a bug.

### Keep try blocks narrow

A `catch` clause describes *which failures* it handles, but the `try` block defines *which statements* it covers. If the block covers more code than the handler was designed for, the handler will receive failures it does not understand and will describe them wrongly.

```java
public class NarrowTry {
    static final int[] PRICES = {5, 8, 13};

    public static void main(String[] args) {
        for (String input : new String[] {"2", "two", "7"}) {
            System.out.println("broad  " + input + " -> " + broad(input));
            System.out.println("narrow " + input + " -> " + narrow(input));
        }
    }

    static String broad(String input) {
        try {
            int index = Integer.parseInt(input);
            return "price " + PRICES[index];
        } catch (Exception e) {
            return "Enter a whole number";       // blames the user for every failure
        }
    }

    static String narrow(String input) {
        int index;
        try {
            index = Integer.parseInt(input);     // only the parsing is protected
        } catch (NumberFormatException e) {
            return "Enter a whole number";
        }
        if (index < 0 || index >= PRICES.length) {
            return "Choose an item from 0 to " + (PRICES.length - 1);
        }
        return "price " + PRICES[index];
    }
}
```

```text
broad  2 -> price 13
narrow 2 -> price 13
broad  two -> Enter a whole number
narrow two -> Enter a whole number
broad  7 -> Enter a whole number
narrow 7 -> Choose an item from 0 to 2
```

Look at the last pair. `"7"` *is* a whole number, yet the broad version tells the user to enter one. The real failure was an `ArrayIndexOutOfBoundsException` from `PRICES[7]`, which the broad `catch (Exception e)` swallowed and relabeled. In a larger program the same pattern hides genuine bugs: a defect deep inside a processing method would be reported to the user as "invalid input", and no developer would ever see it.

The narrow version limits the `try` to the one call whose failure the handler understands, then checks the range explicitly with a message that matches the actual problem. Any other unexpected failure would propagate with its true type and stack trace.

> **Tip:** Declaring the variable before the `try` (`int index;`) and assigning it inside is the standard way to keep a try block narrow while using the result afterwards. The compiler's definite-assignment check accepts it because the `catch` always returns.

## Multiple catch blocks and multi-catch

A `try` can have several `catch` blocks. The JVM tests them **from top to bottom** and runs the first one whose type matches. Because a supertype matches all of its subtypes, specific types must come before general ones.

Fragment (does not compile):

```java
try {
    Integer.parseInt(text);
} catch (IllegalArgumentException e) {
    System.out.println("argument");
} catch (NumberFormatException e) {      // can never be reached
    System.out.println("number");
}
```

```text
error: exception NumberFormatException has already been caught
```

When several unrelated exceptions deserve **the same response**, a **multi-catch** clause lists them with `|`:

```java
import java.time.LocalDate;
import java.time.format.DateTimeParseException;

public class MultiCatch {
    public static void main(String[] args) {
        String[] records = {"2024-05-01;3", "2024-13-01;3", "2024-05-01;many", "2024-05-01"};
        for (String record : records) {
            String[] parts = record.split(";");
            if (parts.length != 2) {
                System.out.println("BAD  " + record + " -> expected 2 fields, got " + parts.length);
                continue;
            }
            try {
                LocalDate date = LocalDate.parse(parts[0]);
                int quantity = Integer.parseInt(parts[1]);
                System.out.println("OK   " + date + " x" + quantity);
            } catch (DateTimeParseException | NumberFormatException e) {
                System.out.println("BAD  " + record + " -> " + e.getClass().getSimpleName());
            }
        }
    }
}
```

```text
OK   2024-05-01 x3
BAD  2024-13-01;3 -> DateTimeParseException
BAD  2024-05-01;many -> NumberFormatException
BAD  2024-05-01 -> expected 2 fields, got 1
```

Multi-catch rules:

- The alternatives must not be related by inheritance. Writing `NumberFormatException | IllegalArgumentException` is an error, because the subclass is already covered by its superclass.
- The parameter `e` is implicitly `final`; you cannot assign to it.
- Inside the block, `e` has the type of the closest common supertype (here `RuntimeException`), so you can call only methods available there.

Also notice that the missing-field case is checked with an `if` rather than by catching `ArrayIndexOutOfBoundsException`. Predictable conditions are better tested than caught.

## finally and its traps

`finally` exists for cleanup that must happen whatever the outcome: releasing a lock, restoring a flag, closing a resource (though for resources, the next lesson's try-with-resources is better). But a `finally` block that *itself* returns or throws changes the result of the whole statement.

```java
public class FinallyTraps {
    public static void main(String[] args) {
        System.out.println("returnsFromFinally() = " + returnsFromFinally());
        System.out.println("swallowsException() = " + swallowsException());
        System.out.println("cleanupRuns() = " + cleanupRuns());
    }

    @SuppressWarnings("finally")
    static int returnsFromFinally() {
        try {
            return 1;
        } finally {
            return 2;               // overrides the pending return value
        }
    }

    @SuppressWarnings("finally")
    static String swallowsException() {
        try {
            throw new IllegalStateException("real problem");
        } finally {
            return "looks fine";    // the exception silently disappears
        }
    }

    static String cleanupRuns() {
        StringBuilder log = new StringBuilder();
        try {
            log.append("work;");
            return log.toString();  // value computed here: "work;"
        } finally {
            log.append("cleanup;"); // runs, but cannot change the value already chosen
        }
    }
}
```

```text
returnsFromFinally() = 2
swallowsException() = looks fine
cleanupRuns() = work;
```

What happens under the hood: when the `try` block executes `return expr`, the value of `expr` is computed and saved, then `finally` runs. If `finally` completes normally, the saved value is returned. If `finally` executes its own `return` or `throw`, the saved value (or the pending exception) is simply discarded. That is how `"real problem"` vanished without a trace. The `@SuppressWarnings("finally")` annotations silence the lint warning `finally clause cannot complete normally`, which exists precisely to catch this mistake.

## Reading stack traces

A stack trace is a snapshot of the call stack at the moment an exception object was created. Here is a realistic one: a three-level parse fails and is translated once at the import boundary.

```java
public class OrderImport {
    public static void main(String[] args) {
        try {
            importOrders(new String[] {"A-1,3", "A-2,x"});
        } catch (IllegalStateException e) {
            e.printStackTrace(System.out);
        }
    }

    static void importOrders(String[] lines) {
        for (String line : lines) {
            try {
                parseLine(line);
            } catch (NumberFormatException e) {
                throw new IllegalStateException("bad order line: " + line, e);
            }
        }
    }

    static int parseLine(String line) {
        String[] parts = line.split(",");
        return parseQuantity(parts[1]);
    }

    static int parseQuantity(String text) {
        return Integer.parseInt(text);
    }
}
```

```text
java.lang.IllegalStateException: bad order line: A-2,x
	at OrderImport.importOrders(OrderImport.java:15)
	at OrderImport.main(OrderImport.java:4)
	at java.base/jdk.internal.reflect.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:103)
	at java.base/java.lang.reflect.Method.invoke(Method.java:580)
	at jdk.compiler/com.sun.tools.javac.launcher.Main.execute(Main.java:484)
	at jdk.compiler/com.sun.tools.javac.launcher.Main.run(Main.java:208)
	at jdk.compiler/com.sun.tools.javac.launcher.Main.main(Main.java:135)
Caused by: java.lang.NumberFormatException: For input string: "x"
	at java.base/java.lang.NumberFormatException.forInputString(NumberFormatException.java:67)
	at java.base/java.lang.Integer.parseInt(Integer.java:662)
	at java.base/java.lang.Integer.parseInt(Integer.java:778)
	at OrderImport.parseQuantity(OrderImport.java:26)
	at OrderImport.parseLine(OrderImport.java:22)
	at OrderImport.importOrders(OrderImport.java:13)
	... 6 more
```

`printStackTrace(System.out)` prints to standard output; the no-argument version prints to standard error. Here is how to read it, step by step:

1. **First line**: the exception type and message of the outermost exception: `IllegalStateException: bad order line: A-2,x`. This says *what the application was doing*.
2. **Frames**: each `at` line is one method call, **most recent first**. The top frame is where the exception was created (line 15, the `throw` in `importOrders`). Below it are its callers.
3. **Framework frames**: the `jdk.internal.reflect` and `javac.launcher` lines appear because this program was run directly from a source file, which uses a launcher that calls `main` reflectively. In a real application you will see similar frames from frameworks and servers. They explain the path, but the defect is almost never inside them.
4. **Caused by**: the original exception with its own type, message, and frames. Read this section to learn *why* the failure happened: the text `"x"` is not a number.
5. **First application frame in the cause**: skip the `java.base` frames at the top and find the first line from your own code: `OrderImport.parseQuantity(OrderImport.java:26)`. That is where to start investigating. Below it, `parseLine` at line 22 and `importOrders` at line 13 show how execution got there.
6. **`... 6 more`**: the remaining six frames of the cause are identical to the last six frames of the enclosing trace, so Java omits them to save space. They are not lost; they are the `main` and launcher frames already printed above.

| Trace element | Question it answers |
|---|---|
| Exception type | What category of failure? |
| Message | Which value or resource was involved? |
| Top frame | Where was this exception object created? |
| First frame from your code | Where should I start reading source? |
| `Caused by:` | What lower-level failure triggered it? |
| `... N more` | Frames shared with the enclosing trace, omitted |
| `Suppressed:` | Extra failures during cleanup (next lesson) |

> **Tip:** With a deep cause chain, read the *last* `Caused by:` first. It is usually the root cause; the earlier sections describe how each layer reacted to it.

### Rethrowing and logging

- Rethrowing the same object with `throw e;` keeps its original stack trace, because the trace was captured when the object was created, not when it was thrown.
- Constructing a new exception without passing the cause starts a brand-new trace and loses the original one.
- Log a failure **once**, at the boundary that handles it. If every layer catches, logs, and rethrows, one failure appears five times in the logs, and operators cannot tell whether one or five things went wrong.

## Common mistakes

### Mistake 1: Supertype catch before subtype catch

Shown above: the compiler rejects it with `exception NumberFormatException has already been caught`. Fix: put the most specific `catch` first.

### Mistake 2: Related alternatives in multi-catch

```java
} catch (NumberFormatException | IllegalArgumentException e) {
```

```text
error: Alternatives in a multi-catch statement cannot be related by subclassing
  Alternative NumberFormatException is a subclass of alternative IllegalArgumentException
```

Fix: keep only the supertype, or use separate `catch` blocks if the responses differ.

### Mistake 3: Assigning the multi-catch parameter

```java
} catch (NumberFormatException | ArithmeticException e) {
    e = null;
}
```

```text
error: multi-catch parameter e may not be assigned
```

Fix: use a new local variable if you need a different value.

### Mistake 4: The empty catch block

```java
try {
    saveSettings();
} catch (IOException e) {
}
```

This compiles and silently discards the failure. The user believes the settings were saved. Fix: recover meaningfully, translate with the cause, or let it propagate. If ignoring is truly correct, write a comment explaining why.

### Mistake 5: A giant try around everything

Wrapping all of `main` in `try { ... } catch (Exception e) { System.out.println("Invalid input"); }` turns every bug into a misleading message, exactly like the broad version in `NarrowTry`. Fix: narrow each `try` to the operation whose failure the handler understands.

### Mistake 6: return in finally

Shown in `FinallyTraps`: a `return` in `finally` overrides a pending return value or discards an exception. Fix: never return or throw from `finally`; use it only for cleanup.

## Best practices

- Catch exceptions only where you can recover, translate, or report.
- Catch the most specific type that describes the failure you handle.
- Keep `try` blocks narrow so unrelated failures are not mislabeled.
- Use multi-catch when the response is identical; use separate blocks when it differs.
- Test for predictable conditions (`parts.length`, `index < size`) instead of catching the resulting exception.
- Never `return` or `throw` from a `finally` block.
- Log once, at the handling boundary, with the full exception (not just its message).
- When reading traces: type, message, first own frame, then every `Caused by:`, deepest first.

## Summary

- The first matching `catch` runs; `finally` runs after the `try` or `catch` in every normal or exceptional exit.
- An uncaught exception propagates to the caller at the point of the call, frame by frame, until a handler matches.
- Order `catch` blocks from specific to general; multi-catch alternatives must be unrelated types, and the parameter is final.
- A narrow `try` block prevents unrelated failures from being handled, and described, as if they were the expected one.
- A `return` or `throw` in `finally` discards the pending result or exception.
- A stack trace lists frames most-recent first; `Caused by:` shows the original exception, and `... N more` marks frames shared with the enclosing trace.

## Practice

### Warm-up

1. Predict the output of `FlowTrace` for the inputs `"-5"`, `""`, and `"100"` before running it.
2. Change `OrderImport` so it prints the trace with `printStackTrace()` (no argument). Where does the output go?

### Core

1. Build a three-method call chain `load -> parse -> convert` that fails at its deepest point with `NumberFormatException`. Translate it exactly once, in `load`, into a custom `ImportException` with the cause. Print the trace and mark every frame from your own code.
2. Rewrite this handler so that only the parse is protected and a defect in `process` would propagate unchanged:

```java
try {
    int count = Integer.parseInt(input);
    process(count);
} catch (Exception e) {
    System.out.println("Enter a whole number");
}
```

3. Write a reader for `"name;age;city"` records that uses one multi-catch for two parsing exceptions and an `if` for the wrong field count.

### Challenge

1. Write a method with a `try`, two `catch` blocks, and a `finally` that each append to a `StringBuilder` log. Produce a table of the log contents for these outcomes: no exception, first `catch` matches, second `catch` matches, no `catch` matches. Then explain in two sentences why logging the same exception at every layer produces misleading operational data.

## Check your understanding

1. In what order are `catch` blocks tested, and which one runs if two could match?
2. If an exception is not matched by any `catch`, does the `finally` block still run? What happens next?
3. Why can a broad `try` block cause a correct number to be reported to the user as invalid input?
4. What does `... 6 more` mean at the end of a `Caused by:` section?
5. What happens to a pending exception if the `finally` block executes `return`?
6. When is multi-catch appropriate, and what restriction applies to the listed types?
