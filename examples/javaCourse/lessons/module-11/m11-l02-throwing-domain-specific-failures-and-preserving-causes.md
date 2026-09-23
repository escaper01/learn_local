# Throwing domain-specific failures and preserving causes

In the previous lesson you saw exceptions thrown by the JDK. Professional code also *throws its own*. When a caller passes a negative deposit, when an account is used after it was closed, or when a report cannot be loaded, your code must stop and say clearly what went wrong, in the language of your application rather than the language of files and sockets.

Doing this well is a design skill. A good exception names the operation that failed, carries safe and useful context, and keeps the original low-level exception attached as its **cause**, so that the person debugging at 3 a.m. still has the full chain of evidence.

What you will learn:

- How the `throw` statement works and what happens to the rest of the method
- When to use the standard exceptions `IllegalArgumentException`, `IllegalStateException`, `NullPointerException`, and `UnsupportedOperationException`
- How to write custom checked and unchecked exception classes with extra fields
- How to translate a low-level exception into a domain exception without losing the cause
- How to walk a cause chain with `getCause()`
- How to separate "not found" from "could not find out", and why to validate before mutating state

## The throw statement

`throw` takes any expression whose type is a `Throwable` and throws that object. Execution of the current method stops at that point, exactly as if a JDK method had thrown.

Fragment:

```java
if (amount <= 0) {
    throw new IllegalArgumentException("deposit must be positive, was " + amount);
}
balance += amount;   // skipped when the exception is thrown
```

Three details matter:

- You almost always write `throw new SomeException(...)`. Creating the object records the stack trace; `throw` starts propagation.
- A `throw` statement ends the flow of control, like `return`. The compiler reports `unreachable statement` for code directly after it in the same block.
- If the thrown type is checked, the enclosing method must catch it or declare it with `throws`, exactly as for any other checked exception.

## Standard exceptions for violated contracts

Before inventing new classes, reach for the JDK exceptions that every Java developer already understands.

| Exception | Throw it when | Example message |
|---|---|---|
| `IllegalArgumentException` | An argument has an invalid value | `deposit must be positive, was -20` |
| `NullPointerException` | A required argument is `null` | `id must not be null` |
| `IllegalStateException` | The object is in the wrong state for this call | `account ACC-1 is closed` |
| `UnsupportedOperationException` | The operation is not supported at all | `read-only view` |
| `IndexOutOfBoundsException` | An index is outside the valid range | `index 7, size 3` |

`java.util.Objects` provides helpers that throw these for you: `Objects.requireNonNull(value, message)` throws `NullPointerException`, and `Objects.checkIndex(index, length)` throws `IndexOutOfBoundsException`.

The following program guards an account with all three of the most common checks.

```java
import java.util.Objects;

public class ThrowBasics {
    public static void main(String[] args) {
        Account account = new Account("ACC-1", 100);
        account.deposit(50);
        System.out.println("balance = " + account.balance());

        try {
            account.deposit(-20);
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }

        account.close();
        try {
            account.deposit(10);
        } catch (IllegalStateException e) {
            System.out.println("rejected: " + e.getMessage());
        }

        try {
            new Account(null, 0);
        } catch (NullPointerException e) {
            System.out.println("rejected: " + e.getMessage());
        }
        System.out.println("final balance = " + account.balance());
    }
}

final class Account {
    private final String id;
    private long balance;
    private boolean open = true;

    Account(String id, long initialBalance) {
        this.id = Objects.requireNonNull(id, "id must not be null");
        if (initialBalance < 0) {
            throw new IllegalArgumentException(
                    "initial balance must be >= 0, was " + initialBalance);
        }
        this.balance = initialBalance;
    }

    void deposit(long amount) {
        if (!open) {
            throw new IllegalStateException("account " + id + " is closed");
        }
        if (amount <= 0) {
            throw new IllegalArgumentException("deposit must be positive, was " + amount);
        }
        balance += amount;
    }

    void close() {
        open = false;
    }

    long balance() {
        return balance;
    }
}
```

```text
balance = 150
rejected: deposit must be positive, was -20
rejected: account ACC-1 is closed
rejected: id must not be null
final balance = 150
```

Notice that every rejected call left the balance untouched. The checks happen *before* `balance += amount`, so a failure cannot leave the object half-updated. A constructor that throws never produces an object at all, so no caller can ever hold an `Account` with a `null` id.

## Writing custom exceptions

Create your own exception class when callers need to *distinguish* a failure from others, or when the failure carries data a handler can use.

To make a custom exception:

1. Choose the superclass: extend `Exception` for a checked exception, `RuntimeException` for an unchecked one.
2. Provide constructors that pass a message (and, when translating, a cause) to `super(...)`.
3. Add `final` fields for structured context, with getters, so handlers do not have to parse the message text.

