# Throwable hierarchy and checked versus unchecked exceptions

Every real program fails sometimes. A file is missing, a user types "twelve" where a number was expected, a network cable is unplugged, or a programmer divides by a count that happens to be zero. What separates a hobby script from professional software is not the absence of failures but how deliberately they are *described*, *signalled*, and *handled*.

Java gives you a precise vocabulary for failure: the `Throwable` family of classes. Understanding that family, and especially the split between **checked** and **unchecked** exceptions, tells you which failures the compiler forces you to think about, which ones indicate bugs, and which ones you should never try to recover from at all.

What you will learn:

- The three kinds of errors in programs: compile-time errors, runtime errors, and logic errors
- What an exception is and what happens when one is thrown and not handled
- The `Throwable` hierarchy: `Error`, `Exception`, and `RuntimeException`
- Which exceptions are checked, which are unchecked, and how the compiler enforces the difference
- What the `throws` clause means as part of a method's contract
- How to decide whether a failure should be checked, unchecked, or not handled at all

## Three kinds of errors in programs

Before we talk about exceptions, it helps to separate failures by *when* they are discovered.

| Kind | Discovered by | When | Example |
|---|---|---|---|
| Compile-time error | The compiler (`javac`) | Before the program runs | Missing semicolon, wrong type |
| Runtime error | The JVM | While the program runs | Division by zero, missing file |
| Logic error | Nobody, automatically | Only through tests or wrong results | Using `/ 3` instead of `/ 3.0` |

### Compile-time errors

The compiler checks syntax and types. If it finds a problem, no `.class` file is produced and nothing runs. This is the cheapest kind of error to fix, because the tool points directly at the line.

Fragment (does not compile):

```java
int count = "three";
```

```text
CompileErrors2.java:3: error: incompatible types: String cannot be converted to int
        int count = "three";
                    ^
1 error
```

A missing semicolon produces `error: ';' expected`. Read these messages carefully: the file name, the line number, and the caret (`^`) under the offending position are all precise evidence.

### Runtime errors and logic errors

A program can compile perfectly and still fail while running, or, worse, run to completion with a wrong answer. The next program shows both.

```java
public class AverageBug {
    public static void main(String[] args) {
        int[] scores = {90, 85, 78};
        int sum = scores[0] + scores[1] + scores[2];

        double wrong = sum / 3;     // logic error: integer division
        double right = sum / 3.0;   // floating-point division
        System.out.println("wrong average = " + wrong);
        System.out.println("right average = " + right);

        int[] noScores = {};
        System.out.println("averaging an empty class...");
        System.out.println(sum / noScores.length);   // runtime error
        System.out.println("this line never runs");
    }
}
```

```text
wrong average = 84.0
right average = 84.33333333333333
averaging an empty class...
Exception in thread "main" java.lang.ArithmeticException: / by zero
	at AverageBug.main(AverageBug.java:13)
```

The first bug is a **logic error**: `sum / 3` divides two `int` values, so the fraction is discarded *before* the result is widened to `double`. Nothing crashed, nothing warned; the program just lied. Only a test that checks the value would notice.

The second bug is a **runtime error**: integer division by zero is undefined, so the JVM *throws an exception*. Because nothing handled it, the program stopped, printed a description, and exited with a non-zero status. The last line never ran.

> **Note:** Floating-point division by zero does not throw. `5.0 / 0` evaluates to `Infinity`. Only integer division and remainder (`/` and `%` on `int` or `long`) throw `ArithmeticException`.

## A first glance at exceptions

An **exception** is an object that describes an abnormal event and interrupts the normal flow of the program. Think of it as a fire alarm: when something goes wrong deep inside a building, the alarm travels outward until someone who knows what to do responds. If nobody responds, the building is evacuated. In Java, "evacuation" means the thread terminates and the JVM prints the exception.

When an exception is thrown:

1. The current statement stops immediately; the rest of the method is skipped.
2. The JVM looks for a matching handler (`catch` block) in the current method.
3. If there is none, the method ends abruptly and the exception moves to the caller.
4. This repeats up the call stack until a handler is found or `main` is left.
5. If `main` is left, the default handler prints `Exception in thread "main"`, the exception class, its message, and the stack trace.

Every exception object carries three core pieces of evidence:

- Its **type**, such as `ArithmeticException`, which classifies the failure
- Its **message**, such as `/ by zero`, which adds detail (it may be `null`)
- Its **stack trace**, the list of method calls that were active when it was created

You will learn to catch exceptions and read stack traces in detail in a later lesson. First you need a map of the family.

## The Throwable hierarchy

Only objects whose class extends `java.lang.Throwable` can be thrown with the `throw` statement or caught with `catch`. The family tree looks like this (simplified):

