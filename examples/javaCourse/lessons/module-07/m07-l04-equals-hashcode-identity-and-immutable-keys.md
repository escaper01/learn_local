# equals, hashCode, identity, and immutable keys

Every `HashMap`, `HashSet`, `List.contains`, `List.indexOf`, cache, and deduplication step in Java depends on two methods inherited from `Object`: `equals` and `hashCode`. When they disagree, collections do not throw an exception. They quietly give wrong answers: a customer cannot be found, a duplicate order gets processed twice, a cache never hits. These are some of the most expensive bugs to track down because nothing crashes.

This lesson explains what the `Object` class gives every object, the difference between identity and equality, the exact contracts `equals` and `hashCode` must obey, and why keys in hash-based collections should be immutable.

## What you will learn

- The key methods of `java.lang.Object`: `toString`, `equals`, `hashCode`, `getClass`
- The difference between identity (`==`) and logical equality (`equals`)
- The five rules of the `equals` contract
- The `hashCode` contract, and the one rule that links it to `equals`
- How hash-based collections use both methods to find an element
- How to write correct `equals`, `hashCode`, and `toString` by hand, and when a record does it for you
- Why a mutable key can "disappear" from a `HashMap`

## The Object class: what every object inherits

Every class extends `java.lang.Object`, directly or indirectly. That gives every object a small toolkit:

| Method | What `Object`'s version does | When to override |
|---|---|---|
| `String toString()` | Class name + `@` + hex hash, for example `PlainPoint@1b6d3586` (the number varies) | Almost always, for logs and debugging |
| `boolean equals(Object o)` | `this == o`: true only for the very same object | When objects represent *values* (money, IDs, coordinates) |
| `int hashCode()` | A number derived from identity | **Always** whenever you override `equals` |
| `Class<?> getClass()` | The object's runtime class | Never (it is `final`) |

`Object` also declares `clone`, `finalize` (deprecated for removal), and the threading methods `wait`/`notify`/`notifyAll`, which you will meet later and rarely override.

## Identity versus equality

Two questions sound similar but are completely different:

- **Identity:** "Are these two references pointing at the *same object* in memory?" Checked with `==`.
- **Equality:** "Do these two objects represent the *same value*?" Checked with `equals`.

An analogy: two printed copies of the same book are *equal* (same content) but not *identical* (two physical objects). You and your reflection in a mirror refer to the identical person.

```java
public class IdentityVsEquality {
    public static void main(String[] args) {
        String a = new String("java");
        String b = new String("java");
        String c = a;

        System.out.println("a == b      : " + (a == b));       // different objects
        System.out.println("a.equals(b) : " + a.equals(b));    // same content
        System.out.println("a == c      : " + (a == c));       // same object

        PlainPoint p1 = new PlainPoint(1, 2);
        PlainPoint p2 = new PlainPoint(1, 2);
        System.out.println("PlainPoint equals (inherited from Object): " + p1.equals(p2));
        System.out.println("PlainPoint toString starts with class name: "
                + p1.toString().startsWith("PlainPoint@"));

        Point q1 = new Point(1, 2);
        Point q2 = new Point(1, 2);
        System.out.println("Point equals (overridden): " + q1.equals(q2));
        System.out.println("Point hash codes equal: " + (q1.hashCode() == q2.hashCode()));
        System.out.println("Point toString: " + q1);

        // Equal hash codes do NOT prove equality:
        System.out.println("\"Aa\".hashCode() = " + "Aa".hashCode());
        System.out.println("\"BB\".hashCode() = " + "BB".hashCode());
        System.out.println("\"Aa\".equals(\"BB\") = " + "Aa".equals("BB"));
    }
}

class PlainPoint {
    private final int x;
    private final int y;
    PlainPoint(int x, int y) { this.x = x; this.y = y; }
}

final class Point {
    private final int x;
    private final int y;

    Point(int x, int y) { this.x = x; this.y = y; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;                     // fast path: same object
        if (!(o instanceof Point other)) return false;  // also handles null
        return x == other.x && y == other.y;            // compare significant fields
    }

    @Override
    public int hashCode() {
        return 31 * Integer.hashCode(x) + Integer.hashCode(y);
    }

    @Override
    public String toString() {
        return "Point[x=" + x + ", y=" + y + "]";
    }
}
```

