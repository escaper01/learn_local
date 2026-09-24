# Chapter 15 assessment and deliberate practice

This chapter turned "does the code work" into a set of concrete, learnable disciplines: structuring a test suite by boundary and determinism rather than by accident, using JUnit and test doubles deliberately instead of mocking everything reflexively, debugging as a falsifiable process rather than guesswork, and making a running system's behavior genuinely inspectable through structured logs, correlation, and carefully bounded metrics. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Test pyramid, boundaries, determinism, and test naming

A bug is a mismatch between actual and intended behavior, not merely a crash. The test pyramid favors many fast, focused unit tests, fewer integration tests, and a small number of end-to-end tests. A test's "unit" is defined by where you choose to draw its boundary, and test cases should be chosen by partitioning the input space and specifically targeting its boundary values. A test must be deterministic — the same result every time, regardless of execution order, timing, or environment — and its name should state the scenario and expected outcome clearly enough that a failure explains itself without opening the test body.

### Lesson 2: JUnit lifecycle, assertions, parameterized tests, and exceptions

JUnit is a dependency added to a build, not part of the JDK. `@BeforeEach`/`@AfterEach` run around every test method, and `@BeforeAll`/`@AfterAll` run once for the whole class. Core assertions (`assertEquals`, `assertTrue`, `assertThrows`, and similar) are ordinary method calls that always execute, unlike Java's own `assert` statement. `@ParameterizedTest` runs one test body across many rows of data, keeping the assertion logic in one place while varying inputs and expected outputs.

### Lesson 3: Fakes, stubs, spies, mocks, and Mockito judgment

Test doubles exist to replace a real, slow, or hard-to-control collaborator with something predictable and fast. The five kinds — dummy, fake, stub, spy, mock — differ in whether they have real (if simplified) behavior and whether they are used for state testing (checking a resulting value) or interaction testing (verifying a specific call happened). Mockito generates doubles at runtime without hand-written classes, but a mocked collaborator can never prove anything about how the real thing actually behaves — that proof requires an integration test against the real dependency.

### Lesson 4: Reproduction, hypotheses, breakpoints, stepping, and thread dumps

A bug must be reduced to a minimal, reliable reproduction — ideally a failing automated test — before any fix is attempted. A useful debugging hypothesis names a specific, falsifiable mechanism that one targeted observation can prove or disprove. Breakpoints pause execution at a specific line, and stepping (over, into, out) advances from that paused point in controlled ways. A thread dump captures every thread's state and call stack at one instant; `BLOCKED` specifically means waiting to acquire a lock another thread currently holds. Java's `assert` statement is disabled by default, making it useful for internal, development-time invariants but never a substitute for real runtime validation.

### Lesson 5: Structured logging, levels, correlation, metrics, and traces

Structured logging emits explicit key-value fields instead of free-form sentences, making logs reliably queryable. A log level threshold filters out lower-severity messages by default, letting production systems suppress high-volume detail. A correlation ID, often stored per-thread, tags every log line produced while handling one logical request. A metric label creates a separate stored time series per distinct value; an unbounded label (like a user ID) can overload a metrics backend's storage, which is why metric labels must be drawn from a small, bounded set — high-cardinality detail belongs in a log field instead.

## Cheat sheet

### Test doubles

| Double | Has real behavior? | Typical use |
|---|---|---|
| Dummy | No | Fills a required parameter, never actually used |
| Fake | Yes, simplified | A working but lightweight stand-in (an in-memory repository) |
| Stub | Partial, scripted | Returns pre-programmed values for state testing |
| Spy | Real, records calls | A real object plus a record of how it was called |
| Mock | Scripted, verified | Checked with `verify(...)` for interaction testing |

### Debugging workflow

| Step | Purpose |
|---|---|
| Reproduction | The smallest reliable case that still exhibits the bug |
| Hypothesis | A specific, falsifiable explanation of the cause |
| Targeted observation | A print, assertion, or breakpoint that proves or disproves the hypothesis |
| Thread dump | Every thread's state and stack at one instant, essential for hangs and deadlocks |

### Java assert versus real validation

| Mechanism | Enabled by default? | Appropriate for |
|---|---|---|
| `assert condition : message` | No (`-ea` required) | Internal, development-time invariants |
| `if (...) throw new IllegalArgumentException(...)` | Always | Real runtime validation of caller-controlled input |
| JUnit `assertEquals`/`assertTrue`/etc. | Always (ordinary method calls) | Test assertions |

### Logging and metrics