```text
Throwable
+-- Error                         serious JVM or environment problems
|   +-- VirtualMachineError
|   |   +-- OutOfMemoryError
|   |   +-- StackOverflowError
|   +-- AssertionError
+-- Exception                     conditions a program may reasonably handle
    +-- IOException               (checked)
    |   +-- FileNotFoundException
    |   +-- NoSuchFileException   (in java.nio.file)
    +-- InterruptedException      (checked)
    +-- RuntimeException          (unchecked)
        +-- ArithmeticException
        +-- NullPointerException
        +-- IllegalArgumentException
        |   +-- NumberFormatException
        +-- IllegalStateException
        +-- IndexOutOfBoundsException
            +-- ArrayIndexOutOfBoundsException
```

The three branches have very different meanings:

- **`Error`** describes problems ordinary application code should not try to recover from: the heap is exhausted, the stack overflowed, a class failed to load. Catching them usually makes things worse, because the JVM may be in a damaged state.
- **`RuntimeException`** and its subclasses usually describe *programming defects* or *violated contracts*: a null reference was used, an index was out of range, an argument was illegal.
- **Other `Exception` subclasses** describe conditions that can happen even in correct code, because they depend on the outside world: a file is missing, a connection was refused, a thread was interrupted.

The following program walks up the real superclass chain of several exception types using reflection (`getSuperclass()`), so you can see the hierarchy from the JDK itself rather than from a diagram.

```java
import java.io.FileNotFoundException;
import java.util.List;

public class HierarchyTour {
    public static void main(String[] args) {
        List<Throwable> samples = List.of(
                new FileNotFoundException("report.txt"),
                new NumberFormatException("For input string: \"abc\""),
                new IllegalStateException("connection closed"),
                new ArrayIndexOutOfBoundsException(5),
                new OutOfMemoryError("Java heap space"));

        for (Throwable t : samples) {
            System.out.println(chain(t.getClass()));
            System.out.println("    kind: " + kind(t) + ", message: " + t.getMessage());
        }
    }

    static String chain(Class<?> type) {
        StringBuilder text = new StringBuilder(type.getSimpleName());
        for (Class<?> c = type.getSuperclass(); c != Object.class; c = c.getSuperclass()) {
            text.append(" -> ").append(c.getSimpleName());
        }
        return text.toString();
    }

    static String kind(Throwable t) {
        if (t instanceof Error) {
            return "Error (serious, do not try to recover)";
        }
        if (t instanceof RuntimeException) {
            return "unchecked exception";
        }
        return "checked exception";
    }
}
```

```text
FileNotFoundException -> IOException -> Exception -> Throwable
    kind: checked exception, message: report.txt
NumberFormatException -> IllegalArgumentException -> RuntimeException -> Exception -> Throwable
    kind: unchecked exception, message: For input string: "abc"
IllegalStateException -> RuntimeException -> Exception -> Throwable
    kind: unchecked exception, message: connection closed
ArrayIndexOutOfBoundsException -> IndexOutOfBoundsException -> RuntimeException -> Exception -> Throwable
    kind: unchecked exception, message: Array index out of range: 5
OutOfMemoryError -> VirtualMachineError -> Error -> Throwable
    kind: Error (serious, do not try to recover), message: Java heap space
```

Notice that creating an exception object does not throw it. The program built five `Throwable` objects and simply inspected them. Throwing is a separate action performed by the `throw` statement.

## Checked versus unchecked exceptions

This is the rule the compiler enforces:

- An exception is **unchecked** if its class is `RuntimeException`, `Error`, or a subclass of either.
- Every other `Throwable` is **checked**: `Exception` itself, `IOException`, `InterruptedException`, `SQLException`, and so on.

For a **checked** exception, the compiler applies the *catch or declare* requirement. If a statement can throw a checked exception, the enclosing method must either:

1. **catch** it with a `try`/`catch` that handles that type (or a supertype), or
2. **declare** it with a `throws` clause, passing the obligation to its own callers.

For **unchecked** exceptions and errors there is no such compiler obligation. You *may* catch them or list them in `throws`, but nothing forces you to.

| Category | Base class | Compiler forces catch or declare? | Typical meaning | Examples |
|---|---|---|---|---|
| Checked | `Exception` (but not `RuntimeException`) | Yes | External condition a caller may recover from | `IOException`, `InterruptedException` |
| Unchecked exception | `RuntimeException` | No | Bug or violated contract | `NullPointerException`, `IllegalArgumentException` |
| Error | `Error` | No | JVM or environment failure | `OutOfMemoryError`, `StackOverflowError` |

> **Warning:** "Unchecked" means *the compiler does not check it*. It does not mean harmless. A `NullPointerException` will crash your program just as surely as an `IOException`.

