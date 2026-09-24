# INSERT, UPDATE, DELETE, affected rows, and schema evolution

`SELECT` reads data; `INSERT`, `UPDATE`, and `DELETE` change it, and each one returns a number — the count of rows affected — that is easy to ignore and dangerous to ignore. This lesson treats that count as a first-class piece of information your code must check, and then turns to the schema itself: how it changes over time, safely, through migrations, rather than through hand-run, unrepeatable scripts.

What you will learn:

- The exact effect of `INSERT`, `UPDATE`, and `DELETE`, including multi-row variants
- Why the affected-row count is meaningful information, not a detail to discard
- What an `UPDATE`'s `WHERE` clause really encodes: an assumption about prior state
- What a migration is, why it must be versioned and repeatable, and why it needs a rollback path
- Why destructive schema changes need a backup and a safer, staged approach
- How schema changes and application deploys must be sequenced to avoid breaking a running system

## INSERT, UPDATE, DELETE: what each actually does

```sql
INSERT INTO orders (customer_id, total_cents) VALUES (42, 1999);

UPDATE orders SET total_cents = 2499 WHERE id = 7;

DELETE FROM orders WHERE id = 7;
```

Each of these statements returns an integer: the number of rows it inserted, updated, or deleted. `INSERT` with a single `VALUES` clause always affects exactly one row (or fails entirely); a multi-row `INSERT` or an `UPDATE`/`DELETE` with a `WHERE` clause can affect zero, one, or many rows, and the exact count is the only reliable way to know which happened.

## Why the affected-row count is meaningful, not noise

An `UPDATE`'s `WHERE` clause encodes an assumption about the row's *current* state — "the row with this ID exists," or more precisely, "a row matching all of these conditions exists right now." The affected-row count tells you whether that assumption held:

```java
int rowsUpdated = statement.executeUpdate(
    "UPDATE orders SET status = 'SHIPPED' WHERE id = ? AND status = 'PACKED'");

if (rowsUpdated == 0) {
    // Either the order does not exist, or it was not in the expected 'PACKED' state.
    // Both are meaningfully different outcomes from "the update succeeded."
    throw new IllegalStateException("order not found or not in PACKED state; cannot ship");
}
```

