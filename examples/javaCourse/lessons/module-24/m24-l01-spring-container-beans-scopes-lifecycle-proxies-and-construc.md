# Spring container, beans, scopes, lifecycle, proxies, and constructor injection

Spring is, at its core, a very large, very mature application of ideas this course has already taught you from first principles: dependency injection and the Dependency Inversion Principle (Chapter 20), reflection and annotations used as the mechanism that wires it all together (Chapter 21), and the hexagonal-architecture discipline of policy code depending on abstractions it owns rather than concrete infrastructure. This lesson demystifies the **container** — the object that actually constructs and wires every bean — so that "Spring magic" becomes, precisely, an application of mechanisms you already understand.

What you will learn:

- What a Spring **bean** is, and what the **ApplicationContext** (the container) actually does with one
- Singleton scope, Spring's default, and exactly what "one instance" means in this specific, bounded sense
- Other scopes (`prototype`, request/session-scoped beans) and when each is appropriate
- The bean lifecycle: construction, dependency injection, initialization callbacks, and destruction
- Why Spring proxies beans, and why that fact matters directly for the next lesson's transaction boundaries
- Constructor injection versus field injection, and why constructor injection is the recommended default

## What a bean is, and what the container does with it

A **bean** is simply an object whose lifecycle — construction, dependency wiring, and eventual destruction — is managed by Spring's **ApplicationContext**, rather than by your own code calling `new` directly. Declaring a class as a bean (via `@Component`, `@Service`, `@Repository`, or a `@Bean`-annotated factory method) tells Spring: "construct exactly this object, resolve whatever it depends on, and hand it out to anything else that needs it."

```java
@Service
public class OrderService {
    private final PaymentGateway paymentGateway; // a dependency, itself a bean

    public OrderService(PaymentGateway paymentGateway) { // constructor injection
        this.paymentGateway = paymentGateway;
    }

    public void placeOrder(Order order) {
        paymentGateway.charge(order.totalCents());
    }
}
```

Nowhere in this class does `OrderService` call `new SomeConcretePaymentGateway()` — it depends on the `PaymentGateway` interface, and Spring's container is responsible for constructing a concrete implementation and passing it in. This is exactly the Dependency Inversion Principle from Chapter 20, and exactly the hexagonal-architecture wiring pattern from that chapter's "wire concrete adapters to ports in exactly one place" guidance — the container *is* that one wiring place, generalized and automated across an entire application, rather than a handful of lines in a `main` method.

## Singleton scope: one instance per container, not one instance globally