### The throws clause is part of the contract

A method's signature tells callers what they must be prepared for. Compare these two methods:

```java
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;

public class ConfigLoader {
    // "throws IOException" is part of the method's contract.
    static String load(Path path) throws IOException {
        return Files.readString(path);
    }

    // Unchecked: the compiler does not force callers to handle this.
    static int parseTimeout(String text) {
        return Integer.parseInt(text);
    }

    public static void main(String[] args) throws IOException {
        Path primary = Path.of("settings.conf");
        Path fallback = Path.of("defaults.conf");
        Files.writeString(fallback, "timeout=30");

        String config;
        try {
            config = load(primary);
        } catch (NoSuchFileException e) {
            System.out.println("missing " + e.getMessage() + ", using " + fallback);
            config = load(fallback);
        }
        System.out.println("config: " + config);

        String value = config.substring(config.indexOf('=') + 1);
        System.out.println("timeout seconds: " + parseTimeout(value));
        System.out.println("parse \"thirty\": " + parseTimeout("thirty"));
    }
}
```

```text
missing settings.conf, using defaults.conf
config: timeout=30
timeout seconds: 30
Exception in thread "main" java.lang.NumberFormatException: For input string: "thirty"
	at java.base/java.lang.NumberFormatException.forInputString(NumberFormatException.java:67)
	at java.base/java.lang.Integer.parseInt(Integer.java:662)
	at java.base/java.lang.Integer.parseInt(Integer.java:778)
	at ConfigLoader.parseTimeout(ConfigLoader.java:14)
	at ConfigLoader.main(ConfigLoader.java:33)
```

Walk through what happened:

1. `load` declares `throws IOException`. Every caller must acknowledge it. `main` handles one specific subtype, `NoSuchFileException`, because it has a sensible recovery: use a fallback file. Other I/O failures (permissions, disk errors) still propagate, which is why `main` also declares `throws IOException`.
2. `parseTimeout` can throw `NumberFormatException`, but it is unchecked, so the compiler accepted the code without any `try`. When `"thirty"` arrived, the exception propagated out of `main` and ended the program.

The checked exception made a *recovery decision visible*. The unchecked one silently relied on the caller passing good data.

## What happens under the hood

How does the compiler know that `Files.readString` can throw `IOException`? It reads the method's declaration in the JDK class file, which includes a `throws IOException` clause. For every call in your method body, the compiler collects the checked exceptions that might escape. Then it subtracts the ones handled by an enclosing `catch`. Anything left over must appear in your own `throws` clause, or compilation fails.

At run time, the JVM does not care about checked versus unchecked at all. The distinction exists only in the compiler. When an exception is thrown, the JVM consults each method's *exception table* (a list of protected bytecode ranges and handler types) to find a matching handler, frame by frame, up the stack. This is why a checked exception thrown through unusual means (for example from code compiled separately) still propagates normally at run time.

Constructing a `Throwable` also records the stack trace at that moment by calling `fillInStackTrace()`. That is why the trace points at the line where the exception object was *created*, which is almost always the line where it was thrown.

## Choosing between checked and unchecked

When you design your own methods, ask one question: **what can the immediate caller usefully do about this failure?**

- If a well-written caller can reasonably *recover* (retry, pick another file, ask the user again) and the failure is caused by the outside world rather than a bug, a checked exception makes that obligation visible.
- If the failure means the caller broke the contract (passed `null`, a negative quantity, an index out of range), an unchecked exception such as `IllegalArgumentException` or `IllegalStateException` is appropriate. Forcing every caller to catch a bug report produces meaningless handlers.
- If the failure is an `Error`, do not handle it in ordinary application code. Let it reach the top-level, where it is logged and the process is restarted or shut down.

Classifying common situations:

| Situation | Suggested category | Reason |
|---|---|---|
| Configuration file is missing | Checked (`IOException`) | Caller may use defaults or report clearly |
| Amount argument is negative | Unchecked (`IllegalArgumentException`) | Caller violated the contract |
| Method called on a closed connection | Unchecked (`IllegalStateException`) | Object used in the wrong state |
| Array index past the end | Unchecked, fix the bug | Retrying cannot help |
| Heap exhausted | `Error`, do not catch | The JVM itself is in trouble |
| Thread interrupted while waiting | Checked (`InterruptedException`) | Caller must stop or restore the interrupt flag |

> **Tip:** `InterruptedException` is a request to stop, not noise. If you catch it and cannot rethrow it, call `Thread.currentThread().interrupt()` to restore the interrupted status so code higher up can see the request.

## Common mistakes

### Mistake 1: Ignoring a checked exception

```java
static String load(Path path) {
    return Files.readString(path);
}
```

