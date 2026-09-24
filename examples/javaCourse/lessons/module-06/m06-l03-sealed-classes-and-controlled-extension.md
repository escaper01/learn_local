# Sealed classes and controlled extension

An operation either succeeds with a value or fails with a reason — never both, never neither. Before Java 17, expressing "exactly one of these alternatives, and nothing else" was surprisingly hard: an ordinary interface lets *anyone*, anywhere, implement it, so the compiler can never promise you have handled every possibility. A single class with a `successFlag`, a `value` field, and an `error` field can represent nonsensical states — success `true` with an error message set — that should never be constructible at all.

A **sealed** hierarchy solves both problems at once: it names, up front, the *complete* and *closed* list of types allowed to be its direct subtypes, and it separates each alternative into its own type with only the data that alternative actually needs. This lesson shows exactly what sealing restricts, what it requires of each permitted subtype, and why it beats a single class stitched together with flags.

What you will learn:

- How to declare a sealed interface or class with an explicit `permits` clause
- What every permitted direct subtype must be: `final`, `sealed`, or `non-sealed`, and why
- What happens when you try to add an unpermitted subtype, or a permitted subtype without one of those three modifiers
- Why records are a natural fit as permitted variants, since they are implicitly `final`
- Why modeling alternatives as separate sealed variants prevents contradictory, nonsensical combinations that a single flags-based class allows

## Declaring a sealed hierarchy

A `sealed` interface or class lists its allowed direct subtypes explicitly, using a `permits` clause:

```java
public class SealedBasics {
    sealed interface Result permits Success, Failure {}
    record Success(String value) implements Result {}
    record Failure(String reason) implements Result {}

    static String describe(Result result) {
        if (result instanceof Success success) {
            return "OK: " + success.value();
        } else if (result instanceof Failure failure) {
            return "FAILED: " + failure.reason();
        }
        throw new IllegalStateException("unreachable: no other permitted type exists");
    }

    public static void main(String[] args) {
        Result ok = new Success("42");
        Result bad = new Failure("timeout");

        System.out.println(describe(ok));
        System.out.println(describe(bad));

        System.out.println("ok instanceof Result: " + (ok instanceof Result));
        System.out.println("Success is final: cannot be extended further");
    }
}
```

Output:

```text
OK: 42
FAILED: timeout
ok instanceof Result: true
Success is final: cannot be extended further
```

`Result` states, right in its declaration, that `Success` and `Failure` are the **only** types ever allowed to implement it directly — not "the only ones I happen to know about today", but a guarantee the compiler itself enforces at compile time, for every source file in the project, forever, unless the sealed declaration itself is changed. This is the essential difference from an ordinary, unsealed interface: with a plain `interface Result {}`, absolutely anyone, in any file, in any package (given appropriate access), could write a third implementation, and nothing would ever warn you that your `describe` method's `if`/`else if` chain no longer covers every case.

## What a permitted subtype must be

Sealing a type is not just a promise about direct subtypes — it also requires each permitted subtype to make its *own* explicit decision about further extension. Every type named in a `permits` clause must be declared `final`, `sealed`, or `non-sealed`; there is no fourth option, and leaving it unstated is a compile error.

First, an attempt to implement the sealed interface from an unlisted type:

```java
public class OpenSubtypeRejected {
    sealed interface Result permits Success, Failure {}
    record Success(String value) implements Result {}
    record Failure(String reason) implements Result {}

    static final class Pending implements Result {}

    public static void main(String[] args) {
        System.out.println("compiling this file should fail");
    }
}
```

```text
OpenSubtypeRejected.java:6: error: class is not allowed to extend sealed class: Result (as it is not listed in its 'permits' clause)
    static final class Pending implements Result {}
                 ^
1 error
```

`Pending` is a perfectly ordinary, correctly-written class — its only sin is not being named in `Result`'s `permits` clause. This is exactly the point: sealing makes adding a new variant a **deliberate, visible act at the sealed type's own declaration**, not something any file elsewhere in the codebase can do silently.

