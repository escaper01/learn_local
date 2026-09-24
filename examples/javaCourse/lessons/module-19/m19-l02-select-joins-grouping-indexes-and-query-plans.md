# SELECT, joins, grouping, indexes, and query plans

Writing a `SELECT` that returns the right rows is only half the skill; the other half is understanding *how* the database finds those rows, because the same logically correct query can run in milliseconds or minutes depending entirely on whether an index exists and whether the database's query planner can use it. This lesson covers join semantics precisely — including a subtlety that trips up experienced developers — and then opens up the query plan as a tool you should read, not just trust.

What you will learn:

- `INNER JOIN` versus `LEFT JOIN`, and exactly what a `LEFT JOIN` preserves
- Why a `WHERE` condition on the right-hand table of a `LEFT JOIN` can silently turn it back into an `INNER JOIN`
- `GROUP BY`, aggregate functions, and the distinction between `WHERE` and `HAVING`
- What an index actually is, and why it speeds up some queries and not others
- How to read a query plan (`EXPLAIN`) to see whether an index is actually being used
- Why an index has write-time costs, not just read-time benefits

## INNER JOIN versus LEFT JOIN

An `INNER JOIN` returns only rows that have a match in both tables. A `LEFT JOIN` returns every row from the left table, with `NULL` filled in for the right table's columns when there is no match:

```sql
-- INNER JOIN: only customers who have placed at least one order
SELECT c.display_name, o.id AS order_id
FROM customer c
INNER JOIN orders o ON o.customer_id = c.id;
```

```sql
-- LEFT JOIN: every customer, including those with zero orders (order_id is NULL for them)
SELECT c.display_name, o.id AS order_id
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.id;
```

```text
display_name  | order_id
Ada Lovelace  | 1
Ada Lovelace  | 2
Grace Hopper  | 3
Alan Turing   | NULL
```

Alan Turing, who has never placed an order, appears in the `LEFT JOIN` result with `order_id = NULL` — this is exactly what makes a `LEFT JOIN` the right tool for "every customer, whether or not they have orders," a question an `INNER JOIN` cannot answer at all, since it would simply omit Alan entirely.

## The WHERE-versus-ON trap on a LEFT JOIN

This is the single most common `LEFT JOIN` mistake, and it looks correct at first glance. Suppose you want every customer, along with only their orders placed after a certain date:

```sql
-- Looks like "every customer, with only recent orders" — but is NOT that.
SELECT c.display_name, o.id AS order_id, o.placed_at
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.placed_at > '2024-01-01' OR o.placed_at IS NULL;
```

Even with the `OR o.placed_at IS NULL` clause, this is fragile and easy to get subtly wrong; the *robust* way to filter the joined table's rows while still preserving every row from the left table is to put the condition in the `ON` clause, not `WHERE`:

```sql
-- Correct: the join itself only matches recent orders; every customer still appears.
SELECT c.display_name, o.id AS order_id, o.placed_at
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.id AND o.placed_at > '2024-01-01';
```

```text
display_name  | order_id | placed_at
Ada Lovelace  | 2        | 2024-03-15
Grace Hopper  | NULL     | NULL
Alan Turing   | NULL     | NULL
```

Grace Hopper's old order does not match the `ON` condition, so her row shows `NULL` for `order_id` — but she still *appears*, because the `ON` clause only affects which right-hand rows are matched, not which left-hand rows survive. Now compare a `WHERE` clause applied naively, without the `IS NULL` escape hatch:

```sql
-- WRONG: this silently turns the LEFT JOIN back into something like an INNER JOIN.
SELECT c.display_name, o.id AS order_id, o.placed_at
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.placed_at > '2024-01-01';
```