```text
Unreported.java:7: error: unreported exception IOException; must be caught or declared to be thrown
        return Files.readString(path);
                               ^
```

Fix: decide who can handle it. Either add `throws IOException` to the signature, or catch it where you have a real recovery.

### Mistake 2: Catching a checked exception that cannot occur

```java
try {
    int x = 1 + 1;
} catch (IOException e) {
    System.out.println("impossible");
}
```

```text
Unreported.java:13: error: exception IOException is never thrown in body of corresponding try statement
```

The compiler knows nothing in the `try` body can throw `IOException`, so the handler is dead code. Fix: remove the handler, or catch it around the call that actually throws it. (This rule does not apply to `Exception` or unchecked types, which is one reason overly broad catches hide mistakes.)

### Mistake 3: Swallowing everything with catch Throwable

```java
try {
    runJob();
} catch (Throwable t) {
    // keep going no matter what
}
```

This catches `OutOfMemoryError`, `StackOverflowError`, and every bug, then continues as if nothing happened. The program may now run with corrupted state and no evidence. Fix: catch the specific exceptions you can handle; let the rest propagate to a top-level handler that logs them.

### Mistake 4: Wrapping every checked exception in RuntimeException by reflex

```java
static String load(Path path) {
    try {
        return Files.readString(path);
    } catch (IOException e) {
        throw new RuntimeException(e);
    }
}
```

This compiles, but it deletes useful information from the method contract: callers no longer see that a missing file is an expected, recoverable condition. Wrapping can be the right choice at an abstraction boundary (you will see how in the next lesson), but doing it everywhere to silence the compiler throws away the benefit of checked exceptions.

## Best practices

- Treat `throws` clauses as documentation of your method's failure contract. Keep them precise: `throws NoSuchFileException` says more than `throws Exception`.
- Use unchecked exceptions for violated preconditions and programming errors; use checked exceptions for external conditions that a caller can realistically act on.
- Never catch `Error` or `Throwable` in ordinary code. A top-level handler (the framework, or the outermost loop of a server) is the only place that should see everything, and only to log and shut down cleanly.
- Do not use exceptions for ordinary control flow such as ending a loop. They are for abnormal events.
- Prefer existing JDK exceptions (`IllegalArgumentException`, `IllegalStateException`, `UnsupportedOperationException`) when they describe the problem precisely.
- When a test expects a failure, assert the *type* of the exception, not just "something was thrown".

## Summary

- Compile-time errors stop compilation, runtime errors throw exceptions while running, and logic errors silently produce wrong results.
- An exception interrupts normal flow and travels up the call stack until a handler catches it; if none does, the thread ends and the stack trace is printed.
- All throwable objects extend `Throwable`, which splits into `Error` and `Exception`; `RuntimeException` is a special subclass of `Exception`.
- Checked exceptions (every `Exception` that is not a `RuntimeException`) must be caught or declared with `throws`. `RuntimeException` and `Error` subclasses carry no such compiler obligation.
- The checked/unchecked distinction is enforced only by the compiler; the JVM propagates all throwables the same way.
- Choose the category based on what the caller can usefully do, not on what silences the compiler.

## Practice

### Warm-up

1. Write a program that triggers `ArithmeticException`, `ArrayIndexOutOfBoundsException`, and `NumberFormatException` one at a time (comment out the others). Record each message and the line number in the trace.
2. Extend `HierarchyTour` with `InterruptedException`, `NoSuchFileException`, `StackOverflowError`, and `UnsupportedOperationException`. Predict each chain before running it.

### Core

1. Classify these failures as checked, unchecked, or error, and write one sentence describing who should respond: file missing, negative domain amount, index bug, exhausted heap, interrupted wait, unknown enum name from user input.
2. Write `static String firstLine(Path path)` that reads a file. First make it declare `throws IOException`. Then write two callers: one that recovers from `NoSuchFileException` with a default, and one that lets the exception propagate.
3. Find a logic error in a small grade calculator of your own: compute a percentage with `int` arithmetic, observe the wrong answer, then write a test value that exposes it.

### Challenge

1. Design the failure contract for a `TemperatureSensor.read()` method used by a thermostat. List each possible failure (sensor disconnected, value out of physical range, bug in calibration table), choose a category for each, and justify it by describing the caller's recovery action.

## Check your understanding

1. What is the difference between a runtime error and a logic error, and which one is harder to detect?
2. Which class is the root of everything that can be thrown, and what are its two direct subclasses in the standard hierarchy?
3. Is `NumberFormatException` checked or unchecked? Explain using its superclass chain.
4. What two options does the compiler give you when your method calls something that can throw a checked exception?
5. Why is catching `Throwable` to "keep the program running" dangerous?
6. Does the JVM treat checked and unchecked exceptions differently at run time?