```text
a == b      : false
a.equals(b) : true
a == c      : true
PlainPoint equals (inherited from Object): false
PlainPoint toString starts with class name: true
Point equals (overridden): true
Point hash codes equal: true
Point toString: Point[x=1, y=2]
"Aa".hashCode() = 2112
"BB".hashCode() = 2112
"Aa".equals("BB") = false
```

`PlainPoint` inherited `Object.equals`, which is just `==`, so two points with identical coordinates were "not equal". `Point` overrides the trio correctly. The last three lines show a **collision**: two different strings with the same hash code. Collisions are legal and unavoidable, since there are far more possible strings than `int` values.

> **Warning:** Use `==` for primitives and for deliberate identity checks (and for enum constants). Use `equals` to compare the content of objects, especially `String`s. Comparing strings with `==` sometimes appears to work because of string literal pooling, which makes the bug even harder to spot.

## The equals contract

`Object.equals` documents a contract that every override must follow. For any non-null references `x`, `y`, `z`:

1. **Reflexive:** `x.equals(x)` is `true`.
2. **Symmetric:** `x.equals(y)` is `true` exactly when `y.equals(x)` is `true`.
3. **Transitive:** if `x.equals(y)` and `y.equals(z)`, then `x.equals(z)`.
4. **Consistent:** repeated calls give the same answer as long as the compared state does not change.
5. **Null:** `x.equals(null)` is `false` (never an exception).

Collections assume these rules. If symmetry fails, `list.contains(a)` and `otherList.contains(b)` can disagree about the same pair. If `equals(null)` throws, some lookups crash.

### Anatomy of a correct equals

```java
// Fragment: the standard shape
@Override
public boolean equals(Object o) {            // parameter MUST be Object
    if (this == o) return true;              // 1. same object: cheap success
    if (!(o instanceof Point other)) return false; // 2. wrong type or null
    return x == other.x && y == other.y;     // 3. compare significant fields
}
```

- Use `==` for primitive fields (for `double`/`float`, prefer `Double.compare(a, b) == 0` so that `NaN` and `-0.0` behave consistently).
- Use `equals` for object fields, or `Objects.equals(a, b)` when a field may be `null`.
- Compare only the fields that define the value. A cached display string or a lazily computed total should not participate.

## The hashCode contract

`hashCode` returns an `int` summary used to decide *where* an object is stored in a hash table. Its contract:

1. **Consistent:** repeated calls return the same value while the relevant state is unchanged (it may differ between program runs).
2. **Equal objects must have equal hash codes.** If `a.equals(b)` is true, then `a.hashCode() == b.hashCode()` must be true.
3. **Unequal objects may share a hash code.** Collisions are allowed; they only cost performance.

Rule 2 is the one that links the two methods, and it runs in one direction only:

| If you know... | Then you know... |
|---|---|
| `a.equals(b)` is true | the hash codes are equal (required) |
| the hash codes are equal | nothing certain: could be a collision |
| the hash codes differ | `a.equals(b)` must be false |
| `a.equals(b)` is false | nothing certain about hash codes |

Also note: equal objects need not be the same object. Two equal values are usually two separate objects, so `==` tells you nothing about equality.

### How a HashSet actually finds an element

Picture a coat check with numbered hooks. When you hand in a coat, the attendant computes a hook number from your ticket and hangs it there. To retrieve it, they compute the number again and look only at that hook.

`HashSet.contains(x)` (and `HashMap.get(key)`) works the same way:

1. Compute `x.hashCode()` and turn it into a bucket index.
2. Go to that one bucket only.
3. Inside the bucket, compare candidates: first by hash value, then with `equals`.
4. Return true only if some candidate is `equals` to `x`.

If two equal objects produce different hash codes, step 2 sends the lookup to the wrong bucket, and `equals` is never even called. That is exactly what goes wrong below.

