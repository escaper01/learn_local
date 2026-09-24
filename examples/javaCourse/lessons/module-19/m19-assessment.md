# Chapter 19 assessment and deliberate practice

This chapter treated the relational database as a system that actively enforces correctness, not merely a place to store data: keys and constraints that make invalid states unrepresentable regardless of which code writes them, joins and indexes that determine both what a query returns and how fast it runs, affected-row counts that reveal whether a write actually did what you assumed, `PreparedStatement` as a genuine security boundary rather than a style choice, and transactions with isolation levels and locking that determine what concurrent operations can safely assume about each other. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Tables, keys, constraints, relationships, and normalization

A surrogate primary key avoids the problems of a natural key that can change; natural-key uniqueness is enforced separately with a `UNIQUE` constraint. A database-level uniqueness constraint is necessary even when the application checks first, because a check-then-insert sequence across two requests is not atomic and concurrent writers can both pass the check. Foreign keys enforce referential integrity, and `ON DELETE` behavior (`RESTRICT`, `CASCADE`, `SET NULL`) must be chosen deliberately per relationship. Normalization avoids update, insertion, and deletion anomalies that duplicated data causes; denormalization is a valid but deliberate, documented trade-off.

### Lesson 2: SELECT, joins, grouping, indexes, and query plans

An `INNER JOIN` keeps only matched rows; a `LEFT JOIN` keeps every left row, filling unmatched right columns with `NULL` — but a condition on the right table placed in `WHERE` instead of `ON` can silently discard those unmatched rows, turning the `LEFT JOIN` back into something like an `INNER JOIN`. `WHERE` filters rows before grouping; `HAVING` filters groups after aggregation. An index lets the database avoid a full table scan for a filtered or joined column, verifiable with `EXPLAIN`, but every index also slows down writes to that table.

### Lesson 3: INSERT, UPDATE, DELETE, affected rows, and schema evolution

`INSERT`, `UPDATE`, and `DELETE` each return an affected-row count that must be checked, not ignored — a count of zero can mean the target does not exist, or was concurrently modified, both meaningfully different from silent success. An `UPDATE`'s `WHERE` clause can encode an expected prior state (a status or version column) to detect concurrent modification cheaply. Schema changes belong in versioned, tracked migrations, never hand-run SQL; destructive or renaming changes need staging (add, dual-write, backfill, cut over, remove) to stay compatible during a rolling deployment.

### Lesson 4: DataSource, connections, PreparedStatement, ResultSet, and pooling

A pooled `DataSource` avoids the cost of establishing a connection per request; closing a pooled connection returns it to the pool rather than tearing it down, and an unreturned connection permanently shrinks the pool's usable capacity. `PreparedStatement` separates SQL structure from parameter values, making SQL injection structurally impossible for bound values — a bound parameter can only ever represent a value, never a table or column name, which must instead come from validated, allow-listed construction. `ResultSet` is a cursor requiring `next()` before reading any row, including the first.

### Lesson 5: Transactions, isolation anomalies, locks, rollback, and deadlocks

A transaction's atomicity means a failure partway through must roll back every statement's effect, not merely stop an exception from propagating — a `try`/`catch` alone does not undo an already-executed statement. Isolation anomalies (dirty reads, non-repeatable reads, phantom reads) occur when concurrent transactions can observe each other's in-progress changes; isolation levels trade correctness against concurrency, from `READ UNCOMMITTED` through `SERIALIZABLE`. A deadlock occurs when two transactions each hold a lock the other needs; the database aborts one, which the application must catch and retry, and consistent lock ordering prevents the underlying circular wait structurally.

## Cheat sheet

### Constraints and their purpose

| Constraint | Prevents |
|---|---|
| `PRIMARY KEY` | Duplicate or missing row identifiers |
| `UNIQUE` | Two rows sharing a value, safely even under concurrent writers |
| `FOREIGN KEY` | A reference to a row that does not exist |
| `NOT NULL` | A missing required value |
| `CHECK` | Any other declared invariant on a column's value |

### Join and filter placement

| Goal | Where the condition goes |
|---|---|
| Filter which right-hand rows match, keep every left row | `ON` clause of the `LEFT JOIN` |
| Discard left rows with no acceptable right-hand match too | `WHERE` clause (behaves like an `INNER JOIN`) |
| Filter individual rows before grouping | `WHERE` |
| Filter groups by an aggregate value | `HAVING` |

### Isolation levels

| Level | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| `READ UNCOMMITTED` | Possible | Possible | Possible |
| `READ COMMITTED` | Prevented | Possible | Possible |
| `REPEATABLE READ` | Prevented | Prevented | Possible (database-dependent) |
| `SERIALIZABLE` | Prevented | Prevented | Prevented |

### JDBC resource lifecycle

