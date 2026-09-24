# Reproduction, hypotheses, breakpoints, stepping, and thread dumps

Debugging is not "staring at code until something looks wrong" — it is a disciplined, falsifiable process: reproduce the failure reliably, form a specific hypothesis about its cause, and use a targeted observation to prove that hypothesis right or wrong before touching a single line of the fix. This lesson covers that process end to end, plus the concrete tools — breakpoints, stepping, and thread dumps — that let you observe a running program's actual state instead of guessing at it.

What you will learn:

- Why a minimal, reliable reproduction must come before any attempt to fix a bug
- What makes a debugging hypothesis genuinely useful: it must be specific enough that an observation could prove it false
- Breakpoints and stepping: pausing execution and advancing through it one controlled step at a time
- Thread dumps: capturing every thread's current state and call stack at a single moment, and what states like `BLOCKED` and `TIMED_WAITING` actually mean

## Reproduction: the failure must be reliable before it can be fixed

The very first step of debugging anything is reducing the failure to the smallest, most reliable case that still exhibits it — a single method call with concrete inputs, ideally captured as an automated test, rather than "the whole application sometimes behaves oddly." Without a reliable reproduction, you cannot tell whether a change actually fixed anything or simply changed the odds of the symptom appearing.

```java
public class ReproductionAndHypothesis {
    static int sumFirstN(int[] values, int n) {
        int sum = 0;
        for (int i = 0; i < n - 1; i++) {
            sum += values[i];
        }
        return sum;
    }

    static int sumFirstNFixed(int[] values, int n) {
        int sum = 0;
        for (int i = 0; i < n; i++) {
            sum += values[i];
        }
        return sum;
    }

    public static void main(String[] args) {
        int[] values = {10, 20, 30, 40};

        System.out.println("minimal reproduction: sumFirstN({10,20,30,40}, 2)");
        int actual = sumFirstN(values, 2);
        System.out.println("actual: " + actual + ", expected: 30");

        System.out.println("hypothesis: the loop bound i < n - 1 excludes the last index that should be included");
        System.out.println("targeted observation: printing the loop bound directly");
        int n = 2;
        System.out.println("  loop runs while i < " + (n - 1) + ", so only index 0 is summed, not index 0 and 1");

        int fixed = sumFirstNFixed(values, 2);
        System.out.println("after changing the bound to i < n: " + fixed + ", expected: 30");
    }
}
```

Output:

```text
minimal reproduction: sumFirstN({10,20,30,40}, 2)
actual: 10, expected: 30
hypothesis: the loop bound i < n - 1 excludes the last index that should be included
targeted observation: printing the loop bound directly
  loop runs while i < 1, so only index 0 is summed, not index 0 and 1
after changing the bound to i < n: 30, expected: 30
```

`sumFirstN({10, 20, 30, 40}, 2)` is exactly the kind of minimal reproduction to look for: the smallest input that still demonstrates the wrong behavior (`10` instead of the expected `30`), with no unrelated code, unrelated data, or unrelated application state involved at all. Before touching the fix, this reproduction should become an actual automated test (exactly as Lesson 2's JUnit patterns established) — a failing test is a reproduction that stays reproducible forever, rather than a manual step you have to remember to repeat.

## A useful hypothesis is specific enough to be proven wrong

This is exactly the chapter's concept-check question: a useful debugging hypothesis is **a specific explanation that an observation can disprove** — not a vague feeling that "something about the loop is wrong," and certainly not a conclusion drawn merely from the fact that the code compiles (compilation proves nothing about runtime behavior at all). "The loop bound `i < n - 1` excludes the last index that should be included" is specific enough that a single targeted observation — printing the actual bound the loop is running with — either confirms or refutes it immediately, as this lesson's example just did.

A hypothesis that cannot be disproven by any observation is not a hypothesis at all; it is a guess dressed up as one. "Maybe there's a race condition somewhere" is not yet useful until it names a specific shared variable, a specific pair of threads, and a specific interleaving that would produce the observed symptom — at which point it becomes something a thread dump (covered below) or a targeted log statement can actually confirm or rule out.

## Breakpoints and stepping: pausing time itself

A **breakpoint** pauses program execution the instant it reaches a specific line, letting you inspect every variable's actual current value rather than inferring it from printed output. Once paused, a debugger's stepping controls let you advance in a controlled way: **step over** runs the current line and pauses again on the next one, without entering any method it calls; **step into** follows execution into a called method's own first line; **step out** runs until the current method returns, pausing back in its caller.

Applied to this lesson's own `sumFirstN` bug: a breakpoint placed on the `sum += values[i];` line, combined with stepping through each loop iteration, would let you watch `i` take the value `0`, then immediately see the loop condition `i < n - 1` (with `n = 2`, meaning `i < 1`) become false before `i` ever reaches `1` — directly observing, rather than inferring, that the loop body ran exactly once when it needed to run twice. This is strictly more information than a scattering of `System.out.println` calls provides, because a debugger lets you inspect *every* variable in scope at the paused moment, not only the ones you thought in advance to print — though a well-placed print statement (as demonstrated in this lesson's own runnable example) remains a perfectly legitimate, often faster tool for a hypothesis specific enough to know exactly what value to check.

