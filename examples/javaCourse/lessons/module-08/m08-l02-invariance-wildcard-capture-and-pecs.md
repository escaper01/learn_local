# Invariance, wildcard capture, and PECS

If `Integer` is a subtype of `Number` (which it is — you use this constantly), it feels natural to expect that a `List<Integer>` should be usable anywhere a `List<Number>` is expected. Java's generics deliberately refuse this. This lesson explains exactly why that refusal is protecting you from a real, silent-corruption bug, and then teaches the tool designed to give back the flexibility safely: **wildcards**, used according to a rule with a name every Java developer eventually memorizes — **PECS**, "producer extends, consumer super."

What you will learn:

- Why `List<Integer>` cannot be assigned to `List<Number>`, and the exact corruption that restriction prevents
- The upper-bounded wildcard `? extends T`: what it lets you read, and why it forbids most writes
- The lower-bounded wildcard `? super T`: what it lets you write, and why it only lets you read as `Object`
- PECS: producer extends, consumer super, applied to a real two-parameter method
- Why the "reverse" version of a correctly-bounded PECS method fails to compile, and what that failure means
- Wildcard capture: how a private generic helper method lets an algorithm work with an unknown wildcard type when it needs one consistent name for it

## Invariance: why List<Integer> is not a List<Number>

Java generics are **invariant**: for two different type arguments `A` and `B`, `List<A>` and `List<B>` have no subtype relationship with each other, even if `A` is a subtype of `B`. This surprises almost every developer coming from an intuition built on ordinary subtyping, so it is worth seeing the compiler reject it directly:

```java
import java.util.ArrayList;
import java.util.List;

public class InvarianceRejected {
    static void poison(List<Number> numbers) {
        numbers.add(3.14);
    }

    public static void main(String[] args) {
        List<Integer> integers = new ArrayList<>();
        integers.add(1);
        integers.add(2);

        List<Number> asNumbers = integers;
        poison(asNumbers);

        int total = 0;
        for (Integer i : integers) {
            total += i;
        }
        System.out.println(total);
    }
}
```

```text
InvarianceRejected.java:14: error: incompatible types: List<Integer> cannot be converted to List<Number>
        List<Number> asNumbers = integers;
                                 ^
1 error
```

This program shows you exactly *why* the restriction exists by attempting the disaster it prevents: **if** `List<Number> asNumbers = integers;` had been allowed, `poison(asNumbers)` could then insert a `3.14` (a `Double`, which genuinely is a `Number`) into what is, underneath, the exact same list object as `integers` — a variable whose declared type promises the compiler, and every piece of code that trusts that declaration, that it contains only `Integer` values. The final `for` loop's implicit cast to `Integer` would then throw `ClassCastException` on the `Double` that was smuggled in, at a line of code that did nothing wrong itself — precisely the "failure moves away from the mistake" danger you saw with raw types in the previous lesson, except this time the corrupting write is disguised as a perfectly reasonable-looking `Number`. Java's invariance rule refuses to even let you reach the poisoning step: the assignment on line 14 is rejected outright, so the entire scenario is caught at compile time instead of surfacing later as a runtime crash.

## The upper-bounded wildcard: ? extends T

Sometimes you genuinely only need to **read** values from a list, treating each one as at least some common supertype — you never need to write element-type-specific values into it. For that, an upper-bounded wildcard, `? extends T`, accepts a list of `T` or **any subtype** of `T`:

```java
import java.util.ArrayList;
import java.util.List;

public class ExtendsWildcard {
    static double sum(List<? extends Number> numbers) {
        double total = 0;
        for (Number n : numbers) {
            total += n.doubleValue();
        }
        return total;
    }

    public static void main(String[] args) {
        List<Integer> integers = List.of(1, 2, 3);
        List<Double> doubles = List.of(1.5, 2.5);

        System.out.println("sum of integers: " + sum(integers));
        System.out.println("sum of doubles: " + sum(doubles));

        List<? extends Number> readable = integers;
        Number first = readable.get(0);
        System.out.println("read as Number: " + first);
    }
}
```

Output:

```text
sum of integers: 6.0
sum of doubles: 4.0
read as Number: 1
```

`sum` now accepts `List<Integer>`, `List<Double>`, or a list of any other `Number` subtype — precisely the flexibility invariance denied us with a plain `List<Number>` parameter. Reading is always safe: whatever the list's real, specific element type is, every element is guaranteed to be *at least* a `Number`, so `n.doubleValue()` is always a valid call.

But this safety comes at a cost, which you can see by trying to write into it:

```java
import java.util.List;

public class ExtendsAddRejected {
    static void addOne(List<? extends Number> numbers) {
        numbers.add(1);
    }

    public static void main(String[] args) {
        System.out.println("compiling this file should fail");
    }
}
```

```text
ExtendsAddRejected.java:5: error: incompatible types: int cannot be converted to CAP#1
        numbers.add(1);
                    ^
  where CAP#1 is a fresh type-variable:
    CAP#1 extends Number from capture of ? extends Number
Note: Some messages have been simplified; recompile with -Xdiags:verbose to get full output
1 error
```

Think through why this must fail: `numbers` could, at run time, actually be a `List<Double>` — the wildcard only promises "some subtype of `Number`," not which one specifically. If `add(1)` (an `Integer`) were allowed, you could corrupt a real `List<Double>` by inserting an `Integer` into it, which is exactly the poisoning `InvarianceRejected` was designed to prevent in the first place. The compiler cannot know which specific subtype the wildcard represents, so it conservatively forbids adding *anything* (except `null`, which fits every reference type). This is why `? extends T` is called the **producer** wildcard: the list produces `T`-compatible values for you to read, but you cannot safely feed values into it.

## The lower-bounded wildcard: ? super T

The opposite situation: sometimes you only need to **write** values of a specific type into a list, without caring exactly what supertype the list is declared to hold. A lower-bounded wildcard, `? super T`, accepts a list of `T` or **any supertype** of `T`:

```java
import java.util.ArrayList;
import java.util.List;

public class SuperWildcard {
    static void addIntegers(List<? super Integer> destination) {
        destination.add(1);
        destination.add(2);
        destination.add(3);
    }

    public static void main(String[] args) {
        List<Number> numbers = new ArrayList<>();
        addIntegers(numbers);
        System.out.println("added to List<Number>: " + numbers);

        List<Object> objects = new ArrayList<>();
        addIntegers(objects);
        System.out.println("added to List<Object>: " + objects);

        List<? super Integer> writable = numbers;
        Object readBack = writable.get(0);
        System.out.println("read back only as Object: " + readBack);
    }
}
```

Output:

```text
added to List<Number>: [1, 2, 3]
added to List<Object>: [1, 2, 3]
read back only as Object: 1
```

`addIntegers` accepts `List<Number>`, `List<Object>`, or any other supertype of `Integer` — because wherever an `Integer` genuinely fits (as it does in a list declared to hold any of its supertypes), adding one is always safe, regardless of exactly which supertype the wildcard turned out to represent. This is why `? super T` is called the **consumer** wildcard: you can safely feed `T` values into it, but reading back out only gives you the guaranteed common ground, `Object` — the compiler has no way to know whether the list's real type is `List<Number>`, `List<Object>`, or something else entirely, so `Object` is the only type it can promise for every element.

## PECS: producer extends, consumer super

Notice the pattern: `? extends T` is safe to **read from** but not write to; `? super T` is safe to **write to** but only reads back as `Object`. **PECS** — "producer extends, consumer super" — is the memorable rule for choosing between them: if a parameter *produces* `T` values for your algorithm to consume (you read from it), bound it with `extends`; if a parameter *consumes* `T` values that your algorithm produces (you write into it), bound it with `super`. A single well-designed generic method commonly needs both wildcards at once, one of each kind:

```java
import java.util.ArrayList;
import java.util.List;

public class PecsTransfer {
    static <T> void transfer(List<? extends T> source, List<? super T> destination) {
        destination.addAll(source);
    }

    public static void main(String[] args) {
        List<Integer> integers = List.of(1, 2, 3);

        List<Number> asNumbers = new ArrayList<>();
        transfer(integers, asNumbers);
        System.out.println("transferred into List<Number>: " + asNumbers);

        List<Object> asObjects = new ArrayList<>();
        transfer(integers, asObjects);
        System.out.println("transferred into List<Object>: " + asObjects);
    }
}
```

Output:

```text
transferred into List<Number>: [1, 2, 3]
transferred into List<Object>: [1, 2, 3]
```

`source` is the **producer** here — `transfer` only ever reads values out of it — so it is bounded with `extends`. `destination` is the **consumer** — `transfer` only ever writes values into it — so it is bounded with `super`. Together, these two independent wildcards let one method accept a `List<Integer>` source alongside a `List<Number>` *or* a `List<Object>` destination, a combination `InvarianceRejected`'s plain, unbounded parameters could never have accepted at all.

## Why the reverse direction correctly fails to compile

PECS is not an arbitrary style preference; swapping the two wildcards produces a method that genuinely cannot be called the way you might expect, and the compiler's rejection is worth reading carefully because it explains exactly why:

```java
import java.util.ArrayList;
import java.util.List;

public class ReverseTransferRejected {
    static <T> void transfer(List<? extends T> source, List<? super T> destination) {
        destination.addAll(source);
    }

    public static void main(String[] args) {
        List<Number> numbers = new ArrayList<>(List.of(1, 2.5, 3));
        List<Integer> integers = new ArrayList<>();
        transfer(numbers, integers);
    }
}
```

```text
ReverseTransferRejected.java:12: error: method transfer in class ReverseTransferRejected cannot be applied to given types;
        transfer(numbers, integers);
        ^
  required: List<? extends T>,List<? super T>
  found:    List<Number>,List<Integer>
  reason: inference variable T has incompatible bounds
    upper bounds: Integer,Object
    lower bounds: Number
  where T is a type-variable:
    T extends Object declared in method <T>transfer(List<? extends T>,List<? super T>)
1 error
```

The `transfer` method itself did not change; what changed is the *call*: now `numbers` (a `List<Number>`, which genuinely contains a `2.5`) is passed as the producer, and `integers` (a `List<Integer>`) is passed as the consumer. The compiler's error message spells out exactly why this cannot type-check: it would need `T` to simultaneously be a supertype of `Number` (from the producer side) and a subtype of `Integer` (from the consumer side) — two constraints with no type that satisfies both. And this is not the compiler being overly cautious: if this call had somehow been allowed, `destination.addAll(source)` would try to insert `1`, `2.5`, and `3` into a `List<Integer>`, and that `2.5` would corrupt it exactly as `InvarianceRejected` and `ExtendsAddRejected` warned against. The compiler error, though dense, is directly reporting that no safe assignment of `T` exists for this particular call — which is exactly correct, because none does.

## Wildcard capture: naming an unknown type locally

A wildcard like `?` deliberately hides its actual type from the *caller's* perspective — but sometimes an algorithm's own internal logic genuinely needs to refer to "whatever that hidden type is" consistently across several steps, such as reading one element out and writing it back to a different position. A private generic helper method lets you give that hidden type a real name, a technique called **wildcard capture**:

```java
import java.util.Arrays;
import java.util.List;

public class WildcardCapture {
    static <T> void swapHelper(List<T> list, int i, int j) {
        T temp = list.get(i);
        list.set(i, list.get(j));
        list.set(j, temp);
    }

    static void swap(List<?> list, int i, int j) {
        swapHelper(list, i, j);
    }

    public static void main(String[] args) {
        List<String> names = Arrays.asList("Amina", "Karim", "Lina");
        System.out.println("before: " + names);
        swap(names, 0, 2);
        System.out.println("after:  " + names);
    }
}
```

Output:

```text
before: [Amina, Karim, Lina]
after:  [Lina, Karim, Amina]
```

The public-facing `swap(List<?> list, ...)` signature is exactly what a caller should see: "I can swap two elements in a list of any type; I don't care what that type is." But swapping genuinely requires a **consistent** type for the temporary variable that holds one element while the other is moved into its place — `list.set(i, someValue)` needs `someValue` to actually be the wildcard's real (if hidden) element type, not just `Object`. `swapHelper<T>` captures that hidden type as a real, nameable type parameter `T` for the duration of its own body, letting the temporary variable and both `set` calls agree on one consistent type — something the outer method's bare `?` could never express by itself, since a fresh `?` at each use site is not guaranteed to mean the same type twice.

## What happens under the hood

Every one of this lesson's rules exists to prevent exactly one category of runtime failure: a `ClassCastException` occurring somewhere far from wherever the actual type mismatch was introduced, precisely as you saw play out concretely in the previous lesson's raw-type example and in this lesson's `InvarianceRejected` walkthrough. Invariance closes the most direct route to that corruption (treating a `List<Integer>` as if it were a `List<Number>`); `? extends T` and `? super T` reopen useful flexibility while each still forbidding exactly the one unsafe direction (writing into a producer, or trusting a specific type read out of a consumer) that could reintroduce the same corruption; and wildcard capture is simply a way to give the compiler's own internal, unnamed "some specific type" a real name when an algorithm's logic genuinely needs to refer to it consistently across more than one step.

## Common mistakes

**1. Expecting `List<Integer>` to be usable wherever `List<Number>` is expected.** Generics are invariant; use `List<? extends Number>` for a parameter that only needs to be read.

**2. Trying to add to a `List<? extends T>` parameter.** The compiler correctly refuses this, because the list's real element type could be any subtype of `T`, and an arbitrary `T` value might not fit it.

