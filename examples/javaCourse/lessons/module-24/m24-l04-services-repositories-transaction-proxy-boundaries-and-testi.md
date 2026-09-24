# Services, repositories, transaction proxy boundaries, and testing slices

`@Transactional` is Spring's most convenient feature and its single most common source of a genuinely surprising bug — one that follows directly, and entirely predictably, from Lesson 1's proxy explanation. This lesson makes that connection explicit: `@Transactional` works by wrapping a bean in a proxy, exactly as Lesson 1 described, and a **self-invocation** — a method calling another method on `this`, directly, in the same object — never passes through that proxy at all, silently skipping the transaction behavior the annotation appeared to promise. This lesson also covers repositories (Spring Data's abstraction over the DataSource/JDBC material from Chapter 19) and testing slices, which let you test each architectural layer in isolation.

What you will learn:

- Repositories: Spring Data's declarative abstraction over Chapter 19's JDBC/DataSource material
- How `@Transactional` actually works: a proxy wrapping start/commit/rollback around a method call
- Why a self-invocation (`this.someMethod()`) bypasses the proxy and silently loses transaction behavior
- The service layer as the natural home for transaction boundaries, one level above repositories
- Testing slices: `@WebMvcTest`, `@DataJpaTest`, and full `@SpringBootTest`, and when to use each
- Designing transaction boundaries deliberately, not accidentally, around a coherent unit of work

## Repositories: declarative persistence, built on Chapter 19's foundations

A Spring Data **repository** is an interface — Spring generates the implementation at runtime — that abstracts over exactly the `DataSource`/`PreparedStatement`/`ResultSet` machinery Chapter 19 covered directly:

```java
public interface OrderRepository extends JpaRepository<OrderEntity, Long> {
    Optional<OrderEntity> findByCustomerIdAndStatus(String customerId, String status);
    List<OrderEntity> findByPlacedAtAfter(Instant cutoff);
}
```

You never write an implementation of this interface at all — Spring Data generates one at startup, translating `findByCustomerIdAndStatus` into a query derived directly from the method's own name (a "derived query method"), or you can write an explicit `@Query` annotation for anything more complex. Underneath, this is still ordinary JDBC (or, for JPA repositories specifically, Hibernate translating into JDBC) — everything Chapter 19 taught about `PreparedStatement`'s protection against SQL injection, transactions, and isolation levels still applies; Spring Data is a **declarative layer on top of**, not a replacement for, that foundation.

## How @Transactional actually works: a proxy, exactly as Lesson 1 described

Recall Lesson 1's proxy explanation: Spring wraps a `@Transactional`-annotated bean in a generated proxy that intercepts calls to its methods, adding behavior around them. For `@Transactional` specifically, that added behavior is: begin a database transaction before the method runs, commit it if the method returns normally, and roll it back if the method throws an unchecked exception:

```java
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final InventoryService inventoryService;

    public OrderService(OrderRepository orderRepository, InventoryService inventoryService) {
        this.orderRepository = orderRepository;
        this.inventoryService = inventoryService;
    }

    @Transactional // the PROXY starts a transaction before this runs, commits/rolls back after
    public void completeOrder(Long orderId) {
        OrderEntity order = orderRepository.findById(orderId).orElseThrow();
        inventoryService.reserveStock(order); // both this call and the save below share ONE transaction
        order.setStatus("COMPLETED");
        orderRepository.save(order);
        // If anything above throws, the proxy rolls back BOTH the inventory reservation
        // and the order status change together — exactly Chapter 19's atomicity guarantee.
    }
}
```

This is exactly Chapter 19's atomicity discipline, delivered declaratively: without `@Transactional`, each repository call would commit independently, and a failure partway through would leave exactly the kind of inconsistent, partial state Chapter 19's bank-transfer example warned against. `@Transactional` lets you state "these operations are one atomic unit of work" as a single annotation, with the proxy doing the actual `commit()`/`rollback()` work Chapter 19 showed you writing by hand with a raw `Connection`.

## The self-invocation trap: why this.someMethod() bypasses the proxy

This chapter's concept-check question names the exact, predictable consequence of the proxy mechanism directly: **a self-invocation through `this` never passes through the surrounding proxy**, because `this` inside a method body refers to the *raw* object instance, not the proxy wrapping it — the proxy only intercepts calls that arrive *from outside* the object, through the reference other beans were actually given.

```java
@Service
public class OrderService {

    @Transactional
    public void completeOrder(Long orderId) {
        // ... business logic ...
    }

    public void completeOrderIfEligible(Long orderId) {
        if (isEligibleForCompletion(orderId)) {
            this.completeOrder(orderId); // SELF-INVOCATION: bypasses the proxy entirely!
            // completeOrder's @Transactional annotation is SILENTLY IGNORED here.
            // No transaction is started by this call at all.
        }
    }
}
```

When `completeOrderIfEligible` calls `this.completeOrder(orderId)` (or even just `completeOrder(orderId)`, implicitly on `this`), that call is an ordinary Java method call on the current object — it never goes back out through the container to reach the proxy Spring constructed around this bean, and therefore never triggers the transaction-starting behavior the proxy is what actually implements. `completeOrder`'s body still runs (the annotation does not prevent execution), but it runs with **no transaction at all**, silently — no compile error, no runtime exception, just business logic that was supposed to be atomic running without that guarantee, discoverable only by carefully reading the call path or by an actual concurrent-modification bug surfacing in production. This directly answers the concept-check's framing: `this.complete()` does **not** trigger default Spring transaction interception, precisely because self-invocation bypasses the proxy that interception mechanism relies on entirely.

## Fixing (and testing for) the self-invocation trap

The correct fix, once the mechanism is understood, is straightforward: route the call back *through the container*, rather than through `this` directly — commonly, by injecting the bean into itself (Spring supports this specifically for this purpose), or, more cleanly, by moving the two methods into genuinely separate beans, so the call between them is necessarily an external, proxy-intercepted call rather than an internal one:

```java
// FIX 1: inject the bean's own proxy and call through it.
@Service
public class OrderService {
    @Autowired
    @Lazy // required: without it, Spring's default circular-reference check refuses to
          // start at all, since this field's type is the bean currently being created
    private OrderService self; // Spring injects the PROXY here, not the raw instance

    public void completeOrderIfEligible(Long orderId) {
        if (isEligibleForCompletion(orderId)) {
            self.completeOrder(orderId); // goes through the proxy: transaction behavior applies correctly
        }
    }

    @Transactional
    public void completeOrder(Long orderId) { /* ... */ }
}

// FIX 2 (cleaner): separate the two responsibilities into different beans entirely.
@Service
public class OrderCompletionEligibilityChecker {
    private final OrderCompletionService completionService;
    // ...
    public void completeOrderIfEligible(Long orderId) {
        if (isEligible(orderId)) {
            completionService.completeOrder(orderId); // an external call: proxy intercepts correctly
        }
    }
}
```

The `@Lazy` on the self-injected field is not optional decoration: without it, Spring Boot's default circular-reference protection (on since Spring Boot 2.6) refuses to start the application at all, reporting `AccountService` as depending on itself in an unresolvable cycle — because eagerly injecting a bean into its own field while that same bean is still being constructed is exactly the circular dependency the container is checking for. `@Lazy` breaks the cycle by injecting a proxy that only resolves the real (fully-constructed) bean the first time `self` is actually used, not during construction — a real, verified requirement for this pattern on a modern Spring Boot version, not a stylistic preference.

This chapter's own judgment question makes the testing implication explicit: for a `@Transactional` method reached through `this`, the right thing to verify is **whether the call actually crosses the configured proxy and transaction boundary** — not merely whether the `@Transactional` annotation's text is present on the method (it can be present and still silently ignored, exactly as shown above), and not whether the method happens to be short. A genuine integration test — one that actually runs against Spring's container and a real (or realistically embedded) database, deliberately forcing a failure partway through a self-invoked call chain and checking whether a rollback genuinely occurred — is the only way to verify this specific behavior; a plain unit test calling the method directly on a bare `new OrderService(...)` instance, with no proxy involved at all, cannot expose this bug either way, since there is no proxy to bypass in the first place.

## Where transaction boundaries belong: the service layer

A repository method alone is typically too fine-grained a unit for a transaction boundary — Chapter 19's own bank-transfer example needed *two* separate statements (debit, credit) inside one transaction, which means the transaction boundary belongs one level above individual repository calls, in the **service layer**, exactly where `completeOrder` above places it. A repository method can itself be transactional for its own single operation, but a service method's `@Transactional` is what actually groups multiple repository (and other service) calls into one coherent, atomic unit of work — the service layer is where "what counts as one indivisible business operation" is actually decided and enforced, not an accidental consequence of wherever `@Transactional` happens to be typed.

## Testing slices: testing one layer at a time

Spring Boot provides **test slices** — annotations that start only the part of the application context relevant to one architectural layer, rather than the entire application, keeping tests fast and focused:

| Test slice | Starts | Good for |
|---|---|---|
| Plain unit test, no Spring at all | Nothing — construct the class with `new` | Testing a service's business logic with test-double dependencies, per Chapter 20's testability discipline |
| `@WebMvcTest` | The web layer only (controllers, `@ControllerAdvice`), with service beans mocked | Testing controller request mapping, validation, and exception-handling behavior in isolation |
| `@DataJpaTest` | The JPA/repository layer only, against an embedded or test database | Testing repository query methods and entity mapping behavior |
| `@SpringBootTest` | The entire application context | Full integration tests, including genuine transaction-boundary and self-invocation behavior |

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {
    @Autowired MockMvc mockMvc;
    @MockBean OrderService orderService; // the real service is NOT started; a mock stands in

    @Test
    void createOrder_withBlankCustomerId_returns400() throws Exception {
        mockMvc.perform(post("/api/orders").contentType(APPLICATION_JSON)
                        .content("{\"customerId\":\"\",\"lines\":[]}"))
               .andExpect(status().isBadRequest()); // verifies @Valid's rejection, without a real service or database
    }
}
```

Choosing the right slice for a given test is a direct application of Chapter 15's testing-pyramid discipline: most tests should be the cheapest, fastest kind that still proves the thing being tested — a controller's request-mapping and validation behavior needs only `@WebMvcTest`, with no real service or database involved at all; a repository's query-derivation logic needs `@DataJpaTest`, with no web layer involved; and only the specific concern of "does a transaction boundary actually hold, including through a self-invocation" needs the full weight of `@SpringBootTest`, run sparingly, exactly where that specific integration behavior is what is actually being verified.

## What happens under the hood: from an external call to a committed transaction

1. Another bean (a controller, or a different service) calls a method on the injected reference it holds — which, for a `@Transactional`-annotated bean, is the proxy Lesson 1 described, not the raw instance.
2. The proxy's own intercepting method runs first: it begins a new database transaction (or joins an existing one, depending on the configured propagation behavior) before delegating to the real method body.
3. The real method body executes, making whatever repository and service calls it needs — each of these, if it calls back into other proxied beans externally, is itself correctly intercepted by those beans' own proxies in turn.
4. If the method returns normally, the proxy commits the transaction; if it throws a `RuntimeException` (Spring's default rollback rule; checked exceptions require explicit configuration to trigger rollback), the proxy rolls the transaction back instead, undoing every change made since it began.
5. A self-invocation (`this.someMethod()`) never reaches this proxy step at all — the call resolves directly to the real object's own method body via ordinary Java method dispatch, with no transaction-management code ever executing around it, silently.

## Common mistakes

**Mistake 1: calling a `@Transactional` method via `this` from another method on the same bean.** This bypasses the proxy entirely, silently running the method with no transaction at all. Fix: route the call through the container (self-injection) or restructure into separate beans so the call is external.

**Mistake 2: placing `@Transactional` on individual repository methods only, with no service-level transaction grouping multiple repository calls into one atomic unit.** A multi-step business operation then commits each step independently, exactly the partial-failure risk Chapter 19 warned against. Fix: place the transaction boundary at the service layer, around the coherent business operation.

**Mistake 3: testing `@Transactional` behavior with a plain unit test constructing the service directly with `new`.** With no Spring container and no proxy involved, this cannot expose a self-invocation bug (or verify rollback behavior) either way. Fix: use a genuine `@SpringBootTest`-level integration test specifically for verifying transaction-boundary and rollback behavior.

**Mistake 4: reaching for full `@SpringBootTest` for every test, when a narrower slice (`@WebMvcTest`, `@DataJpaTest`, or a plain unit test) would suffice and run far faster.** This makes the whole test suite slower than necessary, without adding real assurance for what most tests are actually checking. Fix: choose the narrowest test slice that still proves the specific behavior under test.

## Best practices

- Understand `@Transactional` as proxy-based interception, and route calls through the container (never through `this`) whenever transaction behavior must actually apply.
- Place transaction boundaries at the service layer, around a coherent, indivisible business operation, not scattered across individual repository methods.
- Verify transaction-boundary and self-invocation behavior specifically with full `@SpringBootTest`-level integration tests, since no narrower test can expose this class of bug.
- Use the narrowest test slice (`@WebMvcTest`, `@DataJpaTest`, or a plain unit test) that still proves the specific behavior under test, reserving full `@SpringBootTest` for genuine end-to-end or transaction-boundary verification.
- When reviewing a `@Transactional` method, always trace whether every call site reaching it goes through the container or through a self-invocation — the annotation's presence alone is not evidence its behavior actually applies.

## Summary

- Spring Data repositories are a declarative abstraction generated at runtime, built on top of Chapter 19's JDBC/DataSource foundations, not a replacement for that underlying discipline.
- `@Transactional` works via a proxy that starts a transaction before a method runs and commits or rolls back after, exactly implementing Chapter 19's atomicity guarantee declaratively.
- A self-invocation (`this.someMethod()`) never passes through that proxy, silently losing transaction behavior — a specific, predictable consequence of the proxy mechanism, not a bug in Spring.
- Transaction boundaries belong at the service layer, grouping multiple repository and service calls into one coherent, atomic business operation.
- Spring Boot's test slices (`@WebMvcTest`, `@DataJpaTest`, `@SpringBootTest`) let each architectural layer be tested in isolation at the appropriate cost, with only full `@SpringBootTest` able to expose genuine proxy/transaction-boundary bugs like self-invocation.

## Practice

1. **Warm-up:** Explain, step by step, why calling `this.completeOrder(orderId)` from another method on the same bean does not apply `completeOrder`'s `@Transactional` behavior.
2. **Warm-up:** For a multi-step business operation spanning two repository calls, explain why the transaction boundary belongs at the service layer rather than on each repository method individually.
3. **Core:** Reproduce the self-invocation bug in a small Spring Boot application: call a `@Transactional` method via `this` from a sibling method, force a failure partway through, and confirm (via a full `@SpringBootTest`) that no rollback actually occurred.
4. **Core:** Fix the bug from the previous exercise using self-injection or by separating the two methods into different beans, and confirm with the same test that rollback now occurs correctly.
5. **Challenge:** Write a small `OrderController`/`OrderService`/`OrderRepository` slice, and write three tests at three different levels: a `@WebMvcTest` for the controller's validation behavior, a `@DataJpaTest` for a repository query method, and a full `@SpringBootTest` verifying a transaction rolls back correctly on a forced failure.

## Check your understanding

1. What mechanism does `@Transactional` actually rely on to start and commit/roll back a transaction around a method call?
2. Why does a self-invocation (`this.someMethod()`) never trigger that mechanism, even though the annotation is present on the method?
3. Why does placing a transaction boundary at the service layer, rather than on individual repository methods, matter for a multi-step business operation?
4. Why can a plain unit test constructing a service with `new` never expose a self-invocation transaction bug, in either direction?
5. What is the difference in scope between `@WebMvcTest`, `@DataJpaTest`, and `@SpringBootTest`, and when is each the right choice?
6. According to this chapter's judgment question, what should actually be tested for a `@Transactional` method reached through `this`, rather than merely checking whether the annotation is present?