| Resource | Closing it does |
|---|---|
| `ResultSet` | Releases server-side cursor resources for that query |
| `PreparedStatement` | Releases the prepared query plan resources |
| `Connection` (pooled) | Returns the connection to the pool — does NOT close the underlying socket |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does an `UPDATE`/`DELETE`'s affected-row count go unchecked, silently treating zero rows affected as success?
- Is a `LEFT JOIN`'s right-table filter placed in `WHERE` instead of `ON`, silently discarding unmatched left rows?
- Is any SQL built by concatenating untrusted input directly into the query text, rather than binding it with `PreparedStatement`?
- Is a table or column name ever bound as a `PreparedStatement` parameter, or built from unvalidated input, instead of a fixed allow-list?
- Is a multi-statement operation left without an explicit transaction and rollback on failure?
- Does a `ResultSet` get read without first calling `next()`?

## The judgment question

The judgment question describes two writers both passing a uniqueness check and asks what the final protection is — the correct answer is **a database constraint with defined conflict handling**, not a larger application cache and not a single validation method name. This is Lesson 1's central point, restated at the chapter level: an application-level check, however carefully written, runs as a separate round trip from the subsequent insert, and two concurrent requests can both observe "no conflict yet" in that gap before either one commits — the same race-condition shape as an unsynchronized counter, just spanning a network call. Only a database-level `UNIQUE` (or `PRIMARY KEY`) constraint, enforced as part of the same atomic write, actually guarantees the invariant regardless of timing; a cache only adds another layer that can itself go stale under the same race, and a validation method's name carries no enforcement power at all — it is just code that runs at one particular moment, exactly like the check it is meant to protect.

## Approaching the implementation lab

The lab asks for `placeholders(count)`: return `count` comma-separated question marks, with non-positive counts producing an empty string.

1. Write the precondition and boundary table first: `count = 0` (empty string), a negative count (also empty string), `count = 1` (a single `?`, no comma), and a larger count like `5` (`?,?,?,?,?`).
2. Handle the non-positive case first and return immediately, exactly as the instructions specify — this both matches the boundary tests directly and avoids any special-casing later in a loop.
3. Build the result with a loop or `String.join(",", Collections.nCopies(count, "?"))`, ensuring no leading or trailing comma and exactly `count - 1` commas for `count` placeholders.
4. Recall Lesson 4's exact reason this helper exists: constructing a dynamic `IN (?, ?, ?)` clause for a variable-length list of bound values, where the *number* of placeholders must match the SQL text exactly, since JDBC has no way to bind a variable-length list as a single parameter.

## Approaching the debug lab

The debug lab's starter code compares `owner_id` to `NULL` using `=`, which is a specific, well-known SQL trap this chapter's transaction and query lessons both depend on getting right: in SQL's three-valued logic, `anything = NULL` (and `NULL = NULL`) evaluates to `NULL`, never `true`, so a `WHERE owner_id = NULL` clause matches **zero rows**, always, regardless of how many rows actually have a `NULL` owner_id.

1. Run the program and confirm it currently prints the query text with `owner_id = NULL`, which is the actual (broken) SQL, not yet the corrected version the test expects.
2. Recall this lesson's explicit point from Lesson 2's `LEFT JOIN` discussion: `NULL` never satisfies `=`, `>`, `<`, or any other ordinary comparison operator — SQL provides the dedicated `IS NULL` / `IS NOT NULL` predicates specifically because equality cannot express "is absent."
3. Replace `owner_id = NULL` with `owner_id IS NULL` in the string literal, preserving the rest of the query text exactly.
4. Confirm your fix now prints `SELECT id FROM task WHERE owner_id IS NULL` exactly, and be ready to explain why a real query using `owner_id = NULL` would silently return zero rows even when unassigned tasks exist in the table.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Design a normalized schema for a small system of your choosing (at least three related tables), including primary keys, foreign keys, and at least one `CHECK` constraint, and identify the anomalies a single denormalized table would have caused.
2. Write a `LEFT JOIN` query with a condition on the right table placed correctly in `ON`, then rewrite it incorrectly with the condition in `WHERE`, and compare the two result sets directly to see the discarded rows.
3. Write a migration that adds a column, a backfill step, and describe (in comments or a short document) the staged application-deploy sequence needed to later remove an old column safely under rolling deployment.
4. Write a JDBC method using `PreparedStatement` and nested try-with-resources for `Connection`, `Statement`, and `ResultSet`, and demonstrate it safely handling an adversarial input value that would have broken naive string concatenation.
5. Reproduce a deadlock between two transactions locking two rows in opposite order, catch the resulting error, retry successfully, and then fix it structurally with consistent lock ordering.

## Self-assessment

You are ready for Chapter 20 when you can do all of the following without notes:

- Explain why a database-level `UNIQUE` constraint is necessary even when the application already checks for duplicates.
- Explain how a condition placed in `ON` versus `WHERE` can change a `LEFT JOIN`'s results, and why.
- Explain why an `UPDATE`/`DELETE`'s affected-row count must be checked rather than assumed.
- Explain precisely why `PreparedStatement` prevents SQL injection, and why a table or column name cannot be bound as a parameter.
- Explain what `ResultSet.next()` does and why it must be called before reading the first row.
- Name the three isolation anomalies and one isolation level that prevents each.
- Explain what causes a deadlock and the two ways (retry, consistent lock ordering) to handle it.
