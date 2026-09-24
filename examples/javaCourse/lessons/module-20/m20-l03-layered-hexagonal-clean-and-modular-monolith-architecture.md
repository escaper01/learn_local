# Layered, hexagonal, clean, and modular-monolith architecture

The previous two lessons gave you the vocabulary (cohesion, coupling, dependency direction) and the review questions (SOLID) to judge a design. This lesson applies both to whole-application structure: the named architectural styles teams actually use to decide where a piece of code belongs, why "the domain must not depend on the database" is a rule worth enforcing structurally rather than by convention alone, and how a use case built this way becomes trivially unit-testable without a running database, web server, or container at all.

What you will learn:

- Layered architecture: what each layer owns, and its most common violation
- Hexagonal architecture (ports and adapters): why the domain sits at the center, depending on nothing
- Clean Architecture's dependency rule, and how it generalizes hexagonal's core idea
- The modular monolith: keeping strong internal boundaries without paying microservice deployment costs
- How to build one use case behind a port, and prove it is testable with an in-memory adapter and no infrastructure
- How to recognize when a layer or boundary has silently been violated

## Layered architecture: what each layer owns

The classic **layered architecture** divides code by technical responsibility, typically presentation, business logic, and data access, with each layer depending only on the layer beneath it:

```text
Presentation (HTTP controllers, DTOs)
        |
Business logic (use cases, domain rules)
        |
Data access (repositories, JDBC/JPA)
```

This is simple to explain and easy to onboard new developers into, and it works well for straightforward CRUD-shaped applications. Its most common violation, though, is subtle and easy to introduce accidentally: business logic reaching **past** the data access layer's interface to use a framework-specific detail directly — a domain class importing `jakarta.persistence.Entity`, or a use case catching `java.sql.SQLException` and branching on its vendor-specific error code. The moment business logic depends on a *specific* data access technology's types, rather than on an interface the data access layer merely implements, the dependency direction has quietly inverted from what the layering diagram promises, and swapping or testing the data access layer independently is no longer actually possible without dragging the business logic's compiled dependencies along with it.

## Hexagonal architecture: the domain depends on nothing

**Hexagonal architecture** (also called **ports and adapters**, coined by Alistair Cockburn) makes the layered architecture's implicit rule explicit and structural: the **domain** — the business rules and use cases — sits at the center, defines **ports** (interfaces expressing exactly the behavior it needs), and depends on nothing outside itself. **Adapters** — implementations of those ports for a specific technology (a JDBC repository, an HTTP client, a message queue consumer) — depend on the domain, never the other way around.

```java
// Port: defined BY the domain, expressing exactly what the domain needs — nothing about SQL, JDBC, or storage.
public interface TaskStore {
    Optional<Task> findById(TaskId id);
    void save(Task task);
}

// Domain use case: depends only on the port interface, never on any concrete storage technology.
public final class CompleteTaskUseCase {
    private final TaskStore taskStore;

    public CompleteTaskUseCase(TaskStore taskStore) {
        this.taskStore = taskStore;
    }

    public void completeTask(TaskId id) {
        Task task = taskStore.findById(id)
                .orElseThrow(() -> new TaskNotFoundException(id));
        task.markComplete(); // pure domain logic, no I/O
        taskStore.save(task);
    }
}

// Adapter: implements the port using a specific technology. Depends ON the domain's TaskStore interface;
// the domain has no idea this class, or JDBC, exists.
public final class JdbcTaskStore implements TaskStore {
    private final javax.sql.DataSource dataSource;

    public JdbcTaskStore(javax.sql.DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Optional<Task> findById(TaskId id) {
        // JDBC-specific code lives here, entirely, and nowhere else.
        // ...
        return Optional.empty();
    }

    @Override
    public void save(Task task) {
        // JDBC-specific code lives here, entirely, and nowhere else.
    }
}
```

`CompleteTaskUseCase`'s source code imports `TaskStore`, an interface the domain itself defines, never `JdbcTaskStore` or anything from `java.sql`. This is the exact meaning of the runtime-call-versus-source-dependency distinction from Lesson 1 applied at the whole-application scale: at runtime, `CompleteTaskUseCase` calls into `JdbcTaskStore`'s actual JDBC code; in source code, the dependency arrow points the other way — `JdbcTaskStore` depends on (implements) the domain's `TaskStore` interface, and the domain module never needs `JdbcTaskStore`, `javax.sql`, or any database driver on its compile classpath at all.

## Proving testability: an in-memory adapter, no infrastructure

The entire payoff of this structure is concrete and immediately checkable: a use case built behind a port can be unit-tested with an **in-memory adapter** substituting for the real one, with no database, no container, no network — exactly the fake test double from the testing chapter, applied here as an architectural consequence rather than just a testing trick:

```java
public final class InMemoryTaskStore implements TaskStore {
    private final Map<TaskId, Task> tasks = new HashMap<>();

    void seed(Task task) { tasks.put(task.id(), task); }

    @Override
    public Optional<Task> findById(TaskId id) { return Optional.ofNullable(tasks.get(id)); }

    @Override
    public void save(Task task) { tasks.put(task.id(), task); }
}
```

```java
@Test
void completeTask_marksTaskComplete_andPersistsIt() {
    InMemoryTaskStore store = new InMemoryTaskStore();
    Task task = Task.newTask(TaskId.of("t-1"), "write report");
    store.seed(task);

    new CompleteTaskUseCase(store).completeTask(TaskId.of("t-1"));

    assertTrue(store.findById(TaskId.of("t-1")).orElseThrow().isComplete());
}
```

This test runs in milliseconds, needs no Docker container, no JDBC driver, and no running database — and it genuinely proves the *business rule* (completing a task marks it complete and persists the change) works, independent of whichever storage technology eventually backs it in production. This is the concrete, checkable answer to "is this use case well-separated": if constructing it for a test requires anything beyond an in-memory implementation of its own ports, the boundary has already leaked.

## Clean Architecture: the dependency rule, generalized

**Clean Architecture** (Robert C. Martin) generalizes hexagonal's core idea into concentric rings — entities (core business rules) at the center, use cases around them, then interface adapters, then frameworks and drivers at the outer edge — governed by one rule: **source code dependencies may only point inward**. An outer ring can depend on an inner one; an inner ring must never depend on an outer one, regardless of how many rings the diagram has:

```text
   Frameworks & Drivers (web framework, database driver, UI)
        depends on ↓
   Interface Adapters (controllers, presenters, gateways)
        depends on ↓
   Use Cases (application-specific business rules)
        depends on ↓
   Entities (enterprise-wide business rules)
```

This is the same rule as hexagonal's ports-and-adapters, expressed with more rings for a larger application — the outermost ring is where every framework, database driver, and UI technology lives, and it is explicitly the layer most expected to change (a new framework version, a database migration, a UI redesign), while the innermost rings, holding the business rules that justify the software's existence at all, should be the most stable and the least frequently forced to change by anything outside the business itself.

## The modular monolith: strong boundaries without microservice costs