Here, every customer with no matching recent order — including Alan, who has no orders at all, and Grace, whose only order is old — has `o.placed_at` equal to `NULL` for their unmatched row. `NULL > '2024-01-01'` evaluates to `NULL` (SQL's three-valued logic, not `true` or `false`), and a `WHERE` clause keeps only rows where the condition evaluates to `true` — so both Alan's and Grace's rows are filtered out entirely, silently discarding exactly the "customers with no matching order" rows a `LEFT JOIN` was supposed to preserve. The general rule: a condition on the right-hand table belongs in `ON` if you want it to affect *only which matches are found*, and in `WHERE` only if you genuinely want to filter out unmatched left rows too (in which case you have, deliberately or not, written something equivalent to an `INNER JOIN`).

## GROUP BY, aggregates, and HAVING versus WHERE

`GROUP BY` collapses rows sharing a value into groups, and aggregate functions (`COUNT`, `SUM`, `AVG`, `MAX`, `MIN`) compute one value per group:

```sql
SELECT c.id, c.display_name, COUNT(o.id) AS order_count, COALESCE(SUM(o.total_cents), 0) AS total_spent_cents
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.display_name;
```

`WHERE` filters individual rows *before* grouping happens; `HAVING` filters *groups*, after aggregation, based on an aggregate value that does not exist until the grouping is computed:

```sql
-- Only customers who have placed more than 2 orders — this needs HAVING, not WHERE,
-- because "more than 2 orders" is a property of the GROUP, not of any single row.
SELECT c.id, c.display_name, COUNT(o.id) AS order_count
FROM customer c
INNER JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.display_name
HAVING COUNT(o.id) > 2;
```

Writing `WHERE COUNT(o.id) > 2` is a straightforward SQL error in most databases (the aggregate does not exist yet at the point `WHERE` is evaluated), which is a useful reminder of the actual order SQL conceptually evaluates clauses in: `FROM`/`JOIN`, then `WHERE`, then `GROUP BY`, then `HAVING`, then `SELECT`, then `ORDER BY` — notably different from the order the clauses are *written* in.

## What an index actually is

An **index** is a separate, ordered data structure (commonly a B-tree) that the database maintains alongside a table, mapping a column's values to the row locations that contain them — conceptually similar to a book's index mapping a term to page numbers, so you do not have to scan every page to find it. Without an index on a column used in a `WHERE` clause or a join condition, the database must perform a **full table scan**: reading every single row to check whether it matches, which is fine for a hundred rows and prohibitively slow for a hundred million.

```sql
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
```

This index lets a query filtering or joining on `orders.customer_id` jump directly to the matching rows instead of scanning the entire `orders` table — exactly the reason a foreign key column, which is joined against constantly, should almost always have an index, even though a `FOREIGN KEY` constraint itself does not automatically create one in every database system.

## Reading a query plan

`EXPLAIN` (or `EXPLAIN ANALYZE`, which also actually runs the query and reports real timings) shows the database's chosen execution strategy — this is how you verify an index is actually being used, rather than assuming it:

```sql
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;
```

```text
Index Scan using idx_orders_customer_id on orders  (cost=0.29..8.31 rows=3 width=48)
  Index Cond: (customer_id = 42)
```

Compare this to the same query without the index (or against a column with no index at all):

```text
Seq Scan on orders  (cost=0.00..2100.00 rows=3 width=48)
  Filter: (customer_id = 42)
```

`Seq Scan` (sequential scan) means the database is reading every row in the table and filtering afterward; `Index Scan` means it navigated the index directly to matching rows. The `cost` numbers are the planner's own relative estimates (not milliseconds), useful for comparing two candidate plans against each other, while `EXPLAIN ANALYZE`'s actual elapsed time is what you should trust for a genuine before/after comparison after adding an index. A query that "should" use an index but shows a sequential scan is a specific, diagnosable signal — sometimes the index exists but the query's condition is written in a way the planner cannot match against it (applying a function to the indexed column, for instance, like `WHERE UPPER(email) = ...` against a plain index on `email`), and sometimes the table is simply small enough that the planner correctly judges a full scan faster than the overhead of using the index at all.

## The cost side of an index: writes get slower

An index is not free. Every `INSERT`, `UPDATE`, or `DELETE` that touches an indexed column must also update every index covering that column, which means:

- More indexes on a table make writes to that table slower, proportionally to how many indexes need updating.
- An index consumes storage space independent of the table's own data.
- A table that is written far more often than it is read (a high-volume audit log, for instance) may deliberately carry fewer indexes than a read-heavy reporting table, trading slower occasional reads for faster frequent writes.

This is why "just add an index" is not a universally free performance fix — the right number of indexes on a table is a deliberate trade-off between the read patterns that benefit from them and the write patterns that pay their maintenance cost, informed by measuring actual query plans and actual write throughput rather than guessing.

## What happens under the hood: from a SELECT to a result set

1. The database parses the SQL text into an internal representation and validates it against the schema (table and column names, types).
2. The **query planner** considers multiple possible execution strategies (which join order, sequential scan versus index scan for each table, which join algorithm) and estimates the cost of each, using statistics it maintains about table sizes and value distributions.
3. It chooses the plan it estimates to be cheapest and executes it: for an index scan, it navigates the index's tree structure to locate matching rows directly; for a sequential scan, it reads the table's storage pages in order, checking each row against the filter.
4. For a join, the chosen algorithm (nested loop, hash join, merge join — beyond this lesson's scope in detail) combines matching rows from each table according to the `ON` condition.
5. `GROUP BY` and aggregate functions are computed after filtering and joining, `HAVING` filters the resulting groups, and `ORDER BY`/`LIMIT` are applied last, producing the final result set streamed back to the client.

## Common mistakes

**Mistake 1: putting a filter on the right-hand table's column in `WHERE` instead of `ON` for a `LEFT JOIN`.** This silently discards unmatched left rows, turning the `LEFT JOIN` into something behaving like an `INNER JOIN`. Fix: put conditions that should only affect *matching*, not row survival, in the `ON` clause.

**Mistake 2: trying to filter on an aggregate with `WHERE` instead of `HAVING`.** The aggregate does not exist yet at the point `WHERE` is evaluated. Fix: use `HAVING` for any condition on a `GROUP BY` aggregate.

**Mistake 3: assuming an index exists (or is being used) without checking `EXPLAIN`.** A missing index, or a query written in a way the planner cannot match to an existing index, silently falls back to a full table scan. Fix: run `EXPLAIN` (or `EXPLAIN ANALYZE`) on any query whose performance matters, and confirm the plan actually uses an index scan where expected.

**Mistake 4: adding an index to every column "just in case."** Every index slows down writes to the table and consumes storage. Fix: add indexes based on measured query patterns, not speculatively.

## Best practices

- Put conditions on the right-hand table of a `LEFT JOIN` in the `ON` clause unless you specifically want unmatched left rows discarded too.
- Use `HAVING` for conditions on aggregate values; use `WHERE` for conditions on individual row values evaluated before grouping.
- Index foreign key columns and any column frequently used in a `WHERE` or `JOIN ON` condition.
- Verify index usage with `EXPLAIN`/`EXPLAIN ANALYZE` rather than assuming a created index is actually helping a given query.
- Weigh each new index's write-time cost against its read-time benefit, based on the table's actual read/write ratio.

## Summary

- `INNER JOIN` keeps only matched rows; `LEFT JOIN` keeps every left row, filling unmatched right columns with `NULL`.
- A condition on the right table belongs in `ON` for a `LEFT JOIN` unless you intend to discard unmatched left rows too, which putting it in `WHERE` does silently.
- `WHERE` filters rows before grouping; `HAVING` filters groups after aggregation; SQL's actual evaluation order differs from its written clause order.
- An index is a separate ordered structure that lets the database avoid a full table scan; without one, a query filtering on that column must scan every row.
- `EXPLAIN`/`EXPLAIN ANALYZE` reveals whether a query actually used an available index, rather than leaving that to assumption.
- Every index speeds up matching reads but slows down writes to that table and consumes storage; the right number of indexes is a deliberate, measured trade-off.

## Practice

1. **Warm-up:** For a `LEFT JOIN` between `customer` and `orders`, write a query that lists every customer along with only their orders over $50, without silently discarding customers with no such orders.
2. **Warm-up:** Explain why `WHERE COUNT(*) > 5` is invalid in most databases, and rewrite it correctly.
3. **Core:** Given a table with a million rows and no index on a frequently filtered column, run `EXPLAIN` before and after adding an index, and compare the resulting plans.
4. **Core:** Write a query using `GROUP BY` and `HAVING` to find customers who have spent more than a given total across all their orders.
5. **Challenge:** Design an indexing strategy for a table that is written to constantly (a high-volume event log) but occasionally needs to be queried by a specific field; justify how many indexes you would add and why, given the write/read trade-off.

## Check your understanding

1. What specifically distinguishes an `INNER JOIN` from a `LEFT JOIN`, and what appears in a `LEFT JOIN`'s result for an unmatched row?
2. Why can putting a condition on the right table in `WHERE`, rather than `ON`, silently change a `LEFT JOIN`'s results?
3. Why must a condition on an aggregate value use `HAVING` rather than `WHERE`?
4. What does an index actually do that lets a query avoid scanning every row in a table?
5. What does `EXPLAIN` show you, and why is checking it more reliable than assuming an index is being used?
6. Why is adding an index not a free performance improvement, and what cost does it impose?