Ignoring this count and assuming success is a specific, common bug: the order might not exist at all (a typo'd ID, a request for an already-deleted resource), or — just as importantly — it might exist but no longer be in the state the code assumed, because another request already changed it. This second case is a **concurrent modification**, and checking the affected-row count against an expected prior state (`status = 'PACKED'` in the `WHERE` clause, not just `id = ?`) is a lightweight, database-enforced way to detect it without needing the heavier transaction isolation machinery covered in Lesson 5 — this specific pattern is sometimes called **optimistic locking**, and a `version` column incremented on every update (with `WHERE id = ? AND version = ?`) is a common, more general variant of exactly this technique.

```java
// Optimistic locking with an explicit version column: the WHERE clause encodes
// "only update if nobody else has touched this row since I last read it."
int rowsUpdated = statement.executeUpdate(
    "UPDATE orders SET total_cents = ?, version = version + 1 WHERE id = ? AND version = ?");
if (rowsUpdated == 0) {
    throw new OptimisticLockException("order was modified concurrently; reload and retry");
}
```

A `DELETE`'s affected-row count deserves the same attention: `DELETE FROM sessions WHERE id = ?` returning `0` tells you the session was already gone (perhaps already expired and cleaned up by another process), which is a meaningfully different outcome from "the delete succeeded on a row that existed a moment ago," even though both leave the row absent afterward.

## Multi-row operations and their specific risk

An `UPDATE` or `DELETE` with a broad or mistaken `WHERE` clause can affect far more rows than intended — the canonical, career-defining mistake is an `UPDATE`/`DELETE` with *no* `WHERE` clause at all, which applies to every row in the table:

```sql
-- Catastrophic: no WHERE clause. This updates every row in the entire table.
UPDATE orders SET status = 'CANCELLED';
```

The affected-row count is again the safety net here, but only if you check it *before* the damage matters, or use it defensively: many teams require an explicit `WHERE` clause on every production `UPDATE`/`DELETE` as a matter of tooling policy (some database clients refuse to run one without it), and a script or migration performing a bulk update should log and verify the row count against an expected range before proceeding, rather than assuming the query text alone is proof of correctness.

## Migrations: versioned, repeatable schema changes

A **migration** is a small, versioned script that changes the schema (or occasionally backfills data) in a specific, tracked order — the schema equivalent of a commit history, rather than a wiki page describing "the current state of the database" that someone has to manually keep in sync with reality.

```sql
-- V12__add_order_notes_column.sql
ALTER TABLE orders ADD COLUMN notes VARCHAR(500);
```

A migration tool (Flyway and Liquibase are the common choices for Java projects) tracks which migrations have already been applied to a given database, in a table it manages itself, so that running the migration tool against any environment — a developer's laptop, a staging server, production — brings that environment's schema to exactly the same state, in the same order, regardless of its starting point. This solves a specific, real problem: without it, "run this `ALTER TABLE` by hand on production, and don't forget to also run it on staging" is exactly the kind of manual, easy-to-skip step that produces environments whose schemas have quietly diverged, each with an untracked history of ad hoc changes nobody can reliably reconstruct.

Two properties every migration needs:

- **Idempotent tracking, not idempotent SQL**: the migration tool ensures each migration script runs exactly once per database, so the script itself does not need `IF NOT EXISTS` guards to be safe to "accidentally" run twice — though many teams add them defensively anyway.
- **A forward-only mindset, backed by a real backup**: most modern migration tools favor writing a *new* forward migration to undo a mistake, rather than relying on a hand-maintained "down" script that is rarely tested and easy to get wrong; the actual safety net for a destructive mistake is a verified, restorable backup taken before the migration runs, not a rollback script optimistically written and never exercised.

## Destructive changes need a staged, safer path

Some schema changes are trivially safe (`ADD COLUMN` with a default or nullable definition), and some are genuinely destructive (`DROP COLUMN`, `DROP TABLE`, changing a column's type in a way that can lose data). A destructive change deserves a slower, staged approach rather than a single migration:

```text
Renaming a column safely, across a live system with rolling deployment:

1. Migration: add the new column (nullable), alongside the old one.
2. Deploy application code that writes to BOTH columns, reads from the new one
   with a fallback to the old one.
3. Backfill: a migration or script copies existing data from the old column
   to the new one.
4. Deploy application code that only uses the new column.
5. Migration: drop the old column, once nothing reads or writes it anymore.
```

Collapsing this into one migration — `ALTER TABLE orders RENAME COLUMN total TO total_cents;` run at the same moment new application code is deployed — works fine in a system with a single instance and a maintenance window, but fails in a system undergoing a **rolling deployment**, where old and new application code run simultaneously against the same database for some period: old code expecting the old column name breaks the instant the migration runs, before every old instance has been replaced. The staged approach exists specifically to make the schema change and the application code change independently deployable, each one individually safe against whichever version of the other is currently running.

## Sequencing schema changes against deploys

The general rule underlying the staged rename above: a schema change should be **backward compatible** with the application code currently running, for exactly as long as both versions might coexist during a rolling deployment. Adding a nullable column is backward compatible (old code simply never populates it); removing a column that old code still reads is not. This is the same compatibility discipline Chapter 18 applied to a JSON API's schema evolution, applied here to a database schema instead — additive, optional changes are safe to deploy ahead of the application code that uses them; changes that remove or repurpose something old code depends on must wait until every instance running that old code is gone.

## What happens under the hood: from an UPDATE statement to a durable change

1. The database parses and validates the `UPDATE` statement, then locates the rows matching its `WHERE` clause (using an index, if a suitable one exists, per the previous lesson).
2. For each matching row, it applies the change, typically first to an in-memory or log-based representation as part of an active transaction (Lesson 5 covers this in depth).
3. Any constraint (a `CHECK`, a `NOT NULL`, a `UNIQUE`, a `FOREIGN KEY`) is validated against the new row state before the change is accepted; a violation aborts the statement and leaves the row unchanged.
4. The count of rows actually matched and modified is tracked and returned to the caller as the statement's result, independent of whatever the caller assumed the count would be.
5. A migration tool, before running a migration script, checks its own tracking table for which versions have already been applied to this specific database, runs only the ones not yet applied, in order, and records each one as applied — atomically, typically within the same transaction as the migration's own DDL statements where the database supports transactional DDL.

## Common mistakes

**Mistake 1: ignoring the affected-row count and assuming success.** An `UPDATE`/`DELETE` matching zero rows because the target does not exist, or was concurrently modified, is silently treated as a success. Fix: always check the count, and treat an unexpected value (usually zero, when one row was expected) as a real, handleable condition.

**Mistake 2: an `UPDATE`/`DELETE` with no `WHERE` clause, run against production by accident.** This affects every row in the table. Fix: require an explicit `WHERE` clause as a matter of policy, and verify an expected row-count range before running a bulk change.

**Mistake 3: hand-running schema changes directly against production without a tracked migration.** This leaves environments with an untracked, divergent, and unreproducible schema history. Fix: use a migration tool (Flyway, Liquibase) that tracks applied versions per environment.

**Mistake 4: collapsing a destructive or renaming schema change into one migration deployed simultaneously with the application code that depends on it.** Under a rolling deployment, this breaks whichever instances are still running the old code. Fix: stage the change (add, dual-write, backfill, cut over, remove) across multiple deploys.

## Best practices

- Always check the affected-row count from `INSERT`/`UPDATE`/`DELETE`, and treat an unexpected count as meaningful, not as noise.
- Encode an expected prior state directly in an `UPDATE`'s `WHERE` clause (a status, a version number) to detect concurrent modification cheaply.
- Never run an `UPDATE`/`DELETE` without a `WHERE` clause against real data without deliberately intending to affect every row.
- Manage every schema change through a versioned migration tool, never through untracked, hand-run SQL against a live environment.
- Stage destructive or renaming schema changes across multiple deploys so the schema and application code remain independently, safely deployable during a rolling rollout.
- Take a verified, restorable backup before any genuinely destructive migration, rather than relying solely on a rollback script.

## Summary

- `INSERT`, `UPDATE`, and `DELETE` each return an affected-row count that carries real information about whether the operation did what was expected.
- An `UPDATE`'s `WHERE` clause encodes an assumption about prior state; checking the affected-row count against an expected value is a lightweight way to detect concurrent modification.
- A missing `WHERE` clause on `UPDATE`/`DELETE` affects every row in the table — a mistake serious enough that many teams enforce a policy requiring one.
- Migrations are versioned, tracked, ordered schema changes, applied consistently across every environment by a migration tool rather than by hand.
- Destructive or renaming schema changes need staging (add, dual-write, backfill, cut over, remove) to stay backward compatible during a rolling deployment.
- Schema changes and application deploys must be sequenced so that whichever version of the other is currently running remains compatible.

## Practice

1. **Warm-up:** Explain why `UPDATE orders SET status = 'SHIPPED' WHERE id = 7` returning `0` is meaningfully different information from it returning `1`.
2. **Warm-up:** Design an optimistic-locking `WHERE` clause for an `UPDATE` that must fail if another process has already modified the row since it was last read.
3. **Core:** Write a migration that adds a new nullable column, a second migration that backfills it from existing data, and describe the application-code sequencing that would let you safely remove the old column in a later migration.
4. **Core:** Write code that checks an `UPDATE`'s affected-row count and throws a specific, distinguishable exception for "row does not exist" versus "row exists but was in an unexpected state" (assuming a status column is also checked in the `WHERE` clause).
5. **Challenge:** Design the full staged sequence (migrations plus application deploys, in order) for renaming a column in a system undergoing continuous rolling deployment with zero downtime and zero broken instances at any point.

## Check your understanding

1. Why can an `UPDATE`'s affected-row count of zero be a meaningful, expected outcome rather than an error to suppress?
2. What specific problem does checking a status or version column in an `UPDATE`'s `WHERE` clause solve?
3. Why is running schema changes through a migration tool safer than hand-running SQL directly against each environment?
4. Why can collapsing a column rename into a single migration break a system undergoing a rolling deployment, even if the migration itself runs successfully?
5. What is the difference between relying on a migration tool's "down" script and relying on a verified backup, as a safety net for a destructive schema change?
6. Why must a schema change remain backward compatible with currently running application code during a rolling deployment?
