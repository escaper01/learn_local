# JPA entity states, mappings, fetching, N+1, locking, and migrations

JPA (the Java Persistence API, implemented by Hibernate underneath Spring Data JPA) lets you work with database rows as ordinary Java objects — but every convenience it offers sits directly on top of the SQL, transaction, and locking foundations Chapter 19 already taught you to reason about explicitly. This closing lesson of the chapter, and the course's Java-fundamentals arc, is about predicting exactly what SQL a JPA operation generates, exactly when it runs, and exactly where its conveniences can silently generate far more (or far less transactionally safe) SQL than a developer unfamiliar with the underlying mechanism would expect.

What you will learn:

- The JPA entity lifecycle states: transient, managed, detached, and removed
- How `@Entity`, `@Id`, and relationship mappings translate to the tables and foreign keys from Chapter 19
- Eager versus lazy fetching, and why choosing wrong causes either wasted queries or a `LazyInitializationException`
- The N+1 query problem: the single most common JPA performance bug, and how to fix it
- `@Version` and optimistic locking, mapped directly onto Chapter 19's optimistic-locking pattern
- Why generated SQL and schema migrations must be verified explicitly, never assumed safe

## Entity lifecycle: transient, managed, detached, removed

A JPA entity object moves through four distinct states relative to a **persistence context** (roughly, the current unit-of-work tracking which entities are "known" and being synchronized with the database):

| State | Meaning |
|---|---|
| **Transient** | A plain object, just constructed with `new`; JPA knows nothing about it yet |
| **Managed** | Attached to an active persistence context; changes to its fields are automatically tracked and will be flushed to the database |
| **Detached** | Was managed once, but the persistence context that tracked it has since closed (or it was explicitly detached); changes are no longer automatically tracked |
| **Removed** | Marked for deletion; will be deleted from the database when the persistence context flushes |

```java
OrderEntity order = new OrderEntity(); // TRANSIENT: just a plain Java object so far
order.setCustomerId("c-42");

entityManager.persist(order); // now MANAGED: tracked by the persistence context

order.setStatus("SHIPPED"); // no explicit save() call needed — this change is tracked automatically
// ... transaction commits, or the persistence context flushes ...
// The UPDATE for status="SHIPPED" happens AUTOMATICALLY, because `order` was MANAGED
// at the moment its field changed, and JPA detected the change via "dirty checking."
```

This **dirty checking** — JPA automatically detecting field changes on managed entities and generating the corresponding `UPDATE` statement without an explicit save call — is genuinely convenient, but it means a mutation to a managed entity is not an inert, local change the way mutating a plain object is; it is scheduled, real, pending database work, which is exactly why understanding *when* an entity is managed versus detached is essential to predicting when a change will (or, importantly, will not) actually be persisted.

## Mappings: @Entity, @Id, and relationships, translating directly to Chapter 19's schema

```java
@Entity
@Table(name = "orders")
public class OrderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY) // maps to Chapter 19's surrogate primary key
    private Long id;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderLineEntity> lines = new ArrayList<>();

    @Version // optimistic locking — covered below
    private Long version;
}

@Entity
public class OrderLineEntity {
    @Id @GeneratedValue private Long id;

    @ManyToOne(fetch = FetchType.LAZY) // maps to Chapter 19's foreign key, from the "many" side
    @JoinColumn(name = "order_id")
    private OrderEntity order;

    private String sku;
    private int quantity;
}
```

Every one of these annotations maps directly to a concept Chapter 19 already covered: `@Id`/`@GeneratedValue` is a surrogate primary key; `@JoinColumn` is a foreign key column; `@OneToMany`/`@ManyToOne` describe the same one-to-many relationship Chapter 19's `customer`/`orders` example modeled with plain SQL; `cascade = CascadeType.ALL` decides what happens to child rows when the parent is deleted or saved, echoing Chapter 19's `ON DELETE` discussion, just configured at the object-relational mapping layer instead of in the `CREATE TABLE` statement itself. Reading a JPA mapping is, precisely, reading a schema description in a different notation — the underlying tables, keys, and constraints are exactly what Chapter 19 already taught you to design and reason about.

