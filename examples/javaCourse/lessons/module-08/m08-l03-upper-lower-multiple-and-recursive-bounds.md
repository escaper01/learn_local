# Upper, lower, multiple, and recursive bounds

A generic method that only ever assigns, returns, and stores values of type `T` can be written with no restrictions on `T` at all — any reference type works. But the moment your algorithm needs to *do* something with those values — compare them, add them, call a specific method on them — an unrestricted `T` is not enough, because all the compiler knows about a bare `T` is that it is some reference type, with none of `Object`'s more specific siblings' methods available. A **bound** tells the compiler which operations `T` is guaranteed to support, by requiring `T` to extend a particular class or implement a particular interface.

This lesson works through the bound every Java developer meets constantly — `Comparable` — including a subtlety in exactly how it should be written, then extends to multiple bounds combined with `&`, and closes with the judgment call between building the comparison logic into a bound versus accepting a separate `Comparator` parameter instead.

What you will learn:

- Why an unbounded type parameter cannot call `compareTo`, and the exact compiler error that results
- How an upper bound (`T extends SomeType`) grants access to that type's methods
- The self-referential bound `T extends Comparable<? super T>`, and why it is more flexible than the simpler `T extends Comparable<T>`
- Why `T extends Number` alone still does not grant `compareTo`, since `Number` itself declares no such method
- Multiple bounds with `&`, and the rule that a class bound must come before any interface bounds
- When to design a method around a `Comparable` bound versus accepting an explicit `Comparator` parameter instead

## Why an unbounded type parameter has no useful methods

A bare, unbounded `T` gives the compiler exactly one guarantee: `T` is some reference type, meaning only `Object`'s methods (`equals`, `hashCode`, `toString`, and a few others) are available on it. Nothing else compiles:

```java
public class NoBoundRejected {
    static <T> T larger(T a, T b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    public static void main(String[] args) {
        System.out.println("compiling this file should fail");
    }
}
```

```text
NoBoundRejected.java:3: error: cannot find symbol
        return a.compareTo(b) >= 0 ? a : b;
                ^
  symbol:   method compareTo(T)
  location: variable a of type T
  where T is a type-variable:
    T extends Object declared in method <T>larger(T,T)
1 error
```

The error message is precise: it tells you `T` is (implicitly) declared as `T extends Object`, and `Object` has no `compareTo` method, so the compiler has no basis to allow the call. This is not a limitation to work around with a cast — it is the compiler correctly refusing to assume something about `T` that is not actually guaranteed for every possible reference type you might substitute in.

## The upper bound: T extends Comparable

An **upper bound** restricts `T` to a specific type or one of its subtypes, in exchange for guaranteeing access to that type's methods. The idiomatic bound for "supports comparison" is `T extends Comparable<? super T>`:

```java
public class ComparableBound {
    static <T extends Comparable<? super T>> T larger(T a, T b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    record Money(long cents) implements Comparable<Money> {
        public int compareTo(Money other) {
            return Long.compare(cents, other.cents);
        }
    }

    public static void main(String[] args) {
        System.out.println("larger(3, 7): " + larger(3, 7));
        System.out.println("larger(\"pear\", \"apple\"): " + larger("pear", "apple"));
        System.out.println("larger money: " + larger(new Money(500), new Money(300)));
    }
}
```

Output:

```text
larger(3, 7): 7
larger("pear", "apple"): pear
larger money: Money[cents=500]
```

`T extends Comparable<? super T>` now guarantees that any `T` you substitute in has a `compareTo` method that accepts (at least) another `T`, so `a.compareTo(b)` compiles and works for `Integer`, `String`, and the custom `Money` record equally, with zero casts anywhere. `Integer implements Comparable<Integer>`, `String implements Comparable<String>`, and `Money` implements it explicitly above — the bound accepts all three uniformly, because each one genuinely satisfies "supports comparison with (at least) its own type."

### Why the ? super T matters, not just T extends Comparable<T>

