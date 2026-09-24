# Records, canonical constructors, and shallow immutability

A `Point` with an `x` and a `y`. A `Range` with a `min` and a `max`. A `Team` with a `name` and a list of `members`. These are all the same shape of problem: a small bundle of named values that, together, *are* the thing — two points with the same coordinates are the same point, not merely two points that happen to agree. Before Java 16, giving this shape proper `equals`, `hashCode`, and `toString` methods meant writing (or generating) a page of repetitive, easy-to-get-subtly-wrong boilerplate for every single one.

A `record` writes all of that for you, correctly, from a one-line declaration. This lesson shows exactly what a record generates, how to add validation with a compact canonical constructor, and — critically — the one guarantee records do **not** give you for free: true, deep immutability the moment a mutable type like a `List` or an array is one of the components.

What you will learn:

- What a record declaration generates automatically: accessors, `equals`, `hashCode`, `toString`
- The canonical constructor, and the compact form for adding validation and normalization
- Why record accessors are named `value()`, not `getValue()`
- What "shallow immutability" means, and why a record holding a mutable component is not fully immutable by itself
- How to snapshot a mutable component with `List.copyOf` inside a compact constructor
- Why array components are usually a poor fit for records, because of how their `equals` behaves

## What a record declaration generates

A `record` declares its state as a list of typed **components**. From that one line, the compiler generates a private final field for each component, a public accessor method per component, a canonical (all-components) constructor, and correct `equals`, `hashCode`, and `toString` implementations, all based on every component's value.

```java
public class RecordBasics {
    record Point(int x, int y) {}

    public static void main(String[] args) {
        Point p1 = new Point(3, 4);
        Point p2 = new Point(3, 4);
        Point p3 = new Point(5, 6);

        System.out.println("p1: " + p1);
        System.out.println("x=" + p1.x() + ", y=" + p1.y());

        System.out.println("p1.equals(p2): " + p1.equals(p2));
        System.out.println("p1 == p2: " + (p1 == p2));
        System.out.println("p1.equals(p3): " + p1.equals(p3));
        System.out.println("p1.hashCode() == p2.hashCode(): " + (p1.hashCode() == p2.hashCode()));

        java.util.Set<Point> points = new java.util.HashSet<>();
        points.add(p1);
        points.add(p2);
        points.add(p3);
        System.out.println("set size after adding p1, p2 (duplicate), p3: " + points.size());
    }
}
```

Output:

```text
p1: Point[x=3, y=4]
x=3, y=4
p1.equals(p2): true
p1 == p2: false
p1.equals(p3): false
p1.hashCode() == p2.hashCode(): true
set size after adding p1, p2 (duplicate), p3: 2
```

Every guarantee here comes free, with zero code beyond the one-line declaration: `toString()` prints a readable, self-labeling form (`Point[x=3, y=4]`); `equals` compares every component's value, so `p1.equals(p2)` is `true` even though `p1 == p2` is `false` — two genuinely separate objects that are considered equal because their content matches, exactly the `equals`-versus-`==` distinction from Chapter 4; and `hashCode` is consistent with `equals`, meaning equal records always produce the same hash code, which is precisely why a `HashSet` correctly recognizes `p2` as a duplicate of `p1` and keeps the set's size at 2 rather than 3 (Chapter 9 covers `HashSet` and hash codes in full).

Notice the accessor is `p1.x()`, not `p1.getX()`. Records deliberately break from the older JavaBean getter convention, because a record's accessor is not "an operation performed on an object" in the traditional sense — it is just *reading the component itself*, so it is named exactly like the component, as a plain, concise method call.

## The canonical constructor and its compact form

The constructor that accepts every component, in declared order, is called the **canonical constructor**; the compiler generates a plain version of it automatically. You can instead write your own **compact constructor** — a special, abbreviated syntax with no parameter list and no explicit assignment — to validate or normalize the incoming values before the (still automatic) field assignment happens:

```java
public class CompactConstructor {
    record TaskName(String value) {
        TaskName {
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("name required");
            }
            value = value.trim();
        }
    }

    public static void main(String[] args) {
        TaskName a = new TaskName(" Build ");
        TaskName b = new TaskName("Build");
        System.out.println("a: [" + a.value() + "]");
        System.out.println("a.equals(b): " + a.equals(b));

        try {
            new TaskName("   ");
        } catch (IllegalArgumentException e) {
            System.out.println("blank rejected: " + e.getMessage());
        }

        try {
            new TaskName(null);
        } catch (IllegalArgumentException e) {
            System.out.println("null rejected: " + e.getMessage());
        }
    }
}
```