Second, a permitted subtype that forgets to state its own extension policy:

```java
public class UnsealedSubtypeRejected {
    sealed interface Shape permits Circle {}

    // Missing final, sealed, or non-sealed modifier on Circle.
    static class Circle implements Shape {
        double radius;
    }

    public static void main(String[] args) {
        System.out.println("compiling this file should fail");
    }
}
```

```text
UnsealedSubtypeRejected.java:5: error: sealed, non-sealed or final modifiers expected
    static class Circle implements Shape {
           ^
1 error
```

`Circle` is correctly named in `permits`, but a plain `class` declaration leaves its own extendability ambiguous — could some fourth type extend `Circle`, silently smuggling itself into the `Shape` family through the back door? Sealing forbids leaving that question unanswered: every permitted subtype must pick one of exactly three explicit stances.

| Modifier on a permitted subtype | Meaning |
|---|---|
| `final` | this is a leaf; nothing may extend it further |
| `sealed` (with its own `permits`) | this branches into its own closed, explicitly-listed sub-family |
| `non-sealed` | this deliberately reopens extension; ordinary, unrestricted subclasses/implementations are allowed again from here down |

Records satisfy this requirement automatically and are exactly why `Success` and `Failure` above needed no explicit modifier at all: **every record is implicitly `final`**, a fact you learned in the previous lesson, which is precisely why records are such a natural, low-ceremony fit as the leaves of a sealed hierarchy.

## non-sealed: deliberately reopening extension

Sometimes one branch of a sealed family genuinely should stay open to arbitrary future implementations, while the rest of the family stays closed. `non-sealed` marks exactly that deliberate choice:

```java
public class NonSealedDemo {
    sealed interface Shape permits Circle, Square {}

    non-sealed interface Circle extends Shape {
        double radius();
    }

    record Square(double side) implements Shape {}

    static final class UnitCircle implements Circle {
        public double radius() { return 1.0; }
    }

    static double area(Shape shape) {
        if (shape instanceof Circle circle) {
            return Math.PI * circle.radius() * circle.radius();
        } else if (shape instanceof Square square) {
            return square.side() * square.side();
        }
        throw new IllegalStateException("unreachable");
    }

    public static void main(String[] args) {
        Shape circle = new UnitCircle();
        Shape square = new Square(4);
        System.out.printf("unit circle area: %.4f%n", area(circle));
        System.out.println("square area: " + area(square));
        System.out.println("Circle is non-sealed, so UnitCircle could implement it freely");
    }
}
```

Output:

```text
unit circle area: 3.1416
square area: 16.0
Circle is non-sealed, so UnitCircle could implement it freely
```

`Shape` still closes its own top level to exactly `Circle` and `Square` — nothing else may implement `Shape` directly. But `Circle` reopens extension from that point downward: `UnitCircle`, or any other class anyone writes in any file, can freely `implements Circle` with no `permits` list to update and no compiler restriction at all, because `Circle` explicitly chose `non-sealed` rather than `final` or `sealed`. `Square`, being a record, stays a closed leaf as before. This lets you seal exactly the part of a hierarchy where you want exhaustiveness guarantees (the top-level choice between fundamentally different shapes), while leaving room for genuine, unbounded extensibility exactly where you decide it belongs (arbitrary kinds of circles from a plugin, say) — you saw this same tension already, from the modeling side, in Chapter 5 when weighing inheritance against composition; sealing is the language feature that lets you state the decision explicitly rather than leaving it implicit.

