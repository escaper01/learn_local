# Pattern matching with instanceof and switch

Before Java 16, checking an object's type and then using it as that type took two steps: `instanceof` to check, then an explicit cast to actually use it as that type. Every Java developer wrote this pattern thousands of times, and every Java developer occasionally forgot the cast, or mistyped it, or cast to the wrong type entirely. Java 16 fused the check and the cast into one: **pattern matching**, first for `instanceof`, then extended to `switch`, then extended again to decompose records directly. This lesson covers all three, plus the one question you must answer explicitly no matter how exhaustive your pattern `switch` looks: what happens when the value is `null`?

What you will learn:

- How `instanceof` pattern matching combines a type check and a cast into one expression
- Why the pattern variable's scope is limited to where the compiler can prove the match succeeded
- Java 21's pattern `switch`, including record patterns that decompose a record's components directly
- Guarded patterns using `when`, and the ordering rule the compiler enforces between them
- Why exhaustiveness over a sealed hierarchy's subtypes does **not** automatically mean `null` is handled
- How to give `null` its own explicit policy inside a pattern `switch`, or reject it deliberately beforehand

## instanceof pattern matching

The classic Java idiom was `if (value instanceof String) { String text = (String) value; ... }` — a check, then a redundant cast the compiler could plainly see was already proven safe. Pattern matching removes the redundancy: the cast is folded directly into the `instanceof` check itself, introducing a new variable that is only defined where the compiler can prove the check succeeded.

```java
public class InstanceofPattern {
    static String describe(Object value) {
        if (value instanceof String text && text.length() > 2) {
            return "long string: " + text.toUpperCase(java.util.Locale.ROOT);
        } else if (value instanceof String text) {
            return "short string: " + text;
        } else if (value instanceof Integer number && number > 0) {
            return "positive int: " + number;
        } else if (value instanceof Integer number) {
            return "non-positive int: " + number;
        }
        return "unknown: " + value;
    }

    public static void main(String[] args) {
        System.out.println(describe("Java"));
        System.out.println(describe("Hi"));
        System.out.println(describe(42));
        System.out.println(describe(-5));
        System.out.println(describe(3.14));
        System.out.println(describe(null));

        Object maybeString = "Java";
        System.out.println("null instanceof String: " + (null instanceof String));
        if (maybeString instanceof String s) {
            System.out.println("pattern variable s usable here, no cast needed: " + s.length());
        }
    }
}
```

Output:

```text
long string: JAVA
short string: Hi
positive int: 42
non-positive int: -5
unknown: 3.14
unknown: null
null instanceof String: false
pattern variable s usable here, no cast needed: 4
```

`value instanceof String text` does three things in one expression: it checks whether `value` is a `String`, and if so, it declares `text` as a `String` and assigns it — with no separate cast anywhere. The compiler tracks exactly where this has been proven true, called **flow scoping**: inside the `if` branch of `value instanceof String text && text.length() > 2`, both the `instanceof` check and the length check have definitely succeeded by the time `text.toUpperCase()` runs, so `text` is safely usable there; outside that branch (say, in an `else`), `text` is not in scope at all, because the compiler cannot prove the match held.

The last two lines confirm something important: **`instanceof` always returns `false` for `null`**, for any type — it never throws, and a pattern variable is simply never bound when the tested reference is `null`. This detail matters directly for the next section.

## Java 21 pattern switch and record patterns

Java 21 finalizes **pattern matching for `switch`**: a `switch` can match not just constant values (as in Chapter 3) but types, including sealed hierarchy variants, and — for records specifically — it can **decompose** a record's components directly in the case label itself, called a **record pattern**.

```java
public class PatternSwitch {
    sealed interface Result permits Success, Failure {}
    record Success(String value) implements Result {}
    record Failure(String reason) implements Result {}

    static String describe(Result result) {
        return switch (result) {
            case Success(String text) -> "OK: " + text;
            case Failure(String reason) -> "FAILED: " + reason;
        };
    }

    static String classify(Object value) {
        return switch (value) {
            case Integer i when i < 0 -> "negative int " + i;
            case Integer i when i == 0 -> "zero";
            case Integer i -> "positive int " + i;
            case String s -> "string of length " + s.length();
            default -> "other: " + value;
        };
    }

    public static void main(String[] args) {
        System.out.println(describe(new Success("42")));
        System.out.println(describe(new Failure("timeout")));

        System.out.println(classify(-5));
        System.out.println(classify(0));
        System.out.println(classify(5));
        System.out.println(classify("hi"));
        System.out.println(classify(3.14));
    }
}
```

