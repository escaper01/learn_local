# Test pyramid, boundaries, determinism, and test naming

Every program you ship makes promises: "withdrawing more than the balance is rejected", "orders of 100 euros get a discount", "a loan is overdue the day after its due date". Tests are how a professional team turns those promises into evidence that is re-checked on every change, by every developer, forever. Without tests, each change is a gamble and every refactor is frightening. With a well-designed suite, you can change code on a Friday afternoon and know within seconds whether you broke something.

This lesson is about *designing* tests before you learn the tools. JUnit, AssertJ, and Mockito (next lessons) only automate what you decide to check. If the decisions are poor, the tools just produce fast, green, useless results.

What you will learn:

- What a bug is, and the vocabulary of defects, errors, and failures
- The difference between unit, integration, functional, and end-to-end tests
- Why the test pyramid is shaped the way it is
- How to find the boundaries of a unit and where a real integration test is needed
- How to choose test cases with equivalence partitions and boundary values
- What code coverage measures, and the important things it cannot tell you
- How to make tests deterministic by controlling time, randomness, and shared state
- Why Java's `assert` keyword is not a reliable checking mechanism
- How to name tests so that a failure explains itself

## What a bug actually is

A **bug** is any difference between what software was *intended* to do and what it *actually* does. Engineers often split that idea into three words:

| Term | Meaning | Example |
|---|---|---|
| Mistake (error) | A human decision that was wrong | The developer believed "100 or more" meant `> 100` |
| Defect (fault, bug) | The wrong code or configuration that results | `if (total > 10_000)` in the source |
| Failure | The observable wrong behavior at runtime | A 100.00 EUR order gets no discount |

A defect can sit in the code for years without causing a failure, because no input ever reaches it. That is exactly why testing is about *choosing inputs*: a test is an experiment designed to make a hidden defect produce a visible failure.

Common families of bugs you will meet in Java:

- **Logic and boundary bugs**: `>` instead of `>=`, loops that stop one element early
- **State bugs**: an object left half-updated after an exception
- **Null and absence bugs**: assuming a map lookup always finds a value
- **Integration bugs**: SQL that does not match the real schema, a wrong file encoding
- **Concurrency bugs**: two threads updating the same counter without synchronization
- **Specification bugs**: the code does what the developer thought, but not what the user needed

Tests catch the first five well. The last one is caught by talking to people and by acceptance tests written from the user's point of view.

## Functional testing versus unit testing

People use many overlapping names for tests. The important distinction is *what question the test answers* and *how much of the system it runs*.

| Kind | Question it answers | Scope | Typical speed |
|---|---|---|---|
| Unit test | Does this small piece of logic behave correctly? | One class or a few collaborating classes, in memory | Milliseconds |
| Integration test | Does my code work with a real boundary? | Code plus a real database, file system, or HTTP client | Hundreds of ms to seconds |
| Functional test | Does this feature do what the requirement says? | A feature exercised through its public entry point, treated as a black box | Seconds |
| End-to-end test | Does a complete user journey work? | The whole deployed application, often through the UI | Seconds to minutes |

A **unit test** is usually written by the developer, knows how the code is structured, and runs entirely in memory. A **functional test** is written from the requirement: "when a customer submits an order of 100 euros, the receipt shows a 10 percent discount". It does not care which classes implement the rule. Both are valuable. Unit tests pinpoint *where* a problem is; functional tests prove that the pieces add up to *what the user asked for*.

> **Note:** "Functional" is contrasted with "non-functional" testing too: performance, security, and accessibility checks test *how well* a system works rather than *what* it does.

## The test pyramid

The test pyramid is a rule of thumb for how many tests of each kind to write:

```text
            /\
           /  \        few end-to-end tests: critical user journeys only
          /----\
         /      \      some integration tests: each real boundary once
        /--------\
       /          \    many unit tests: every rule, branch, and edge case
      /____________\
```

The shape follows from cost. Unit tests are cheap to write, run in milliseconds, and point to the exact line that broke. End-to-end tests are slow, need a running environment, fail for many unrelated reasons (a slow network, a changed button label), and when they fail you still have to hunt for the cause.

