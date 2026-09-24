# Purity, side effects, higher-order functions, and testability

The previous four lessons gave you the vocabulary of functional-style Java: lambdas, the standard functional interfaces, method references, and `Optional`. This lesson is about the discipline that makes that vocabulary actually pay off — writing computations that are **pure** wherever possible, treating **side effects** as something explicit rather than incidental, and using **higher-order functions** (functions that accept or return other functions) to build small, genuinely reusable pieces of logic that are trivial to test in isolation.

What you will learn:

- What makes a computation "pure," and what counts as an observable side effect
- Why a pure function can be called any number of times with the same input and never change what the rest of the program observes
- Why safely caching ("memoizing") a function's results depends entirely on that function being pure
- Higher-order functions: writing your own reusable logic (like a retry policy) parameterized by an arbitrary block of behavior
- Injecting a side effect itself as a parameter, so code that would otherwise require real I/O to test becomes trivially testable

## Pure functions versus observable side effects

A function is **pure** when its result depends only on its arguments, and calling it performs no observable mutation of anything outside itself — no writing to a shared field, no I/O, no changing an argument that the caller still holds a reference to. This is exactly the chapter's concept-check question: purity has nothing to do with whether a lambda or a static method implements the logic — it is entirely about whether that logic's result depends only on its inputs, with no external mutation.

```java
import java.util.ArrayList;
import java.util.List;

public class PureVsImpure {
    static int pureDouble(int value) {
        return value * 2;
    }

    static List<Integer> auditLog = new ArrayList<>();

    static int impureDoubleWithLogging(int value) {
        auditLog.add(value);
        return value * 2;
    }

    public static void main(String[] args) {
        System.out.println("pureDouble(5) called twice: " + pureDouble(5) + ", " + pureDouble(5));
        System.out.println("auditLog before any impure call: " + auditLog);

        System.out.println("impureDoubleWithLogging(5): " + impureDoubleWithLogging(5));
        System.out.println("auditLog after one impure call: " + auditLog);

        System.out.println("impureDoubleWithLogging(5) again: " + impureDoubleWithLogging(5));
        System.out.println("auditLog after two impure calls with the same input: " + auditLog);
    }
}
```

Output:

```text
pureDouble(5) called twice: 10, 10
auditLog before any impure call: []
impureDoubleWithLogging(5): 10
auditLog after one impure call: [5]
impureDoubleWithLogging(5) again: 10
auditLog after two impure calls with the same input: [5, 5]
```

Both functions return the identical numeric result (`10`) for the identical input every time — but `pureDouble` leaves absolutely no trace of having been called, while `impureDoubleWithLogging` visibly grows `auditLog` on every single call, even when the argument never changes. Calling `pureDouble(5)` twice in a row is indistinguishable, from the rest of the program's point of view, from calling it once and reusing the result — but calling `impureDoubleWithLogging(5)` twice genuinely is not the same as calling it once, because the second call leaves `auditLog` in a different state than the first one did. That property — a pure call can always be replaced by its result with no change in program behavior — is called **referential transparency**, and it is the entire reason purity matters practically, not just philosophically.

## Why memoization is only safe for pure functions

Referential transparency is not an abstract nicety — it is the specific property that makes an optimization like caching ("memoization") safe at all. A memoizing wrapper assumes that calling the wrapped function again with an already-seen input can simply return the previously cached result, instead of running the function again — an assumption that is only valid if the function is pure.

```java
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

public class MemoizationSafety {
    static <T, R> Function<T, R> memoize(Function<T, R> pureFunction) {
        Map<T, R> cache = new HashMap<>();
        return input -> cache.computeIfAbsent(input, pureFunction);
    }

    static int slowSquare(int n) {
        try {
            Thread.sleep(50);
        } catch (InterruptedException ignored) {
        }
        return n * n;
    }

    static int callCount = 0;

    static int impureCounterIncrement(int n) {
        callCount++;
        return callCount;
    }

    public static void main(String[] args) {
        Function<Integer, Integer> memoizedSquare = memoize(MemoizationSafety::slowSquare);
        long start = System.nanoTime();
        System.out.println("first call: " + memoizedSquare.apply(7));
        long firstMs = (System.nanoTime() - start) / 1_000_000;
        start = System.nanoTime();
        System.out.println("second call, same input: " + memoizedSquare.apply(7));
        long secondMs = (System.nanoTime() - start) / 1_000_000;
        System.out.println("first call took at least 50ms: " + (firstMs >= 50));
        System.out.println("second call was faster (served from cache): " + (secondMs < firstMs));

        Function<Integer, Integer> memoizedButImpure = memoize(MemoizationSafety::impureCounterIncrement);
        System.out.println("memoizing an impure function, first call with 1: " + memoizedButImpure.apply(1));
        System.out.println("calling the same impure function directly (not memoized) with the same logical input: " + impureCounterIncrement(1));
        System.out.println("memoized cache now returns a stale value for the identical input: " + memoizedButImpure.apply(1));
    }
}
```

