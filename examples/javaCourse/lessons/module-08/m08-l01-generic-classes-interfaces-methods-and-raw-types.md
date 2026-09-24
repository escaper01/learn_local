# Generic classes, interfaces, methods, and raw types

A container class that holds "an `Object`" can hold anything — which sounds flexible, until you realize it means the compiler can never help you catch a mistake where the wrong kind of thing goes in, and every single value that comes back out needs an explicit cast before you can use it as anything more specific than `Object`. **Generics** let a class, interface, or method declare a *type parameter* — a placeholder type, filled in by whoever uses it — so the compiler can track exactly what goes in and guarantee what comes back out, all without a single cast anywhere in your code.

This lesson builds the vocabulary the rest of the chapter depends on: generic classes and methods, why primitives cannot be type arguments, the boxing and unboxing that bridges that gap, and why a **raw type** — a generic type used without its type argument — throws away every one of these guarantees.

What you will learn:

- How to declare a generic class with a type parameter, and why it eliminates the casts an `Object`-based design requires
- How to declare a generic method, separate from a generic class
- Why primitive types cannot be type arguments, and how boxing and unboxing bridge that gap
- Why unboxing a `null` wrapper throws `NullPointerException`
- What a raw type is, why it exists, and why using one silently discards every compile-time guarantee generics provide
- The `?` wildcard, for when a value's exact type genuinely does not matter

## A generic class preserves a type relationship

A generic class declares one or more type parameters — conventionally single uppercase letters like `T` — in angle brackets right after the class name. Every place `T` appears inside the class is later filled in with one consistent, specific type, chosen when the class is used:

```java
public class BoxDemo {
    static final class Box<T> {
        private final T value;
        Box(T value) { this.value = value; }
        T get() { return value; }
    }

    public static void main(String[] args) {
        Box<String> name = new Box<>("Ada");
        String text = name.get();
        System.out.println("no cast needed: " + text.toUpperCase());

        Box<Integer> age = new Box<>(34);
        int years = age.get();
        System.out.println("unboxed automatically: " + (years + 1));

        Box<Box<String>> nested = new Box<>(new Box<>("nested"));
        System.out.println("nested get: " + nested.get().get());
    }
}
```

Output:

```text
no cast needed: ADA
unboxed automatically: 35
nested get: nested
```

`Box<String>` and `Box<Integer>` are both built from the exact same class declaration, yet each one remembers, at compile time, exactly what type of value it holds. `name.get()` returns a `String` directly, ready to call `.toUpperCase()` on with no cast — the compiler already knows `get()` returns whatever `T` was filled in as for this particular box, because `Box<String>` fixed `T` to `String` the moment it was declared. `T` is exactly the "type relationship" the chapter's concept-check question is asking about: it connects the type passed into the constructor to the type returned by `get()`, and the compiler enforces that connection for every single `Box` you ever create, regardless of what type it holds.

Compare this to the version generics were introduced specifically to replace:

```java
public class ObjectBoxProblem {
    static final class ObjectBox {
        private final Object value;
        ObjectBox(Object value) { this.value = value; }
        Object get() { return value; }
    }

    public static void main(String[] args) {
        ObjectBox box = new ObjectBox("Ada");
        String text = (String) box.get();
        System.out.println("required an explicit cast: " + text);

        ObjectBox mistaken = new ObjectBox(42);
        String broken = (String) mistaken.get();
        System.out.println(broken);
    }
}
```

Output:

```text
required an explicit cast: Ada
Exception in thread "main" java.lang.ClassCastException: class java.lang.Integer cannot be cast to class java.lang.String (java.lang.Integer and java.lang.String are in module java.base of loader 'bootstrap')
	at ObjectBoxProblem.main(ObjectBoxProblem.java:14)
```

`ObjectBox` genuinely can hold any type, but that flexibility is exactly the weakness: every caller must remember, entirely on their own, what type they *believe* is inside, and cast accordingly — and nothing stops `mistaken` from holding an `Integer` while the code confidently casts it as if it were a `String`. The mistake here (putting an `int` into a box a caller expects to hold a `String`) and the failure (a `ClassCastException`) can be arbitrarily far apart in a real program: the box might be constructed in one file and cast incorrectly in a completely different one, weeks later. `Box<T>` makes this exact class of mistake impossible to even write: `Box<String>` simply has no constructor that accepts an `int`, so the error is caught the moment you try to compile the mistake, not discovered later when it runs.