This chapter's first concept-check question addresses a specific, common misreading directly: Spring's default **singleton** scope means **one bean instance per `ApplicationContext`** — not one instance across all processes, not one instance shared across multiple applications, and not (despite the name's overlap with the classic Singleton design pattern) a globally unique object enforced at the JVM or class level.

```java
@Service
public class ReportGenerator { /* ... */ }
```

Every place in the application that depends on `ReportGenerator` — every constructor parameter typed as `ReportGenerator`, across every other bean — receives the exact same, single instance, as long as they are all wired by the same `ApplicationContext`. A test that starts a *second*, separate `ApplicationContext` (common in test isolation) gets its own, entirely distinct singleton instance — Spring's singleton scope is scoped to the container, not to the running JVM as a whole, which is precisely why two independent test contexts, or two independently deployed instances of the same application, each have their own separate "singleton" `ReportGenerator`, never sharing state between them.

## Other scopes: prototype, request, and session

Singleton is the default and by far the most common scope, but other scopes exist for genuinely different lifecycle needs:

| Scope | Lifecycle |
|---|---|
| `singleton` (default) | One instance per container, shared by every dependent |
| `prototype` | A new instance every time the bean is requested from the container |
| `request` (web applications) | A new instance per HTTP request, discarded when the request completes |
| `session` (web applications) | One instance per user session, living as long as that session does |

```java
@Component
@Scope("prototype")
public class ReportBuilder {
    // Accumulates state across a series of method calls (a builder-like object,
    // per Chapter 20's Builder pattern) — a NEW instance is needed each time,
    // since a shared singleton would mix state between unrelated, concurrent uses.
}
```

Choosing `prototype` (or a web-scoped bean) is a deliberate decision, made when a bean genuinely accumulates or holds per-use, per-request, or per-session state that must not be shared — a mutable, stateful builder is a reasonable `prototype` candidate; an immutable, stateless service (the overwhelming majority of real beans, including virtually every plain business-logic service class) should stay `singleton`, both because sharing costs nothing when there is no mutable state to protect and because unnecessarily creating a new instance per use wastes construction cost for no benefit.

## The bean lifecycle: construction, injection, initialization, destruction

A bean's life inside the container follows a defined sequence, with hooks available at each stage:

```java
@Service
public class ConnectionPoolWarmer {

    private final DataSource dataSource;

    public ConnectionPoolWarmer(DataSource dataSource) { // 1. Constructed, dependencies injected
        this.dataSource = dataSource;
    }

    @PostConstruct // 2. Runs once, after construction and dependency injection are complete
    void warmUp() {
        try (Connection ignored = dataSource.getConnection()) {
            // establish an initial connection eagerly, rather than on the first real request
        } catch (SQLException e) {
            throw new IllegalStateException("could not warm up connection pool", e);
        }
    }

    @PreDestroy // 3. Runs once, as the container is shutting down, before the bean is discarded
    void shutdown() {
        // release any resources this bean itself directly holds
    }
}
```

`@PostConstruct` is the correct place for initialization logic that depends on the bean's dependencies already being fully wired — attempting the same logic directly in the constructor would run *before* Spring has necessarily finished injecting every dependency in more complex wiring scenarios, and mixes "how do I construct this object" with "what does this object need to do once it is fully ready," two genuinely separate concerns. `@PreDestroy` mirrors this at the other end of the lifecycle, giving a bean a guaranteed opportunity to release its own resources as the container shuts down — directly analogous to the `finally`-block cleanup discipline this course has applied to sockets, executors, and files throughout, just triggered by the container's own shutdown sequence rather than a single method's own try-with-resources block.

## Why Spring proxies beans

Many of Spring's most useful features — declarative transactions (next lesson), method-level security, caching — work by wrapping a bean in a **proxy**: a generated object implementing the same interface (or extending the same class), which intercepts calls to the real bean and adds behavior around them before delegating to the actual implementation. This is precisely the Decorator/Proxy pattern from Chapter 20, applied automatically by the framework rather than hand-written:

```java
@Service
public class OrderService {

    @Transactional // Spring wraps this bean in a proxy that starts/commits/rolls back a transaction
    public void placeOrder(Order order) {
        // ...
    }
}
```

Calling code that holds a reference to `OrderService`, injected by Spring, actually holds a reference to the **proxy**, not the raw `OrderService` instance itself — the proxy is what the container hands out to every dependent, and it is the proxy's own method that runs first when `placeOrder` is called, wrapping the real method body with transaction start/commit/rollback logic before and after the actual call. This fact — that an injected bean reference is often a proxy, not the bare class instance — is the exact mechanism behind next lesson's central pitfall (`this.someMethod()` bypassing the proxy entirely), so understanding it here is what will make that lesson's surprising behavior predictable rather than mysterious.

## Constructor injection versus field injection

Spring supports injecting dependencies via a constructor, a setter method, or directly into a field (using `@Autowired` on the field itself). **Constructor injection is the recommended default**, for reasons that connect directly to earlier chapters:

```java
// RECOMMENDED: constructor injection.
@Service
public class OrderService {
    private final PaymentGateway paymentGateway; // can be `final` — set exactly once, at construction

    public OrderService(PaymentGateway paymentGateway) {
        this.paymentGateway = Objects.requireNonNull(paymentGateway);
    }
}

// DISCOURAGED: field injection.
@Service
public class OrderServiceFieldInjected {
    @Autowired
    private PaymentGateway paymentGateway; // cannot be final; not set until AFTER construction
}
```

Constructor injection lets a dependency field be declared `final`, guaranteeing (at the language level, checked by the compiler) that it is set exactly once and never reassigned — exactly the immutability discipline Chapter 4 established as a defense against a whole category of bugs. It also makes the class's real dependencies fully visible and testable without any Spring machinery at all: a plain unit test can construct `OrderService` directly with a test double for `PaymentGateway`, using ordinary `new`, with zero framework involvement — precisely the "well-separated use case, testable with an in-memory adapter and no infrastructure" property Chapter 20's hexagonal architecture lesson demanded, now delivered concretely by choosing constructor injection over field injection. Field injection, by contrast, requires either Spring's reflection-based injection machinery or manual reflection (recall Chapter 21's `setAccessible` discussion) just to construct the object with its dependencies satisfied in a plain unit test — a real, avoidable cost paid for no corresponding benefit.

## What happens under the hood: from @Component to an injected, proxied bean

