# Chapter 21 assessment and deliberate practice

This chapter opened up the mechanisms every major Java framework is built on, and drew a firm line around each one: reflection lets code inspect and invoke what it only knows at runtime, at the cost of compile-time type safety and a specific wrapping/access-control discipline; annotations are inert metadata that only ever do something because a separate consumer chooses to interpret them; class loaders give the JVM its notion of type identity, which a plugin architecture can exploit deliberately or violate accidentally; and the module system turns "please don't reach into my internals" from a convention into a compiler- and runtime-enforced boundary. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Class objects and reflective type inspection

Every loaded type has exactly one `Class` object per class loader, obtainable via a class literal, `getClass()`, or `Class.forName`. `getDeclaredMethods` reports only methods declared directly on that type, including private ones, while `getMethods` collects public methods including inherited ones — the two answer different questions and are not interchangeable. Generic type erasure means a `List<String>` and a `List<Integer>` share exactly one `Class` object at runtime.

### Lesson 2: Constructors, fields, methods, method handles, and access control

Reflective lookups match a target's declared parameter types exactly, including the distinction between a primitive type and its boxed wrapper — `Integer.class` never matches a parameter declared as primitive `int`. `Method.invoke` always wraps an invoked method's own thrown exception in `InvocationTargetException`; the real failure is in `getCause()`. Reflection respects ordinary access control by default; `setAccessible(true)` is a deliberate, explicit bypass reserved for legitimate framework-style needs. `MethodHandle` trades `Method.invoke`'s runtime flexibility for earlier type-checking and better performance under repeated invocation.

### Lesson 3: Annotation targets, retention, processing, and generated code

An annotation is metadata attached to a program element; it does nothing by itself, regardless of retention policy — some separate consumer must use reflection (for `RUNTIME` retention) or run as a compile-time annotation processor (for `SOURCE` retention) to interpret it and act. `@Target` restricts which element kinds an annotation may legally be placed on; `@Retention` controls how long its metadata survives. Choosing the wrong retention for a framework-consumed annotation means reflection finds nothing at runtime, not because the annotation was misapplied but because it was discarded before the program started.

### Lesson 4: Class loaders, delegation, plugins, identity, and loader leaks

A class's runtime identity is its binary name plus the specific `ClassLoader` instance that defined it — two byte-for-byte identical classes loaded by different loaders are genuinely distinct types, which is exactly why an apparently impossible `ClassCastException` between "the same class" is the signature symptom of a loader-identity mismatch. Parent delegation prevents application code from shadowing trusted JDK classes. A plugin architecture exploits per-plugin class loaders deliberately for isolation; a class loader leak happens when something outside a supposedly unloaded plugin still holds a reference reaching back into it, keeping the entire loader and everything it loaded permanently resident in memory.

### Lesson 5: JPMS descriptors, requires, exports, opens, services, and jlink

`module-info.java` makes a module's dependencies (`requires`) and exposed packages (`exports`) explicit and enforced by the compiler and the JVM, not merely a build-tool convention — an unexported package is genuinely invisible outside its module. `exports` and `opens` are separate permissions: `exports` allows ordinary compile-time-checked API use, while `opens` additionally permits deep reflective access, including bypassing private-member access control, which is exactly what dependency-injection and serialization frameworks need and mere `exports` does not grant. `uses`/`provides` formalizes the service-provider pattern so a consumer depends only on an interface. `jlink` builds a minimal runtime image from the module system's explicit, computable dependency graph.

## Cheat sheet

### Reflection failure points

| Failure | Exception | When |
|---|---|---|
| Method/field/constructor not found | `NoSuchMethodException`/`NoSuchFieldException` | At lookup time, before any invocation is attempted |
| Access not permitted (and no `setAccessible`) | `IllegalAccessException` | At invocation time |
| Target method itself threw | `InvocationTargetException` (wraps the real cause) | At invocation time, wrapping the target's own exception |
| Argument type mismatch | `IllegalArgumentException` | At invocation time |

### Annotation retention

| Retention | Survives to | Consumer |
|---|---|---|
| `SOURCE` | Discarded after compilation | Annotation processor, at compile time |
| `CLASS` (default) | In the `.class` file, not loaded for reflection | Rarely used directly |
| `RUNTIME` | Readable via reflection while running | Framework code using reflection |

### exports versus opens

| Permission | Grants |
|---|---|
| `exports` | Ordinary, compile-time-checked use of a package's public types |
| `opens` | Deep reflective access, including `setAccessible`-based bypass of private members |

### Class loader identity

A class's runtime identity = binary name + defining `ClassLoader` instance. Same name, same bytecode, different loader = different type.

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does a reflective method lookup use a boxed wrapper class (`Integer.class`) where the target's declared parameter is primitive (`int`)?
- Is `InvocationTargetException` logged or reported without unwrapping `getCause()`?
- Is `setAccessible(true)` called reflexively rather than for a deliberate, legitimate reason?
- Does code assume an annotation causes behavior by its presence alone, with no identified consumer that reads it?
- Would a `ClassCastException` between "the same class" be misdiagnosed as a build or dependency-version problem instead of a class-loader-identity mismatch?
- Does a module declaration use `exports` where a reflection-based framework actually needs `opens`?