Output:

```text
first call: 49
second call, same input: 49
first call took at least 50ms: true
second call was faster (served from cache): true
memoizing an impure function, first call with 1: 1
calling the same impure function directly (not memoized) with the same logical input: 2
memoized cache now returns a stale value for the identical input: 1
```

`memoize(MemoizationSafety::slowSquare)` works exactly as intended: `slowSquare` is pure (its result depends only on `n`), so the second call with the same argument correctly and safely returns the cached `49` without paying the 50-millisecond cost again. `memoize(MemoizationSafety::impureCounterIncrement)`, however, wraps a function whose result secretly depends on a hidden, ever-changing `callCount` field rather than purely on its argument — and the consequence is directly visible: the memoized wrapper returns `1` (the cached first result) for input `1` even after a *direct*, non-memoized call with that same input has already advanced `callCount` to `2`. The cache is not "wrong" in any technical sense — it is doing exactly what memoization always does — the bug is that memoization was applied to a function that was never actually pure, silently breaking the assumption the optimization depends on.

## Higher-order functions: parameterizing behavior, not just data

A **higher-order function** is one that accepts a function as an argument, returns a function as its result, or both — `memoize` above is one example. Writing your own higher-order functions lets you factor out a piece of *control flow* (like "try this, and retry a few times if it fails") so it can be reused with any specific operation supplied later, exactly the way a generic collection class is reused with any specific element type.

```java
import java.util.function.Supplier;

public class HigherOrderRetry {
    static <T> T retry(int attempts, Supplier<T> action) {
        RuntimeException lastFailure = null;
        for (int attempt = 1; attempt <= attempts; attempt++) {
            try {
                return action.get();
            } catch (RuntimeException e) {
                lastFailure = e;
                System.out.println("attempt " + attempt + " failed: " + e.getMessage());
            }
        }
        throw lastFailure;
    }

    static int callCount = 0;

    static int flakyOperation() {
        callCount++;
        if (callCount < 3) {
            throw new RuntimeException("temporary failure #" + callCount);
        }
        return 42;
    }

    public static void main(String[] args) {
        int result = retry(5, HigherOrderRetry::flakyOperation);
        System.out.println("eventually succeeded with: " + result);
        System.out.println("total attempts made: " + callCount);
    }
}
```

Output:

```text
attempt 1 failed: temporary failure #1
attempt 2 failed: temporary failure #2
eventually succeeded with: 42
total attempts made: 3
```

`retry` knows absolutely nothing about what `flakyOperation` does — it only knows it received a `Supplier<T>` (any zero-argument, value-returning block of code) and a maximum number of attempts. The retry policy itself — try, catch, log, try again, eventually give up — is written exactly once, completely independent of any specific operation, and reused here via a method reference. This is the same generalization Chapter 8 taught for generic classes, applied to *behavior* instead of *data*: instead of parameterizing a class by the type it holds, `retry` parameterizes a control-flow pattern by the specific action it should perform.

## Testability: injecting the side effect itself

Chapter 12 taught injecting a `Clock` so date-dependent code could be tested without depending on the real system clock. The identical idea extends to *any* side effect: instead of a method hard-coding exactly *how* it reports its result (printing, writing to a file, sending a network request), it accepts that reporting mechanism as a parameter — making the side effect itself an explicit, substitutable dependency.

```java
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

public class TestableSideEffects {
    static void processOrderHardToTest(String orderId, double amount) {
        if (amount <= 0) {
            System.out.println("rejected order " + orderId + ": non-positive amount");
            return;
        }
        System.out.println("processed order " + orderId + " for $" + amount);
    }

    static void processOrder(String orderId, double amount, Consumer<String> sink) {
        if (amount <= 0) {
            sink.accept("rejected order " + orderId + ": non-positive amount");
            return;
        }
        sink.accept("processed order " + orderId + " for $" + amount);
    }

    public static void main(String[] args) {
        System.out.println("hard-to-test version writes directly to standard output:");
        processOrderHardToTest("A1", 100.0);
        processOrderHardToTest("A2", -5.0);

        List<String> captured = new ArrayList<>();
        processOrder("B1", 100.0, captured::add);
        processOrder("B2", -5.0, captured::add);
        System.out.println("testable version captured, with no real output performed: " + captured);
    }
}
```

Output:

```text
hard-to-test version writes directly to standard output:
processed order A1 for $100.0
rejected order A2: non-positive amount
testable version captured, with no real output performed: [processed order B1 for $100.0, rejected order B2: non-positive amount]
```

`processOrderHardToTest` can only ever be verified by capturing real standard output — awkward, and exactly the kind of test that tends to get skipped in practice. `processOrder` takes the exact same decision logic and accepts a `Consumer<String> sink` as a parameter: in production you would pass `System.out::println`, but a test can pass `captured::add` (a plain `ArrayList`) instead, then make ordinary assertions against `captured` with no real I/O, no mocking framework, and no test flakiness from shared console state. The underlying business logic — deciding whether to accept or reject the order — did not change at all; only *where the result goes* became an explicit, injectable choice instead of a hard-coded assumption buried inside the method.

