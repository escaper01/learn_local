# Transactions, isolation anomalies, locks, rollback, and deadlocks

A bank transfer between two accounts must debit one and credit the other as a single, indivisible unit — if the process crashes between the two statements, the money must not simply vanish from one account without appearing in the other. This is exactly the problem **transactions** solve, and this closing lesson covers what a transaction actually guarantees, the specific anomalies that occur when multiple transactions run concurrently, the isolation levels that trade correctness against performance, and deadlocks — the one failure mode locking itself can produce.

What you will learn:

- What a transaction is, and the ACID properties it provides
- Why a multi-statement operation must be wrapped in a transaction, with rollback on any failure
- The specific isolation anomalies: dirty reads, non-repeatable reads, and phantom reads
- The standard isolation levels and which anomalies each one prevents
- How row-level locking works, and what a deadlock is
- How to detect and recover from a deadlock at the application level

## What a transaction guarantees: ACID

A **transaction** groups one or more SQL statements into a single unit of work that either fully commits or fully rolls back — there is no partial, half-applied state visible to anyone else. The classic acronym for what a transaction promises:

| Property | Promise |
|---|---|
| **Atomicity** | All statements in the transaction succeed, or none of their effects persist |
| **Consistency** | A transaction moves the database from one valid state to another, respecting every constraint |
| **Isolation** | Concurrent transactions do not see each other's uncommitted changes (to a degree controlled by the isolation level, below) |
| **Durability** | Once committed, a transaction's changes survive a subsequent crash |

```java
Connection connection = dataSource.getConnection();
try {
    connection.setAutoCommit(false); // start an explicit transaction
    try (PreparedStatement debit = connection.prepareStatement(
             "UPDATE account SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?")) {
        debit.setInt(1, 5000);
        debit.setLong(2, fromAccountId);
        debit.setInt(3, 5000);
        int debited = debit.executeUpdate();
        if (debited == 0) {
            throw new IllegalStateException("insufficient funds or account not found");
        }
    }
    try (PreparedStatement credit = connection.prepareStatement(
             "UPDATE account SET balance_cents = balance_cents + ? WHERE id = ?")) {
        credit.setInt(1, 5000);
        credit.setLong(2, toAccountId);
        credit.executeUpdate();
    }
    connection.commit(); // both statements' effects become permanent together
} catch (Exception e) {
    connection.rollback(); // undoes the debit too, even though it already "succeeded" on its own
    throw e;
} finally {
    connection.setAutoCommit(true);
    connection.close();
}
```

If the credit statement fails for any reason — a constraint violation, a network error, the process crashing before `commit()` is called — the `rollback()` in the `catch` block undoes the debit as well, exactly as Lesson 3's affected-row check combined with a transaction is what actually prevents "the money vanished from one account without appearing in the other." Without wrapping both statements in one transaction, a failure between them leaves the database in exactly that inconsistent, real-money-losing state — a `try`/`catch` around the two statements alone, without a database transaction, only stops the exception from propagating; it does nothing to undo the debit that already executed.

## Isolation anomalies: what can go wrong between concurrent transactions

**Isolation** is the property that decides what one transaction can observe about another transaction's *uncommitted* or concurrently-changing work, and weaker isolation levels permit specific, named anomalies in exchange for better performance:

| Anomaly | What happens |
|---|---|
| **Dirty read** | Transaction A reads a row that transaction B has modified but not yet committed; if B then rolls back, A has read data that never actually existed |
| **Non-repeatable read** | Transaction A reads the same row twice, and gets different values, because transaction B committed a change to that row in between |
| **Phantom read** | Transaction A re-runs the same query twice and gets a different *set* of rows, because transaction B inserted or deleted a row matching the query's condition in between |

```text
Dirty read example:
  Transaction A:                          Transaction B:
  ---                                     UPDATE account SET balance = 0 WHERE id = 1;
  SELECT balance FROM account WHERE id=1;  (returns 0 -- reads B's uncommitted change)
  ---                                     ROLLBACK;  (B's change never actually happened)
  -- Transaction A already used the value 0, which turned out to never be real.
```

## Isolation levels: which anomalies each one prevents

SQL defines four standard isolation levels, each preventing more anomalies than the last, generally at the cost of more locking and reduced concurrency:

| Isolation level | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| `READ UNCOMMITTED` | Possible | Possible | Possible |
| `READ COMMITTED` | Prevented | Possible | Possible |
| `REPEATABLE READ` | Prevented | Prevented | Possible (varies by database) |
| `SERIALIZABLE` | Prevented | Prevented | Prevented |

```java
connection.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
```