| Concern | Correct choice |
|---|---|
| A field that could take many distinct values (user ID, email) | A structured log field |
| A dimension with a small, known set of values (status code, region) | A metric label |
| Grouping one request's scattered log lines | A correlation ID, cleared before thread reuse |
| Diagnosing behavior across multiple services | A distributed trace, propagating one trace ID |
| Suppressing low-value detail in production | A configured log-level threshold, raised temporarily while investigating |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does a test's name fail to state both the scenario and the expected outcome?
- Is a mock used to verify behavior that only an integration test against the real dependency could actually prove?
- Does a debugging hypothesis fail to name anything a specific observation could disprove?
- Is Java's `assert` statement used anywhere real runtime input validation was actually needed?
- Does a `ThreadLocal` correlation ID lack a `finally` block clearing it before the thread could be reused?
- Is an unbounded value (a user ID, a raw UUID) ever used as a metric label rather than a log field?

## The judgment question

The judgment question describes a mock-heavy test suite that passes while the real SQL fails, and asks what evidence is missing — the correct answer is **integration tests against the chosen database**, not more mock verifications of the same calls and not a longer sleep in unit tests. This is exactly Lesson 3's central limitation of mocks: a mocked repository can only ever confirm that your code called it with the arguments you expected — it proves nothing whatsoever about whether the *real* database would accept that SQL, honor that constraint, or return data in the shape your code assumes. Adding more mock verifications only re-confirms the same already-proven fact (the code calls the collaborator correctly); it can never substitute for actually running the real query against the real (or a realistic, containerized) database. A longer sleep addresses timing, not correctness, and is irrelevant to a mismatch between assumed and actual SQL behavior entirely.

## Approaching the implementation lab

The lab asks for `diagnostic`: return the exact string `expected=<expected>, actual=<actual>` built from two integers.

1. Write the precondition and boundary table first: a normal mismatch, both values equal (including `0, 0`), and at least one negative value.
2. Match the literal text precisely — `"expected="`, then the first integer, `", actual="`, then the second integer — with no extra spaces, punctuation, or line endings, exactly as Lesson 1's determinism-and-precision discipline requires for any test-facing output format.
3. Build the string with straightforward concatenation (`"expected=" + value1 + ", actual=" + value2`); there is no formatting subtlety here beyond matching the literal text exactly.
4. Keep the method deterministic and side-effect-free, exactly as every function lab in this course requires: no printing, purely a function of its two inputs.

## Approaching the debug lab

The debug lab's check relies on Java's `assert` statement, which is silently skipped entirely (including never evaluating its condition) without the `-ea` JVM flag — so `failed` never becomes `true`, and the program incorrectly prints `false` instead of the required `true`.

1. Run the program and confirm it currently prints `false` instead of the expected `true`.
2. Recall Lesson 4's exact distinction, reinforced by Lesson 1: `assert` statements do nothing at all unless the JVM is launched with `-ea`, while an explicit `if` that throws always runs, regardless of any launch flag.
3. Replace the `assert 2+2==5;` statement with an explicit check that always executes — for example, `if (2 + 2 != 5) { throw new AssertionError(); }` — inside the same `try`/`catch` structure, keeping the same `failed` flag pattern.
4. Confirm your fix now prints `true`, and be ready to explain, without consulting the answer, why `assert` silently does nothing without `-ea` while an explicit `throw` does not.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Write a small class with a real dependency, then create a stub version (for state testing) and a mock version (for interaction testing) of the same collaborator, demonstrating both testing styles against the identical class under test.
2. Take a method with a deliberately introduced bug, write a specific and falsifiable hypothesis about its cause, confirm or refute it with a single targeted observation, then fix it and add a regression test.
3. Build a small structured logger with a configurable level threshold and a `ThreadLocal`-based correlation ID, and simulate two concurrent "requests" on separate threads to confirm their log lines never cross-contaminate.
4. Design a metric-emitting utility that deliberately uses only bounded labels, and write a comment explaining what label you deliberately excluded and why it would have caused unbounded cardinality.
5. Reproduce this chapter's `assert`-versus-`-ea` behavior yourself: write a program using `assert` for an invariant, run it both with and without `-ea`, and confirm the two runs behave differently.

## Self-assessment

You are ready for Chapter 16 when you can do all of the following without notes:

- Explain the test pyramid's shape and why unit tests should dominate the suite by count.
- Choose the right test double (dummy, fake, stub, spy, or mock) for a given testing need, and explain why a mocked collaborator can never prove real-world integration correctness.
- State a debugging hypothesis specific enough that a single observation could disprove it.
- Explain why Java's `assert` statement is unsuitable as a substitute for real runtime input validation.
- Explain what a correlation ID accomplishes, and why it must be cleared before a pooled thread is reused.
- Explain why an unbounded-cardinality value must never be used as a metric label, and where that same information belongs instead.
- Explain why a test's name should state both its scenario and its expected outcome clearly enough for a failure to explain itself without opening the test body.
