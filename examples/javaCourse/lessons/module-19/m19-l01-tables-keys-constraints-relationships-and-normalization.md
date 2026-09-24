# Tables, keys, constraints, relationships, and normalization

A relational database is not just a place to persist objects — it is a system that can *enforce* rules about your data even when your application code has a bug, crashes mid-operation, or two requests race each other. This lesson is about designing a schema that uses that enforcement deliberately: choosing keys that identify rows unambiguously, constraints that make invalid states impossible to store, and a normalized structure that avoids the specific inconsistencies duplication causes.

What you will learn:

- What a table, row, and column actually are, and how a schema differs from the data it holds
- Primary keys, natural versus surrogate keys, and why uniqueness must be enforced by the database, not just the application
- Foreign keys and referential integrity: what they prevent, and what happens on delete
- `NOT NULL`, `UNIQUE`, and `CHECK` constraints, and why they belong in the schema, not only in validation code
- Normalization: the update, insertion, and deletion anomalies that duplicated data causes
- Why some denormalization is a deliberate, justified trade-off, not a mistake

## Tables, rows, and the schema

A relational database organizes data into **tables**: named collections of **rows**, each with the same fixed set of typed **columns**. The **schema** is the definition of tables, columns, types, and constraints — it exists independently of the data itself, and is what a **migration** (covered in the next lesson) changes over time.