You will often see the simpler `T extends Comparable<T>` written instead, and for many everyday types it works identically. But `T extends Comparable<? super T>` is strictly more flexible, and the difference matters the moment a class implements `Comparable` for one of its own *supertypes* rather than for itself exactly. Imagine a `Money` subclass, `DiscountedMoney`, that does not redeclare its own `compareTo` and instead relies on inheriting `Comparable<Money>` from its parent — with the plain `T extends Comparable<T>` bound, `DiscountedMoney` would need `Comparable<DiscountedMoney>` specifically to qualify, which it does not have; `Comparable<? super T>` correctly accepts `Comparable<Money>` (a supertype of `DiscountedMoney`) as sufficient, since a `DiscountedMoney` can always be compared using logic written for `Money`. This is precisely the same producer-style reasoning from the previous lesson's PECS rule, applied to a bound instead of a method parameter — which is exactly why the wildcard appears here at all: `Comparable<? super T>` is read from (you call `compareTo` on values it supplies), not written into.

### Why Number alone is not enough

A very common instinct is to reach for `T extends Number` when a generic method needs to compare numeric values, since every number type feels like it should be comparable. It is not, on its own:

```java
public class NumberNoCompareRejected {
    static <T extends Number> T larger(T a, T b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    public static void main(String[] args) {
        System.out.println("compiling this file should fail");
    }
}
```

```text
NumberNoCompareRejected.java:3: error: cannot find symbol
        return a.compareTo(b) >= 0 ? a : b;
                ^
  symbol:   method compareTo(T)
  location: variable a of type T
  where T is a type-variable:
    T extends Number declared in method <T>larger(T,T)
1 error
```

The abstract class `Number` itself declares only numeric-conversion methods (`intValue()`, `doubleValue()`, and similarly named ones) — it does **not** declare `compareTo`. Each concrete subclass such as `Integer` or `Double` separately implements `Comparable` on its own, but that fact is not visible through `Number`'s own declared contract. `T extends Number` correctly grants access to `doubleValue()` and its siblings, but nothing about comparison; if a bound needs both, it must ask for both, which brings us to combining bounds.

## Multiple bounds with &

A type parameter can require **more than one** bound at once, combined with `&`: `T extends Number & Comparable<T>` requires `T` to be both a subtype of `Number` *and* to implement `Comparable<T>`, granting access to both sets of methods simultaneously.

```java
public class MultipleBounds {
    static <T extends Number & Comparable<T>> T max(T a, T b) {
        T bigger = a.compareTo(b) >= 0 ? a : b;
        System.out.println("  comparing as numbers too: " + a.doubleValue() + " vs " + b.doubleValue());
        return bigger;
    }

    public static void main(String[] args) {
        System.out.println("max(3, 7) = " + max(3, 7));
        System.out.println("max(2.5, 1.5) = " + max(2.5, 1.5));
    }
}
```

Output:

```text
  comparing as numbers too: 3.0 vs 7.0
max(3, 7) = 7
  comparing as numbers too: 2.5 vs 1.5
max(2.5, 1.5) = 2.5
```

Both `a.compareTo(b)` (from the `Comparable<T>` bound) and `a.doubleValue()` (from the `Number` bound) compile inside the same method, because the combined bound grants both sets of guarantees at once. There is exactly one syntax rule to remember: **if one of the bounds is a class (like `Number`), it must be listed first**; every bound after the first must be an interface. `T extends Comparable<T> & Number` would not compile — `Number`, being a class, has to come before any interface bounds in the `&`-joined list.

## Applying a bound to a whole list, or accepting a Comparator instead

The same bound generalizes naturally from comparing two values to finding the largest across an entire list — and, alongside it, there is often a genuinely better alternative: accepting an explicit `Comparator<? super T>` parameter instead of requiring `Comparable` at all.