1. On startup, Spring scans the application's classpath (or configuration classes) for `@Component`-annotated classes (and its specializations `@Service`, `@Repository`, `@Controller`) and `@Bean`-annotated factory methods, building a registry of bean *definitions* — not yet instantiated objects, just metadata about what could be constructed and how.
2. For each singleton bean actually needed, Spring resolves its constructor's parameter types, recursively constructing (or reusing an already-constructed singleton for) each dependency first, then invokes the bean's own constructor with those resolved dependencies — this is reflection, applying exactly Chapter 21's `Constructor.newInstance` mechanism, performed automatically by the container.
3. If a bean requires proxying (for `@Transactional`, security annotations, or similar), Spring wraps the freshly constructed instance in a dynamically generated proxy object at this point, before the bean is registered as available for other beans to depend on.
4. Any `@PostConstruct`-annotated method runs once construction and injection are complete, via the same reflective invocation mechanism.
5. The fully constructed (and possibly proxied) bean is stored in the container's registry and handed out to every other bean that declares a dependency on it — for singleton scope, this exact same object (or its proxy) is returned for every subsequent request, for the life of that specific `ApplicationContext`.
6. On container shutdown, `@PreDestroy`-annotated methods run for beans that declare them, in roughly the reverse order of their construction, giving each bean a final opportunity to release resources.

## Common mistakes

**Mistake 1: assuming Spring's singleton scope means a globally unique object across an entire running system.** It means one instance per `ApplicationContext`; two separate contexts (two test runs, two application instances) each have their own separate singleton. Fix: understand singleton scope as container-scoped, not JVM-wide or system-wide.

**Mistake 2: choosing `prototype` scope reflexively for beans that hold no genuinely per-use mutable state.** This wastes construction cost with no corresponding benefit, since a stateless singleton is equally safe to share and cheaper to reuse. Fix: default to singleton; reserve `prototype` (or web-scoped beans) for genuinely stateful, per-use or per-request objects.

**Mistake 3: putting initialization logic that depends on injected dependencies directly in the constructor, rather than in `@PostConstruct`.** In more complex wiring scenarios, this can run before every dependency is guaranteed to be fully available. Fix: use `@PostConstruct` for logic that genuinely needs the bean's dependencies already wired.

**Mistake 4: using field injection instead of constructor injection.** This prevents declaring the dependency `final`, and makes the class harder to construct in a plain unit test without Spring's own machinery. Fix: default to constructor injection for every bean dependency.

## Best practices

- Default to singleton scope; reserve `prototype` or web-scoped beans for genuinely stateful, per-use lifecycle needs.
- Use constructor injection as the default for every bean dependency, allowing dependency fields to be declared `final`.
- Use `@PostConstruct`/`@PreDestroy` for initialization and cleanup logic that genuinely depends on the bean's full lifecycle stage, rather than cramming it into the constructor.
- Remember that an injected bean reference may be a proxy, not the bare class instance, whenever the bean carries annotations (like `@Transactional`) that require proxying.
- Write unit tests that construct a service directly with `new` and test doubles, verifying the class's real dependencies are visible and testable without any Spring container involvement at all.

## Summary

- A bean is an object whose construction and wiring is managed by Spring's `ApplicationContext`, rather than by direct `new` calls in application code.
- Singleton scope (the default) means one instance per container, not a system-wide or JVM-wide singleton; other scopes (`prototype`, request, session) exist for genuinely different lifecycle needs.
- The bean lifecycle includes construction, dependency injection, `@PostConstruct` initialization, and `@PreDestroy` cleanup, each a defined stage with its own hook.
- Spring proxies beans that need cross-cutting behavior (transactions, security, caching) added around their methods, and an injected bean reference is very often that proxy, not the bare instance — a fact the next lesson's transaction-boundary pitfall depends on directly.
- Constructor injection is the recommended default: it allows `final` dependency fields and makes a class constructible and testable with plain `new` and no Spring machinery at all.

## Practice

1. **Warm-up:** Explain precisely why two separate `ApplicationContext` instances (as in two independent test runs) each have their own separate singleton instance of the same bean class.
2. **Warm-up:** For a mutable, per-use report builder that accumulates state across several calls, explain why `prototype` scope is appropriate while singleton scope would be a bug.
3. **Core:** Write a bean with a constructor-injected dependency, a `@PostConstruct` initialization method, and a `@PreDestroy` cleanup method, and trace (in comments or a short write-up) the order these are invoked in relative to the bean's construction.
4. **Core:** Rewrite a field-injected class to use constructor injection instead, declare its dependency field `final`, and write a plain unit test constructing it directly with `new` and a test double, with no Spring container involved at all.
5. **Challenge:** Add `@Transactional` to a bean's method and, using a debugger or logging, confirm that the object other beans receive when Spring injects this bean is a generated proxy rather than the raw class instance.

## Check your understanding

1. What does Spring's default singleton scope actually guarantee, and what does it not guarantee about uniqueness beyond a single container?
2. When is `prototype` scope an appropriate choice instead of the default singleton scope?
3. Why is `@PostConstruct` the correct place for initialization logic that depends on a bean's own injected dependencies, rather than the constructor itself?
4. Why does Spring wrap certain beans in a proxy, and what mechanism from Chapter 20 does this directly apply?
5. Why does constructor injection allow a dependency field to be declared `final` while field injection does not?
6. Why is a constructor-injected class easier to unit test without a Spring container than a field-injected one?
