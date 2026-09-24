# Null contracts, defensive copying, and immutable design

You now understand references well enough to see the danger they carry: any reference can be `null`, meaning "refers to no object at all", and any object reachable through a reference you handed out can be silently changed by whoever holds it. Both facts are sources of real, common bugs — the null pointer exception is famous enough to have its own name, and a "read-only" object that quietly mutates because of a shared array is a defect that can take hours to trace back to its cause.

This lesson gives you the professional habits that prevent both: deciding and documenting whether `null` is an allowed value, failing fast and clearly when it is not, and using defensive copying so that an object's internal state cannot be corrupted or read out from under it. Together these habits are the foundation of designing objects that are actually safe to use, which Chapter 5 builds on directly.

What you will learn:

- What `NullPointerException` means and how to read Java's "helpful" NPE messages
- How to decide and enforce a null contract with `Objects.requireNonNull` and the `Objects` helper methods
- Why storing or returning a caller-provided array (or other mutable object) directly creates a hidden aliasing bug
- How defensive copying on the way in and on the way out closes that hole
- The design of a genuinely immutable class, and why immutability sidesteps the entire problem
- The difference between fixing a symptom and fixing the actual contract

## NullPointerException: what it means and how to read it

`null` is a special reference value meaning "this variable points to no object". Calling a method or accessing a field on a `null` reference is meaningless — there is no object to send the message to — so Java throws `NullPointerException` (often abbreviated NPE).

```java
public class NullPointerDemo {
    static String greet(String name) {
        return "Hello, " + name.toUpperCase() + "!";
    }

    public static void main(String[] args) {
        System.out.println(greet("Amina"));
        System.out.println(greet(null));
    }
}
```

Output:

```text
Hello, AMINA!
Exception in thread "main" java.lang.NullPointerException: Cannot invoke "String.toUpperCase()" because "<parameter1>" is null
	at NullPointerDemo.greet(NullPointerDemo.java:3)
	at NullPointerDemo.main(NullPointerDemo.java:8)
```

Modern Java (since version 14) produces a "helpful NPE" that states exactly which call failed and why: `Cannot invoke "String.toUpperCase()" because "<parameter1>" is null` tells you precisely which method call on which reference was the problem, without any guesswork. The compiler used here did not retain the source parameter's actual name `name` (that requires compiling with the `-g` debug flag, which most IDEs enable by default but plain `javac` does not), so it falls back to `<parameter1>`; either way, the *what* and *where* are unambiguous, and the stack trace below it — read the same way you learned in the previous lesson — shows exactly which call chain led there.

An NPE is not a mysterious failure. It always means the same thing: **some reference that the code assumed would point to an object was actually `null`** at the moment it was used. The fix is never to "make the exception go away"; it is to decide, deliberately, whether `null` should have been a legal value there in the first place.

## Deciding and enforcing a null contract

Every parameter, field, and return value has an implicit **contract**: is `null` an acceptable value, or not? Leaving this undecided is how NPEs sneak into production code weeks after it was written. There are exactly two correct designs, and the wrong design is a third option: silently doing nothing sensible.

```java
import java.util.Objects;

public class NullChecks {
    static String greetChecked(String name) {
        if (name == null) {
            return "Hello, stranger!";
        }
        return "Hello, " + name.toUpperCase() + "!";
    }

    static String greetRequired(String name) {
        Objects.requireNonNull(name, "name must not be null");
        return "Hello, " + name.toUpperCase() + "!";
    }

    public static void main(String[] args) {
        System.out.println(greetChecked(null));
        System.out.println(greetChecked("Karim"));

        try {
            greetRequired(null);
        } catch (NullPointerException e) {
            System.out.println("caught: " + e.getMessage());
        }

        String maybe = null;
        System.out.println("with default: " + Objects.requireNonNullElse(maybe, "anonymous"));
        System.out.println("Objects.toString: " + Objects.toString(maybe, "N/A"));
        System.out.println("Objects.equals(null, null): " + Objects.equals(null, null));
    }
}
```

Output:

```text
Hello, stranger!
Hello, KARIM!
caught: name must not be null
with default: anonymous
Objects.toString: N/A
Objects.equals(null, null): true
```

**Design one: `null` is allowed, and the code handles it meaningfully.** `greetChecked` decides that a missing name means "stranger" and handles that case explicitly. This is correct whenever `null` genuinely represents a real, sensible state in your domain — an optional middle name, an address line that some customers do not have.