Splitting a system into microservices is one way to enforce strong module boundaries — a network call is a much harder boundary to accidentally violate than a Java method call — but it comes with real, significant operational costs (distributed transactions, network failure handling from Chapter 18, deployment and monitoring for many independent services). A **modular monolith** takes the opposite trade-off: a single deployable application, internally organized into strongly-bounded modules (by feature, following Lesson 1's package-by-feature guidance) with enforced dependency rules between them, deployed as one unit.

```text
com.example.app
├── orders/          (public API: OrderService interface; everything else package-private)
├── inventory/       (public API: InventoryService interface; everything else package-private)
├── billing/         (public API: BillingService interface; everything else package-private)
└── shared/          (genuinely shared kernel: money types, IDs — kept deliberately small)
```

Each module exposes a small, deliberate public interface and keeps its internal classes package-private, so another module physically cannot reach into its implementation details — the same encapsulation discipline from earlier chapters, applied at the package level instead of the class level. A modular monolith gets much of a microservices architecture's benefit (modules can be reasoned about, tested, and potentially extracted independently) without paying its full operational cost up front, and "extract this module into its own service later, if and when it genuinely needs independent scaling or deployment" becomes a realistic, lower-risk option specifically *because* the internal boundary was already enforced before the extraction, rather than discovered — often painfully, as tangled cross-module dependencies — at the moment someone tries to actually split it.

## Recognizing a silently violated boundary

All of these styles share the same failure mode when unenforced: a boundary that exists only as a convention, a comment, or a package name, with nothing actually stopping code from crossing it. Concrete warning signs:

- A domain or use-case class importing anything from a specific database driver, web framework, or messaging library.
- A "port" interface whose method signatures leak an implementation detail (a `ResultSet` parameter, an HTTP status code return type) instead of expressing pure domain concepts.
- A unit test for business logic that requires a running database, container, or network call to pass.
- A module's "internal" package being imported directly from another module, bypassing its declared public interface.

Static analysis tools (ArchUnit is a common choice for Java) can enforce these rules automatically — failing a build if, for example, any class under `com.example.domain` is found to import anything under `javax.sql` — turning "please don't do that" into a genuine, structurally enforced boundary rather than a hope resting on code review catching every violation.

## What happens under the hood: from a use case to a running application

1. At application startup (a `main` method, or a framework's dependency-injection container), concrete adapter instances are constructed and wired into the use cases that depend on their port interfaces — this wiring is the *only* place in the entire codebase that needs to know about both the domain's ports and the concrete adapter types simultaneously.
2. An incoming request (an HTTP call, a message from a queue) is handled by an adapter at the outer edge, which translates it into a call against a use case's port-facing method — using domain types, not framework types, from that point inward.
3. The use case executes pure business logic, calling out to its injected ports (a repository, a notification sender) whenever it needs I/O, without knowing or caring which concrete technology backs each port.
4. The result flows back out through the same adapters, translated back into whatever external representation the caller expects (an HTTP response body, a message to publish).
5. A unit test for the use case substitutes an in-memory or otherwise lightweight adapter at exactly the same wiring point step 1 uses in production, proving the business logic correct without needing any of the real infrastructure.

## Common mistakes

**Mistake 1: a domain or use-case class importing a specific storage/framework technology directly.** This silently inverts the dependency direction the architecture is meant to enforce, regardless of what the package names or diagrams claim. Fix: define a port interface expressing only domain concepts, and depend on that instead.

**Mistake 2: a "port" interface that leaks implementation details in its signature.** A method returning a `ResultSet` or accepting an `HttpServletRequest` is not actually a domain-shaped abstraction, whatever it is named. Fix: express ports purely in terms of domain types and outcomes.

**Mistake 3: a unit test for business logic that requires real infrastructure to run.** This is a direct, checkable symptom that the boundary has leaked somewhere. Fix: if an in-memory adapter cannot stand in for the real one in a test, find and fix the leak rather than accepting a slower, infrastructure-dependent test.

**Mistake 4: treating "modules" as folder names with no enforced boundary.** Without package-private internals and a deliberate public interface, nothing stops another "module" from reaching directly into another's implementation. Fix: keep implementation classes package-private, expose a small public interface per module, and consider enforcing this with a tool like ArchUnit.

## Best practices

- Let the domain define ports in terms of what it needs, never in terms of a specific technology's types.
- Wire concrete adapters to ports in exactly one place (application startup or a DI container), keeping that as the only code aware of both sides.
- Treat "can this use case be unit-tested with an in-memory adapter and no infrastructure" as a direct, checkable test of whether the boundary actually holds.
- Choose a modular monolith over premature microservices when the operational cost of many independently deployed services is not yet justified by an actual scaling or ownership need.
- Enforce architectural boundaries with a tool (ArchUnit or equivalent) rather than relying solely on code review and convention.

## Summary

- Layered architecture separates by technical responsibility, but its dependency direction is easy to silently violate without structural enforcement.
- Hexagonal architecture (ports and adapters) puts the domain at the center, depending on nothing; adapters depend on the domain, and the source-code dependency direction is the opposite of the layered picture's implicit assumption in the naive case.
- Clean Architecture generalizes the same idea into concentric rings governed by one rule: dependencies point inward only.
- A modular monolith enforces strong internal module boundaries within a single deployable unit, deferring the operational cost of true microservices until it is actually justified.
- A use case built behind a port should be testable with an in-memory adapter and zero real infrastructure — this is the concrete proof the architecture is actually working, not just diagrammed.
- Unenforced boundaries (conventions, comments, package names alone) get violated silently; tools like ArchUnit can enforce them structurally.

## Practice

1. **Warm-up:** For a `TaskStore` port interface, identify which of these method signatures leaks an implementation detail and rewrite it purely in domain terms: `List<Task> findByStatus(ResultSet preloadedRows)`.
2. **Warm-up:** Explain why a domain class importing `jakarta.persistence.Entity` directly is a structural violation of hexagonal architecture, even if the class otherwise contains only business logic.
3. **Core:** Build a small use case behind a port interface, implement both a real (in-memory is fine for this exercise) and a fake adapter, and write a unit test using the fake adapter that proves the use case's business rule without any real infrastructure.
4. **Core:** Sketch (in prose or a diagram) a modular-monolith package structure for a small e-commerce system (orders, inventory, payments), specifying each module's public interface and what stays package-private.
5. **Challenge:** Configure an ArchUnit rule (or design one on paper if the library is unavailable) that fails a build if any class under a `domain` package imports anything under `java.sql` or a chosen web framework's package, and describe what specific mistake this rule would catch.

## Check your understanding

1. What is the practical difference between the direction of a runtime call and the direction of a source-code dependency in a hexagonal architecture?
2. Why is a domain class importing a specific database driver's types a structural violation, even if the surrounding logic is otherwise pure business logic?
3. What concrete, checkable test proves that a use case is genuinely well-separated from its infrastructure?
4. What single rule does Clean Architecture's concentric-rings diagram enforce, regardless of how many rings it has?
5. What trade-off does a modular monolith make compared to a full microservices architecture, and when is that trade-off worth it?
6. Why can an architectural boundary that exists only as a naming convention or comment fail silently, and what is one way to enforce it structurally instead?