Output:

```text
OK: 42
FAILED: timeout
negative int -5
zero
positive int 5
string of length 2
other: 3.14
```

`case Success(String text) ->` is a **record pattern**: it simultaneously checks that `result` is a `Success`, and — in the same step — pulls its `value` component straight out into a freshly bound variable `text`, ready to use on the right-hand side of the arrow with no separate call to `success.value()` needed at all. `describe` needs no `default` branch and no `instanceof` chain, because `Result` is the sealed interface from the previous lesson: the compiler can see, from `Result`'s own `permits` clause, that `Success` and `Failure` are the *only* two possibilities, and therefore that covering both of them **is** covering every case.

`classify` demonstrates a **guarded pattern**, using `when`: `case Integer i when i < 0` matches only `Integer` values that are also negative, letting you attach an arbitrary boolean condition to a type pattern, executed only after the type match itself succeeds. Because `classify`'s parameter is a plain `Object`, not a sealed type, the compiler cannot prove exhaustiveness on its own, so a `default` branch is required here, unlike in `describe`.

## Ordering and dominance between guarded cases

When multiple `case` labels could match the same value, more specific cases must come **before** more general ones that would otherwise "catch" the same values first — the compiler calls a case that would incorrectly intercept a later, more specific case's values a **dominated** case, and rejects it outright.

```java
public class DominanceOrder {
    static String describe(Object value) {
        return switch (value) {
            case Integer i when i > 100 -> "big int " + i;
            case Integer i -> "any other int " + i;
            case Object other -> "not an int: " + other;
        };
    }

    public static void main(String[] args) {
        System.out.println(describe(500));
        System.out.println(describe(5));
        System.out.println(describe("text"));
    }
}
```

Output:

```text
big int 500
any other int 5
not an int: text
```

This ordering — guarded `Integer` case, then unguarded `Integer` case, then the fully general `Object` case — is the only order that works, and it is not a stylistic preference; the compiler actively enforces it:

```java
public class DominanceRejected {
    static String describe(Object value) {
        return switch (value) {
            case Object other -> "generic: " + other;
            case Integer i -> "int " + i;
        };
    }

    public static void main(String[] args) {
        System.out.println("compiling this file should fail");
    }
}
```

```text
DominanceRejected.java:5: error: this case label is dominated by a preceding case label
            case Integer i -> "int " + i;
                 ^
1 error
```

`case Object other` matches literally everything a reference type could be, including every `Integer`, so placing it first means the later, more specific `case Integer i` could **never** be reached — it is *dominated*. The compiler does not merely warn about this dead code; it refuses to compile it at all, which is a real safety net: reordering cases in a large `switch` cannot silently make a later branch permanently unreachable without the compiler telling you immediately.

## Exhaustiveness over a sealed hierarchy: what "complete" really means

You saw `describe(Result result)` above compile with no `default`, because `Result` is sealed with exactly two permitted subtypes. Adding a third permitted variant without updating every `switch` over `Result` is exactly the safety net sealing was introduced to provide:

```java
public class NonExhaustiveRejected {
    sealed interface Result permits Success, Failure, Pending {}
    record Success(String value) implements Result {}
    record Failure(String reason) implements Result {}
    record Pending(String reference) implements Result {}

    static String describe(Result result) {
        return switch (result) {
            case Success(String text) -> "OK: " + text;
            case Failure(String reason) -> "FAILED: " + reason;
        };
    }

    public static void main(String[] args) {
        System.out.println("compiling this file should fail");
    }
}
```

```text
NonExhaustiveRejected.java:8: error: the switch expression does not cover all possible input values
        return switch (result) {
               ^
1 error
```