**Design two: `null` is forbidden, and the code says so immediately and clearly.** `greetRequired` uses `Objects.requireNonNull(name, "message")`, which throws `NullPointerException` with your custom message right at the boundary, the moment the bad value arrives — not three method calls later, deep inside some unrelated helper, where the eventual stack trace tells you nothing about the true source of the problem. This is called **failing fast**, and it is almost always better than letting a `null` travel silently through several layers before it finally causes a crash somewhere confusing.

The `java.util.Objects` class has several small utilities worth knowing: `requireNonNullElse(value, fallback)` returns a default when the value is `null`; `Objects.toString(value, fallback)` is a null-safe version of calling `toString()`; and `Objects.equals(a, b)` (which you met with strings in Lesson 2) safely handles either or both arguments being `null` without throwing.

| Situation | Correct response |
|---|---|
| `null` is a meaningful value in your domain | handle it explicitly with an `if` or a default, as `greetChecked` does |
| `null` should never be passed here | reject it immediately with `Objects.requireNonNull`, as `greetRequired` does |
| You are not sure yet | that itself is the bug — decide, and write it into the code and its documentation |

> **Tip:** `Objects.requireNonNull` is usually the very first line of a constructor or a public method that takes a reference parameter. Placing it first means the failure happens before any other work runs, and before any partially-invalid state can be created.

## The hidden aliasing bug: exposing your internals

A null contract protects you from missing values, but there is a second, subtler hole: even a **non-null** array or other mutable object can be silently corrupted, or can silently corrupt the object that shared it, purely through aliasing (Lesson 1). This happens whenever a class stores a caller-provided reference directly, or hands one of its own internal references back out to a caller.

```java
import java.util.Arrays;

public class LeakyRoster {
    static class Roster {
        private final String[] names;

        Roster(String[] names) {
            this.names = names;
        }

        String[] getNames() {
            return names;
        }
    }

    public static void main(String[] args) {
        String[] original = {"Amina", "Karim", "Lina"};
        Roster roster = new Roster(original);

        System.out.println("before outside mutation: " + Arrays.toString(roster.getNames()));

        original[0] = "HACKED";
        System.out.println("after mutating the array we passed in: " + Arrays.toString(roster.getNames()));

        String[] exposed = roster.getNames();
        exposed[1] = "ALSO HACKED";
        System.out.println("after mutating the returned array: " + Arrays.toString(roster.getNames()));
    }
}
```

Output:

```text
before outside mutation: [Amina, Karim, Lina]
after mutating the array we passed in: [HACKED, Karim, Lina]
after mutating the returned array: [HACKED, ALSO HACKED, Lina]
```

Notice that `names` is declared `private final`, which sounds protective — and yet the roster's data was corrupted **twice**, from two completely different directions, without ever touching the private field by name:

1. **The constructor stored the caller's array reference directly**, rather than copying it. The caller (`main`) still holds `original`, pointing at that exact same array, so mutating `original` after construction reaches straight into the "private" field.
2. **`getNames()` returned the internal array reference directly**, rather than a copy. Any caller can now mutate the roster's actual internal state just by modifying the array they were handed back — `final` only stops the *field* from being reassigned to point at a different array; it does nothing to protect the array's *contents*, exactly as you learned in Lesson 1.

`private` and `final` are necessary for encapsulation, but on their own they are not sufficient when a field is a reference to something mutable. The object graph reaches outside the class through both the constructor and the getter, and either path is enough to break the intended guarantee.

## Defensive copying: closing both directions

The fix is **defensive copying**: never store a caller's mutable reference directly, and never hand out your own internal mutable reference directly. Copy on the way in, and copy on the way out.

```java
import java.util.Arrays;
import java.util.Objects;

public class DefensiveRoster {
    static final class Roster {
        private final String[] names;

        Roster(String[] names) {
            Objects.requireNonNull(names, "names must not be null");
            this.names = names.clone();
        }

        String[] getNames() {
            return names.clone();
        }

        int size() {
            return names.length;
        }
    }

    public static void main(String[] args) {
        String[] original = {"Amina", "Karim", "Lina"};
        Roster roster = new Roster(original);

        original[0] = "HACKED";
        System.out.println("after mutating our own array: " + Arrays.toString(roster.getNames()));

        String[] exposed = roster.getNames();
        exposed[1] = "ALSO HACKED";
        System.out.println("after mutating the returned copy: " + Arrays.toString(roster.getNames()));

        System.out.println("roster size stayed correct: " + roster.size());

        try {
            new Roster(null);
        } catch (NullPointerException e) {
            System.out.println("constructor rejected null: " + e.getMessage());
        }
    }
}
```