## The judgment question

The judgment question describes untrusted text selecting arbitrary reflection targets, and asks what boundary is needed — the correct answer is **a narrowly validated allowed set of types and operations**, not `setAccessible` everywhere and not broad catches around all calls. This is Lesson 2's central security point, restated at the chapter level: reflection can construct arbitrary objects and invoke arbitrary methods by name, and letting untrusted input choose that name directly bypasses whatever access boundary the application's real public API was designed to enforce, regardless of how many exceptions are caught around the call. Calling `setAccessible` everywhere would make the problem strictly worse, since it removes the one access-control check reflection still respects by default. Broad `catch` blocks address only the symptom of a failed reflective call, not the actual vulnerability of an attacker choosing what gets constructed or invoked in the first place — the only real fix is validating the requested target against a small, fixed, reviewed allow-list before any reflective call happens at all.

## Approaching the implementation lab

The lab asks for `componentNames(selector)`: use `Class.getRecordComponents()` to report the nested `Task` or `Owner` record's component names in declaration order, based on the selector string.

1. Write the precondition and boundary table first: `"Task"` (`"id,title"`), `"Owner"` (`"name"`), a case-mismatched selector like `"task"` (empty string), and an entirely unmatched or empty selector (also empty string).
2. Map the selector to the actual nested record's `Class` object (`Task.class` or `Owner.class`) rather than hard-coding the two expected output strings — the instructions are explicit that the lab is checking genuine reflective inspection, and a source review, not just the test output, verifies this.
3. Call `getRecordComponents()` on the matched `Class` object and read each `RecordComponent`'s `getName()` in the array's own order (which reports components in their declaration order for a record), joining them with commas.
4. For any selector that does not exactly match `"Task"` or `"Owner"` (including case differences or an empty string), return `""` without attempting reflection on anything, matching the hidden tests for `"task"` and `""`.

## Approaching the debug lab

The debug lab's starter code looks up `String.substring` using `Integer.class` as the parameter type, but `String.substring(int)` is declared with the **primitive** `int` parameter — exactly the primitive-versus-boxed mismatch this chapter's second lesson names explicitly, and `getMethod` cannot find a method by matching a boxed type against a primitive parameter.

1. Run the program and confirm it currently fails (with `NoSuchMethodException`) before ever reaching the point of printing anything, since the lookup itself cannot find a matching method.
2. Recall Lesson 2's exact point: `int.class` and `Integer.class` are two distinct `Class` objects, and reflective lookup matches a method's declared signature exactly — there is no automatic boxing/unboxing at the lookup step, only (separately) at invocation time for the arguments themselves.
3. Change the lookup to `String.class.getMethod("substring", int.class)`, preserving the reflective invocation (`method.invoke("Java", 1)`) exactly as given.
4. Confirm your fix now prints `ava` exactly (`"Java".substring(1)`), and be ready to explain why the parameter-type mismatch caused the lookup itself to fail, rather than causing a failure at invocation time.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Write a small framework-style component that scans a class for methods carrying a custom `RUNTIME`-retained annotation and invokes each one reflectively, correctly unwrapping any `InvocationTargetException`.
2. Reflectively access and modify a `private` field on a class you did not write, demonstrating both the `IllegalAccessException` without `setAccessible` and successful access with it, and write one sentence justifying why this specific access is legitimate.
3. Build a two-module JPMS application demonstrating `exports` for ordinary API use and `opens` for a package a simulated framework needs deep reflective access into, and show the `InaccessibleObjectException` that results from attempting the same reflective access against a merely-exported (not opened) package.
4. Construct a deliberate class-loader-identity mismatch (load the same class through two separate `URLClassLoader` instances) and demonstrate the resulting `instanceof` failure and `ClassCastException`.
5. Design (in prose) an allow-list-based validation scheme for a hypothetical plugin system that must construct a class named in a configuration file, ensuring untrusted or malformed class names never reach a reflective call.

## Self-assessment

You are ready for Chapter 22 when you can do all of the following without notes:

- Explain the difference between `getDeclaredMethods` and `getMethods`, and why the distinction matters when writing framework-style code.
- Explain why a reflective lookup using a boxed wrapper class fails to match a method declared with a primitive parameter.
- Explain what `InvocationTargetException` wraps and why its cause, not its own message, is the useful diagnostic.
- Explain why an annotation does nothing by itself, and identify what always makes one "do something."
- Explain what forms a class's runtime identity, and why a plugin architecture might deliberately want two identically-named classes to be distinct types.
- Explain the difference between `exports` and `opens`, and why a reflection-based framework specifically needs the latter.
- Explain why untrusted input must never directly select a reflection target, and what mitigates that risk.