> **Note:** In a named module, permitted subtypes must belong to that same module; in the unnamed module (the common case for smaller, single-module projects, which is what this course's exercises use), they must belong to the same package as the sealed type. Chapter 21 covers the Java Platform Module System and named modules in depth.

## Why separate sealed variants beat one class with flags

The deepest reason to reach for a sealed hierarchy is not the compiler enforcement by itself — it is that separating alternatives into their own types with only the data each one actually needs makes **contradictory states impossible to construct in the first place**, whereas a single class juggling several fields with a flag cannot make that promise.

```java
public class WhySealedOverFlags {
    static final class FlagResult {
        boolean success;
        String value;
        String error;
    }

    sealed interface Result permits Success, Failure {}
    record Success(String value) implements Result {}
    record Failure(String reason) implements Result {}

    public static void main(String[] args) {
        FlagResult contradictory = new FlagResult();
        contradictory.success = true;
        contradictory.value = null;
        contradictory.error = "but also this error is set";
        System.out.println("contradictory flag combination compiles fine: success="
                + contradictory.success + " value=" + contradictory.value + " error=" + contradictory.error);

        Result cannotBeContradictory = new Success("42");
        System.out.println("a Success simply has no error field to misuse: " + cannotBeContradictory);
    }
}
```

Output:

```text
contradictory flag combination compiles fine: success=true value=null error=but also this error is set
a Success simply has no error field to misuse: Success[value=42]
```

`FlagResult` compiles and runs perfectly happily while representing something that should be logically impossible: marked successful, with no value, yet also carrying an error message — nothing in the type system prevents this nonsensical combination, because `success`, `value`, and `error` are just three independent fields with no relationship enforced between them. Every method that receives a `FlagResult` must defensively re-check combinations of these fields that should never coexist, and every new field added to `FlagResult` in the future multiplies the number of theoretically-reachable-but-meaningless combinations.

`Success`, by contrast, simply **has no `error` field to misuse**. There is no way to construct a "successful failure", because success and failure are different types entirely, not different states of the same type distinguished by a flag. This is the real payoff of sealing combined with records: each alternative carries exactly the data that alternative needs, no more, and the sealed `permits` clause guarantees that `Success` and `Failure` remain the only two shapes a `Result` can ever take.

## What happens under the hood

Sealing is purely a compile-time and class-file-level restriction — there is no runtime cost to using a sealed type versus an ordinary one. The `permits` clause is recorded in the compiled class file itself, which is exactly how the compiler can reject an unpermitted subtype even when that subtype lives in a separate source file compiled at a different time: at compile time, the compiler checks any class or interface claiming to extend or implement a sealed type against that sealed type's own recorded `permits` list, wherever it is being compiled from. This is also precisely what makes the pattern-matching exhaustiveness you will study in the next lesson possible: because the full, closed list of direct subtypes is fixed and known to the compiler, it can prove — not merely hope — that a `switch` covering every permitted subtype has genuinely covered every possible case, with no `default` branch required.

## Common mistakes

**1. Forgetting to add a new variant to the `permits` clause.** Attempting to implement a sealed type from a class not listed there fails to compile with a clear "not listed in its 'permits' clause" error; the fix is always to add it explicitly at the sealed declaration.

**2. Leaving a permitted subtype without `final`, `sealed`, or `non-sealed`.** Every permitted subtype must pick one, with no default; the compiler rejects the omission outright rather than guessing your intent.

**3. Modeling alternatives that should be separate sealed variants as one class with boolean flags and several optional fields instead.** This allows contradictory, meaningless states to compile and requires every consumer to manually re-validate combinations the type system could have ruled out entirely.

**4. Sealing a hierarchy that genuinely needs unbounded, plugin-style extension.** If arbitrary external code should be able to add new implementations you cannot foresee, sealing is the wrong tool for that particular type; either leave it an ordinary open interface, or use `non-sealed` on the specific branch that needs to stay open, as `NonSealedDemo` does.

**5. Assuming sealing alone gives you exhaustiveness checking.** Sealing is what *makes* exhaustiveness checking possible; you still need the pattern-matching `switch` from the next lesson to actually get the compiler's exhaustiveness verification, rather than a chain of `instanceof` checks ending in a manually-written "unreachable" branch, as this lesson's own examples still do.

## Best practices

- Reach for a sealed hierarchy whenever you have a **closed, known set of alternatives** with genuinely different data shapes — results, parsed outcomes, a fixed set of message or event types.
- Make each permitted variant a `record` whenever it is a value with no independent identity or lifecycle, taking advantage of records being implicitly `final` and needing no extra modifier.
- Use `non-sealed` deliberately, and only on the specific branch that truly needs to remain open to unforeseen implementations; leave every other branch closed.
- Prefer separate sealed variants over one class with several optional fields and a discriminating flag, specifically to make invalid combinations unconstructible rather than merely undocumented.
- Treat adding a new permitted variant as a real design decision made at the sealed type's own declaration, not something to route around with an unrelated open interface elsewhere.

## Summary

- `sealed` restricts which types may be **direct subtypes** of an interface or class, listed explicitly in a `permits` clause; anything not listed is rejected at compile time.
- Every permitted direct subtype must itself be declared `final`, `sealed`, or `non-sealed` — there is no default, and omitting one is a compile error.
- Records are implicitly `final`, making them a natural, low-ceremony fit as the leaves of a sealed hierarchy.
- `non-sealed` deliberately reopens extension from a specific point in an otherwise-closed hierarchy, for the parts that genuinely need unbounded extensibility.
- Modeling alternatives as separate sealed variants, each carrying only its own relevant data, makes contradictory states unconstructible — unlike a single class with flags and optional fields, which the compiler cannot stop from representing nonsensical combinations.

## Practice

Warm-up:

1. Declare a sealed interface `Vehicle` permitting exactly `Car` and `Bicycle` (as records with whatever fields you like), and write a method using `instanceof` checks that describes each one.
2. Remove the `final` modifier from one of your record-based permitted subtypes and observe what happens — then explain, in your own words, why records do not actually need this step.
3. Attempt to add a third class implementing `Vehicle` without adding it to `permits`, and read the resulting compiler error carefully.

Core:

1. Model a payment result as a sealed interface `PaymentResult` with variants `Accepted(String receiptId)`, `Declined(String reason)`, and `Pending(String reference)`. Add a compact constructor to each record rejecting a blank component. Write a method that describes any `PaymentResult` using `instanceof` pattern checks.
2. Take a class you (or a classmate) previously modeled with a boolean flag and several optional fields representing genuinely different cases, and redesign it as a sealed hierarchy of records instead. Write a short comparison of which nonsensical states the old design allowed that the new one prevents.
3. Add a fourth variant to your `PaymentResult` hierarchy from exercise 1, update its `permits` clause, and find every place in your own code that must now change to account for it. Write down what alerted you to each place (a compiler error, or something you had to notice yourself).

Challenge:

1. Design a small sealed hierarchy for JSON-like values: `sealed interface JsonValue permits JsonString, JsonNumber, JsonBoolean, JsonNull {}`, using records where appropriate (`JsonNull` might be a `final class` with no components, since a record with zero components is unusual but legal — try it and see). Write a method that renders any `JsonValue` back to its textual JSON form.
2. Using `NonSealedDemo`'s pattern, design a sealed `Notification` hierarchy with two closed, final variants (`EmailNotification`, `SmsNotification`) and one deliberately `non-sealed` variant (`CustomNotification`) meant to be extended by application-specific notification types you have not written yet. Justify, in a short comment, exactly why that one branch alone should stay open.

## Check your understanding

1. What does a sealed type's `permits` clause actually restrict — every possible instance of the type, or something narrower?
2. What three modifiers are permitted subtypes required to choose from, and what does each one mean for further extension?
3. Why do records satisfy the "must be final, sealed, or non-sealed" requirement without you writing anything extra?
4. What compiler error occurs if a class implements a sealed interface without being named in that interface's `permits` clause?
5. Give a concrete example of a nonsensical state that a single class with a boolean flag and two optional fields can represent, that a sealed hierarchy of two separate record variants cannot.
6. When is `non-sealed` the right choice instead of `final` or `sealed` for a permitted subtype?