## Eager versus lazy fetching

`fetch = FetchType.LAZY` (used above for `OrderLineEntity.order`) means the referenced entity is **not** loaded from the database until the code actually accesses it; `FetchType.EAGER` loads it immediately, as part of the same query that loads the entity itself:

```java
OrderLineEntity line = orderLineRepository.findById(lineId).orElseThrow();
// line.getOrder() has NOT triggered a query yet, with LAZY fetching — only a proxy exists so far.

String customerId = line.getOrder().getCustomerId();
// THIS line triggers a SEPARATE query to actually load the OrderEntity, the first time
// a real field on it is accessed.
```

Choosing wrong in either direction has a real, specific cost: `EAGER` fetching for a relationship that is rarely actually needed wastes a join (or an extra query) on every single load, even for the majority of calls that never touch that association at all; `LAZY` fetching accessed *after* the persistence context that loaded the original entity has already closed throws `LazyInitializationException` — the lazy proxy can no longer reach the database to fulfill the deferred load, because the session/transaction that would have let it do so is gone. This second failure is specifically common in a REST controller that serializes an entity directly (exactly Lesson 3's "don't serialize JPA entities directly" warning, now given its own concrete mechanical reason): if the persistence context closes before Jackson tries to serialize a lazy association, serialization throws, sometimes deep inside framework code far from the controller method that "looks" perfectly correct.

## The N+1 query problem: the single most common JPA performance bug

**N+1** describes a specific, extremely common pattern: loading a list of `N` parent entities with one query, then triggering `N` *additional* separate queries — one per parent — when a lazily-fetched association on each one is subsequently accessed in a loop:

```java
// ONE query loads all orders.
List<OrderEntity> orders = orderRepository.findAll();

for (OrderEntity order : orders) {
    // Each iteration triggers a SEPARATE query for order.getLines(), because it's LAZY.
    // For 100 orders, this is 1 (orders) + 100 (one per order's lines) = 101 total queries,
    // where a single, well-constructed query could have retrieved everything needed.
    System.out.println(order.getLines().size());
}
```

This is invisible in the application code itself — nothing about the loop *looks* wrong, and it works correctly for a small number of orders in local testing — which is exactly what makes it the most common real-world JPA performance bug: it degrades gracefully with data volume in development and then becomes a genuine, visible latency problem in production, once the "small number of orders" assumption a local test happened to satisfy no longer holds. The fix is to fetch the needed association **eagerly, for this specific query**, using a `JOIN FETCH`:

```java
@Query("SELECT o FROM OrderEntity o JOIN FETCH o.lines WHERE o.customerId = :customerId")
List<OrderEntity> findByCustomerIdWithLines(@Param("customerId") String customerId);
```

This single, explicit query loads every needed `OrderEntity` and its `lines` together, in one round trip — the entity mapping's own `FetchType.LAZY` default stays correct and appropriate for the general case (most callers of `OrderEntity` never need `lines` at all), while this specific query method opts into eager loading exactly where it is actually needed, which is the right granularity: the fetch strategy for a *specific query's* needs, not a single, compromise-forced setting on the entity mapping itself.

## @Version and optimistic locking: exactly Chapter 19's pattern, automated

This chapter's concept-check question names `@Version`'s purpose directly: **optimistic conflict detection** — exactly the `WHERE id = ? AND version = ?` pattern Chapter 19's transaction lesson demonstrated by hand, now generated and enforced automatically by JPA:

```java
@Entity
public class OrderEntity {
    @Version
    private Long version;
    // ...
}
```

```sql
-- JPA automatically generates and checks this shape on every UPDATE to a @Version-annotated entity:
UPDATE orders SET status = ?, version = ? WHERE id = ? AND version = ?
--                                                          ^^^^^^^^^^^^^ the version read when this entity was LOADED
```

If another transaction has modified (and incremented the version of) the same row since this entity was loaded, the `WHERE` clause matches zero rows — exactly Chapter 19's affected-row-count check — and JPA translates that zero-row result into an `OptimisticLockException`, thrown back to the calling code, which must catch it and decide how to respond (reload and retry, or surface a conflict to the user), exactly the recovery pattern Chapter 19's own optimistic-locking section demonstrated by hand. `@Version` does not eliminate the need to understand what it is doing underneath — it automates the mechanical generation of a pattern you should already be able to construct yourself, and understanding the underlying SQL is exactly what lets you correctly interpret an `OptimisticLockException` when it appears, rather than treating it as an unexplained framework error.

## Generated SQL and migrations: verify, never assume

Two closing warnings connect this lesson directly back to earlier chapters. First: JPA's generated SQL should be **inspected**, not assumed correct or efficient — enabling SQL logging (`spring.jpa.show-sql=true`, or a proper SQL logging library for production) and actually reading the queries a given code path produces is the only way to catch an N+1 problem, an unexpectedly eager fetch, or a query shape that does not use an available index (Chapter 19's `EXPLAIN` discipline still applies directly to JPA-generated SQL, exactly as it would to hand-written SQL). Second: schema changes for JPA-mapped tables still need Chapter 16's versioned migration discipline (Flyway or Liquibase) — Hibernate's own automatic schema generation (`spring.jpa.hibernate.ddl-auto=update`) is convenient for local development but is exactly the kind of unversioned, untracked, environment-diverging schema change Chapter 16 warned against for any environment beyond a developer's own local database; production schema changes should always go through the same reviewed, versioned migration pipeline as any other schema change, regardless of whether an ORM sits on top of the resulting tables.