> **Tip:** A **conditional breakpoint** (supported by every major Java IDE) pauses only when a specified expression is true — for example, only when a loop variable reaches a particular value, or only on the hundredth call to a method. This is essential for a bug that only manifests deep inside a loop or after many prior calls, where an ordinary breakpoint would force you to resume manually hundreds of times first.

## Thread dumps: every thread's state and stack, at one instant

A **thread dump** captures the call stack and current state of every thread in the JVM at a single moment — indispensable for diagnosing deadlocks, unexpected blocking, or threads that appear "stuck." `Thread.getState()` reports a specific enum value describing exactly what a thread is doing right now.

```java
public class ThreadDumpDemo {
    static final Object lock = new Object();

    public static void main(String[] args) throws InterruptedException {
        Thread blocker = new Thread(() -> {
            synchronized (lock) {
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException ignored) {
                }
            }
        }, "blocker-thread");

        Thread waiter = new Thread(() -> {
            synchronized (lock) {
                System.out.println("waiter-thread acquired the lock");
            }
        }, "waiter-thread");

        blocker.start();
        Thread.sleep(200);
        waiter.start();
        Thread.sleep(300);

        System.out.println("blocker-thread state: " + blocker.getState());
        System.out.println("waiter-thread state: " + waiter.getState());

        blocker.join();
        waiter.join();

        System.out.println("after both threads finish:");
        System.out.println("blocker-thread state: " + blocker.getState());
        System.out.println("waiter-thread state: " + waiter.getState());
    }
}
```

Output:

```text
blocker-thread state: TIMED_WAITING
waiter-thread state: BLOCKED
waiter-thread acquired the lock
after both threads finish:
blocker-thread state: TERMINATED
waiter-thread state: TERMINATED
```

`blocker-thread` holds `lock` and is inside `Thread.sleep(1000)`, correctly reported as `TIMED_WAITING` (waiting, but with a bounded time limit, distinct from an unbounded wait). `waiter-thread`, meanwhile, has already started and is attempting to enter the same `synchronized (lock)` block that `blocker-thread` currently holds — correctly reported as `BLOCKED`, the specific state meaning "waiting to acquire a monitor lock held by another thread." A real thread dump (produced by `jstack`, an IDE's "dump threads" action, or a JVM `SIGQUIT` signal) reports exactly this same state, for every thread in the process, along with each thread's full call stack — which is precisely what lets you diagnose a real deadlock: two threads each `BLOCKED` waiting for a lock the other one holds, visible directly in their respective stack traces without needing to guess which two threads are involved.

## Assertions: turning a hypothesis into executable, self-checking code

Java's `assert` keyword lets you write a hypothesis directly into the code as an executable check: `assert condition : message` throws `AssertionError` with that message if `condition` is false. Critically, assertions are **disabled by default** — they must be explicitly enabled with the `-ea` JVM flag — which makes them a deliberate development- and test-time tool rather than a production input-validation mechanism (Chapter 11's `IllegalArgumentException` remains the correct choice for validating input a caller actually controls).

```java
public class AssertionsAsHypotheses {
    static int sumFirstNFixed(int[] values, int n) {
        assert n >= 0 && n <= values.length : "n out of range: " + n;
        int sum = 0;
        for (int i = 0; i < n; i++) {
            sum += values[i];
        }
        return sum;
    }

    public static void main(String[] args) {
        boolean assertionsEnabled = false;
        assert assertionsEnabled = true;
        System.out.println("assertions enabled: " + assertionsEnabled);

        int[] values = {10, 20, 30, 40};
        System.out.println("sumFirstNFixed result: " + sumFirstNFixed(values, 2));

        try {
            sumFirstNFixed(values, 10);
            System.out.println("out-of-range call did not throw at the precondition");
        } catch (AssertionError e) {
            System.out.println("assertion caught the violated precondition immediately: " + e.getMessage());
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println("without assertions, the same bad input instead failed later, less clearly: " + e.getClass().getSimpleName());
        }
    }
}
```

Output without `-ea` (the default):

```text
assertions enabled: false
sumFirstNFixed result: 30
without assertions, the same bad input instead failed later, less clearly: ArrayIndexOutOfBoundsException
```

Output with `-ea`:

```text
assertions enabled: true
sumFirstNFixed result: 30
assertion caught the violated precondition immediately: n out of range: 10
```

The identical bad input (`n = 10` against a four-element array) produces two very different diagnostic experiences depending purely on whether assertions are enabled: with `-ea`, the precondition violation is caught at its actual source, with a message stating exactly what went wrong; without it, the same bug surfaces several lines later, inside the loop, as a generic `ArrayIndexOutOfBoundsException` that says nothing about *why* the index went out of range in the first place. This is exactly the value assertions add during development and testing: each one is a standing, automatically-checked hypothesis about a specific invariant, catching a violation at the precise point it actually occurred rather than wherever its downstream consequences happen to eventually surface.

## What happens under the hood