```java
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class HashingContract {
    public static void main(String[] args) {
        // 1) equals overridden, hashCode NOT overridden
        Set<HalfDone> broken = new HashSet<>();
        broken.add(new HalfDone("978-0134685991"));
        System.out.println("HalfDone equal? "
                + new HalfDone("978-0134685991").equals(new HalfDone("978-0134685991")));
        System.out.println("HalfDone found in HashSet? "
                + broken.contains(new HalfDone("978-0134685991")));

        // 2) equals and hashCode both overridden from the same fields
        Set<Isbn> ok = new HashSet<>();
        ok.add(new Isbn("978-0134685991"));
        ok.add(new Isbn("978-0134685991"));             // duplicate by value
        System.out.println("Isbn set size: " + ok.size());
        System.out.println("Isbn found in HashSet? " + ok.contains(new Isbn("978-0134685991")));

        Map<Isbn, String> titles = new HashMap<>();
        titles.put(new Isbn("978-0134685991"), "Effective Java");
        System.out.println("Lookup by an equal key: " + titles.get(new Isbn("978-0134685991")));
    }
}

final class HalfDone {
    private final String code;
    HalfDone(String code) { this.code = code; }

    @Override
    public boolean equals(Object o) {
        return o instanceof HalfDone other && code.equals(other.code);
    }
    // hashCode() inherited from Object: based on identity, not on code
}

final class Isbn {
    private final String code;

    Isbn(String code) {
        this.code = Objects.requireNonNull(code, "code");
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Isbn other && code.equals(other.code);
    }

    @Override
    public int hashCode() {
        return code.hashCode();          // derived from exactly the field equals uses
    }

    @Override
    public String toString() {
        return "Isbn[" + code + "]";
    }
}
```

```text
HalfDone equal? true
HalfDone found in HashSet? false
Isbn set size: 1
Isbn found in HashSet? true
Lookup by an equal key: Effective Java
```

`HalfDone` objects are equal but their identity-based hash codes differ, so the set looks in the wrong bucket. (In principle two identity hashes could coincide by chance, which is why this bug can even appear intermittent.) `Isbn` derives its hash from the same field `equals` compares, so equal ISBNs always land in the same bucket.

### Writing hashCode

- Use the same fields as `equals`, and no others. Using *fewer* fields is legal but causes more collisions; using a field that `equals` ignores breaks the contract.
- The simplest correct approach is `Objects.hash(field1, field2, ...)`. It handles `null` and is clear; it allocates a small array per call, which rarely matters.
- For a single field, use `Integer.hashCode(x)`, `Long.hashCode(x)`, `field.hashCode()`, or `Objects.hashCode(field)` (null-safe).
- For hand-written combinations, the conventional pattern is `result = 31 * result + fieldHash` for each field.

## Records: equality for free, with caveats

A `record` automatically gets `equals`, `hashCode`, and `toString` based on all of its components. For a type whose components truly *are* its value, this is the best option: shorter, and impossible to get out of sync when you add a component.

```java
// Fragment
record TaskId(long value) { }
var ids = new java.util.HashSet<TaskId>();
ids.add(new TaskId(7));
ids.add(new TaskId(7));
System.out.println(ids.size());   // 1
```

Caveats: records compare components with their own `equals`, so an **array** component is compared by identity, and a mutable `List` component can change after the record is used as a key. The program in the pitfalls section demonstrates the array case.

## Immutable keys and the mutable-key trap

A hash table computes an element's bucket **once**, when the element is inserted. If a field used by `hashCode` changes afterwards, the element is still stored in the old bucket, but every lookup now computes a new bucket.

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public class MutableKeyTrap {
    public static void main(String[] args) {
        Map<Seat, String> bookings = new HashMap<>();
        Seat seat = new Seat("A", 1);
        bookings.put(seat, "Ada");

        System.out.println("Before change, containsKey: " + bookings.containsKey(seat));

        seat.setRow("B");      // hash-relevant state changes AFTER insertion

        System.out.println("After change, containsKey:  " + bookings.containsKey(seat));
        System.out.println("get(seat):                  " + bookings.get(seat));
        System.out.println("Map size:                   " + bookings.size());
        for (Map.Entry<Seat, String> e : bookings.entrySet()) {
            System.out.println("Still inside when iterating: " + e.getKey() + " -> " + e.getValue());
        }

        // The safe design: an immutable key (a record here).
        Map<SeatId, String> safe = new HashMap<>();
        safe.put(new SeatId("A", 1), "Ada");
        System.out.println("Record key lookup: " + safe.get(new SeatId("A", 1)));
        System.out.println("Record toString:   " + new SeatId("A", 1));
    }
}