## What happens under the hood: from a managed entity to generated SQL

1. `entityManager.persist(entity)` (or a Spring Data repository's `save`) registers the entity with the active persistence context, transitioning it from transient to managed, and schedules an eventual `INSERT`.
2. While managed, JPA tracks every field mutation against a snapshot taken when the entity was loaded (or first persisted); at flush time (end of the transaction, or an explicit flush), it compares current field values against that snapshot and generates `UPDATE` statements only for entities that actually changed — this is dirty checking.
3. A `@ManyToOne`/`@OneToMany` marked `LAZY` is represented, until first accessed, by a proxy object (for `@ManyToOne`) or an uninitialized collection wrapper (for `@OneToMany`); accessing a real field or method on it for the first time triggers a fresh query against the still-open persistence context to actually populate it.
4. `@Version`-annotated fields are automatically included in every generated `UPDATE`'s `SET` clause (incrementing) and `WHERE` clause (matching the value read at load time); a mismatch means the affected-row count comes back as zero, which JPA translates into `OptimisticLockException`.
5. `JOIN FETCH` in an explicit JPQL query instructs Hibernate to generate a single SQL query with an actual `JOIN`, populating both the parent entities and their associated collection in one round trip, rather than relying on the entity mapping's own lazy-loading default and triggering N additional queries later.

## Common mistakes

**Mistake 1: serializing a lazily-loaded entity directly from a controller after the persistence context has closed.** This throws `LazyInitializationException`, often confusingly, deep inside serialization code. Fix: translate to a DTO (per Lesson 3) within the transactional boundary, before the persistence context closes, or use `JOIN FETCH` to eagerly load exactly what the DTO needs.

**Mistake 2: accessing a lazy association inside a loop over a list of parent entities, causing N+1 queries.** This looks correct and performs fine at small scale, then degrades badly under real data volume. Fix: use `JOIN FETCH` (or Spring Data's `@EntityGraph`) for a specific query's actual needs, rather than defaulting every relationship to eager fetching globally.

**Mistake 3: using Hibernate's automatic schema generation (`ddl-auto=update`) for a production database.** This is an unversioned, untracked schema change mechanism, exactly what Chapter 16 warned against beyond local development. Fix: manage production schema changes through a versioned migration tool, regardless of the ORM layered on top.

**Mistake 4: treating `@Version`/`OptimisticLockException` as unexplained framework magic instead of the exact `WHERE ... AND version = ?` pattern from Chapter 19.** This makes it harder to reason correctly about when and why the exception occurs, or to design a correct retry strategy. Fix: understand `@Version` as automating a pattern you should already be able to write and reason about by hand.

## Best practices

- Understand entity lifecycle states (transient, managed, detached, removed) precisely enough to predict when a field mutation will or will not be automatically persisted.
- Default relationship fetching to `LAZY`, and opt into eager loading per-query with `JOIN FETCH` (or `@EntityGraph`) exactly where a specific query's needs justify it.
- Enable and actually read SQL logging during development to catch N+1 problems and unexpectedly generated queries before they reach production.
- Use `@Version` for optimistic locking wherever concurrent modification of the same row is a realistic possibility, and handle `OptimisticLockException` with a deliberate retry or conflict-surfacing strategy.
- Manage schema changes for JPA-mapped tables through the same versioned migration discipline as any other schema change; reserve automatic schema generation for local development only.

## Summary

- An entity's lifecycle state (transient, managed, detached, removed) determines whether a field mutation is automatically tracked and persisted via dirty checking.
- JPA mappings (`@Entity`, `@Id`, `@OneToMany`/`@ManyToOne`, `@JoinColumn`) translate directly to Chapter 19's tables, keys, and foreign keys — reading a mapping is reading a schema in a different notation.
- Lazy fetching defers loading until access, risking `LazyInitializationException` after the persistence context closes; eager fetching loads immediately, risking wasted queries when the association is rarely needed.
- The N+1 query problem — one query per parent entity's lazily-accessed association inside a loop — is the most common JPA performance bug, fixed with an explicit `JOIN FETCH` for the specific query that needs it.
- `@Version` automates exactly Chapter 19's optimistic-locking pattern (`WHERE id = ? AND version = ?`), translating a zero-affected-row result into `OptimisticLockException`.
- Generated SQL should be inspected, not assumed correct; production schema changes for JPA-mapped tables still require versioned migrations, never an ORM's automatic schema generation.

## Practice

1. **Warm-up:** Explain why mutating a managed entity's field, with no explicit save call, still results in an `UPDATE` statement being generated at transaction commit.
2. **Warm-up:** A controller accesses a lazily-fetched association after its transaction has already completed, and the application throws `LazyInitializationException`. Explain precisely why.
3. **Core:** Write a small entity relationship with a `LAZY`-fetched association, reproduce an N+1 query pattern by looping over a list and accessing that association, and enable SQL logging to observe the extra queries directly.
4. **Core:** Fix the N+1 problem from the previous exercise with an explicit `JOIN FETCH` query, and confirm via SQL logging that the fix reduces the query count to one.
5. **Challenge:** Add `@Version` to an entity, simulate two concurrent updates to the same row (two separate `EntityManager`/persistence context instances loading the same entity, then both attempting to save), and confirm the second save throws `OptimisticLockException`, then implement a retry strategy that reloads and reapplies the change.

## Check your understanding

1. What does it mean for an entity to be "managed," and why does mutating a managed entity's field not require an explicit save call?
2. How does a `@OneToMany`/`@ManyToOne` mapping correspond to a foreign key relationship from Chapter 19?
3. What is the practical trade-off between `FetchType.LAZY` and `FetchType.EAGER`, and what specific exception can result from choosing lazy fetching incorrectly?
4. What is the N+1 query problem, why is it easy to miss in development, and what fixes it?
5. What SQL pattern does `@Version` automatically generate, and how does it relate to Chapter 19's optimistic-locking material?
6. Why is an ORM's automatic schema generation feature inappropriate for a production database, according to Chapter 16's migration discipline?
