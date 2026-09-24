# JPMS descriptors, requires, exports, opens, services, and jlink

Before Java 9, "the classpath" was a flat, unstructured bag of jars: any public class in any jar could be used by any other jar, and reflection could reach into any class's private members regardless of intent. The **Java Platform Module System** (JPMS, "the module system," introduced in Java 9) adds a structural boundary on top of that: a module declares exactly what it depends on and exactly what it exposes, and — most relevant after the previous lesson's reflection and class-loader material — exactly what it permits deep reflective access into. This closing lesson of the chapter covers declaring and reading a module, and why `opens` exists as a deliberate, narrower permission than `exports`.

What you will learn:

- What `module-info.java` is, and the difference between the classpath and the module path
- `requires`: declaring a dependency on another module
- `exports`: making a package's public types usable by other modules at compile time and runtime
- `opens`: permitting deep reflective access to a package's members, separately from `exports`
- Why frameworks that use reflection (dependency injection, JSON libraries) specifically need `opens`, not just `exports`
- `uses`/`provides`: the module system's built-in service-provider mechanism
- `jlink`: building a custom, minimal runtime image containing only the modules an application needs

## module-info.java: a module's descriptor

A **module** is declared by a `module-info.java` file at the root of its source tree, naming the module and declaring its relationships to other modules:

```java
// module-info.java
module com.example.billing {
    requires com.example.contracts;
    requires java.sql;

    exports com.example.billing.api;
}
```

This single file is the module's entire public contract: which other modules it needs (`requires`), and which of its own packages it makes available to other modules (`exports`). A package **not** listed in an `exports` clause is invisible outside the module entirely — not merely "discouraged from use," but genuinely inaccessible: code in another module cannot even reference a class in an unexported package, and the compiler rejects the attempt outright, not merely warns about it.

## requires: declaring a dependency

`requires` is the module-level equivalent of a Maven or Gradle dependency declaration, but enforced by the JVM itself at both compile time and runtime, not merely as a build-tool convention:

```java
module com.example.billing {
    requires com.example.contracts; // another module in this application
    requires java.sql;              // a JDK platform module
    requires transitive com.example.money; // "transitive" propagates this requirement to consumers
}
```

`requires transitive` is worth calling out specifically: an ordinary `requires` is not visible to modules that depend on `com.example.billing` — they would need their own separate `requires com.example.money` if they use types from it directly. `requires transitive` says "any module that requires me also gets this dependency automatically," which matters precisely when `com.example.billing`'s own exported API exposes types from `com.example.money` (a method returning a `Money` value, say) — without `transitive`, a consumer could accept that returned `Money` value without ever having declared a dependency on the module that defines it, which the module system otherwise would not permit.

## exports: compile-time and runtime visibility for public types

`exports` makes a package's `public` types usable by other modules — both to compile against and to use at runtime — while every package **not** exported remains entirely internal, regardless of the visibility modifiers on the classes inside it:

```java
module com.example.billing {
    exports com.example.billing.api;       // usable by any module that requires com.example.billing
    exports com.example.billing.internal.testing to com.example.billing.tests; // exported ONLY to a named module
    // com.example.billing.internal is NOT exported at all: fully invisible outside this module,
    // even though its classes might individually be declared `public`.
}
```