```java
import java.util.HashMap;
import java.util.Map;

public class Bank {
    public static void main(String[] args) {
        Ledger ledger = new Ledger();
        ledger.open("alice", 120);

        try {
            ledger.withdraw("alice", 50);
            ledger.withdraw("alice", 100);
            System.out.println("second withdrawal succeeded");
        } catch (InsufficientFundsException e) {
            System.out.println(e.getMessage());
            System.out.println("shortfall = " + e.shortfall());
        }
        System.out.println("alice balance = " + ledger.balance("alice"));

        try {
            ledger.withdraw("bob", 10);
        } catch (InsufficientFundsException e) {
            System.out.println("not reached");
        } catch (UnknownAccountException e) {
            System.out.println(e.getMessage());
        }
    }
}

/** Checked: a caller can recover, for example by offering a smaller amount. */
final class InsufficientFundsException extends Exception {
    private final long requested;
    private final long available;

    InsufficientFundsException(long requested, long available) {
        super("requested " + requested + " but only " + available + " available");
        this.requested = requested;
        this.available = available;
    }

    long shortfall() {
        return requested - available;
    }
}

/** Unchecked: asking for an account that does not exist is a caller defect here. */
final class UnknownAccountException extends RuntimeException {
    UnknownAccountException(String accountId) {
        super("unknown account: " + accountId);
    }
}

final class Ledger {
    private final Map<String, Long> balances = new HashMap<>();

    void open(String id, long initial) {
        balances.put(id, initial);
    }

    long balance(String id) {
        Long value = balances.get(id);
        if (value == null) {
            throw new UnknownAccountException(id);
        }
        return value;
    }

    void withdraw(String id, long amount) throws InsufficientFundsException {
        long current = balance(id);                 // 1. validate everything first
        if (amount > current) {
            throw new InsufficientFundsException(amount, current);
        }
        balances.put(id, current - amount);         // 2. only then change state
    }
}
```

```text
requested 100 but only 70 available
shortfall = 30
alice balance = 70
unknown account: bob
```

The design choices are deliberate:

- `InsufficientFundsException` is **checked** because a normal, correct caller (a checkout screen) can respond: show the shortfall and offer a smaller amount. The compiler forces `withdraw` callers to think about it.
- `UnknownAccountException` is **unchecked** because, in this design, callers are expected to use only ids that exist. Asking for `"bob"` is a defect in the calling code, not a business situation.
- `shortfall()` exposes data as a typed value. A handler never needs to parse `"requested 100 but only 70 available"`.
- The failed withdrawal did not change Alice's balance. Validate, then mutate.

> **Tip:** Name exceptions after *what went wrong in the domain*, ending with `Exception`: `InsufficientFundsException`, `TaskNotFoundException`, `ForbiddenTransitionException`. A name like `MyException` or `ErrorException` tells a reader nothing.

## Translating exceptions and preserving causes

Layers of an application speak different languages. A file-reading helper speaks in paths and `IOException`. A report service speaks in report ids. A web controller speaks in HTTP status codes. When a low-level failure crosses into a higher layer, you often **translate** it into an exception that makes sense at that level.

The danger in translation is losing evidence. The original `NoSuchFileException` knows *which file* was missing and *where* in the code it was detected. If the new exception forgets it, that knowledge is gone forever.

Every standard `Throwable` constructor family includes a version that accepts a **cause**:

```java
new RuntimeException(String message, Throwable cause)
new Exception(String message, Throwable cause)
new IllegalArgumentException(String message, Throwable cause)
```

Passing the caught exception as `cause` links the two objects. Later, `getCause()` returns the original, with its own type, message, and stack trace intact. A printed stack trace shows it under a `Caused by:` heading.

```java
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class ReportService {
    public static void main(String[] args) {
        try {
            loadReport("q3-sales");
        } catch (ReportLoadException e) {
            System.out.println("Caught: " + e);
            Throwable current = e;
            int depth = 0;
            while (current != null) {
                System.out.println("  ".repeat(depth) + "- " + current.getClass().getName()
                        + ": " + current.getMessage());
                current = current.getCause();
                depth++;
            }
        }

        try {
            loadReportLosingCause("q3-sales");
        } catch (ReportLoadException e) {
            System.out.println("Without the cause: getCause() = " + e.getCause());
        }
    }

    static String loadReport(String reportId) {
        Path file = Path.of("reports", reportId + ".csv");
        try {
            return Files.readString(file);
        } catch (IOException e) {
            throw new ReportLoadException(reportId, e);        // evidence kept
        }
    }

    static String loadReportLosingCause(String reportId) {
        try {
            return Files.readString(Path.of("reports", reportId + ".csv"));
        } catch (IOException e) {
            throw new ReportLoadException(reportId, null);     // evidence discarded
        }
    }
}

final class ReportLoadException extends RuntimeException {
    ReportLoadException(String reportId, Throwable cause) {
        super("Could not load report " + reportId, cause);
    }
}
```