**3. Expecting to read a precise type back out of a `List<? super T>` parameter.** Only `Object` is guaranteed; the list's real type could be `T`, or any of its supertypes.

**4. Swapping producer and consumer bounds in a PECS-shaped method.** The compiler will reject calls that genuinely need the correct direction, exactly as `ReverseTransferRejected` demonstrates, and the resulting error message describes the exact type conflict.

**5. Trying to write algorithm logic that needs a consistent type directly against a `List<?>` parameter**, instead of delegating to a private generic helper method that captures the wildcard as a real type parameter.

## Best practices

- Before choosing a wildcard, ask whether a parameter only produces values you read (use `extends`), only consumes values you supply (use `super`), or genuinely needs both (keep it a plain, unbounded type parameter with no wildcard at all).
- Say "producer extends, consumer super" to yourself while designing any generic method's parameters; it resolves the great majority of wildcard-direction confusion immediately.
- Never fight the compiler's rejection of an unsafe write into a `? extends T` parameter or an unsafe read from a `? super T` parameter — the rejection is protecting you from the exact corruption this lesson demonstrated concretely.
- Reach for a private generic helper method the moment an algorithm working with a `?`-typed parameter needs to treat two values as the same, currently-unknown type.
- Remember that a read-only wildcard promise (`? extends T`) says nothing about whether the underlying collection can be mutated by someone else entirely — it only restricts what *this* method may do to it.

## Summary

- Java generics are invariant: `List<A>` and `List<B>` share no subtype relationship even when `A` is a subtype of `B`, which prevents inserting an incompatible value through a supertype-typed alias.
- `List<? extends T>` (a producer) is safe to read from as `T`, but unsafe to write into, because its real element type could be any subtype of `T`.
- `List<? super T>` (a consumer) is safe to write `T` values into, but only readable back as `Object`, because its real element type could be any supertype of `T`.
- PECS — producer extends, consumer super — is the rule for choosing correctly between the two wildcards in a generic method's parameters.
- Reversing PECS's directions produces a method that the compiler correctly refuses to call the "wrong way," because no single type can satisfy both directions' constraints at once.
- Wildcard capture, via a private generic helper method, lets an algorithm refer to a wildcard's real, currently-unknown type consistently across multiple steps within one call.

## Practice

Warm-up:

1. Write a method `static void printAll(List<? extends Object> values)` and explain, in a comment, why `? extends Object` here communicates almost the same thing as a plain `List<?>`.
2. Attempt to write `numbers.add(5)` inside a method parameter typed `List<? extends Integer> numbers`, and read the resulting compiler error.
3. Write `static void fillWithZero(List<? super Integer> list, int count)` that adds the value `0`, `count` times, and call it with both a `List<Integer>` and a `List<Number>`.

Core:

1. Write a generic method `static <T> boolean containsAny(List<? extends T> values, List<? extends T> targets)` that returns true if any element of `values` also appears in `targets`, and explain why both parameters are correctly bounded with `extends` rather than `super`.
2. Reproduce `ReverseTransferRejected`'s scenario with a method and call of your own design (not the identical `transfer` method), and write a short explanation, in your own words, of what the resulting compiler error is telling you.
3. Write a private generic helper method that reverses a `List<?>` in place (swapping from both ends toward the middle), following the same wildcard-capture pattern as `WildcardCapture.swapHelper`.

Challenge:

1. Design a generic method `static <T> void copyInto(List<? extends T> source, List<? super T> destination, int limit)` that copies at most `limit` elements, applying PECS correctly, and demonstrate it working with several different, correctly-related producer and consumer type combinations.
2. Explain, in writing, why a hypothetical `Stack<T>` class's `pushAll(Iterable<? extends T> items)` method should use `extends`, while its `popAllInto(Collection<? super T> destination)` method should use `super`, referencing PECS explicitly in your explanation, then implement both methods for a simple `Stack<T>` you design.

## Check your understanding

1. Why does the assignment `List<Number> asNumbers = someListOfInteger;` fail to compile, and what specific corruption would become possible if it were allowed?
2. What can you safely do with a `List<? extends Number>` parameter, and what does the compiler forbid you from doing with it?
3. What can you safely do with a `List<? super Integer>` parameter, and what is the most specific type you can read an element back out as?
4. State the PECS rule in your own words, and explain which wildcard goes with "producer" and which goes with "consumer."
5. A method declared `<T> void transfer(List<? extends T> source, List<? super T> destination)` is called with the source and destination arguments swapped relative to their intended roles. What does the compiler report, and why is that rejection correct rather than overly strict?
6. When does an algorithm need wildcard capture (a private generic helper method) instead of working directly against a `List<?>` parameter?