So the strategy is: test every rule and edge case at the unit level; test each *boundary* (database mapping, file format, HTTP contract) with a focused integration test; and use a handful of end-to-end tests to prove the critical journeys hang together. Do not repeat all fifty discount edge cases at every level.

The opposite shape, the "ice-cream cone" with mostly manual and end-to-end tests, produces a suite that is slow, flaky, and expensive, so people stop running it.

## Boundaries: where a unit ends

A unit test should be fast and repeatable. Anything that is slow, shared, or outside your control is a **boundary**:

- The database and SQL
- The file system and file encodings
- The network, HTTP APIs, message queues
- The system clock
- Random number generators
- Environment variables and system properties
- Threads and scheduling

Good design places these behind small interfaces or parameters (you saw dependency injection in earlier chapters). The business logic then receives a `Clock`, a `Random`, or an `OrderRepository`, and the unit test passes in a controlled version.

Crucially, replacing a boundary in a unit test means that *the boundary itself is not being tested*. If your repository runs SQL, some other test must run that SQL against a real database. A test double can only answer what you told it to answer; it cannot tell you whether the real thing would agree.

## Choosing test cases: partitions and boundary values

You cannot test every possible `long`. Instead, split the input space into **equivalence partitions**: groups of inputs the code should treat the same way. Then test one representative from each partition, plus the **boundary values** where behavior changes, because that is where off-by-one mistakes live.

For a withdrawal from an account holding 100 cents:

| Partition | Representative | Expected |
|---|---|---|
| Negative amount | -1 | Rejected, balance unchanged |
| Zero | 0 | Rejected, balance unchanged |
| Normal amount | 30 | Accepted, balance 70 |
| Exactly the balance (boundary) | 100 | Accepted, balance 0 |
| Just above the balance (boundary) | 101 | Rejected, balance unchanged |

Notice two things. First, the failure cases assert that *state did not change*, not only that an error was reported. Second, the expected values come from the business rule, worked out by hand, not from calling the code.

Here is that table turned into a complete runnable program, using a plain loop instead of a test framework:

```java
import java.util.List;

public class WithdrawMatrix {

    record Case(String name, long balance, long amount, String expectedOutcome, long expectedBalance) { }

    public static void main(String[] args) {
        List<Case> cases = List.of(
            new Case("negative amount is rejected", 100, -1, "REJECTED", 100),
            new Case("zero amount is rejected", 100, 0, "REJECTED", 100),
            new Case("ordinary amount is accepted", 100, 30, "OK", 70),
            new Case("exact balance empties account", 100, 100, "OK", 0),
            new Case("one cent too much is rejected", 100, 101, "REJECTED", 100)
        );

        int failures = 0;
        for (Case c : cases) {
            Account account = new Account(c.balance());
            String outcome = account.withdraw(c.amount());
            boolean ok = outcome.equals(c.expectedOutcome())
                && account.balance() == c.expectedBalance();
            System.out.printf("%-4s %-32s outcome=%s balance=%d%n",
                ok ? "PASS" : "FAIL", c.name(), outcome, account.balance());
            if (!ok) {
                failures++;
            }
        }
        System.out.println(failures == 0 ? "all cases passed" : failures + " case(s) failed");
    }
}

final class Account {
    private long balanceCents;

    Account(long openingCents) {
        this.balanceCents = openingCents;
    }

    String withdraw(long amountCents) {
        if (amountCents <= 0 || amountCents > balanceCents) {
            return "REJECTED";
        }
        balanceCents -= amountCents;
        return "OK";
    }

    long balance() {
        return balanceCents;
    }
}
```

```text
PASS negative amount is rejected      outcome=REJECTED balance=100
PASS zero amount is rejected          outcome=REJECTED balance=100
PASS ordinary amount is accepted      outcome=OK balance=70
PASS exact balance empties account    outcome=OK balance=0
PASS one cent too much is rejected    outcome=REJECTED balance=100
all cases passed
```

Each case gets a *fresh* `Account`, so no case can be influenced by another. This table-driven shape is exactly what JUnit's parameterized tests automate in the next lesson.