```text
Caught: ReportLoadException: Could not load report q3-sales
- ReportLoadException: Could not load report q3-sales
  - java.nio.file.NoSuchFileException: reports/q3-sales.csv
Without the cause: getCause() = null
```

With the cause, the diagnostic chain says *what the application was trying to do* (load report `q3-sales`) and *why it failed underneath* (the exact file path was missing). Without the cause, the second half is simply gone. Nothing about translation requires hiding the original; the cause parameter exists precisely so abstraction boundaries do not destroy diagnostic evidence.

### Step-by-step trace of a translation

1. `Files.readString` fails and throws `NoSuchFileException("reports/q3-sales.csv")`, capturing its stack trace.
2. The `catch (IOException e)` block in `loadReport` receives it; `e` refers to that object.
3. `new ReportLoadException(reportId, e)` calls `RuntimeException(String, Throwable)`, which stores `e` in the new object's cause field and captures a *second* stack trace at the translation point.
4. The new exception propagates to `main`. Its `getCause()` returns the original object unchanged.
5. The loop in `main` follows `getCause()` until it returns `null`, printing each link.

> **Note:** If a class offers no cause constructor, call `initCause(cause)` once on the new exception before throwing it. It can be called at most once, and not at all if a cause was already set through a constructor.

### When to translate and when to let it propagate

- **Translate** when the higher layer's callers should not depend on implementation details. A `ReportRepository` that later moves from files to a database should not suddenly start throwing `SQLException` at its callers.
- **Let it propagate unchanged** when the caller genuinely works at the same level. A file-copy utility should simply declare `throws IOException`.
- **Translate once**, at the boundary. Wrapping the same failure at every layer produces chains ten levels deep that say the same thing repeatedly.
- `java.io.UncheckedIOException` is the JDK's standard unchecked wrapper for an `IOException`, used for example by streams returned from `Files.lines`.

## Failure versus absence

Not every "nothing" is a failure. Searching for a user id that does not exist is a *normal* outcome with a correct answer: "there is no such user". Failing to reach the user database is different: the correct answer is "I do not know". Mixing the two is one of the most damaging design mistakes in real systems, because a caller who receives "no user" may create a duplicate, delete data, or show a misleading message.

```java
import java.util.Map;
import java.util.Optional;

public class AbsenceVsFailure {
    public static void main(String[] args) {
        UserStore healthy = new UserStore(Map.of("u1", "Mina"), true);
        UserStore broken = new UserStore(Map.of("u1", "Mina"), false);

        System.out.println(describe(healthy, "u1"));
        System.out.println(describe(healthy, "u9"));
        System.out.println(describe(broken, "u1"));
    }

    static String describe(UserStore store, String id) {
        try {
            return store.findName(id)
                    .map(name -> "found " + name)
                    .orElse("no user " + id);
        } catch (StoreUnavailableException e) {
            return "cannot answer right now: " + e.getMessage();
        }
    }
}

final class StoreUnavailableException extends RuntimeException {
    StoreUnavailableException(String message) {
        super(message);
    }
}

final class UserStore {
    private final Map<String, String> names;
    private final boolean reachable;

    UserStore(Map<String, String> names, boolean reachable) {
        this.names = names;
        this.reachable = reachable;
    }

    /** Empty means "definitely absent"; an exception means "could not find out". */
    Optional<String> findName(String id) {
        if (!reachable) {
            throw new StoreUnavailableException("user store unreachable");
        }
        return Optional.ofNullable(names.get(id));
    }
}
```

```text
found Mina
no user u9
cannot answer right now: user store unreachable
```

The method has three distinct outcomes, and the caller can tell them apart. If `findName` had caught the outage and returned `Optional.empty()`, the third line would have claimed that `u1` does not exist, which is false. The same reasoning applies to collections: returning an empty list after a storage outage makes "there are no orders" indistinguishable from "we could not load the orders".

## Safe messages

Exception messages end up in logs, monitoring tools, bug reports, and sometimes in front of users. Put in the message what a developer needs to locate the problem: the operation, stable identifiers, and the offending value when it is not sensitive. Keep out:

- passwords, tokens, API keys, session ids
- full file contents or request bodies
- personal data such as addresses or card numbers
- arbitrary user input of unbounded length

`"Could not load report q3-sales"` is good. `"Login failed for user bob with password hunter2"` is a security incident.