Output:

```text
after mutating our own array: [Amina, Karim, Lina]
after mutating the returned copy: [Amina, Karim, Lina]
roster size stayed correct: 3
constructor rejected null: names must not be null
```

Both attacks now fail harmlessly, because they no longer reach the real internal array at all:

- **The constructor copies** with `names.clone()` before storing anything. `main`'s `original` array and the roster's internal array are now two completely independent objects; mutating one has zero effect on the other.
- **`getNames()` copies again** before returning. Whatever the caller does to the array they receive, they are only ever touching a throwaway copy, never the roster's real internal state.
- **The null check runs first**, so a `null` array is rejected immediately with a clear message, before a broken `Roster` could ever be constructed — the two ideas from this lesson, null contracts and defensive copying, are meant to be applied together at every boundary.

This pattern generalizes far beyond arrays: any time a class holds a reference to something mutable — a `Date`, a `StringBuilder`, another custom object with mutable fields, a collection (Chapter 9) — the same two questions apply. *Could the caller still hold a reference to what I just stored?* *Am I about to hand out a reference to something I still consider mine?* If either answer is yes, and the object is mutable, copy it.

## Immutable design: the deeper fix

Defensive copying works, but it has a cost: every construction and every read allocates a new copy, and you must remember to add it at *every single point* where a mutable reference crosses the class boundary — miss just one getter, and the hole reopens. There is a stronger, simpler solution available whenever the type of value allows it: make the object itself **immutable**, exactly the same guarantee `String` gave you in Lesson 2, so that there is nothing left to defensively copy in the first place.

```java
public final class ImmutablePoint {
    private final int x;
    private final int y;

    public ImmutablePoint(int x, int y) {
        this.x = x;
        this.y = y;
    }

    public int getX() { return x; }
    public int getY() { return y; }

    public ImmutablePoint translated(int dx, int dy) {
        return new ImmutablePoint(x + dx, y + dy);
    }

    @Override
    public String toString() {
        return "(" + x + "," + y + ")";
    }

    public static void main(String[] args) {
        ImmutablePoint origin = new ImmutablePoint(0, 0);
        ImmutablePoint moved = origin.translated(3, 4);

        System.out.println("origin: " + origin);
        System.out.println("moved:  " + moved);
        System.out.println("origin is unchanged after translated(): " + origin);

        ImmutablePoint current = origin;
        for (int i = 0; i < 3; i++) {
            current = current.translated(1, 1);
            System.out.println("step " + i + ": " + current);
        }
        System.out.println("origin still: " + origin);
    }
}
```

Output:

```text
origin: (0,0)
moved:  (3,4)
origin is unchanged after translated(): (0,0)
step 0: (1,1)
step 1: (2,2)
step 2: (3,3)
origin still: (0,0)
```

`ImmutablePoint` never has any method that changes `x` or `y` after construction; instead, `translated` returns a **brand-new** point representing the moved location, leaving the original completely untouched — the same pattern `String.toUpperCase()` used back in Lesson 2. Every iteration of the loop reassigns the local variable `current` to a new object, but `origin` itself is never at risk, no matter how many other references exist or what any of them do, because there genuinely is no way to mutate the object at all. This is why immutable objects are automatically safe to share freely between methods, store in collections as keys, and hand out through getters without a single defensive copy anywhere: there is nothing to protect against, because there is no mutation to perform.

The ingredients of an immutable class, all four required together:

| Ingredient | Why it matters |
|---|---|
| Every field is `private final` | prevents both reassignment and outside access |
| No setter methods | there is no way to change a field after construction |
| The class is `final`, or otherwise cannot be subclassed to add mutation | prevents a subclass from breaking the guarantee |
| Any mutable field is defensively copied in and never handed out directly | closes the exact hole from `LeakyRoster`, for the rare case an immutable class must hold something like an array |

`ImmutablePoint` here needed no defensive copying at all, because `int` fields are primitives with no aliasing possible in the first place; defensive copying is only needed when a field's *type* is itself something mutable. Chapter 5 will build full, general-purpose immutable classes using this exact recipe, and Chapter 6 introduces `record`, a language feature specifically designed to make this pattern far less verbose to write.

## Common mistakes

**1. Leaving a null contract undecided.** Neither checking for `null` nor rejecting it, and simply hoping the caller never passes one, guarantees an eventual NPE at the worst possible moment, deep inside unrelated code.

**2. Storing a constructor parameter's array (or other mutable object) directly.** `this.names = names;` looks identical to a safe assignment but silently aliases the caller's data.