Output:

```text
a: [Build]
a.equals(b): true
blank rejected: name required
null rejected: name required
```

Notice the syntax: `TaskName { ... }` has no parameter list at all — the compact constructor implicitly receives the same parameters as the canonical constructor (named exactly like the components), and any reassignment you make to a parameter (`value = value.trim();`) is what actually gets stored into the field once the compact constructor's body finishes; you never write the assignment yourself. This is the exact same short-circuit null-safety pattern from Chapter 2: `value == null || value.isBlank()` checks for `null` *first*, so `isBlank()` is never called on a `null` reference, which is why passing `null` correctly reports "name required" instead of crashing with an unrelated `NullPointerException`.

The result is a record that has validated and normalized its own state the instant it is constructed, and — because there is no way to construct a `TaskName` except through this constructor, and no setters exist at all — every `TaskName` object that exists anywhere in the program is guaranteed to hold a non-blank, trimmed value for its entire lifetime.

## Shallow immutability: the guarantee records do not make

A record's fields are `final`, and there are no setters — so is a record automatically, completely immutable? Only **shallowly**. `final` guarantees the component's *reference* cannot be reassigned after construction, exactly as you learned for `final` array variables in Chapter 4. It says nothing at all about whether the object that reference points to can itself be mutated by someone else who also holds a reference to it.

```java
import java.util.ArrayList;
import java.util.List;

public class ShallowImmutability {
    record Team(String name, List<String> members) {}

    public static void main(String[] args) {
        List<String> input = new ArrayList<>();
        input.add("Amina");
        input.add("Karim");

        Team team = new Team("Falcons", input);
        System.out.println("before mutation: " + team);

        input.add("Lina");
        System.out.println("after mutating the original list: " + team);

        team.members().add("Sneaky");
        System.out.println("after mutating through the accessor: " + team);
    }
}
```

Output:

```text
before mutation: Team[name=Falcons, members=[Amina, Karim]]
after mutating the original list: Team[name=Falcons, members=[Amina, Karim, Lina]]
after mutating through the accessor: Team[name=Falcons, members=[Amina, Karim, Lina, Sneaky]]
```

This is **exactly** the `LeakyRoster` bug from Chapter 4, Lesson 5, wearing a record's clothing. The generated canonical constructor stores whatever `List` reference it was handed **directly**, with no copying, and the generated accessor `members()` hands that same internal reference straight back out. So the record's field is genuinely `final` — you could never write `team.members = somethingElse;` — and yet the *content* the field points to was mutated twice, from two different directions, without the record's own code ever running a single line to do it. `record` gives you correct `equals`/`hashCode`/`toString` for free; it does **not** automatically give you defensive copying, because the compiler cannot know, for an arbitrary component type, whether copying is even meaningful or how to do it.

The chapter's concept-check question is precisely this distinction: a record with a mutable `List` component guarantees only that *the component reference itself* cannot be reassigned — not that the list's elements are frozen, and certainly not that some deep, recursive immutability applies to every object reachable from the record.

## Fixing it: snapshotting inside the compact constructor

The fix is the identical technique from Chapter 4: defensive copying, written inside the compact constructor so it runs for every possible way a `Team` can be constructed.

```java
import java.util.ArrayList;
import java.util.List;

public class SnapshotTeam {
    record Team(String name, List<String> members) {
        Team {
            members = List.copyOf(members);
        }
    }

    public static void main(String[] args) {
        List<String> input = new ArrayList<>();
        input.add("Amina");
        input.add("Karim");

        Team team = new Team("Falcons", input);
        System.out.println("before mutation: " + team);

        input.add("Lina");
        System.out.println("after mutating the original list: " + team);

        try {
            team.members().add("Sneaky");
        } catch (UnsupportedOperationException e) {
            System.out.println("mutation through accessor rejected: " + e.getClass().getSimpleName());
        }
    }
}
```

Output:

```text
before mutation: Team[name=Falcons, members=[Amina, Karim]]
after mutating the original list: Team[name=Falcons, members=[Amina, Karim]]
mutation through accessor rejected: UnsupportedOperationException
```