## Coverage: what it measures and what it cannot

A **coverage tool** (JaCoCo is the common one for Java) instruments your bytecode and records which lines and branches executed while the tests ran. The report says things like "87 percent line coverage, 72 percent branch coverage".

Coverage is useful for one job: finding code that *no test executed at all*. Unexecuted code is definitely untested. But the reverse is not true. Coverage records *execution*; it knows nothing about whether any assertion checked the result, or whether the checks that ran were the right checks.

This program shows two suites against a buggy discount rule. Both execute every line of `discountedCents`, so both would report 100 percent line coverage:

```java
public class CoverageIsNotCorrectness {

    // Business rule: orders of 100 euros or more get 10 percent off.
    // Bug: the boundary uses > instead of >=.
    static int discountedCents(int totalCents) {
        if (totalCents > 10_000) {
            return totalCents - totalCents / 10;
        }
        return totalCents;
    }

    static int passed = 0;
    static int failed = 0;

    static void check(boolean condition, String name) {
        if (condition) {
            passed++;
            System.out.println("PASS " + name);
        } else {
            failed++;
            System.out.println("FAIL " + name);
        }
    }

    public static void main(String[] args) {
        System.out.println("-- weak suite: executes every line --");
        int small = discountedCents(5_000);
        int large = discountedCents(20_000);
        check(small > 0, "small order returns something positive");
        check(large > 0, "large order returns something positive");

        System.out.println("-- strong suite: independent expected values --");
        check(discountedCents(9_999) == 9_999, "just below threshold: no discount");
        check(discountedCents(10_000) == 9_000, "exactly at threshold: discount applies");
        check(discountedCents(20_000) == 18_000, "above threshold: 10 percent off");

        System.out.println(passed + " passed, " + failed + " failed");
    }
}
```

```text
-- weak suite: executes every line --
PASS small order returns something positive
PASS large order returns something positive
-- strong suite: independent expected values --
PASS just below threshold: no discount
FAIL exactly at threshold: discount applies
PASS above threshold: 10 percent off
4 passed, 1 failed
```

The weak suite reaches every line and passes, yet it would pass for almost any implementation. The strong suite catches the bug because it (1) checks exact values, (2) derives them from the rule rather than the code, and (3) includes the boundary value.

> **Tip:** Mutation testing tools (PIT is the usual choice for Java) deliberately change your code, for example flipping `>` to `>=`, and check whether any test fails. A surviving mutant is evidence of weak assertions, which is the gap line coverage cannot see.

## Determinism: the same result every time

A **deterministic** test gives the same verdict every time it runs, on every machine, in any order. A **flaky** test sometimes passes and sometimes fails without a code change. Flaky tests are worse than no tests: people learn to ignore red builds.

Common sources of nondeterminism and their fixes:

| Source | Symptom | Fix |
|---|---|---|
| System clock (`LocalDate.now()`) | Test fails at midnight, on month ends, or in another time zone | Inject a `java.time.Clock`; use `Clock.fixed` in tests |
| Randomness | Different data each run | Inject a `Random` or `RandomGenerator` with a fixed seed |
| Hash ordering | Output order of `HashMap`/`HashSet` differs | Assert on sets, sort before comparing, or use ordered collections |
| Shared mutable state | Tests pass alone but fail together | Fresh fixtures per test; no mutable `static` fields |
| Real network or services | Timeouts, rate limits | Test doubles in unit tests; controlled environments for integration tests |
| `Thread.sleep` for waiting | Slow and still racy | Wait on a condition with a timeout, or make the logic synchronous in tests |
| Locale and default charset | Number formats or text decoding differ | Pass `Locale` and `StandardCharsets.UTF_8` explicitly |

Time is the most common culprit. The fix is to make "now" a dependency:

```java
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

public class FixedClockDemo {

    public static void main(String[] args) {
        Clock march10 = Clock.fixed(Instant.parse("2024-03-10T12:00:00Z"), ZoneOffset.UTC);
        Clock march11 = Clock.fixed(Instant.parse("2024-03-11T00:00:00Z"), ZoneOffset.UTC);

        LibraryLoan loan = new LibraryLoan(LocalDate.of(2024, 3, 10));

        report("due today", loan.isOverdue(march10) == false);
        report("one day later", loan.isOverdue(march11) == true);
        System.out.println("today according to test clock: " + LocalDate.now(march10));
    }

    static void report(String name, boolean ok) {
        if (!ok) {
            throw new AssertionError("failed: " + name);
        }
        System.out.println("PASS " + name);
    }
}

final class LibraryLoan {
    private final LocalDate dueDate;

    LibraryLoan(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    // The clock is a parameter, so tests control "now".
    boolean isOverdue(Clock clock) {
        return LocalDate.now(clock).isAfter(dueDate);
    }
}
```

```text
PASS due today
PASS one day later
today according to test clock: 2024-03-10
```

In production you pass `Clock.systemDefaultZone()` (or a clock configured once at startup); in tests you pass a fixed clock. The test now means the same thing in 2024 and in 2034.

## Plain-Java checks and the assert keyword

Java has an `assert` statement, and beginners often assume it is a testing tool. It is not a reliable one. **Assertions are disabled by default.** The JVM skips `assert` statements entirely, including evaluating their condition, unless you start it with `-ea` (enable assertions). An explicit `if` that throws always runs.

```java
public class AssertKeyword {

    public static void main(String[] args) {
        int width = -3;
        assert width > 0 : "width must be positive";
        System.out.println("assert statement finished, width=" + width);

        if (width <= 0) {
            throw new AssertionError("explicit check: width must be positive, was " + width);
        }
        System.out.println("never printed");
    }
}
```

Run normally with `java AssertKeyword.java`:

```text
assert statement finished, width=-3
Exception in thread "main" java.lang.AssertionError: explicit check: width must be positive, was -3
	at AssertKeyword.main(AssertKeyword.java:9)
```

Run with `java -ea AssertKeyword.java`:

```text
Exception in thread "main" java.lang.AssertionError: width must be positive
	at AssertKeyword.main(AssertKeyword.java:5)
```

The same source produces different behavior depending on a launch flag. That is why production validation uses explicit checks (`if` plus an exception, or `Objects.requireNonNull`), and why test frameworks provide assertion *methods* such as `assertEquals`, which are ordinary method calls that always execute.

## Naming tests so failures explain themselves

When a test fails in CI, its name is often the first and only thing you read. A good name states the **scenario** and the **expected behavior**:

- `withdraw_amountAboveBalance_isRejectedAndBalanceUnchanged`
- `isOverdue_dayAfterDueDate_returnsTrue`
- `discount_exactlyAtThreshold_appliesTenPercent`

Bad names describe nothing: `test1`, `testWithdraw`, `worksCorrectly`. Popular conventions include `method_condition_expected`, `shouldXWhenY`, and given/when/then. Pick one convention per project and apply it consistently. JUnit also lets you attach a human sentence with `@DisplayName`, which you will see next lesson.

Inside the test, use the **Arrange, Act, Assert** layout:

```java
// Arrange: build the situation
Account account = new Account(100);

// Act: perform exactly one behavior
String outcome = account.withdraw(101);

// Assert: check every observable consequence
check(outcome.equals("REJECTED"), "outcome");
check(account.balance() == 100, "balance unchanged");
```

One behavior per test keeps failures precise. Several assertions are fine when they all describe the consequences of that one behavior.

## What happens under the hood: from change to verdict

1. You change production code and run the test task (from the IDE or with the build tool).
2. The build tool compiles `src/main/java` and then `src/test/java` against it.
3. A test engine discovers test classes and methods (by annotations, in JUnit).
4. For each test, a fresh fixture is built, the behavior is executed, and assertions compare expected and actual values.
5. A failed assertion throws an `AssertionError`; the engine catches it, records the failure with its message and stack trace, and moves on to the next test.
6. If coverage is enabled, an agent has been recording which bytecode instructions ran; a report is generated at the end.
7. The build tool returns a nonzero exit code if any test failed, which stops the CI pipeline.