## What happens under the hood

None of this changes anything about how the JVM executes code — `retry`, `memoize`, and `processOrder` are ordinary methods, and the `Supplier`/`Function`/`Consumer` arguments they accept are ordinary functional-interface instances, exactly as Lesson 2 described. What changes is a design discipline: treating "what varies" (the specific operation, the specific side effect, the specific source of the current time) as an explicit parameter rather than something hard-coded inside a method body, so that parameter can be swapped for a test double without needing any special testing framework, reflection trickery, or mocking library at all.

## Common mistakes

**1. Assuming purity is about *how* a function is written (lambda versus method) rather than *what* it does.** Purity is entirely about whether the result depends only on the arguments and no external state is mutated.

**2. Memoizing or otherwise caching a function without first confirming it is actually pure.** Caching an impure function's results can silently return stale, wrong values, exactly as `MemoizationSafety` demonstrated.

**3. Writing a new, one-off retry, timing, or logging wrapper around every individual operation** instead of writing one small higher-order function once and reusing it via a lambda or method reference.

**4. Hard-coding a side effect (printing, writing to a file, calling a real API) directly inside business logic**, making that logic untestable without performing the real side effect.

**5. Confusing "pure" with "never useful."** Real programs need side effects somewhere — the goal is keeping side effects at the edges and explicit, not eliminating them entirely.

## Best practices

- Prefer writing the core of a calculation as a pure function, and push side effects (I/O, mutation, logging) to the smallest, most explicit boundary possible.
- Only apply memoization or other caching to functions you have confirmed are actually pure.
- Factor out reusable control-flow patterns (retry, timing, fallback) into small higher-order functions parameterized by `Supplier`, `Function`, `Consumer`, or another functional interface.
- When a method's side effect makes it hard to test, consider injecting that side effect itself as a parameter, exactly as `Clock` was injected in Chapter 12.
- Keep the decision logic and the reporting mechanism separate, so either one can change or be tested independently of the other.

## Summary

- A pure function's result depends only on its arguments and produces no observable external mutation; this is unrelated to whether it is written as a lambda or a named method.
- Referential transparency — a pure call can always be replaced by its result with no change in behavior — is what makes optimizations like memoization safe; applying memoization to an impure function can produce stale, wrong results.
- A higher-order function accepts or returns another function, letting you factor out and reuse a control-flow pattern (like retry logic) independently of any specific operation.
- Injecting a side effect itself (such as a `Consumer<String>` output sink) as a parameter makes code testable without real I/O, mocking frameworks, or captured console output.
- The goal of this discipline is not eliminating side effects, but keeping them explicit, isolated, and pushed to the boundaries of a program rather than scattered through its core logic.

## Practice

Warm-up:

1. Write one pure and one impure version of a simple calculation of your choosing, and write a short explanation of exactly what makes the impure version impure.
2. Write a higher-order function `static <T> T timed(String label, Supplier<T> action)` that measures and prints how long `action` took to run, then returns its result, and use it to time two different operations.
3. Refactor a method that currently prints its result directly so that it instead accepts a `Consumer<String>` parameter, and demonstrate capturing its output in a `List<String>` instead of printing it.

Core:

1. Write your own generic `memoize` method (or reuse this lesson's) and use it to cache the results of a genuinely pure, moderately expensive calculation, demonstrating a measurable speedup on a repeated call.
2. Extend `HigherOrderRetry`'s `retry` method to also accept a delay (in milliseconds) between attempts, and write a test-style demonstration showing it retries the correct number of times before either succeeding or exhausting its attempts.
3. Design a small "notification" method that decides whether to send an alert based on some condition, accepting the actual sending mechanism as a `Consumer<String>` parameter, and write two demonstrations: one using a real-looking sink (printing), and one using a capturing list, without changing the decision logic at all.

Challenge:

1. Design a small pipeline of higher-order functions — for example, a `compose`-style utility that chains several `Function<T, T>` validation or transformation steps together — and demonstrate it rejecting or transforming several different inputs correctly.
2. Take a method somewhere in a personal or example project that currently mixes a calculation with a hard-coded side effect (printing, writing to a file, or similar), and refactor it into a pure calculation plus an injected side-effect parameter, writing a short explanation of what became easier to test as a result.

## Check your understanding

1. What specifically makes a function "pure," and why is the answer unrelated to whether it is implemented as a lambda or a named method?
2. What is referential transparency, and why does it justify treating a function call as replaceable by its cached result?
3. Why did memoizing an impure function produce a stale, wrong result in this lesson's example, when memoizing a pure function worked correctly?
4. What makes `retry` in this lesson a higher-order function, and what specifically does it let you avoid repeating?
5. How does injecting a `Consumer<String>` parameter make `processOrder` easier to test than `processOrderHardToTest`, without changing its actual decision logic at all?
6. Does writing pure functions mean a real program should have no side effects at all? Why or why not?
