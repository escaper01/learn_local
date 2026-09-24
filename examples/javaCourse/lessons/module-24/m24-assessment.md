# Chapter 24 assessment and deliberate practice

This chapter showed Spring Boot and JPA as applications of mechanisms this course already taught from first principles — dependency injection and proxies, HTTP semantics and validated DTOs, JDBC and transaction atomicity, optimistic locking — rather than as a separate, opaque framework to memorize. The chapter's sharpest lesson, repeated at three levels (the container's proxy mechanism, the self-invocation trap it causes, and the testing discipline needed to catch it), is that Spring's conveniences are readable, predictable consequences of an underlying mechanism, and the surprising bugs they produce are exactly as predictable once that mechanism is understood. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Spring container, beans, scopes, lifecycle, proxies, and constructor injection

A bean's lifecycle (construction, dependency injection, `@PostConstruct`, `@PreDestroy`) is managed by Spring's `ApplicationContext`, applying Chapter 20's Dependency Inversion Principle automatically across an entire application. Singleton scope means one instance per container, not a system-wide singleton. Spring proxies beans that need cross-cutting behavior (transactions, security), meaning an injected reference is often a proxy, not the raw instance — the fact the next lessons build directly on. Constructor injection is the recommended default, allowing `final` dependency fields and plain-`new` unit testing without any Spring machinery.

### Lesson 2: Boot auto-configuration, properties, profiles, validation, and startup

Auto-configuration is ordinary, readable conditional bean registration (`@ConditionalOnClass`, `@ConditionalOnMissingBean`), never opaque magic — an explicit application bean always wins. Property sources resolve in a fixed precedence order (command line, environment variables, profile-specific files, base files, defaults). Profiles vary beans and values by environment while keeping business logic itself environment-agnostic. `@ConfigurationProperties` with `@Validated` applies Bean Validation to configuration, and failing fast at startup on bad required values is the correct default — an immediate, clear deployment-time failure beats a delayed, confusing production-time one.

### Lesson 3: REST controllers, DTOs, Bean Validation, and exception responses

`@RestController` methods apply Chapter 18's HTTP method-and-status semantics declaratively. DTOs must stay separate from domain and JPA entities at the controller boundary, exactly as Chapter 18 warned for any JSON API. `@Valid` and Bean Validation check only a request's declared shape constraints — never authentication or authorization, which remain entirely separate, explicit controls. `@ControllerAdvice` centralizes translating exceptions into structured, correctly-statused, client-safe responses, logging full detail only server-side.

### Lesson 4: Services, repositories, transaction proxy boundaries, and testing slices

Spring Data repositories are a declarative layer over Chapter 19's JDBC/DataSource foundations. `@Transactional` works via the proxy mechanism from Lesson 1, starting a transaction before a method runs and committing or rolling back after. A self-invocation (`this.someMethod()`) never passes through that proxy, silently losing transaction behavior — a specific, predictable consequence of the mechanism, not a Spring bug. Transaction boundaries belong at the service layer, around a coherent business operation. Testing slices (`@WebMvcTest`, `@DataJpaTest`, `@SpringBootTest`) test each layer at the appropriate cost, with only full `@SpringBootTest` able to expose a genuine self-invocation/rollback bug.

### Lesson 5: JPA entity states, mappings, fetching, N+1, locking, and migrations

An entity's lifecycle state (transient, managed, detached, removed) determines whether dirty checking automatically persists a field mutation. JPA mappings translate directly to Chapter 19's tables, keys, and foreign keys. Lazy fetching risks `LazyInitializationException` after the persistence context closes; the N+1 query problem — one extra query per parent entity's lazily-accessed association in a loop — is the most common JPA performance bug, fixed with an explicit `JOIN FETCH`. `@Version` automates exactly Chapter 19's `WHERE id = ? AND version = ?` optimistic-locking pattern. Production schema changes for JPA-mapped tables still require versioned migrations, never an ORM's automatic schema generation.

## Cheat sheet

### Bean scope and injection

| Concept | Correct understanding |
|---|---|
| Singleton scope | One instance per `ApplicationContext`, not system-wide |
| Constructor injection | Recommended default; allows `final` fields and plain-`new` testing |
| `@Transactional`/security-annotated bean | Injected reference is often a generated proxy, not the raw instance |

### HTTP status mapping (Chapter 18, applied declaratively)

| Outcome | Status | Spring mechanism |
|---|---|---|
| Resource created | 201 | `@ResponseStatus(HttpStatus.CREATED)` |
| Validation failure | 400 | `MethodArgumentNotValidException`, via `@Valid` |
| Not found | 404 | Custom exception + `@ExceptionHandler` |
| Unexpected error | 500 | Catch-all `@ExceptionHandler`, generic message to client |

### The self-invocation trap

| Call shape | Goes through the proxy? | Transaction applies? |
|---|---|---|
| External bean calls `orderService.completeOrder(id)` | Yes | Yes |
| `this.completeOrder(id)` from another method on the same bean | No | No — silently skipped |

### Fetching and the N+1 problem

| Strategy | Risk |
|---|---|
| `EAGER` by default | Wasted joins/queries when the association is rarely needed |
| `LAZY` by default | `LazyInitializationException` if accessed after the persistence context closes; N+1 if accessed in a loop |
| `JOIN FETCH` for a specific query | Fixes N+1 for exactly the query that needs the association |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Is a JPA entity ever serialized directly as a controller's response type instead of a dedicated DTO?
- Is `@Valid` passing ever treated as proof the caller is authenticated or authorized?
- Does any `@Transactional` method get called via `this` from another method on the same bean?
- Is a lazily-fetched association accessed inside a loop over a list of parent entities, risking N+1?
- Is an `@ConfigurationProperties` class carrying required values left unvalidated?
- Does a full `@SpringBootTest` get used where a narrower slice (`@WebMvcTest`, `@DataJpaTest`, or a plain unit test) would suffice?