`List.copyOf(members)` (covered fully as part of Chapter 9's collections material) does two things at once: it copies the elements into a brand-new list, completely disconnected from whatever list the caller passed in, **and** that new list is itself unmodifiable, so even calling `.add(...)` on the value returned by the accessor now fails loudly with `UnsupportedOperationException` instead of silently succeeding. This single line closes both directions of the leak simultaneously — the constructor no longer aliases the caller's list, and the accessor can no longer be used to sneak a mutation back in — which is a meaningfully stronger guarantee than the two-separate-`clone()`-calls approach Chapter 4 used for a plain array-holding class, precisely because `List.copyOf`'s result actively refuses further mutation rather than merely being a fresh, independently-mutable copy.

## A cautionary case: array components

Not every mutable type is this easy to protect, and arrays specifically have an additional, sharper problem beyond aliasing: `Object`'s default `equals` and `hashCode` — which arrays inherit and do not override — compare by identity, not by content, exactly as you saw in Chapter 4.

```java
import java.util.Arrays;

public class ArrayComponent {
    record Row(int[] values) {}

    public static void main(String[] args) {
        Row r1 = new Row(new int[] {1, 2, 3});
        Row r2 = new Row(new int[] {1, 2, 3});

        System.out.println("r1: " + r1);
        System.out.println("r1.equals(r2) with identical content: " + r1.equals(r2));
        System.out.println("Arrays.equals(r1.values(), r2.values()): " + Arrays.equals(r1.values(), r2.values()));
        System.out.println("r1.values() == r2.values(): " + (r1.values() == r2.values()));
    }
}
```

Output:

```text
r1: Row[values=[I@6f3b5d16]
r1.equals(r2) with identical content: false
Arrays.equals(r1.values(), r2.values()): true
r1.values() == r2.values(): false
```

Two genuinely serious problems appear at once. First, `toString()` prints the same unreadable `[I@...` reference text Chapter 4 warned you about — a record's generated `toString` calls each component's own `toString`, and an array's default `toString` was never designed to show its elements. Second, and far more dangerous: `r1.equals(r2)` is `false` even though both arrays hold identical content, because the record's generated `equals` compares each component using that component's own `equals` method, and an array's inherited `equals` is reference (identity) comparison — precisely as unreliable here as it was for two separately-built `String` objects, but with no way to override it since you cannot change how arrays implement `equals`. A record built around an array component silently fails to behave like a proper value type at all, for the exact property records exist to provide.

For exactly this reason, prefer `List<T>` (defensively copied with `List.copyOf`, as `SnapshotTeam` demonstrates) over a plain array whenever a record needs to hold a sequence of values, unless you have a specific, deliberate reason to accept identity-based equality for that component.

## Extra methods, static factories, and validation logic

A record can declare additional instance methods, static methods, and static fields, exactly like an ordinary class — the compact constructor is only *one* place validation can live, and static factory methods are a common companion:

```java
public class RecordExtras {
    record Range(int min, int max) {
        Range {
            if (min > max) {
                throw new IllegalArgumentException("min " + min + " must not exceed max " + max);
            }
        }

        int span() {
            return max - min;
        }

        static Range of(int a, int b) {
            return new Range(Math.min(a, b), Math.max(a, b));
        }
    }

    public static void main(String[] args) {
        Range r = new Range(3, 10);
        System.out.println(r + ", span=" + r.span());

        Range reordered = Range.of(10, 3);
        System.out.println("Range.of(10, 3) -> " + reordered);

        try {
            new Range(10, 3);
        } catch (IllegalArgumentException e) {
            System.out.println("direct construction rejected: " + e.getMessage());
        }
    }
}
```

Output:

```text
Range[min=3, max=10], span=7
Range.of(10, 3) -> Range[min=3, max=10]
direct construction rejected: min 10 must not exceed max 3
```

`span()` is an ordinary instance method computed from the components, no different from any method you would write in a regular class. `Range.of` is a **static factory method** that accepts values in either order and normalizes them before delegating to the real constructor — but notice that the compact constructor's `min > max` check still runs on every path, including calls through `Range.of`, because `of` still ultimately calls `new Range(...)`. There is no way to bypass a compact constructor's validation once it is written; every single construction path funnels through it.

## What happens under the hood

Records are, in a real sense, `final` classes the compiler writes for you based on the component list — every record is implicitly `final` and cannot be extended, and it can implement interfaces but cannot extend another class (it implicitly extends `java.lang.Record`). This matters for the next lesson: because records cannot be subclassed, they satisfy, by construction, one of the requirements for being a permitted variant inside a sealed hierarchy. The compiler-generated `equals`, `hashCode`, and `toString` all operate the same mechanical way: iterate every declared component, using that component's own type's `equals`/`hashCode`/`toString`. That mechanical uniformity is exactly why an array component breaks the illusion — the record's logic is entirely correct and consistent, but arrays are simply the one common type whose own `equals` does not mean what you probably want it to mean.

## Common mistakes

**1. Assuming a record with any mutable component is automatically, fully immutable.** Only the component *references* are fixed; the objects they point to can still be mutated unless you explicitly defend against it.

**2. Forgetting to add a compact constructor for a mutable component type.** Without one, the canonical constructor stores whatever reference it receives verbatim, exactly like the un-fixed `LeakyRoster` from Chapter 4.

**3. Using an array as a record component when content-based equality matters.** The generated `equals` will compare arrays by identity, silently breaking the value semantics the record was written to provide.

**4. Calling the accessor `getX()` out of habit.** Record accessors are named exactly like their components (`x()`), not with the JavaBean `get` prefix.

**5. Believing validation in the compact constructor can be bypassed by a static factory method.** Every construction path funnels through the same canonical constructor; a factory method can only normalize inputs *before* handing them to it, never skip it.

## Best practices

- Reach for a `record` the moment a type's entire purpose is to bundle a fixed set of named values that define its identity — points, ranges, money amounts, DTOs, results.
- Add a compact constructor to validate invariants and to normalize input, exactly as you would in an ordinary class's constructor.
- Whenever a component's declared type is mutable (a `List`, a `Map`, a `Set`, an array, another mutable class), defensively snapshot it inside the compact constructor — `List.copyOf` is the standard idiom for list components.
- Avoid array components in records; prefer `List<T>` so both `equals` and `toString` behave correctly by default.
- Keep records free of unrelated behavior; if a type needs identity, mutable state over time, or complex lifecycle logic, it is very likely a better fit for the entity-style ordinary class covered later in this chapter, not a record.

## Summary

- A `record` declaration generates a private final field, a same-named accessor, a canonical constructor, and correct `equals`/`hashCode`/`toString` for every listed component, from one line of code.
- A compact constructor (written with no parameter list) lets you validate and normalize component values; any reassignment inside it becomes the value actually stored.
- Record immutability is **shallow**: a `final` reference to a mutable object (a `List`, an array) does not prevent that object's contents from being changed by anyone else who holds a reference to it.
- Defensively copying a mutable component inside the compact constructor — `List.copyOf(members)` — closes that hole for both the constructor and any accessor that returns it.
- Array components are a particularly poor fit for records because arrays inherit identity-based `equals`, silently breaking the value semantics a record exists to provide; prefer `List<T>` instead.

## Practice

Warm-up:

1. Declare `record Money(String currency, long cents)`. Create two instances with identical values and confirm `equals` returns `true` while `==` returns `false`.
2. Add a compact constructor to `Money` that rejects a negative `cents` value with `IllegalArgumentException`.
3. Print a `Money` instance directly and explain, in your own words, exactly which parts of the output the compiler generated for you and how.

Core:

1. Build a `Team` record (as in this lesson) but with a `Set<String>` component instead of a `List`, defensively copying with `Set.copyOf` in the compact constructor. Demonstrate that mutating the caller's original set afterward has no effect.
2. Write `record Interval(int start, int end)` whose compact constructor rejects `start > end`, plus an instance method `overlaps(Interval other)` that returns whether the two intervals share any point.
3. Take the `Row` record with an `int[]` component from this lesson and rewrite it as `record Row(List<Integer> values)` with a defensive copy, then demonstrate that `equals` now correctly returns `true` for two instances built from identical content.

Challenge:

1. Design `record Address(String street, String city, String postalCode)` with a compact constructor that trims every component and rejects any blank one, plus a static factory `Address.parse(String singleLine)` that splits a comma-separated line into the three components before delegating to the canonical constructor. Ensure invalid input is rejected the same way regardless of which entry point was used.
2. Build a small immutable `Inventory` record wrapping a `Map<String, Integer>` of item name to quantity, defensively copied with `Map.copyOf`, with a method `withAdded(String item, int quantity)` that returns a **new** `Inventory` reflecting the addition rather than mutating the existing one (look back at Chapter 4's immutable-design pattern for the shape of this method).

## Check your understanding

1. What exactly does a one-line `record Point(int x, int y) {}` declaration generate for you, without you writing anything else?
2. Why is a record's accessor for a component named `value()` rather than `getValue()`?
3. A record has a `List<String>` component with no compact constructor. Describe two independent ways its contents could be mutated from outside the record, without ever reassigning the component itself.
4. What does `List.copyOf(members)` provide that a plain `new ArrayList<>(members)` copy does not?
5. Why is an `int[]` component usually a poor choice for a record that needs correct, content-based `equals`?
6. A record's compact constructor throws for invalid input. Can a static factory method on that same record ever construct an instance that skips this validation? Why or why not?