The moment `Pending` was added to `Result`'s `permits` clause, every existing pattern `switch` over `Result` that does not also handle `Pending` (or supply a `default`) **stops compiling**, everywhere in the project, immediately. This is precisely the value of sealed types from the previous lesson combined with pattern `switch`: adding a new variant is not a silent risk that some forgotten branch of code quietly mishandles it — it becomes a compile error at every single site that needs updating, which you then fix one by one with full confidence you have found them all.

## null is never automatically covered by exhaustiveness

Here is the crucial detail the chapter's concept-check question is built around, and it is easy to get wrong precisely because everything above feels so thoroughly checked by the compiler: **exhaustiveness over a sealed type's subtypes says nothing at all about `null`.** A pattern `switch` that correctly covers every permitted subtype still throws `NullPointerException` on a `null` selector, unless you give `null` its own explicit case.

```java
public class NullInSwitch {
    sealed interface Result permits Success, Failure {}
    record Success(String value) implements Result {}
    record Failure(String reason) implements Result {}

    static String describeRejectsNull(Result result) {
        return switch (result) {
            case Success(String text) -> "OK: " + text;
            case Failure(String reason) -> "FAILED: " + reason;
        };
    }

    static String describeHandlesNull(Result result) {
        return switch (result) {
            case null -> "no result provided";
            case Success(String text) -> "OK: " + text;
            case Failure(String reason) -> "FAILED: " + reason;
        };
    }

    public static void main(String[] args) {
        System.out.println(describeHandlesNull(null));
        System.out.println(describeHandlesNull(new Success("42")));

        try {
            describeRejectsNull(null);
        } catch (NullPointerException e) {
            System.out.println("exhaustive switch without case null still threw NPE: " + e.getClass().getSimpleName());
        }
    }
}
```

Output:

```text
no result provided
OK: 42
exhaustive switch without case null still threw NPE: NullPointerException
```

`describeRejectsNull` is, by every measure covered so far in this lesson, a completely exhaustive `switch`: it covers `Success` and `Failure`, the entire permitted set for `Result`, with no `default` needed and no compiler complaint. And yet calling it with `null` throws `NullPointerException` — because none of `Success`, `Failure`, or any type pattern at all ever matches `null` (recall from the very first example that `instanceof` always returns `false` for `null`; the same rule underlies type patterns in `switch`), so a `switch` with no explicit `case null` treats an incoming `null` as an unhandled case and throws, exactly as an old-style `switch` on a `null` selector always has.

`describeHandlesNull` adds `case null ->` as its own explicit branch, given first, which is the only correct way to make `null` a genuinely handled input rather than a crash. This is a **deliberate policy decision you must make yourself**, precisely because the compiler's exhaustiveness checking — powerful as it is for subtypes — simply does not extend to `null`. The two legitimate designs are: reject `null` before the `switch` even runs (perhaps with `Objects.requireNonNull`, as in Chapter 4), if a `null` `Result` should never legitimately occur; or give it `case null ->` with a specific, meaningful branch, if a missing result is itself a valid state your code needs to represent.

## What happens under the hood

A pattern `switch`'s exhaustiveness check works because the compiler can enumerate a sealed type's permitted direct subtypes exactly, reading that list straight from the class file's recorded `permits` information covered in the previous lesson — the very same mechanism that let it reject an unpermitted subtype at compile time now lets it *positively* confirm a `switch`'s cases together account for every one of them. `null` sits fundamentally outside this reasoning: `null` is not an instance of any type at all, sealed or otherwise, so no amount of enumerating subtypes can ever "cover" it — the language instead requires you to opt in with `case null` as a wholly separate, explicit branch, precisely so that handling (or deliberately rejecting) a missing value is always a conscious decision visible right in the `switch`, not an accidental gap that exhaustiveness checking happened to paper over.

## Common mistakes

**1. Assuming a pattern variable is usable outside the branch where the match was proven.** `if (x instanceof String s) { ... } System.out.println(s);` after the `if` block does not compile — flow scoping only extends exactly as far as the compiler can prove the match held.

**2. Ordering guarded `case` labels from general to specific.** A more general pattern placed before a more specific one silently makes the specific one unreachable; the compiler flags this as a dominated case and refuses to compile it, so fix the order rather than trying to work around the error.

**3. Believing an exhaustive `switch` over a sealed type's subtypes also handles `null`.** It does not; a `null` selector throws `NullPointerException` unless you add `case null` yourself.