```java
import java.util.Comparator;
import java.util.List;

public class MaxOfList {
    static <T extends Comparable<? super T>> T max(List<T> values) {
        if (values.isEmpty()) {
            throw new java.util.NoSuchElementException("cannot find max of an empty list");
        }
        T best = values.get(0);
        for (T value : values) {
            if (value.compareTo(best) > 0) {
                best = value;
            }
        }
        return best;
    }

    static <T> T maxBy(List<T> values, Comparator<? super T> comparator) {
        if (values.isEmpty()) {
            throw new java.util.NoSuchElementException("cannot find max of an empty list");
        }
        T best = values.get(0);
        for (T value : values) {
            if (comparator.compare(value, best) > 0) {
                best = value;
            }
        }
        return best;
    }

    record Person(String name, int age) {}

    public static void main(String[] args) {
        System.out.println("max of ints: " + max(List.of(3, 7, 2, 9, 4)));
        System.out.println("max of words: " + max(List.of("pear", "apple", "banana")));

        List<Person> people = List.of(new Person("Amina", 34), new Person("Karim", 28), new Person("Lina", 41));
        Person oldest = maxBy(people, Comparator.comparingInt(Person::age));
        System.out.println("oldest by comparator: " + oldest);

        Person longestName = maxBy(people, Comparator.comparingInt(p -> p.name().length()));
        System.out.println("longest name by comparator: " + longestName);

        try {
            max(List.<Integer>of());
        } catch (java.util.NoSuchElementException e) {
            System.out.println("empty list rejected: " + e.getMessage());
        }
    }
}
```

Output:

```text
max of ints: 9
max of words: pear
oldest by comparator: Person[name=Lina, age=41]
longest name by comparator: Person[name=Amina, age=34]
empty list rejected: cannot find max of an empty list
```

`max(List<T>)` works for any type with a single, "natural" ordering baked into it, such as numeric or alphabetical order for `Integer` and `String`. But `Person` has no single natural ordering — sometimes you want the oldest, sometimes the one with the longest name — so forcing `Person` to implement `Comparable` would only ever capture *one* of those orderings as "the" natural one, awkwardly. `maxBy(List<T>, Comparator<? super T>)` sidesteps the question entirely: it needs no bound on `T` at all, because the ordering logic is supplied separately, as data, letting one method support arbitrarily many different orderings for the same type. `Comparator.comparingInt(Person::age)` and `Comparator.comparingInt(p -> p.name().length())` are two completely different orderings for the exact same `Person` type, each expressed as its own small, explicit comparator (method references and lambda expressions like these are covered fully in Chapter 13).

Both methods explicitly reject an empty list with a specific, named exception rather than an accidental crash or a misleading default — the same explicit-contract discipline this chapter's earlier lessons have applied consistently to every edge case.

## What happens under the hood

A bound is purely a compile-time promise, checked once, at every call site, before generics erase away at compilation (a topic the next lesson covers in full): `T extends Comparable<? super T>` does not change how `compareTo` is invoked at run time, it only lets the compiler *prove*, ahead of time, that the call is guaranteed to be valid for every type that could ever be substituted for `T`. This is exactly why an unbounded `T` cannot call `compareTo` even though the *actual* value passed in at run time might well happen to implement `Comparable` — the compiler will not take that risk based on one particular call site; it demands the guarantee be written into the type parameter's own declaration, so it holds for every possible caller, not just the ones you happened to test.

## Common mistakes

**1. Assuming a bare, unbounded `T` supports comparison, arithmetic, or any method beyond `Object`'s.** Only a bound grants access to a more specific type's methods.

**2. Reaching for `T extends Number` when a bound needs comparison.** `Number` itself declares no `compareTo`; you need `Comparable` (or `Comparable` combined with `Number` via `&`) explicitly.

**3. Writing `T extends Comparable<T>` when `T extends Comparable<? super T>` would be more broadly reusable**, particularly whenever inheritance is involved in the types you expect callers to substitute.