**3. Returning an internal mutable field directly from a getter.** It looks like read access but is actually a second, undocumented way to mutate the object's internal state.

**4. Believing `private final` alone protects a mutable field's contents.** It only controls the *field itself* (who can see it, whether it can be reassigned), not what the object it refers to allows others to do.

**5. Copying in only one direction.** Defensive copying must happen both where mutable data enters the class (constructors, setters) and where it leaves (getters, any method returning an internal reference); protecting only one side still leaves the other wide open.

**6. Reaching for a mutable design by default.** Many classes are modeled as mutable purely out of habit, when an immutable design with methods like `translated` would eliminate the entire category of aliasing bugs this lesson covers.

## Best practices

- At every public method and constructor boundary, explicitly decide whether each reference parameter may be `null`, and enforce that decision immediately with either a handled `if` branch or `Objects.requireNonNull`.
- Never store a caller-provided mutable reference directly; clone or copy it first if the class needs to own that data.
- Never return an internal mutable reference directly from a method; return a copy, or an unmodifiable view once you learn about those in Chapter 9.
- Prefer designing genuinely immutable classes whenever the value they represent does not need to change after creation — it removes the need for most defensive copying entirely.
- Fail fast, with a clear message, as close as possible to where invalid data actually enters your code, rather than letting it silently propagate.

## Summary

- `NullPointerException` means some reference the code relied on being non-null was actually `null`; modern Java's message states exactly which call and reference caused it.
- Every reference has an implicit null contract: decide whether `null` is meaningful and handle it, or forbid it and enforce that immediately with `Objects.requireNonNull`.
- Storing or returning a caller's (or your own) mutable reference directly creates hidden aliasing: outside code can corrupt your object's state, or your object can corrupt outside state, without ever touching a private field by name.
- Defensive copying — cloning on the way in, cloning on the way out — closes that hole, but must be applied consistently at every boundary.
- A genuinely immutable class (private final fields, no setters, no subclassing, defensive copies for any mutable field it must hold) needs no defensive copying at its read boundary at all, because there is nothing left to protect against.

## Practice

Warm-up:

1. Write a method that takes a `String` parameter and rejects `null` with `Objects.requireNonNull` and a clear message. Call it once with a valid value and once with `null`, and read the resulting exception.
2. Write a method `describe(String note)` where `null` is a meaningful value meaning "no note provided", and have it return an appropriate default message in that case.
3. Given a class with a `private final int[] scores` field and a constructor that stores its parameter directly, demonstrate the aliasing bug by mutating the array from outside after construction.

Core:

1. Fix the class from warm-up exercise 3 using defensive copying in both the constructor and any getter, and demonstrate that outside mutation no longer has any effect.
2. Design and implement a small immutable `Range` class with `private final` `min` and `max` fields, no setters, and a method `withMax(int newMax)` that returns a new `Range` rather than mutating the existing one. Validate in the constructor that `min <= max`, rejecting invalid ranges immediately.
3. Write a class that wraps a `java.util.Date` field (a genuinely mutable type) passed into its constructor and returned from a getter, and apply defensive copying using `new Date(originalDate.getTime())` at both boundaries.

Challenge:

1. Take the `LeakyRoster` example and extend it: add a method `addName(String name)` to the buggy version that appends to the internal array (you will need to grow it, as in Chapter 4 Lesson 1's practice), then show a second, independent way the leak could cause a bug in a multi-method program. Fix the whole class properly.
2. Design an immutable `ImmutableList`-style wrapper around an array of `String` (do not use `java.util.List` yet) that defensively copies on construction, exposes read-only access by index and length, and provides a method `withAppended(String value)` that returns a new instance rather than mutating the original. Write a short program proving that no combination of operations you can think of ever changes an already-created instance.

## Check your understanding

1. What does a `NullPointerException` message like `Cannot invoke "String.toUpperCase()" because "name" is null` tell you, precisely, that a bare `NullPointerException` without that detail would not?
2. What are the two valid ways to handle a reference parameter that might be `null`, and what is the one invalid option?
3. A class stores a constructor's array parameter directly as `this.data = data;`. Describe a concrete sequence of calls, using variables outside the class, that corrupts the object's internal state without ever calling a setter.
4. Why does making a field `private final` fail to prevent that corruption on its own?
5. What two changes turn `LeakyRoster` into `DefensiveRoster`, and why are both necessary rather than just one?
6. Why does a fully immutable class, like `ImmutablePoint`, need no defensive copying for its primitive fields, and when would an immutable class still need defensive copying for one of its fields?