**4. Adding a `default` branch purely out of habit on a `switch` over a sealed type.** This is not wrong, but it silently defeats the exact benefit sealing was supposed to give you: a future new variant will now fall into `default` instead of producing a compile error demanding your attention at every site that needs updating.

**5. Forgetting that `instanceof` (and therefore any type pattern) always returns `false` for `null`**, which is precisely the mechanism behind `null` never being automatically matched by any type-based `case` in a `switch`.

## Best practices

- Prefer pattern matching (`instanceof` with a bound variable, or a pattern `switch`) over the older manual check-then-cast idiom; it is shorter and cannot mismatch the cast to the wrong type.
- When switching over a sealed hierarchy, deliberately **omit** `default` so the compiler's exhaustiveness check keeps protecting you as new variants are added later.
- Always decide `null`'s policy explicitly for any reference-typed `switch` selector: either rule it out beforehand with a null check, or give it its own `case null` branch with real, meaningful behavior.
- Order guarded cases from most specific to least specific, letting the compiler's dominance check confirm you got the order right rather than discovering a silently-unreachable branch later.
- Use record patterns to decompose a record's components directly in a `case` label whenever you would otherwise immediately call several accessor methods on it inside the branch.

## Summary

- `instanceof` pattern matching folds a type check and a cast into one expression, binding a new variable that is usable only where the compiler can prove the match succeeded.
- Java 21's pattern `switch` matches types (including record patterns that decompose components directly) and supports `when` guards for additional conditions.
- More specific guarded cases must be written before more general ones; a case that could never be reached because an earlier one already covers its values is rejected as "dominated" at compile time.
- A `switch` covering every permitted subtype of a sealed type is exhaustive and needs no `default` — and adding a new permitted variant later breaks that exhaustiveness everywhere, forcing a compile error at every site needing an update.
- Exhaustiveness over subtypes never automatically covers `null`; a `null` selector throws `NullPointerException` unless you add an explicit `case null` branch or rule `null` out beforehand.

## Practice

Warm-up:

1. Write a method using `instanceof` pattern matching that accepts an `Object` and returns a different message for `Integer`, `Double`, and anything else.
2. Convert that method to a pattern `switch` with a `default` branch, and compare the two versions for readability.
3. Confirm, with a small test, that `null instanceof Integer` returns `false` rather than throwing.

Core:

1. Using the sealed `PaymentResult` hierarchy you built in the previous lesson's practice (`Accepted`, `Declined`, `Pending`), write an exhaustive pattern `switch` with record patterns that produces a human-readable message for each variant, with no `default` branch.
2. Add `case null` to your `PaymentResult` switch with a meaningful message ("no payment attempted yet"), and write a small test confirming both the `null` case and every real variant behave correctly.
3. Write a guarded pattern `switch` over `Object` that classifies an `Integer` as `"negative"`, `"zero"`, or `"positive"` using `when` guards, and a `String` by whether `isBlank()` is true, ordering the cases correctly so none dominates another.

Challenge:

1. Add a fourth variant to your `PaymentResult` hierarchy and observe every compile error that appears across your existing pattern switches. Fix each one, and write a short note describing how this experience differs from what would happen if every switch had used `default` instead.
2. Design a sealed `Shape` hierarchy (`Circle(double radius)`, `Rectangle(double width, double height)`, `Triangle(double base, double height)`, all records) and write a single pattern `switch` with record patterns that computes each shape's area, decomposing each record's components directly in its case label rather than calling accessor methods inside the branch body.

## Check your understanding

1. What two things does `if (value instanceof String text)` do in one expression that older Java required two separate steps for?
2. Why is `text` from `value instanceof String text` not usable in the `else` branch of that same `if`?
3. What compile-time error occurs if a general case, such as `case Object other`, is placed before a more specific case for the same switch, and why?
4. A `switch` covers every permitted subtype of a sealed interface with no `default`. Does calling it with a `null` argument throw, and why or why not?
5. What are the two legitimate ways to handle a `null` selector in a pattern `switch`, and how do they differ in intent?
6. What does a record pattern like `case Success(String text) ->` do that an ordinary type pattern like `case Success s ->` would not do as directly?