```sql
CREATE TABLE customer (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    display_name  VARCHAR(100) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Every column has a declared type (`BIGINT`, `VARCHAR(255)`, `TIMESTAMP`), and the database rejects any attempt to store a value that does not fit that type — this is the same discipline as Java's static typing, enforced at the storage layer instead of the compiler, and it catches a different class of bug: one introduced by a raw SQL statement, a migration script, or a completely different application sharing the same database, none of which pass through your Java compiler at all.

## Primary keys: natural versus surrogate

A **primary key** is the column (or columns) that uniquely identifies a row, and every table should have one. Two common strategies:

| Kind | Example | Trade-off |
|---|---|---|
| Natural key | An email address, a national ID number, a product SKU | Meaningful, but can change (a customer updates their email) or turn out not to be as unique as assumed (SKUs get reused) |
| Surrogate key | An auto-incrementing `BIGINT`, or a generated UUID | Never changes and carries no business meaning, but requires an extra column and a lookup to translate from any business-meaningful identifier |

The practical guidance most teams converge on: use a surrogate key (an auto-incrementing ID, as in the `customer` table above) as the primary key, and enforce natural-key uniqueness *separately* with a `UNIQUE` constraint. This way, a customer's email can be corrected without renumbering every foreign key that refers to that customer elsewhere in the schema — a foreign key referencing a surrogate ID never needs to change when unrelated business data changes.

```sql
ALTER TABLE customer ADD CONSTRAINT customer_email_unique UNIQUE (email);
```

## Why the database, not just the application, must enforce uniqueness

Consider an application that checks "does this email already exist?" before inserting a new customer, entirely in Java code, with no corresponding database constraint. Under concurrent load, two requests for the same new email can both run that check, both see "no existing customer," and both proceed to insert — the check-then-act sequence is not atomic across two separate database round trips from two separate connections, exactly the same race-condition shape as the unsynchronized counter increment from the concurrency chapter, just spanning a network call instead of a memory access. A `UNIQUE` constraint at the database level closes this gap completely: the second `INSERT` fails with a constraint violation, regardless of what the application-level check concluded moments earlier, because the database enforces it as part of the same atomic operation that writes the row.

```java
try {
    customerRepository.insert(email, displayName);
} catch (SQLException e) {
    if (isUniqueViolation(e)) { // vendor-specific SQLState/error code check
        throw new DuplicateEmailException(email);
    }
    throw e;
}
```

This is not a reason to skip the application-level check — a friendly, immediate validation error is better user experience than waiting for a database round trip to fail — but the database constraint is what actually *guarantees* the invariant under concurrency; the application check is only a fast-path optimization for the common, non-racing case.

## Foreign keys and referential integrity

A **foreign key** declares that a column's values must match a primary (or unique) key value in another table, or be `NULL`. This is what prevents an `order` from referencing a `customer_id` that does not exist — a state that would otherwise be perfectly representable (the column is just a number) but semantically meaningless.

```sql
CREATE TABLE orders (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  BIGINT NOT NULL REFERENCES customer(id),
    total_cents  INTEGER NOT NULL CHECK (total_cents >= 0),
    placed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Deleting a referenced row raises a question the schema must answer explicitly: what happens to the `orders` rows that reference a `customer` about to be deleted? The `ON DELETE` clause decides:

| `ON DELETE` behavior | Effect |
|---|---|
| `RESTRICT` (often the default) | The delete is rejected while any referencing row exists |
| `CASCADE` | Referencing rows are deleted automatically |
| `SET NULL` | The foreign key column is set to `NULL` on referencing rows (requires the column to be nullable) |

`CASCADE` is convenient but dangerous when applied without thinking through the consequences: `ON DELETE CASCADE` on `orders.customer_id` means deleting a customer silently deletes their entire order history, which is rarely what a real business process actually wants — a **soft delete** (an `is_deleted` or `deleted_at` column, leaving the row in place) is frequently the safer choice for data with this kind of business significance, precisely because it does not destroy data through a cascade nobody explicitly asked for at the moment of deletion.

## NOT NULL, UNIQUE, and CHECK: encoding invariants in the schema

Three more constraint types let the schema itself reject invalid data outright, rather than relying on every piece of code that ever writes to the table to remember to validate it:

```sql
CREATE TABLE product (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku         VARCHAR(64) NOT NULL UNIQUE,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    status      VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'DISCONTINUED'))
);
```

- `NOT NULL` rejects a missing value outright — no row can ever have `price_cents` unset.
- `UNIQUE` on `sku` prevents two products from sharing a stock-keeping unit, for the same concurrency reason as the customer email example above.
- `CHECK` encodes an arbitrary boolean invariant — here, a price must be positive, and a status must be one of three known values, which is exactly the guarantee an enum would give in Java, expressed at the schema level for data that arrives through channels a Java enum's compiler check never sees (a bulk import, a different service, a manual data-fix script).

A team that relies solely on Java-level validation (a `@NotNull` annotation, an `if (price <= 0) throw ...`) protects data written through that one code path, but a schema-level constraint protects the data *regardless of which code path wrote it* — including code paths that do not exist yet, written by someone who has never read the validation logic in your service.

## Normalization: the anomalies duplication causes

**Normalization** is the discipline of structuring tables so that each fact is stored in exactly one place. Consider a deliberately unnormalized table that repeats customer information on every order:

```text
order_id | customer_email      | customer_name | product_sku | quantity
1        | ada@example.com     | Ada Lovelace  | WIDGET-1    | 2
2        | ada@example.com     | Ada Lovelace  | WIDGET-2    | 1
3        | grace@example.com   | Grace Hopper  | WIDGET-1    | 5
```

This single, denormalized table produces three specific problems, known as **anomalies**:

| Anomaly | What goes wrong |
|---|---|
| **Update anomaly** | Ada changes her display name; every row repeating it must be updated, and missing even one leaves the data inconsistent |
| **Insertion anomaly** | A new customer with no orders yet cannot be recorded at all, because the table only has a row per order, not per customer |
| **Deletion anomaly** | Deleting Grace's only order also deletes the only record that she exists as a customer at all |

Normalizing splits this into separate `customer` and `orders` tables (as constructed above), each fact stored exactly once, and referenced rather than repeated:

```text
customer table:                        orders table:
id | email             | display_name  id | customer_id | product_sku | quantity
1  | ada@example.com   | Ada Lovelace  1  | 1           | WIDGET-1    | 2
2  | grace@example.com | Grace Hopper  2  | 1           | WIDGET-2    | 1
                                        3  | 2           | WIDGET-1    | 5
```

Now Ada's name lives in exactly one row; changing it once is correct everywhere it is referenced; a customer with no orders yet is simply a `customer` row with no matching `orders` rows; deleting an order never risks deleting the fact that a customer exists.

## When denormalization is a deliberate trade-off

Normalization is the right default, but it is not an absolute rule: a fully normalized schema sometimes requires expensive joins (next lesson) for a read pattern that dominates a system's load, and **deliberately** duplicating a value (storing a computed order total on the `orders` row instead of recomputing it from line items on every read, for example) can be the correct engineering trade-off — as long as the team has explicitly decided to accept the update-anomaly risk in exchange for read performance, and has a plan (a recalculation job, a database trigger, careful application discipline) for keeping the duplicated value consistent. The distinction that matters is between an *accidental* denormalization nobody thought about, which silently invites the anomalies above, and a *deliberate* one, chosen with the trade-off explicitly acknowledged and mitigated.

## What happens under the hood: from a CREATE TABLE statement to enforced invariants

1. `CREATE TABLE` (and subsequent `ALTER TABLE ... ADD CONSTRAINT`) statements register the schema — column types, keys, and constraints — in the database's own metadata catalog, distinct from the data rows themselves.
2. Every subsequent `INSERT` or `UPDATE` is checked against this metadata before the database commits the change: a type mismatch, a `NOT NULL` violation, a `UNIQUE` conflict, a `CHECK` failure, or a `FOREIGN KEY` referencing a nonexistent row all cause the statement to fail with an error, leaving existing data untouched.
3. A `UNIQUE` or primary key constraint is typically backed by an index (covered in the next lesson), which both enforces the constraint efficiently and speeds up lookups by that column.
4. A `FOREIGN KEY` constraint is checked at write time on both sides: inserting a referencing row checks the referenced row exists; deleting a referenced row checks (or applies) its `ON DELETE` behavior against every referencing row.
5. None of this enforcement depends on which application, script, or person issued the SQL — it applies uniformly to every writer of the database, which is precisely the property that makes it more robust than enforcing the same rules only in one application's code.

## Common mistakes

**Mistake 1: relying only on application-level uniqueness checks.** Under concurrent writers, a check-then-insert sequence is not atomic and can let two racing requests both pass. Fix: back every uniqueness requirement with a database `UNIQUE` constraint.

**Mistake 2: using `ON DELETE CASCADE` without considering the consequence.** Deleting one row can silently delete an entire tree of business-significant data nobody intended to remove. Fix: choose the `ON DELETE` behavior deliberately per relationship, and consider soft deletes for data with real business significance.

**Mistake 3: choosing a natural key that can change as the primary key.** A primary key referenced by foreign keys elsewhere becomes expensive or impossible to correct later. Fix: use a surrogate key as the primary key, and enforce natural-key uniqueness separately.

**Mistake 4: duplicating data across rows without recognizing the anomalies it invites.** An accidentally denormalized schema produces update, insertion, and deletion anomalies that quietly corrupt data over time. Fix: normalize by default, and treat any duplication as a deliberate, documented trade-off with a plan for keeping copies consistent.

## Best practices

- Give every table a surrogate primary key, and enforce natural-key uniqueness with a separate `UNIQUE` constraint.
- Back every uniqueness or validity rule with a database constraint, even when the application also validates it.
- Choose `ON DELETE` behavior deliberately for every foreign key; consider soft deletes for data with real business significance.
- Normalize by default; treat denormalization as a conscious, documented performance trade-off with an explicit consistency plan.
- Use `CHECK` constraints to encode invariants (valid ranges, allowed enum-like values) that a schema can enforce independently of any one application's code path.

## Summary

- A schema defines tables, typed columns, and constraints, enforced by the database independently of any application code.
- A surrogate primary key avoids the problems of a natural key that can change; natural-key uniqueness is enforced separately.
- A database-level `UNIQUE` constraint closes a race condition that an application-only check cannot, because check-then-insert across a network round trip is not atomic.
- Foreign keys enforce referential integrity, and `ON DELETE` behavior must be chosen deliberately per relationship.
- `NOT NULL`, `UNIQUE`, and `CHECK` constraints protect data regardless of which code path writes it.
- Normalization avoids update, insertion, and deletion anomalies caused by duplicated data; denormalization is a valid but deliberate trade-off, not a default.

## Practice

1. **Warm-up:** Explain, in terms of a race between two concurrent requests, why an application-only uniqueness check is insufficient without a database constraint.
2. **Warm-up:** For a `blog_post` table referencing an `author` table, choose an `ON DELETE` behavior for deleting an author and justify it.
3. **Core:** Design a normalized schema (tables, primary keys, foreign keys, at least one `CHECK` constraint) for a simple library system: books, authors, and loans. Identify the anomalies a single denormalized table would have caused.
4. **Core:** Write `CREATE TABLE` statements enforcing that an `order_line`'s `quantity` must be positive and that a `product_sku` referenced by an `order_line` must exist in a `product` table.
5. **Challenge:** Design a deliberate denormalization (a cached order total) for a system with expensive joins on a hot read path, and describe exactly what mechanism keeps the cached value consistent with the underlying line items.

## Check your understanding

1. Why is a database-level `UNIQUE` constraint necessary even when the application already checks for duplicates before inserting?
2. What is the practical advantage of a surrogate key over a natural key as a table's primary key?
3. What does `ON DELETE CASCADE` do, and why can it be dangerous when applied without considering the relationship's business meaning?
4. Name the three classic normalization anomalies and give a one-sentence example of each.
5. Why might a team deliberately denormalize part of a schema, and what must accompany that decision to keep it safe?
6. Why does a `CHECK` constraint protect data more broadly than an equivalent validation check written only in one application's code?