A breakpoint works by having the JVM's debugging interface (JDWP, the Java Debug Wire Protocol) insert a special instruction at the target location that suspends the thread and notifies the attached debugger the moment it is reached; stepping resumes execution with that same mechanism re-armed at the next relevant instruction boundary. `Thread.getState()` reads the thread's state directly from the JVM's own scheduler bookkeeping — the same information a full thread dump reports for every thread simultaneously, which is why a thread dump is often the single fastest way to diagnose a genuinely concurrent bug: it reveals what every thread is actually doing, and blocked on what, without needing to attach a debugger to any one of them individually.

## Common mistakes

**1. Attempting to fix a bug before establishing a minimal, reliable reproduction.** Without one, you cannot tell whether a subsequent change actually fixed the problem or merely changed the odds of it appearing.

**2. Forming a vague hypothesis that no single observation could disprove.** "Something about the loop is wrong" is not falsifiable; "the loop bound excludes the last valid index" is.

**3. Reaching immediately for a debugger when a single well-placed print statement (or a failing assertion) would answer the specific question just as fast.** Stepping through unrelated code wastes time a targeted observation would have avoided.

**4. Confusing `BLOCKED` (waiting to acquire a lock another thread holds) with `WAITING`/`TIMED_WAITING` (waiting voluntarily, for a notification or a timeout) when reading a thread dump.** They point to genuinely different root causes.

**5. Debugging directly against production or another shared, live environment** rather than reproducing the failure in an isolated environment where breakpoints and stepping cannot disrupt other users.

**6. Treating a disabled-by-default `assert` as equivalent to real input validation.** Since assertions are typically off in production, use exceptions like `IllegalArgumentException` for anything a caller could actually violate at runtime; reserve `assert` for internal invariants checked during development and testing.

## Best practices

- Reduce every bug to its smallest reliable reproduction, ideally captured as a failing automated test, before attempting any fix.
- State every debugging hypothesis specifically enough that one targeted observation could prove it false.
- Choose between a print statement, an assertion, and a debugger breakpoint based on which gives you the needed answer fastest, not out of habit.
- Use a conditional breakpoint instead of manually resuming past many irrelevant iterations or calls.
- Reach for a thread dump immediately when diagnosing a hang, deadlock, or unexpectedly blocked thread, rather than guessing from symptoms alone.
- Use `assert` to encode internal invariants as standing, executable hypotheses during development and testing, but never as a substitute for real runtime input validation.

## Summary

- A bug must be reduced to a minimal, reliable reproduction — ideally a failing automated test — before any fix is attempted.
- A useful debugging hypothesis names a specific, falsifiable mechanism that one targeted observation can prove or disprove.
- Breakpoints pause execution at a specific line; step over, step into, and step out advance execution in controlled, specific ways from that paused point.
- A conditional breakpoint pauses only when a specified expression is true, essential for bugs deep inside loops or after many prior calls.
- A thread dump captures every thread's state and call stack at one instant; `BLOCKED` specifically means waiting to acquire a lock another thread currently holds, distinct from a voluntary `WAITING`/`TIMED_WAITING`.

## Practice

Warm-up:

1. Take a method with a deliberately introduced off-by-one bug, write the smallest possible reproduction demonstrating it, and state a specific, falsifiable hypothesis about the cause before looking at the code again.
2. Confirm or refute your hypothesis using a single targeted print statement, then fix the bug and re-verify.
3. Write a two-thread program where one thread holds a lock while another attempts to acquire it, and print both threads' `getState()` values while the second is waiting.

Core:

1. Convert a manual reproduction (a `main` method demonstrating a bug) into a proper failing JUnit test, following Lesson 2's conventions, and then fix the underlying bug so the test passes.
2. Design a small program with a genuine deadlock (two threads each holding one lock and waiting for the other's), and use `getState()` on both threads to confirm both report `BLOCKED`.
3. Write down three hypotheses for a bug of your choosing: one vague and unfalsifiable, and two specific and falsifiable, explaining in a comment what observation would disprove each of the falsifiable ones.

Challenge:

1. Research your IDE's conditional breakpoint feature, and use it to debug a loop that only misbehaves on a specific, hard-to-reach iteration (for example, only every hundredth call), documenting the expression you used.
2. Trigger a real thread dump for a running Java process using `jstack` (or your IDE's "dump threads" action) against a small program you write that deliberately hangs, and identify the exact line each blocked thread is waiting at from the dump's stack trace.

## Check your understanding

1. Why must a bug be reduced to a minimal, reliable reproduction before attempting to fix it?
2. What makes a debugging hypothesis "useful," according to this lesson, and why is a hypothesis that cannot be disproven not actually useful?
3. What is the difference between step over, step into, and step out when using a debugger?
4. When would a conditional breakpoint be preferable to an ordinary one?
5. What does `Thread.getState()` returning `BLOCKED` specifically mean, and how does it differ from `WAITING` or `TIMED_WAITING`?
6. Why is a thread dump often the fastest way to diagnose a genuine deadlock, compared to attaching a debugger to one thread at a time?
7. Why are Java assertions disabled by default, and why does that make them unsuitable as a replacement for real runtime input validation?