`READ COMMITTED` is the default in many production databases (including PostgreSQL) and is a reasonable default for most application code: it prevents the specific danger of a dirty read (acting on data that turns out to have never been committed) while allowing more concurrency than the stricter levels. `SERIALIZABLE` gives the strongest guarantee — transactions behave *as if* they ran one at a time, in some order, even though they actually ran concurrently — but at real performance cost, since the database must do more work (locking or conflict detection) to uphold that guarantee, and a `SERIALIZABLE` transaction can fail with a serialization error that must be retried even when nothing about the transaction's own SQL was wrong, purely because the database detected a conflict with a concurrent transaction. Choosing an isolation level is a deliberate trade-off between correctness guarantees and throughput, made per-transaction based on what that specific operation actually needs — not a single global setting applied uniformly regardless of the operation.

## Row-level locking

Under the hood, a database enforces isolation partly through **locks**: a transaction that reads or writes a row (depending on the isolation level and the specific operation) may acquire a lock on it, and a second transaction attempting a conflicting operation on the same row must wait until the first transaction commits or rolls back and releases the lock.

```sql
-- SELECT ... FOR UPDATE explicitly locks the selected rows until the transaction ends,
-- preventing another transaction from modifying (or, depending on the database, even reading) them concurrently.
BEGIN;
SELECT balance_cents FROM account WHERE id = 1 FOR UPDATE;
-- ... application logic decides the new balance based on the locked, current value ...
UPDATE account SET balance_cents = 4500 WHERE id = 1;
COMMIT;
```

`SELECT ... FOR UPDATE` is the explicit, deliberate version of the row-level locking that plain `UPDATE` statements also perform implicitly — it is useful specifically when application logic needs to read a value, make a decision based on it, and then write a new value, all as one atomic unit, without another transaction sneaking in a conflicting change to the same row in between the read and the write.

## Deadlocks: two transactions, opposite lock order

Exactly as with the in-process lock ordering problem from the concurrency chapter, a **deadlock** between database transactions occurs when two transactions each hold a lock the other needs, and each is waiting for the other to release it:

```text
Transaction A:                           Transaction B:
BEGIN;                                   BEGIN;
UPDATE account SET ... WHERE id = 1;     UPDATE account SET ... WHERE id = 2;
  (A now holds a lock on row 1)            (B now holds a lock on row 2)
UPDATE account SET ... WHERE id = 2;     UPDATE account SET ... WHERE id = 1;
  (A waits for B's lock on row 2)          (B waits for A's lock on row 1)
  -- Neither can proceed. Deadlock.
```

Every production database includes **deadlock detection**: it periodically checks for exactly this cyclic waiting pattern and, on finding one, unilaterally aborts one of the two transactions (rolling it back and raising a specific, detectable error) to break the cycle, letting the other proceed. This means a well-written application must be prepared to **catch a deadlock error and retry the aborted transaction** — a deadlock is not a bug in the sense that something is definitely wrong with the code, but it is a condition every multi-row-locking transaction must be ready to encounter and recover from under real concurrent load.

```java
int maxAttempts = 3;
for (int attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
        transferFunds(connection, fromAccountId, toAccountId, amountCents);
        break; // success
    } catch (SQLException e) {
        if (isDeadlockError(e) && attempt < maxAttempts) {
            continue; // the database already rolled back this transaction; simply retry it
        }
        throw e;
    }
}
```

The same **consistent lock ordering** fix from the concurrency chapter applies here too, and is usually preferable to relying on retry alone: if every transaction that needs to lock both accounts always locks the lower account ID first, the specific circular-wait pattern above cannot occur at all, because both transactions would then compete for the *same* first lock in the *same* order, and one would simply wait for the other to finish entirely rather than each holding one lock the other needs.

## What happens under the hood: from BEGIN to COMMIT

1. `setAutoCommit(false)` (or an explicit `BEGIN`/`START TRANSACTION`) starts a new transaction; every statement executed on that connection afterward is part of it until `commit()` or `rollback()`.
2. Depending on the isolation level, each read may take a **snapshot** of the data as of the transaction's start (or as of each statement, for `READ COMMITTED`), and each write acquires a lock on the affected row(s), held until the transaction ends.
3. If a second transaction attempts a conflicting operation on a locked row, it blocks (waits) until the first transaction releases the lock via `commit` or `rollback` — unless this creates a cyclic wait, in which case the database's deadlock detector eventually aborts one of the transactions instead of letting both wait forever.
4. `commit()` makes every change in the transaction permanent and visible to other transactions atomically, and releases all locks the transaction held.
5. `rollback()` undoes every change made since the transaction began, as if none of the statements had ever run, and likewise releases all locks.
6. A crash between statements and before `commit()` is handled the same way as an explicit `rollback()`: the database's own recovery process, on restart, undoes any transaction that was not durably committed, which is exactly what atomicity and durability together guarantee.