This is the module system's most direct structural consequence for the hexagonal/Clean Architecture boundaries from Chapter 20: a module's internal implementation package can contain `public` classes (`public` is still needed for the module's *own* internal code across its own packages to use them) while remaining genuinely, compiler-enforced invisible to every other module, closing exactly the "public means accessible to everyone" gap that `public` alone left open before JPMS existed. Qualified exports (`exports ... to specificModule`) narrow this further, letting a module expose an internal package to, say, its own test module specifically, without making it available to every other consumer.

## opens: a separate, narrower permission for deep reflection

This is the lesson's central, most commonly misunderstood point, and exactly this chapter's concept-check question: `exports` and `opens` are **two different permissions**, and a module that only `exports` a package does **not** thereby permit deep reflective access into that package's private members.

```java
module com.example.billing {
    exports com.example.billing.api;      // compile-time and ordinary runtime use
    opens com.example.billing.entities;   // deep reflective access, including private members
}
```

The distinction exists precisely because of the previous lesson's `setAccessible(true)` mechanism: a dependency-injection framework (Spring), a JSON library (Jackson), or an ORM (Hibernate) commonly needs to reflectively set a `private` field or invoke a `private` constructor on your own classes — behavior that `exports` alone does not permit under the module system, even though the exact same reflective code would have worked without complaint on the pre-module-system classpath. `opens` grants exactly this: deep reflective access (including `setAccessible(true)` reaching private members), separately and more permissively than mere `exports`, which only ever concerns ordinary, compile-time-checked, public API usage.

```text
Without `opens`, calling setAccessible(true) on a private field in an exported-but-not-opened
package throws InaccessibleObjectException at runtime — a module boundary explicitly refusing
the exact bypass that worked freely before JPMS existed.
```

A module that needs to be fully reflection-friendly for every package, common for an application module used heavily by frameworks, can use `open module` to open every package to deep reflection at once:

```java
open module com.example.billing {
    requires com.example.contracts;
    exports com.example.billing.api;
    // every package in this module is implicitly `opens`ed to deep reflection
}
```

This is a deliberate, coarser trade-off — convenient for an application module that frameworks need broad reflective access into, but it forfeits the module system's own protection against the exact `setAccessible`-based encapsulation bypass the previous lesson described, for every package in the module at once, rather than the specific ones that genuinely need it.

## Services: uses and provides

JPMS has a built-in service-provider mechanism, formalizing the older `java.util.ServiceLoader` convention with compile-time-checked declarations:

```java
// The module declaring the service interface:
module com.example.notifications.api {
    exports com.example.notifications.api;
}

// A module providing an implementation:
module com.example.notifications.email {
    requires com.example.notifications.api;
    provides com.example.notifications.api.NotificationSender
        with com.example.notifications.email.EmailNotificationSender;
}

// A module consuming the service, without depending on any specific implementation module:
module com.example.app {
    requires com.example.notifications.api;
    uses com.example.notifications.api.NotificationSender;
}
```

```java
ServiceLoader<NotificationSender> senders = ServiceLoader.load(NotificationSender.class);
for (NotificationSender sender : senders) {
    sender.send(recipient, message);
}
```

`com.example.app` depends only on the *interface* module, declared with `uses`, and has no compile-time or runtime dependency on `com.example.notifications.email` at all — a different implementation module could be swapped in (or added alongside it) purely by changing which modules are present at runtime, with zero code changes in the consuming module. This is exactly the Dependency Inversion Principle from Chapter 20, enforced structurally by the module system rather than merely by convention: the consuming module genuinely cannot see or depend on the concrete implementation class, only the interface it was compiled against.

## jlink: a minimal, custom runtime image

`jlink` assembles a custom Java runtime image containing **only** the modules an application actually needs, rather than shipping (or requiring the target machine to have installed) the full JDK:

```text
jlink --module-path mods:$JAVA_HOME/jmods \
      --add-modules com.example.billing \
      --output custom-runtime \
      --strip-debug --no-header-files --no-man-pages
```

The resulting `custom-runtime` directory contains a complete, self-sufficient Java runtime — including its own `java` launcher — but stripped down to exactly the platform modules the application's own module graph actually requires, transitively. This produces a meaningfully smaller distributable than bundling a full JDK (relevant for containerized deployments where image size matters, and for constrained environments), and it is only possible *because* the module system makes an application's full transitive dependency graph on platform modules explicit and computable ahead of time — something the classpath's flat, unstructured jar list never made knowable without actually running the application and observing what it touches.

## What happens under the hood: from module-info.java to an enforced boundary

1. `javac` reads each module's `module-info.java` and builds a module graph: which modules require which others, transitively, before compiling any ordinary source file.
2. Compiling a class that references a type from a package another module does not `exports` (to this module, specifically, for a qualified export) fails at compile time — this check happens before the classpath-style "it compiles, but might fail at runtime with a missing class" uncertainty ever gets a chance to occur.
3. At runtime, the module system enforces the same boundary again: even code that somehow bypassed the compiler (reflection, a dynamically loaded class) attempting to access an unexported package's types, or attempting deep reflective access into a package that is `exports`ed but not `opens`ed, is refused with a runtime exception (`IllegalAccessException`/`InaccessibleObjectException`), not merely discouraged.
4. `ServiceLoader.load` (backed by `uses`/`provides` declarations) scans the module path at runtime for modules providing the requested service interface, instantiating whichever implementation(s) it finds — resolved dynamically, without the consuming module's compiled code ever referencing the concrete implementation class directly.
5. `jlink` computes the full transitive closure of platform modules an application's own modules require, and copies only those modules' data into the assembled runtime image, producing a smaller, purpose-built JVM distribution rather than the full JDK.

## Common mistakes

**Mistake 1: assuming `exports` is sufficient for a framework's reflective needs.** A dependency-injection or serialization framework attempting `setAccessible(true)` on a merely-exported package's private members fails with `InaccessibleObjectException`. Fix: use `opens` (or `open module` for broad framework-friendliness) for any package that genuinely needs deep reflective access.

**Mistake 2: forgetting `requires transitive` when an exported API exposes another module's types.** Consumers get a compile error trying to use a type they never explicitly declared a dependency on, even though your own module's API handed it to them. Fix: mark the dependency `transitive` whenever your exported API surfaces another module's exported types.

**Mistake 3: over-using `open module` reflexively instead of scoping `opens` to the specific packages that need it.** This forfeits the module system's encapsulation protection for every package at once, not just the ones genuinely requiring reflective access. Fix: prefer package-specific `opens` clauses, reserving `open module` for cases where truly broad framework compatibility is required.

**Mistake 4: hard-coding a dependency on a specific service implementation module instead of using `uses`/`provides`.** This defeats the purpose of the service mechanism, coupling the consumer to one concrete implementation exactly as a direct `new SomeConcreteClass()` would. Fix: declare `uses` against the interface, and let implementation modules `provide` themselves independently.

## Best practices

- Export only the packages a module's consumers genuinely need; keep internal implementation packages unexported, even if their classes are individually `public`.
- Use `opens`, scoped to specific packages, for exactly the packages a reflection-based framework needs deep access into — reserve `open module` for genuinely broad framework-compatibility needs.
- Mark a `requires` as `transitive` whenever your module's exported API surfaces types from that dependency.
- Prefer `uses`/`provides` over a hard dependency on a concrete implementation module, wherever a service abstraction genuinely benefits from swappable implementations.
- Use `jlink` to produce minimal, purpose-built runtime images for deployment, once your application's module boundaries are established.

## Summary

- `module-info.java` declares a module's dependencies (`requires`) and what it exposes (`exports`); an unexported package is genuinely invisible to other modules, both at compile time and runtime.
- `exports` and `opens` are separate permissions: `exports` allows ordinary, compile-time-checked API use; `opens` additionally permits deep reflective access, including bypassing private-member access control.
- Frameworks relying on `setAccessible(true)` (dependency injection, JSON/ORM libraries) specifically need `opens`, not merely `exports`, to function under the module system.
- `uses`/`provides` formalize the service-provider pattern, letting a consuming module depend only on an interface, with implementation modules resolved dynamically at runtime.
- `jlink` builds a minimal custom runtime image containing only the modules an application's own module graph actually requires, made possible by the module system's explicit, computable dependency graph.

## Practice

1. **Warm-up:** Explain why a package that is `exports`ed but not `opens`ed still causes `InaccessibleObjectException` when a framework attempts `setAccessible(true)` on one of its private fields.
2. **Warm-up:** A module's exported API method returns a type from a dependency it declared with a plain `requires` (not `transitive`). What compile-time problem does this cause for consumers, and how is it fixed?
3. **Core:** Write a small two-module application: one module exporting an API package and opening an entities package for reflection, and another module consuming it; demonstrate both ordinary API use and a reflection-based framework-style access into the opened package.
4. **Core:** Implement a `uses`/`provides` service setup with one interface module, two independent implementation modules, and a consumer module that never directly references either implementation, and demonstrate swapping which implementation is present at runtime.
5. **Challenge:** Use `jlink` to build a minimal runtime image for a small modularized application, and compare its size to a full JDK installation, explaining which specific platform modules were included and why.

## Check your understanding

1. What happens, at compile time, when code in one module references a type from a package another module has not `exports`ed?
2. Why does `exports` alone not permit a framework to reflectively set a private field via `setAccessible(true)`?
3. When must a `requires` be marked `transitive`, and what compile-time problem does omitting it cause for consumers?
4. What does the `uses`/`provides` mechanism let a consuming module avoid depending on directly?
5. Why is `jlink` only possible because of the module system's explicit dependency graph, rather than something equally achievable with the classpath alone?
6. What is the trade-off of declaring `open module` instead of scoping `opens` to specific packages?