final class Seat {
    private String row;
    private final int number;

    Seat(String row, int number) { this.row = row; this.number = number; }

    void setRow(String row) { this.row = row; }

    @Override
    public boolean equals(Object o) {
        return o instanceof Seat s && row.equals(s.row) && number == s.number;
    }

    @Override
    public int hashCode() {
        return Objects.hash(row, number);
    }

    @Override
    public String toString() {
        return row + number;
    }
}

record SeatId(String row, int number) { }
```

```text
Before change, containsKey: true
After change, containsKey:  false
get(seat):                  null
Map size:                   1
Still inside when iterating: B1 -> Ada
Record key lookup: Ada
Record toString:   SeatId[row=A, number=1]
```

The entry is still in the map (size 1, visible when iterating) but unreachable by lookup, even when you look it up with *the very same object*. Removing and reinserting keys around every change is fragile. The professional fix is design: make key types immutable (final fields, no setters), and base equality on stable identifiers. For example, an `Account` should be equal by its account number, never by its balance, which changes all the time.

## Common mistakes

The following program demonstrates three classic mistakes in one run.

```java
import java.util.Arrays;
import java.util.List;

public class EqualsPitfalls {
    public static void main(String[] args) {
        // Pitfall 1: overloading equals instead of overriding it
        List<Coin> coins = List.of(new Coin(50));
        Coin fifty = new Coin(50);
        System.out.println("Direct call fifty.equals(Coin): " + fifty.equals(new Coin(50)));
        System.out.println("List.contains (uses equals(Object)): " + coins.contains(fifty));

        // Pitfall 2: records compare array components by reference
        Scores s1 = new Scores("Ada", new int[] {90, 80});
        Scores s2 = new Scores("Ada", new int[] {90, 80});
        System.out.println("Records with equal array contents equal? " + s1.equals(s2));
        System.out.println("Arrays.equals on the arrays: " + Arrays.equals(s1.values(), s2.values()));

        // Pitfall 3: equals across a hierarchy that adds a field
        Point2 p = new Point2(1, 2);
        ColorPoint cp = new ColorPoint(1, 2, "red");
        System.out.println("p.equals(cp): " + p.equals(cp));
        System.out.println("cp.equals(p): " + cp.equals(p));
    }
}

final class Coin {
    private final int cents;
    Coin(int cents) { this.cents = cents; }

    // WRONG: parameter type is Coin, so this is an OVERLOAD of equals, not an override
    public boolean equals(Coin other) {
        return other != null && cents == other.cents;
    }

    @Override
    public int hashCode() { return Integer.hashCode(cents); }
}

record Scores(String name, int[] values) { }

class Point2 {
    final int x, y;
    Point2(int x, int y) { this.x = x; this.y = y; }
    @Override public boolean equals(Object o) {
        return o instanceof Point2 p && x == p.x && y == p.y;
    }
    @Override public int hashCode() { return 31 * x + y; }
}