## Common mistakes

**Mistake 1: treating a multi-statement operation as safe without wrapping it in a transaction.** A failure between statements leaves partial, inconsistent state — a `try`/`catch` alone does not undo an already-executed statement. Fix: wrap related statements in a transaction, and roll back on any failure.

**Mistake 2: choosing `READ UNCOMMITTED` (or leaving a database's default unexamined) without understanding dirty reads are possible.** Acting on data from a transaction that later rolls back can corrupt application-level decisions made from it. Fix: know your database's default isolation level, and choose it deliberately per operation's actual correctness needs.

**Mistake 3: not catching and retrying a deadlock error.** A deadlock is an expected condition under real concurrent load, not necessarily a bug; failing to retry surfaces it as an unhandled error to the end user for what is often a transient condition. Fix: detect the database-specific deadlock error and retry the aborted transaction.

**Mistake 4: acquiring locks on multiple rows in an inconsistent order across different code paths.** This is exactly what creates the circular-wait pattern a deadlock requires. Fix: always acquire locks on multiple rows in one single, consistent order (e.g., by ascending ID) across every code path that might lock more than one row at a time.

## Best practices

- Wrap every multi-statement operation that must be atomic in an explicit transaction, with rollback on any failure.
- Choose the isolation level deliberately per operation, based on which anomalies that specific operation cannot tolerate — do not leave it as an unexamined default for correctness-sensitive code.
- Use `SELECT ... FOR UPDATE` when application logic must read a value, decide based on it, and write a new value as one atomic unit.
- Catch and retry deadlock errors, since they are an expected, recoverable condition under real concurrent load.
- Acquire locks on multiple rows in a single, consistent order everywhere in the application to prevent deadlocks structurally, rather than relying solely on retry.
- Keep transactions as short as practical — a long-running transaction holds its locks (and, on some isolation levels, its snapshot) for longer, increasing contention with other concurrent transactions.

## Summary

- A transaction groups statements into an atomic, isolated, durable unit; a failure partway through must trigger a rollback that undoes everything, not just stop the failure from propagating as an exception.
- Isolation anomalies (dirty reads, non-repeatable reads, phantom reads) occur when concurrent transactions are allowed to observe each other's in-progress or recently-changed data.
- Isolation levels trade correctness guarantees against concurrency: `READ COMMITTED` is a common, reasonable default; `SERIALIZABLE` gives the strongest guarantee at the greatest performance cost.
- Row-level locks enforce isolation for writes (and, at stricter levels, reads); `SELECT ... FOR UPDATE` explicitly locks rows for a read-decide-write sequence.
- A deadlock occurs when two transactions each hold a lock the other needs; the database detects and breaks it by aborting one transaction, which the application must catch and retry.
- Consistent lock ordering across the application prevents the circular-wait pattern that causes deadlocks in the first place.

## Practice

1. **Warm-up:** Explain, using the bank transfer example, exactly what a `try`/`catch` without a database transaction fails to undo when the second of two statements fails.
2. **Warm-up:** For a report that must remain internally consistent across several queries run in sequence, which isolation level prevents its numbers from changing partway through, and why?
3. **Core:** Write a fund-transfer method wrapped in an explicit transaction, with rollback on any failure, and a test that forces the second statement to fail and confirms the first statement's effect was also undone.
4. **Core:** Reproduce a deadlock between two transactions locking two rows in opposite order, observe the database's deadlock error, and add a retry loop that recovers from it.
5. **Challenge:** Fix the deadlock from the previous exercise structurally, by enforcing a single consistent lock-acquisition order across both code paths, and confirm the deadlock no longer occurs even under repeated concurrent execution.

## Check your understanding

1. What does atomicity guarantee about a multi-statement transaction, and why is a plain `try`/`catch` without a database transaction insufficient to provide it?
2. What is the difference between a dirty read and a non-repeatable read?
3. Why does `SERIALIZABLE` isolation sometimes require an application to retry a transaction even when nothing was wrong with its SQL?
4. What does `SELECT ... FOR UPDATE` accomplish that a plain `SELECT` followed by an `UPDATE` does not?
5. Why does a database's deadlock detector abort one of the two deadlocked transactions rather than waiting indefinitely?
6. What structural fix prevents deadlocks between transactions that both need to lock the same two rows?
