# Annotation targets, retention, processing, and generated code

`@Override`, `@Test`, `@Autowired`, `@Entity` — annotations are everywhere in real Java code, and a beginner's natural assumption is that writing `@Test` on a method somehow makes it run as a test. This lesson corrects that assumption precisely: an annotation is pure metadata, inert by itself, and every behavior associated with one comes entirely from a consumer — a framework's runtime code, or a compile-time annotation processor — that chooses to look for it and act on what it finds.

What you will learn:

- What an annotation actually is: metadata attached to a program element, nothing more
- `@Target`: which kinds of program elements an annotation may be placed on
- `@Retention`: whether an annotation survives to source only, class files, or runtime
- Why a `RUNTIME`-retained annotation still does nothing without a consumer that reads it via reflection
- What an annotation processor is, and how it generates code at compile time (`SOURCE` retention's real use case)
- Reading a realistic custom annotation end to end: declaration, application, and the code that interprets it

## An annotation is metadata, not behavior

The single most important fact this lesson establishes: **an annotation, by itself, does nothing.** Writing `@Test` on a method attaches metadata saying "this method is annotated with `@Test`" — it is JUnit's own runtime code, using reflection to scan for methods carrying that specific annotation, that decides to run them. Remove JUnit from the classpath and leave the annotation in place, and the method becomes an ordinary, un-executed method with an inert piece of metadata attached to it.

```java
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Important {
    String reason() default "";
}
```

```java
public class ReportJob {
    @Important(reason = "used by the nightly billing run")
    public void generateInvoices() { /* ... */ }

    public void logStatus() { /* ordinary method, no annotation */ }
}
```

Nothing in this code causes `generateInvoices` to behave any differently than `logStatus` at runtime — no JVM mechanism inspects annotations automatically and changes execution based on them. The annotation only becomes meaningful the moment *some other piece of code* — written separately, deliberately, using reflection or the compiler's annotation-processing API — looks for `@Important` and does something in response to finding it. This directly answers this chapter's concept-check question: a custom runtime annotation never executes behavior "by itself," regardless of its retention policy; a consumer must always interpret it.

## @Target: which program elements an annotation may be placed on

`@Target` restricts where an annotation is legal to write, checked by the compiler:

```java
import java.lang.annotation.ElementType;

@Target({ElementType.TYPE, ElementType.METHOD})
public @interface Auditable {
}
```

| `ElementType` value | Where the annotation may be placed |
|---|---|
| `TYPE` | A class, interface, enum, or annotation declaration |
| `METHOD` | A method declaration |
| `FIELD` | A field declaration |
| `PARAMETER` | A method or constructor parameter |
| `CONSTRUCTOR` | A constructor declaration |
| `LOCAL_VARIABLE` | A local variable declaration |
| `ANNOTATION_TYPE` | Another annotation's declaration (a "meta-annotation") |
| `PACKAGE` | A package declaration (`package-info.java`) |
| `TYPE_USE` | Anywhere a type is referenced, including generics and casts (Java 8+) |

Omitting `@Target` entirely allows the annotation to be placed on essentially anything — deliberately restricting it to only the element kinds a consumer actually expects to find it on is a small but genuine correctness safeguard: without it, nothing stops a developer from mistakenly annotating a field with something meant only for methods, an error the compiler would otherwise catch immediately.

## @Retention: how long the metadata survives

`@Retention` controls how far into the build and runtime pipeline the annotation's information survives:

| `RetentionPolicy` | Survives to | Typical use |
|---|---|---|
| `SOURCE` | Discarded after compilation; never in the `.class` file at all | `@Override`, annotations consumed only by an annotation processor at compile time |
| `CLASS` (the default if unspecified) | Present in the `.class` file, but not loaded into memory by the JVM at runtime | Rarely used directly; mostly a historical default |
| `RUNTIME` | Present in the `.class` file AND readable via reflection while the program runs | `@Test`, `@Autowired`, any annotation a framework inspects at runtime |

```java
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.SOURCE)
public @interface GeneratedBySchema { } // only useful to a compile-time tool; irrelevant at runtime

@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresPermission {
    String value();
} // must be RUNTIME for reflection to find it after the program is compiled and running
```

Choosing the wrong retention is a specific, common bug: an annotation meant to be read by a framework via reflection, but declared with `SOURCE` or the default `CLASS` retention, simply is not there when reflection looks for it at runtime — `getAnnotation(RequiresPermission.class)` returns `null` unconditionally, not because the annotation was misapplied, but because it was discarded before the program ever started running.

## Annotation processing: SOURCE retention's real job

A `SOURCE`-retained annotation is not useless — it is exactly what an **annotation processor** consumes at compile time, before the `.class` files are even produced, to generate additional source code. This is how libraries like Lombok, Dagger, and various ORM/mapping frameworks work: they hook into the `javac` compilation process itself, scan for their own annotations, and emit new `.java` files that get compiled alongside the rest of your code.

```java
// Written by the developer:
@AutoValue
abstract class Point {
    abstract int x();
    abstract int y();
}
```

```java
// Generated by an annotation processor at compile time, in a separate file the developer never writes:
final class AutoValue_Point extends Point {
    private final int x;
    private final int y();
    // ... generated constructor, equals(), hashCode(), toString() ...
}
```

The developer writes a small, declarative abstract class; the annotation processor, running as a compiler plugin, generates the full boilerplate implementation as an ordinary `.java` file that then compiles normally. This is fundamentally different from a `RUNTIME`-retained annotation read via reflection: there is no runtime cost at all (the generated code is plain, ordinary Java, indistinguishable at runtime from code a developer typed by hand), but the mechanism only works at compile time, and cannot react to information only available once the program is actually running.

## A realistic annotation end to end: declaration, application, consumption

Tying the pieces together — a custom `RUNTIME`-retained annotation, applied to methods, and a consumer that uses reflection to find and act on it, echoing this chapter's earlier lessons directly:

```java
// 1. Declaration: metadata shape, target, and retention.
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface RetryOnFailure {
    int maxAttempts() default 3;
}
```

```java
// 2. Application: the annotation is inert metadata here, nothing more.
public class PaymentGateway {
    @RetryOnFailure(maxAttempts = 5)
    public void charge(int amountCents) {
        // ... calls an external payment service ...
    }

    public void logAudit(String message) { /* not annotated: no retry behavior */ }
}
```

```java
// 3. Consumer: reflection finds the annotation and decides what to do about it.
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

public class RetryingInvoker {

    public static void invokeWithRetry(Object target, String methodName) throws Exception {
        Method method = target.getClass().getMethod(methodName);
        RetryOnFailure retry = method.getAnnotation(RetryOnFailure.class);
        int maxAttempts = (retry != null) ? retry.maxAttempts() : 1; // no annotation = no retry

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                method.invoke(target);
                return; // success
            } catch (InvocationTargetException e) {
                System.out.println("attempt " + attempt + " failed: " + e.getCause());
                if (attempt == maxAttempts) throw e;
            }
        }
    }
}
```

`RetryingInvoker` is the *entire* reason `@RetryOnFailure` does anything at all — without it, the annotation on `charge` is exactly as inert as no annotation at all would be. This is worth internalizing precisely because it is the opposite of how annotations often feel from the outside, especially to a developer used to a framework already providing the consumer: the annotation looks declarative and magical, but the actual behavior is always, unconditionally, ordinary Java code written by someone, somewhere, reading that metadata and acting on it.

## What happens under the hood: from a compiled class to a read annotation

1. The compiler encodes `RUNTIME`-retained annotations (and their element values) directly into the `.class` file's constant pool and attribute structure, alongside the class's ordinary bytecode.
2. When the class is loaded by the JVM, this annotation metadata is loaded along with everything else the `Class` object describes — it is not treated specially or executed in any way at load time.
3. `Method.getAnnotation(SomeAnnotation.class)` (or `getAnnotations()`, `isAnnotationPresent()`) performs an ordinary reflective lookup against this stored metadata, returning `null` (or an empty result) if the requested annotation is not present.
4. Any behavior that follows — retrying, validating, wiring a dependency — is ordinary Java code the consumer wrote, executed as a direct consequence of that lookup returning a non-null result, with no JVM-level "annotation execution" mechanism involved at any point.
5. For `SOURCE`-retained annotations processed at compile time, the annotation processor runs as part of `javac`'s own compilation rounds, before bytecode generation for the final class files; any code it generates is compiled in the same build, and the annotation itself never survives into any `.class` file at all.

## Common mistakes

**Mistake 1: assuming an annotation causes behavior by its mere presence.** No JVM mechanism executes anything based on an annotation alone; some consumer must read and act on it. Fix: understand that "what does this annotation actually do" always has an answer in the form of "this specific piece of consumer code reads it and does X" — never "the annotation itself."

**Mistake 2: declaring a framework-consumed annotation with `SOURCE` or the default `CLASS` retention.** Reflection at runtime finds nothing, since the metadata was discarded before the program started. Fix: use `RUNTIME` retention for any annotation a framework or your own code will inspect via reflection while the program runs.

**Mistake 3: omitting `@Target`, allowing an annotation to be misapplied to an element kind its consumer never checks for.** This produces a silent no-op rather than a compile-time error when the annotation is placed somewhere its consumer will never look. Fix: declare `@Target` explicitly, restricted to the element kinds the consumer actually expects.

**Mistake 4: expecting an annotation processor's generated code to react to runtime state.** Annotation processing happens entirely at compile time, before the program ever runs; it cannot depend on runtime values. Fix: use `RUNTIME`-retained annotations plus reflection for anything that must react to information only available while the program is executing.

## Best practices

- Declare `@Target` explicitly for every custom annotation, restricted to the element kinds its consumer expects.
- Use `RUNTIME` retention for any annotation meant to be read via reflection while the program runs; use `SOURCE` for annotations meant only for a compile-time annotation processor.
- When reading someone else's framework code and encountering an unfamiliar annotation, look for the reflection-based (or annotation-processor-based) consumer that actually interprets it, rather than assuming the annotation itself is doing something.
- Keep a custom annotation's own declaration small and purely declarative; put all actual logic in the separate consumer that reads it.

## Summary

- An annotation is metadata attached to a program element; it does nothing by itself, regardless of its retention policy.
- `@Target` restricts which kinds of program elements an annotation may legally be placed on, checked at compile time.
- `@Retention` controls how long an annotation's metadata survives: `SOURCE` (compile-time only), `CLASS` (in the `.class` file but not loaded for reflection), or `RUNTIME` (readable via reflection while the program runs).
- A `RUNTIME`-retained annotation only becomes meaningful once a consumer uses reflection to find and act on it; the annotation and its consumer are always two separate pieces of code.
- `SOURCE`-retained annotations are consumed by annotation processors at compile time, generating additional source code with zero runtime cost, but with no ability to react to runtime information.

## Practice

1. **Warm-up:** Explain precisely why removing a framework from the classpath, while leaving its annotations in your own code, causes those annotations to become entirely inert rather than causing a compile error.
2. **Warm-up:** A custom annotation is declared with the default (unspecified) retention and a framework attempts to read it via reflection at runtime, always getting `null`. Diagnose and fix the bug.
3. **Core:** Declare a custom `RUNTIME`-retained annotation with a `@Target` restricted to methods, apply it to a method with an element value, and write a reflection-based consumer that reads the annotation and changes its behavior based on the value found.
4. **Core:** Explain, in your own words, the difference between what a `RUNTIME`-retained annotation plus reflection can do and what a `SOURCE`-retained annotation plus an annotation processor can do, and give one example use case better suited to each.
5. **Challenge:** Extend the `RetryOnFailure`/`RetryingInvoker` example with a second annotation attribute (a delay between attempts) and demonstrate the consumer correctly reading and applying both attributes.

## Check your understanding

1. Why does writing `@Test` on a method not, by itself, cause that method to run as a test?
2. What does `@Target` restrict, and what happens if an annotation is applied to an element kind its intended consumer never actually checks for?
3. What is the practical consequence of declaring a framework-consumed annotation with `SOURCE` retention instead of `RUNTIME`?
4. Why can annotation-processor-generated code have zero runtime cost compared to a reflection-based approach reading a `RUNTIME`-retained annotation?
5. In the `RetryOnFailure` example, what specifically makes the annotation "do something," and what would happen if `RetryingInvoker` were deleted but the annotation and its application remained?
6. Why can't an annotation processor's generated code react to information only available once the program is running?