class ColorPoint extends Point2 {
    final String color;
    ColorPoint(int x, int y, String color) { super(x, y); this.color = color; }
    @Override public boolean equals(Object o) {
        return o instanceof ColorPoint cp && super.equals(cp) && color.equals(cp.color);
    }
    @Override public int hashCode() { return 31 * super.hashCode() + color.hashCode(); }
}
```

```text
Direct call fifty.equals(Coin): true
List.contains (uses equals(Object)): false
Records with equal array contents equal? false
Arrays.equals on the arrays: true
p.equals(cp): true
cp.equals(p): false
```

### 1. equals(Coin) instead of equals(Object)

Collections call `equals(Object)`, which `Coin` never overrode, so they fall back to identity. Fix: declare `public boolean equals(Object o)` and put `@Override` on it; the annotation would have turned this mistake into a compile error.

### 2. Arrays inside records or equals

Arrays inherit identity `equals`. Fix: use `List.copyOf(...)` for the component, or override `equals`/`hashCode` in the record using `Arrays.equals` and `Arrays.hashCode`.

### 3. Broken symmetry across a hierarchy

`p.equals(cp)` is true but `cp.equals(p)` is false, violating symmetry. There is no way to add a value field in a subclass and keep the `equals` contract with `instanceof`-based equality. Fix: prefer composition (a `ColorPoint` that *has* a `Point`), make value classes `final`, or use records, which cannot be extended.

### 4. Overriding equals but not hashCode

Shown earlier with `HalfDone`: equal objects, different buckets, failed lookups. Fix: whenever you override one, override both from the same fields.

### 5. Mutable fields in hash keys

Shown with `Seat`. Fix: immutable keys, stable identifiers.

## Best practices

- Override `equals`, `hashCode`, and `toString` together for value-like classes, always with `@Override`.
- Prefer a `record` when all components define the value and are themselves immutable values.
- Make value classes `final` so that subclasses cannot break symmetry.
- Base equality on stable identity fields (an ID, an ISBN), never on frequently changing state.
- Use `Objects.equals` and `Objects.hash` to handle nullable fields safely.
- Write contract tests: reflexive, symmetric, transitive, `equals(null)` is false, equal objects have equal hash codes, and a `HashSet` lookup with a fresh equal object succeeds.
- Keep `toString` free of secrets such as passwords or tokens; it ends up in logs.

## Summary

- `Object` provides default `toString`, `equals` (identity), and `hashCode` (identity-based) for every object.
- `==` tests identity; `equals` tests logical equality as defined by the class.
- `equals` must be reflexive, symmetric, transitive, consistent, and false for `null`, and must take an `Object` parameter.
- Equal objects must have equal hash codes. Equal hash codes never prove equality, because collisions are legal.
- Hash collections use `hashCode` to choose a bucket and `equals` to confirm a match, so the two methods must agree.
- A key whose hash-relevant state changes after insertion becomes unreachable; use immutable keys.
- Records generate consistent `equals`, `hashCode`, and `toString`, but compare array components by identity.

## Practice

### Warm-up

1. Create two `StringBuilder` objects with the same content and compare them with `==` and `equals`. Explain the result by checking whether `StringBuilder` overrides `equals`.
2. Write `toString` for a `Book` class and print a book with and without it.

### Core

1. Write an ordinary immutable `ProductId` class (not a record) with `equals`, `hashCode`, and `toString`. Test reflexivity, symmetry, transitivity, `equals(null)`, differing values, and a `HashSet` lookup with a fresh equal instance.
2. Reproduce the mutable-key failure with your own class. Then repair the *design* (immutable key or stable ID) instead of removing and reinserting entries.
3. Decide, in writing, whether a bank `Account` should be equal by balance, by owner name, or by account number, and justify it using the consistency rule.

### Challenge

1. Write a `Money` class with an amount in cents and a currency code. Implement `equals` and `hashCode`, then add a `NaN`-like "unknown" state and decide how equality should treat it without breaking reflexivity.
2. Convert `ColorPoint` to use composition so that symmetry holds, and write a test that checks both directions for every pair of sample objects.

## Check your understanding

1. What does `Object.equals` do if a class does not override it, and why is that usually wrong for value classes?
2. Two objects are equal according to `equals`. What must be true about their hash codes, and what is *not* required about their references?
3. Two objects have the same hash code. What can you conclude about their equality?
4. Walk through the steps a `HashSet` performs in `contains(x)`. At which step does a missing `hashCode` override cause the failure?
5. Why can a key become unreachable in a `HashMap` even when you look it up with the very same object?
6. Why does writing `equals(Coin other)` compile but fail inside collections, and which annotation would have caught it?