## The judgment question

The judgment question describes a transactional method called through `this`, and asks what should be tested — the correct answer is **whether the call crosses the configured proxy and transaction boundary**, not only whether the annotation text exists and not only whether the method is short. This is Lesson 4's central point, and it follows directly from Lesson 1's proxy mechanism: the `@Transactional` annotation's mere textual presence on a method says nothing about whether any given call site actually reaches the proxy that implements its behavior — a self-invocation through `this` demonstrably does not, regardless of how the annotation reads. Checking "is the method short" is irrelevant to this specific failure mode entirely; a one-line method called via `this` loses transaction behavior exactly as completely as a fifty-line one. Only a test that actually exercises the real call path — through a genuine Spring container, ideally forcing a failure and checking whether rollback actually occurred — can verify the proxy boundary was genuinely crossed, which is precisely why this class of bug requires full `@SpringBootTest`-level integration testing to catch, never a plain unit test or a code-reading check for the annotation's presence.

## Approaching the implementation lab

The lab asks for `httpStatus(result)`: map `"CREATED"` to `201` and `"MISSING"` to `404`; every other string maps to `500`.

1. Write the precondition and boundary table first: the two named mappings (`"CREATED"` → `201`, `"MISSING"` → `404`), an unrelated string (`"x"` → `500`), a plausible-but-unmapped named result (`"CONFLICT"` → `500`, since only two specific strings are mapped), and a case-mismatched variant of a mapped string (`"created"` → `500`, since the comparison is case-sensitive).
2. Compare the input against the two named strings exactly (`"CREATED".equals(value1)`, `"MISSING".equals(value1)`), falling through to `500` for anything else — a `switch` expression with a `default` case, or a simple `if`/`else if`/`else` chain, both work equally well here.
3. Do not attempt case-insensitive matching or any fuzzy comparison — the hidden test with lowercase `"created"` specifically confirms exact, case-sensitive matching is required.
4. Recall the lab's own stated scope: this pure mapping helper checks only the string-to-status logic in isolation; it does not test an actual Spring controller's real HTTP behavior, which the chapter's own external labs (per Lesson 3) are what actually verify.

## Approaching the debug lab

The debug lab's starter code increments the `version` column in an `UPDATE` statement but never checks the *expected* version in the `WHERE` clause — exactly the "optimistic update without checking the expected version" mistake Lesson 5 warns against, which silently allows a concurrent conflicting write to be overwritten instead of detected as a conflict.

1. Run the program and confirm it currently prints `UPDATE task SET title = ?, version = version + 1 WHERE id = ?` — missing the version check entirely.
2. Recall Lesson 5's exact point, itself drawn directly from Chapter 19: optimistic locking requires the `WHERE` clause to check `version = ?` against the value read at load time, so that a concurrent modification (which would have incremented the row's actual version) causes the update to match zero rows instead of silently succeeding and overwriting the other transaction's change.
3. Add `AND version = ?` to the end of the `WHERE` clause, preserving the rest of the SQL text exactly as given.
4. Confirm your fix now produces exactly `UPDATE task SET title = ?, version = version + 1 WHERE id = ? AND version = ?`, and be ready to explain why omitting the version check from the `WHERE` clause defeats optimistic locking's entire purpose — the row would still be updated, and the increment would still happen, but nothing would ever detect that a concurrent, conflicting write had occurred in between.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Build a small Spring Boot application with a constructor-injected service, a `@ConfigurationProperties` class with at least one validated required field, and confirm the application fails to start when that field is missing or invalid.
2. Write a controller with a `@Valid`-annotated DTO and a `@ControllerAdvice` handling at least a validation failure and a custom not-found exception, and add a separate, explicit authorization check in the service layer, demonstrating that a well-formed but unauthorized request is still rejected.
3. Reproduce the self-invocation transaction bug end to end: a `@Transactional` method called via `this`, a forced failure partway through, and a full `@SpringBootTest` confirming no rollback occurred; then fix it and confirm the fix with the same test.
4. Build an entity relationship, deliberately trigger an N+1 query pattern with SQL logging enabled, then fix it with an explicit `JOIN FETCH` and confirm the query count drops.
5. Add `@Version` to an entity, simulate a genuine concurrent-modification conflict across two separate persistence contexts, and implement a retry strategy that catches `OptimisticLockException`, reloads the entity, and reapplies the intended change.

## Self-assessment

You are ready to complete this project checkpoint when you can do all of the following without notes:

- Explain what Spring's default singleton scope actually guarantees, and why constructor injection is the recommended default over field injection.
- Explain what `@ConditionalOnClass`/`@ConditionalOnMissingBean` actually check, and why failing fast at startup on bad configuration is the correct default.
- Explain why `@Valid` succeeding says nothing about a caller's authentication or authorization, and why a DTO must stay separate from a domain or JPA entity at a controller boundary.
- Explain precisely why a self-invocation bypasses a `@Transactional` proxy, and what specifically must be tested to verify a transaction boundary actually holds.
- Explain the N+1 query problem, why it is easy to miss in development, and how `JOIN FETCH` fixes it for a specific query.
- Explain what SQL pattern `@Version` automatically generates, and how it maps directly onto Chapter 19's optimistic-locking discipline.
- Choose the correct test slice (`@WebMvcTest`, `@DataJpaTest`, `@SpringBootTest`, or a plain unit test) for a given testing need, and justify the choice.