## Generic methods

A method can introduce its own type parameter, independent of any class it belongs to, by declaring it in angle brackets **before** the return type:

```java
import java.util.List;

public class GenericMethodDemo {
    static <T> T first(List<T> values) {
        if (values.isEmpty()) {
            throw new java.util.NoSuchElementException("cannot take first element of an empty list");
        }
        return values.get(0);
    }

    static <T> boolean contains(List<T> values, T target) {
        for (T value : values) {
            if (value.equals(target)) {
                return true;
            }
        }
        return false;
    }

    public static void main(String[] args) {
        List<String> names = List.of("Amina", "Karim", "Lina");
        String firstName = first(names);
        System.out.println("first: " + firstName);

        List<Integer> numbers = List.of(10, 20, 30);
        int firstNumber = first(numbers);
        System.out.println("first number (unboxed): " + firstNumber);

        System.out.println("contains \"Karim\": " + contains(names, "Karim"));
        System.out.println("contains 99: " + contains(numbers, 99));

        try {
            first(List.of());
        } catch (java.util.NoSuchElementException e) {
            System.out.println("empty list rejected: " + e.getMessage());
        }
    }
}
```

Output:

```text
first: Amina
first number (unboxed): 10
contains "Karim": true
contains 99: false
empty list rejected: cannot take first element of an empty list
```

`static <T> T first(List<T> values)` reads as: "for whatever type `T` turns out to be, this method takes a `List` of that type and returns one value of that same type." You never write `first(names)` with an explicit type argument — the compiler infers `T` from the argument you pass, exactly as `var` infers a variable's type from its initializer (Chapter 2). Notice that `first` explicitly defines what happens for an empty list, throwing a specific, named exception rather than letting some unrelated error surface later — precisely the kind of explicit-contract discipline Chapter 4 taught for null handling, applied here to a different edge case.

## Primitives cannot be type arguments: boxing and unboxing

Every type argument you write in angle brackets, such as the `T` in `List<T>`, must be a reference type. You cannot write `List<int>` — it does not compile. Instead, Java uses the **wrapper classes** from Chapter 2 (`Integer`, `Double`, `Boolean`, and so on), and the compiler automatically converts between a primitive and its wrapper wherever needed: **boxing** wraps a primitive into its wrapper object, and **unboxing** extracts the primitive value back out.

You already saw this working invisibly in `GenericMethodDemo`: `List<Integer> numbers = List.of(10, 20, 30);` boxed each `int` literal into an `Integer` automatically, and `int firstNumber = first(numbers);` unboxed the returned `Integer` back into an `int`, with no cast, no explicit `.intValue()` call, and no visible ceremony at all.

This convenience has exactly one sharp edge: unboxing a wrapper reference that is `null` throws `NullPointerException`, because there is no primitive value to extract from "no object at all."

```java
import java.util.HashMap;
import java.util.Map;

public class UnboxingNull {
    public static void main(String[] args) {
        Map<String, Integer> scores = new HashMap<>();
        scores.put("Amina", 95);

        Integer aminaScore = scores.get("Amina");
        System.out.println("Amina: " + aminaScore);

        Integer karimScore = scores.get("Karim");
        System.out.println("Karim (boxed, may be null): " + karimScore);

        int unboxed = karimScore;
        System.out.println("never printed: " + unboxed);
    }
}
```

Output:

```text
Amina: 95
Karim (boxed, may be null): null
Exception in thread "main" java.lang.NullPointerException: Cannot invoke "java.lang.Integer.intValue()" because "<local3>" is null
	at UnboxingNull.main(UnboxingNull.java:15)
```

`scores.get("Karim")` returns `null` because no such key exists (Chapter 9 covers `Map` fully). Assigning that `null` to the wrapper-typed variable `karimScore` is completely fine — `Integer` is a reference type, and `null` is a valid reference. The crash comes one line later, the instant `int unboxed = karimScore;` tries to *unbox* that `null` into a primitive `int`: there is no `int` value hiding inside "no object", so the JVM throws, and the error message even names the exact hidden method call — `Integer.intValue()` — that unboxing silently performs on your behalf. Any time a generic API can return a boxed wrapper that might be absent (a missing map key, an optional result), assume it can be `null` and check before you let it unbox.