## Common mistakes

**Mistake 1: expected values computed by the code under test.**

```java
// Wrong: repeats the implementation, so it shares any bug in it
int expected = total > 10_000 ? total - total / 10 : total;
check(discountedCents(total) == expected, "discount");
```

If the formula is wrong, the test is wrong in exactly the same way and passes. Fix: write the expected literal from the requirement, such as `9_000` for `10_000`.

**Mistake 2: assertions that accept almost anything.**

```java
check(result != null, "returns something");   // passes for nearly any bug
```

Fix: assert the exact value, the exact collection contents, or the exact state change.

**Mistake 3: shared mutable fixtures.**

```java
static final List<String> CART = new ArrayList<>(); // shared by every test
```

The first test adds items; the second test that expects an empty cart now depends on execution order. Fix: create fixtures fresh for every test.

**Mistake 4: reading the real clock.**

```java
boolean overdue = LocalDate.now().isAfter(dueDate); // result depends on today
```

Fix: accept a `Clock` and use `LocalDate.now(clock)`.

**Mistake 5: chasing a coverage percentage.** Teams that require "90 percent coverage" often get tests that execute code without asserting anything meaningful. Fix: treat coverage as a map of untested areas, and review assertions, not percentages.

## Best practices

- Write the case table (partitions, boundaries, failure paths) before writing test code.
- Derive expected values independently from the rule, preferably by hand.
- Assert unchanged state on every failure path.
- Keep unit tests in memory; move real boundaries into focused integration tests.
- Inject `Clock`, random sources, and other boundaries so tests control them.
- Make every test independent: it must pass alone, in any order, and in parallel.
- Name tests by scenario and expectation; read the name aloud as a sentence.
- Temporarily break the code (or use mutation testing) to confirm a test can fail.
- Treat a flaky test as a real defect to fix, not an annoyance to rerun.

## Summary

- A bug is a gap between intended and actual behavior; tests are experiments that make hidden defects visible.
- Unit tests check small pieces quickly; integration tests check real boundaries; functional and end-to-end tests check features and journeys.
- The pyramid puts most checks at the fast, precise unit level and only critical journeys at the expensive top.
- Partitions plus boundary values give a small set of cases with high bug-finding power.
- Coverage shows what executed, not whether the checks were meaningful or correct.
- Deterministic tests control time, randomness, ordering, and shared state.
- The `assert` keyword is off unless `-ea` is passed; explicit checks and framework assertion methods always run.
- Good names and Arrange-Act-Assert make failures self-explanatory.

## Practice

1. **Warm-up:** For a method `isAdult(int age)` where adulthood starts at 18, list the partitions and boundary values, and write the expected result for each by hand.
2. **Warm-up:** Rename these tests so they describe scenario and expectation: `test1`, `testDiscount`, `checkLogin`.
3. **Core:** Extend `WithdrawMatrix` with a daily limit of 500 cents across several withdrawals. Add cases for exactly reaching the limit and exceeding it by one cent, and assert the balance after each rejected attempt.
4. **Core:** Write a `SubscriptionRenewal` class whose `renewsToday` method depends on the date. Make it testable with an injected `Clock` and test the last day of February in a leap year and a non-leap year.
5. **Core:** Take the weak suite from `CoverageIsNotCorrectness` and list three different buggy implementations that it would still accept.
6. **Challenge:** Write a tiny runner that executes a list of test cases in a random order (with a printed seed) and reports failures. Deliberately introduce a shared static fixture and use the seed to reproduce an order-dependent failure.

## Check your understanding

1. Why can a defect exist in code for a long time without ever causing a failure?
2. What is the practical difference between a functional test and a unit test for the same discount rule?
3. A report shows 100 percent line coverage for a class. Which important question about the test suite does that number leave unanswered, and how could you find out?
4. Why does the test pyramid have many unit tests and few end-to-end tests, rather than the other way round?
5. Name three sources of nondeterminism in tests and the technique that removes each one.
6. Why is an explicit `if` that throws `AssertionError` more trustworthy than an `assert` statement in a program started with a plain `java` command?