**4. Placing an interface bound before a class bound in a multiple-bound declaration.** `T extends Comparable<T> & Number` is invalid syntax; the class bound must come first.

**5. Forcing a type to implement `Comparable` for a single "natural" ordering when the real need is several different orderings.** A `Comparator` parameter, supplied separately per call, is the better tool whenever more than one ordering matters.

## Best practices

- Add exactly the bound your algorithm's operations require — no more, no less — reflecting what the algorithm actually needs, not every interface the types you have tested happen to implement.
- Prefer `T extends Comparable<? super T>` over the narrower `T extends Comparable<T>` for broadly reusable generic methods.
- Combine bounds with `&` when a method genuinely needs operations from more than one type or interface, remembering the class-first ordering rule.
- Reach for an explicit `Comparator<? super T>` parameter instead of a `Comparable` bound whenever a type has no single obvious natural ordering, or when callers might reasonably want several different orderings.
- When a compiler error names a missing method on a type variable, read exactly which bound the type variable currently has (the error states it) before adding a broader bound than the method actually needs.

## Summary

- An unbounded type parameter `T` supports only `Object`'s methods; calling anything more specific requires a bound.
- `T extends SomeType` grants access to `SomeType`'s methods, restricting substitutions for `T` to `SomeType` or its subtypes.
- `T extends Comparable<? super T>` is the idiomatic, broadly reusable bound for "supports comparison," more flexible than the narrower `T extends Comparable<T>`.
- `Number` alone does not provide `compareTo`; a bound needing both numeric conversion and comparison must combine both with `&`, class bound first.
- A `Comparator<? super T>` parameter, rather than a `Comparable` bound, is the better design whenever a type has no single natural ordering or callers need multiple different orderings.

## Practice

Warm-up:

1. Write a generic method `static <T extends Comparable<? super T>> T min(T a, T b)` and test it with two `Integer` values and two `String` values.
2. Attempt to write a generic method that calls `.length()` on a bare, unbounded `T`, and read the resulting compiler error to see exactly what it tells you.
3. Add a bound to that method so `.length()` compiles, and explain in a comment which interface or class you chose and why.

Core:

1. Write a record `Temperature(double celsius) implements Comparable<Temperature>` with a `compareTo` implementation, and use it with your `min` method from the warm-up without any changes to `min` itself.
2. Write a generic method `static <T extends Number & Comparable<T>> boolean isBetween(T value, T lower, T upper)` that checks whether `value` falls within an inclusive range, using both the numeric and comparison capabilities the combined bound provides.
3. Design a `Book` class with `title`, `author`, and `pageCount` fields (no natural ordering), and write two separate `Comparator<Book>` instances — one by title, one by page count — then use both with a `maxBy`-style method.

Challenge:

1. Write a generic method `static <T extends Comparable<? super T>> List<T> sortedCopy(List<T> values)` that returns a new, sorted list without modifying the original (recall Chapter 4's defensive-copying discipline), implementing the sort yourself with any algorithm from Chapter 10 you are comfortable with, or a simple insertion sort.
2. Design a small generic `Range<T extends Comparable<? super T>>` class with `min` and `max` fields, a compact-constructor-style validation that rejects `min > max` (referencing Chapter 6's record validation pattern), and a method `contains(T value)` using the bound's comparison capability.

## Check your understanding

1. Why does calling `a.compareTo(b)` fail to compile for a bare, unbounded type parameter `T`, even if every type you personally plan to use it with actually has a `compareTo` method?
2. What specifically does `T extends Comparable<? super T>` guarantee that a bare `T` does not?
3. Why does `T extends Number` alone not grant access to a `compareTo` method?
4. What is the syntax rule for combining a class bound and an interface bound with `&` on the same type parameter?
5. When should a generic method accept a `Comparator<? super T>` parameter instead of requiring `T` to satisfy a `Comparable` bound?
6. In what specific situation does `T extends Comparable<? super T>` accept a type that `T extends Comparable<T>` would reject?