## Raw types: generics with the safety switched off

A **raw type** is a generic type used with no type argument at all — just `Box` instead of `Box<String>`, `List` instead of `List<String>`. Raw types exist purely for compatibility with code written before Java 5 introduced generics; using one in new code throws away every guarantee this lesson has built up.

```java
import java.util.ArrayList;
import java.util.List;

public class RawTypeDanger {
    @SuppressWarnings({"unchecked", "rawtypes"})
    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        names.add("Amina");
        names.add("Karim");

        List raw = names;
        raw.add(42);
        System.out.println("raw list after adding an int: " + raw);

        for (String name : names) {
            System.out.println("reading: " + name.toUpperCase());
        }
    }
}
```

Output:

```text
raw list after adding an int: [Amina, Karim, 42]
reading: AMINA
reading: KARIM
Exception in thread "main" java.lang.ClassCastException: class java.lang.Integer cannot be cast to class java.lang.String (java.lang.Integer and java.lang.String are in module java.base of loader 'bootstrap')
	at RawTypeDanger.main(RawTypeDanger.java:15)
```

`names` is declared `List<String>` — a completely trustworthy, fully-checked type. But assigning it to a raw `List raw` variable strips away the compiler's memory of what element type it should enforce; `raw.add(42)` compiles (with only an unchecked warning, suppressed here so the example runs cleanly) even though it inserts an `Integer` into a list the original variable still believes holds only `String` values. The corruption happens silently at the `add` call. The **failure** — a `ClassCastException` — happens three lines later, inside the completely innocent-looking `for` loop, at the exact moment the loop reaches the corrupted element and Java inserts its usual implicit cast to `String` on your behalf. This is precisely the pattern this lesson's practice exercise asks you to notice: **the failure moves away from the original mistake**, landing at an unrelated line of code that did nothing wrong itself, which is exactly the debugging nightmare generics exist to prevent. (Chapter 10's upcoming lesson on erasure and heap pollution examines this exact scenario in more depth.)

If a value's precise type genuinely does not matter — you only need to read it as `Object`, or pass it along unchanged — use the **wildcard** `?` instead of a raw type, which keeps type-safety intact while expressing "I don't need to know the specific type here":

```java
public class WildcardBox {
    static final class Box<T> {
        private final T value;
        Box(T value) { this.value = value; }
        T get() { return value; }
    }

    static void printAny(Box<?> box) {
        Object value = box.get();
        System.out.println("unknown-typed box contains: " + value);
    }

    public static void main(String[] args) {
        printAny(new Box<>("text"));
        printAny(new Box<>(42));
        printAny(new Box<>(3.14));
    }
}
```

Output:

```text
unknown-typed box contains: text
unknown-typed box contains: 42
unknown-typed box contains: 3.14
```

`Box<?>` accepts a `Box` of *any* type argument, unlike `Box<Object>` (which would only accept a box specifically declared to hold `Object`). Unlike the raw `List` above, `Box<?>` still fully participates in generic type checking — you simply cannot call `box.get()` and treat the result as anything more specific than `Object`, because the wildcard genuinely means "some type, but I am not telling you which." The difference between "some specific, unknown type I am not allowed to violate" (`?`) and "no type checking at all" (raw) is exactly the difference between disciplined flexibility and giving up the compiler's help entirely — the next lesson builds heavily on this distinction.

## Common mistakes

**1. Using `Object` as a substitute for a real type parameter.** It compiles for anything, which is exactly the problem: it defers every type mistake to a runtime `ClassCastException` instead of catching it at compile time.

**2. Writing `List<int>` or any other primitive type argument.** Type arguments must be reference types; use the wrapper class (`List<Integer>`) instead.

**3. Unboxing a value that might be `null` without checking first.** A `Map.get` that misses, or any other API that can legitimately return "nothing," should be checked before its result is assigned to a primitive variable.

**4. Assigning a properly-typed generic variable to a raw-typed one "just to make the compiler stop complaining."** This is precisely how `RawTypeDanger` corrupted `names`; the unchecked warning exists to flag exactly this danger, not to be silenced reflexively.

**5. Confusing a raw type with a wildcard.** `List` (raw) discards all element-type checking; `List<?>` keeps full type-safety while expressing "the element type is some specific but unknown type."

## Best practices

- Reach for a generic class or method the moment a type or algorithm's logic is identical regardless of the specific type involved, but you still want the compiler to enforce consistency between what goes in and what comes out.
- Let type inference do its job; explicitly writing out type arguments at every call site (`GenericMethodDemo.<String>first(names)`) is rarely necessary and adds noise.
- Treat any boxed wrapper value that could plausibly be `null` (a map lookup, an optional field) as needing a null check before you let it unbox.
- Never introduce a raw type in new code; if you must interoperate with genuinely old, un-generified code, isolate that boundary as narrowly as possible and add the type argument back immediately.
- Reach for `?` (a wildcard) rather than a raw type whenever you only need to read a value generically without knowing or caring about its exact type argument.

## Summary

- A generic class or method declares a type parameter that connects its inputs and outputs, letting the compiler enforce a consistent type relationship with no casts required.
- An `Object`-based design compiles for any input but defers type mistakes to a `ClassCastException` at some later, unrelated point in the program; a generic type catches the same mistake at compile time.
- Type arguments must be reference types; boxing and unboxing let primitives and their wrapper classes (`int`/`Integer`, and so on) cross that boundary automatically.
- Unboxing a `null` wrapper reference throws `NullPointerException`, because there is no primitive value to extract.
- A raw type (a generic type used with no type argument) compiles with only a warning but discards every compile-time type guarantee, letting corruption happen silently at one point in the code and fail with a `ClassCastException` at a completely different, unrelated point.
- `Box<?>` (a wildcard) is the type-safe alternative to a raw type when a value's exact type argument genuinely does not matter.

## Practice

Warm-up:

1. Write a generic class `Pair<L, R>` holding two values of potentially different types, with accessors `left()` and `right()`.
2. Write a generic method `static <T> T last(List<T> values)` that returns the final element, and decide and implement what it should do for an empty list, following the same explicit-contract discipline as `first` in this lesson.
3. Demonstrate, with a small program, that unboxing a `null` `Integer` throws `NullPointerException`, and add a check that avoids it.

Core:

1. Build the `Pair<L, R>` class from the warm-up further: add a static factory method `static <L, R> Pair<L, R> of(L left, R right)` and demonstrate that type inference lets callers omit explicit type arguments when calling it.
2. Deliberately reproduce `RawTypeDanger`'s scenario in your own words: create a properly-typed `List<String>`, alias it through a raw `List` variable, insert an incompatible value, and show that the resulting `ClassCastException` occurs at a *different* line than the corrupting insertion. Then fix it by removing the raw type entirely.
3. Compile one of your generic classes with `-Xlint:unchecked` after introducing a raw-type reference somewhere in it, and read the exact warning the compiler produces.

Challenge:

1. Design a generic `Stack<T>` backed by an `ArrayList<T>` internally, with `push`, `pop`, and `peek` methods, and decide (documenting your choice) what `pop` and `peek` should do when the stack is empty — an explicit exception, matching this lesson's `first` method's discipline.
2. Write a generic method `static <T> List<T> repeat(T value, int times)` that returns a list containing `value` repeated `times` times, and explain in a comment why this works uniformly for any reference type `T` without needing to know anything else about it.

## Check your understanding

1. What type relationship does `Box<T>` preserve between its constructor and its `get()` method, and why can't `Box`'s `Object`-based equivalent make the same guarantee?
2. Why can't you write `List<int>`, and what do you write instead?
3. Under what specific circumstance does unboxing throw `NullPointerException`?
4. What compiles, but only with a warning, when you assign a `List<String>` reference to a raw `List` variable, and why is that dangerous?
5. In the raw-type example, why does the `ClassCastException` occur inside the `for` loop rather than at the line that actually inserted the wrong type?
6. What is the difference between a raw type like `Box` and a wildcard type like `Box<?>`?