## Common mistakes

### Mistake 1: Throwing a checked exception without declaring it

```java
void withdraw(String id, long amount) {
    if (amount > balance(id)) {
        throw new InsufficientFundsException(amount, balance(id));
    }
}
```

```text
error: unreported exception InsufficientFundsException; must be caught or declared to be thrown
```

Fix: add `throws InsufficientFundsException` to the method signature, so callers see the obligation.

### Mistake 2: Translating without the cause

```java
} catch (IOException e) {
    throw new ReportLoadException("Could not load report " + id);  // cause lost
}
```

The program still reports a failure, but `getCause()` returns `null` and the stack trace has no `Caused by:` section. Nobody can tell whether the file was missing, unreadable, or corrupt. Fix: pass `e` as the cause argument.

### Mistake 3: Copying only the message

```java
} catch (IOException e) {
    throw new IllegalStateException(e.getMessage());
}
```

This keeps a string but loses the original *type* and *stack trace*. A message like `reports/q3-sales.csv` on its own does not even say that the file was missing. Fix: `throw new IllegalStateException("could not load settings", e);`

### Mistake 4: Mutating before validating

```java
void transfer(Account from, Account to, long amount) {
    from.withdrawUnchecked(amount);
    if (!to.isOpen()) {
        throw new IllegalStateException("target closed");  // money already gone
    }
    to.depositUnchecked(amount);
}
```

The exception is thrown after the first account was debited, so the money vanishes. Fix: perform every check that can fail first, then perform the mutations; for multi-step operations that can still fail midway, define rollback or use a transaction.

### Mistake 5: Hiding a failure as absence

```java
List<Order> findOrders(String customer) {
    try {
        return database.query(customer);
    } catch (SQLException e) {
        return List.of();   // outage now looks like "no orders"
    }
}
```

Fix: let a failure propagate (translated if appropriate). Return empty only when the answer really is "none".

## Best practices

- Prefer standard JDK exceptions when they describe the problem; create custom exceptions when callers must distinguish the failure or need structured data from it.
- Give custom exceptions a constructor that accepts a cause, even if you do not need it yet.
- Store handler-relevant context in typed fields, not only in the message string.
- Validate all inputs and state before changing anything, so a thrown exception leaves objects unchanged.
- Translate at abstraction boundaries, translate once, and always chain the cause.
- Keep messages specific and free of secrets and personal data.
- Distinguish absence (`Optional.empty()`, empty collection) from failure (an exception).

## Summary

- `throw new X(...)` stops the current method and starts propagation; checked types must still be caught or declared.
- Use `IllegalArgumentException` for bad arguments, `IllegalStateException` for wrong object state, `NullPointerException` (often via `Objects.requireNonNull`) for missing required values.
- Custom exceptions extend `Exception` (checked) or `RuntimeException` (unchecked), pass message and cause to `super`, and may carry typed fields.
- Passing the original exception as the cause preserves its type, message, and stack trace across abstraction translation; `getCause()` retrieves it and stack traces show it as `Caused by:`.
- "Not found" and "could not find out" are different outcomes and must stay distinguishable.

## Practice

### Warm-up

1. Add a `withdraw` method to the `Account` class from `ThrowBasics` that rejects non-positive amounts, withdrawals on a closed account, and amounts greater than the balance. Verify the balance is unchanged after each rejection.
2. Change `ReportService` so the report file exists, and confirm no exception is thrown. Then remove it again and print `e.getCause().getClass()`.

### Core

1. Design exceptions for a task tracker: unknown task id, forbidden status transition (for example DONE back to OPEN), and unavailable repository. Decide checked or unchecked for each and write a one-line justification.
2. Simulate a two-level translation: a `readFile` helper throws `IOException`, a `TaskRepository` translates it to `RepositoryUnavailableException`, and a `TaskService` lets it propagate. Print the full cause chain from `main`.
3. Write a test-style `main` that proves a failed withdrawal leaves the balance unchanged and that the exception message does not contain a secret PIN passed to the method.

### Challenge

1. Implement `transfer(from, to, amount)` across two ledgers so that any failure (unknown target account, insufficient funds, closed account) leaves both balances exactly as they were. Explain in comments why the order of operations guarantees it.

## Check your understanding

1. What happens to the statements after a `throw` in the same method?
2. When would you create a custom exception class instead of using `IllegalArgumentException`?
3. What does the second constructor argument in `super(message, cause)` accomplish, and how do you get that object back later?
4. What information is lost if you rethrow `new IllegalStateException(e.getMessage())`?
5. Why is returning an empty list after a database outage misleading to callers?
6. Why should validation happen before any state is changed?
