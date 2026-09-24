# Designing readable and usable generic APIs

You now know every mechanical rule generics enforce: invariance, PECS, bounds, and what erasure takes away. This final lesson is about a different skill — using that knowledge to design a generic method or class that is genuinely *pleasant* to call, not merely one that compiles. The chapter's guiding principle is a single sentence worth memorizing: **a reusable API should accept the least restrictive useful input, and return the most precise, honest result.** Every example in this lesson is one concrete consequence of that sentence.

What you will learn:

- How to design a two-type-parameter method combining `Function`, PECS, and a defensively-copied, honest return type
- Why returning a wildcard type when a precise type would be truthful burdens every single caller unnecessarily
- Why accepting `Iterable<T>` instead of `List<T>` can be a strictly more flexible, equally correct choice
- How to recognize and remove a generic type parameter that does not actually connect any input to any output
- Why documenting ownership and mutability separately from a signature's generics matters, since type safety says nothing about either

## A complete example: transform

`Function<T, R>` (a standard interface from `java.util.function`, covered fully in Chapter 13) represents "a piece of behavior that consumes a `T` and produces an `R`." Combined with everything this chapter has taught, it enables a small, genuinely reusable utility:

```java
import java.util.List;
import java.util.function.Function;

public class TransformDemo {
    static <T, R> List<R> transform(List<T> input, Function<? super T, ? extends R> operation) {
        var output = new java.util.ArrayList<R>();
        for (T value : input) output.add(operation.apply(value));
        return List.copyOf(output);
    }

    public static void main(String[] args) {
        List<String> names = List.of("Amina", "Karim", "Lina");
        List<Integer> lengths = transform(names, String::length);
        System.out.println("lengths: " + lengths);

        List<Integer> numbers = List.of(1, 2, 3);
        List<String> texts = transform(numbers, n -> "#" + n);
        System.out.println("texts: " + texts);

        try {
            lengths.add(99);
        } catch (UnsupportedOperationException e) {
            System.out.println("result is unmodifiable: " + e.getClass().getSimpleName());
        }
    }
}
```

Output:

```text
lengths: [5, 5, 4]
texts: [#1, #2, #3]
result is unmodifiable: UnsupportedOperationException
```

Every design decision in this one method's signature reflects something this chapter already taught you, applied deliberately: `Function<? super T, ? extends R>` uses PECS from Lesson 2 correctly — the function **consumes** `T` values (so its parameter type is bounded with `super`, accepting a function written for any supertype of `T`) and **produces** `R` values (so its return type is bounded with `extends`, accepting a function that produces any subtype of `R`). `transform` returns `List.copyOf(output)` rather than the raw, still-mutable `output` list directly — an **unmodifiable** result, exactly Chapter 6's `List.copyOf` idiom, applied here so that the returned list's contract is honest: nothing about calling `transform` implies you are entitled to mutate what comes back. And `T` and `R` are used precisely because they connect something real: `T` is the type read from `input` and fed into `operation`; `R` is the type `operation` produces and the type the returned list actually holds. Neither one is decorative.

## Why a wildcard return type burdens the caller

You have used wildcards extensively as *parameter* types. Using one as a **return** type is a different, usually worse idea, because it pushes uncertainty about the specific type onto every single caller, forever, for no benefit to them:

```java
import java.util.ArrayList;
import java.util.List;

public class WildcardReturnBurden {
    record Task(String title) {}

    static List<? extends Task> loadTasksWildcard() {
        return new ArrayList<Task>(List.of(new Task("Write chapter"), new Task("Review PR")));
    }

    static List<Task> loadTasksPrecise() {
        return new ArrayList<>(List.of(new Task("Write chapter"), new Task("Review PR")));
    }

    public static void main(String[] args) {
        List<? extends Task> fromWildcard = loadTasksWildcard();
        System.out.println("read from wildcard result: " + fromWildcard.get(0));

        List<Task> fromPrecise = loadTasksPrecise();
        fromPrecise.add(new Task("Deploy release"));
        System.out.println("added directly to precise result: " + fromPrecise);
    }
}
```

Output:

```text
read from wildcard result: Task[title=Write chapter]
added directly to precise result: [Task[title=Write chapter], Task[title=Review PR], Task[title=Deploy release]]
```

Both methods genuinely return a `List<Task>` internally — the implementation itself never actually holds anything other than exact `Task` objects. `loadTasksWildcard`'s declared return type of `List<? extends Task>` is, in this case, simply **not truthful about what the method actually produces**, and that dishonesty has a real, immediate cost: because Lesson 2 established that a `? extends T` list is safe to read from but not write into, *every single caller* of `loadTasksWildcard` is now permanently unable to add a `Task` to the returned list, even though the actual underlying object would have handled it perfectly well:

```java
import java.util.ArrayList;
import java.util.List;

public class WildcardReturnAddRejected {
    record Task(String title) {}

    static List<? extends Task> loadTasksWildcard() {
        return new ArrayList<Task>(List.of(new Task("Write chapter")));
    }

    public static void main(String[] args) {
        List<? extends Task> tasks = loadTasksWildcard();
        tasks.add(new Task("Deploy release"));
    }
}
```

```text
WildcardReturnAddRejected.java:13: error: incompatible types: Task cannot be converted to CAP#1
        tasks.add(new Task("Deploy release"));
                  ^
  where CAP#1 is a fresh type-variable:
    CAP#1 extends Task from capture of ? extends Task
Note: Some messages have been simplified; recompile with -Xdiags:verbose to get full output
1 error
```

Compare `loadTasksPrecise`, which simply returns `List<Task>` — the type it actually is — and every caller can `.add(...)` to it exactly as normally as any other `List<Task>` they created themselves, with no artificial restriction at all. This is exactly the chapter's concept-check question: a wildcard return type does not protect anyone from anything here (there was never a genuinely unknown subtype involved, only one exact, known type, `Task`); it simply forces every caller to manage an unknown-typed result they never actually needed to think about. Reserve `? extends T` return types for the rare, genuinely honest case where a method's real implementation *could* return different concrete subtypes depending on runtime conditions — when it is describing real uncertainty, not manufacturing artificial uncertainty about a type the method always actually returns.

## Accepting the least restrictive useful input: Iterable<T> versus List<T>

The "least restrictive useful input" half of this lesson's guiding principle has its own concrete example: if a method's logic only ever needs to walk through elements once, in order, requiring a full `List<T>` parameter is more restrictive than the method actually needs — `Iterable<T>`, the common supertype of `List`, `Set`, and every other collection type Chapter 9 covers, is enough.

```java
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public class IterableVersusList {
    static <T> int count(Iterable<T> values) {
        int total = 0;
        for (T value : values) {
            total++;
        }
        return total;
    }

    public static void main(String[] args) {
        List<String> list = List.of("a", "b", "c");
        Set<String> set = Set.of("x", "y");
        List<Integer> arrayList = new ArrayList<>(List.of(1, 2, 3, 4));

        System.out.println("count(list): " + count(list));
        System.out.println("count(set): " + count(set));
        System.out.println("count(arrayList): " + count(arrayList));
        System.out.println("accepting Iterable<T> instead of List<T> let all three work unchanged");
    }
}
```

Output:

```text
count(list): 3
count(set): 2
count(arrayList): 4
accepting Iterable<T> instead of List<T> let all three work unchanged
```

`count` never calls `.get(index)`, never checks `.size()` directly, never relies on any ordering guarantee beyond "I can walk through this once" — everything a plain enhanced `for` loop needs, which is exactly what `Iterable<T>` promises. Declaring the parameter as `Iterable<T>` instead of `List<T>` costs nothing (every `List` is already an `Iterable`) and immediately makes the method usable with a `Set`, or any future collection type, with zero changes. This is the caller-facing half of "accept the least restrictive useful input": ask, honestly, what your method's logic actually requires from a parameter, and declare the loosest type that still satisfies that requirement — not the specific type you happened to test it with first.

## Removing generic parameters that connect nothing

Not every method that touches a generic type needs its own type parameter. If `T` never actually connects an input to an output — if the method would behave identically no matter what `T` was substituted, and never returns a `T`-typed value derived from the input — it is very likely unnecessary ceremony:

```java
import java.util.List;

public class UnnecessaryGenericParameter {
    static <T> int describeLength(List<T> values) {
        return values.size();
    }

    static int lengthPrecise(List<?> values) {
        return values.size();
    }

    public static void main(String[] args) {
        System.out.println(describeLength(List.of("a", "b", "c")));
        System.out.println(lengthPrecise(List.of(1, 2, 3, 4)));
        System.out.println("both work, but the second signature is more honest: T is never used elsewhere");
    }
}
```

Output:

```text
3
4
both work, but the second signature is more honest: T is never used elsewhere
```

Both methods work identically for any caller. But `describeLength`'s `<T>` type parameter is pure decoration: it appears exactly once, in the parameter type, and nowhere else — not in the return type, not in any other parameter, not connecting anything to anything. `lengthPrecise`'s `List<?>` says exactly the same thing more honestly: "I accept a list of any element type, and I do not need to name that type anywhere, because I never use it." A generic type parameter earns its place in a signature only when it links at least two things together (an input to another input, or an input to the return type); if it links nothing, a wildcard communicates the same acceptance of "any type" without implying a relationship that does not actually exist.

## Documenting ownership and mutability separately

Nothing in this entire chapter's type-checking machinery says anything at all about whether a returned collection is safe to mutate, or whether a method takes ownership of a collection you pass it, or defensively copies it first. `List<Task>` as a return type is compatible with an implementation that returns a live, mutable internal field (the exact `LeakyRoster` mistake from Chapter 4), a fresh mutable copy, or an unmodifiable snapshot (as `TransformDemo.transform` returns above) — the generic signature alone cannot distinguish between any of these for a caller reading only the type. This is precisely why Chapter 4's defensive-copying discipline and this chapter's generics discipline are complementary, not substitutes for each other: a method's Javadoc or its own clear naming convention (`copyOf`, `unmodifiableView`, `wrap`) needs to state explicitly whether a returned collection can be mutated, whether the method retains a reference to a collection you passed in, and whether later changes to your original data will or will not be reflected — none of which any amount of `<T>`, `? extends T`, or `? super T` can express on its own.

## What happens under the hood

Every recommendation in this lesson reduces, in the end, to the same underlying fact: a generic signature is a piece of communication with every future caller of your code, not merely a set of rules for the compiler to check. `T`, `R`, `? extends T`, and `? super T` each make a specific, narrow claim about a relationship between types — and the moment a signature makes a claim broader or vaguer than the implementation actually needs (an unnecessary type parameter, an untruthful wildcard return type, an unnecessarily specific `List<T>` parameter where `Iterable<T>` would do), every caller inherits that vagueness as an ongoing cost, even though the underlying code never needed it in the first place.

## Common mistakes

**1. Returning a wildcard type (`List<? extends T>`) when the implementation always produces one exact, known type.** This needlessly restricts every caller from writing into the result, for no genuine safety benefit.

**2. Requiring a more specific parameter type (`List<T>`) than the method's logic actually uses.** If the method only iterates once, `Iterable<T>` is equally correct and strictly more broadly usable.

**3. Adding a type parameter that appears in only one place in a signature**, connecting nothing to anything else, when a plain wildcard would say the same thing honestly.

**4. Assuming a generic return type communicates mutability or ownership.** It does not; document those separately, in Javadoc or in the method's own naming, exactly as Chapter 4 taught for non-generic APIs.

**5. Copy-pasting `? extends`/`? super` onto a return type out of habit from parameter design**, without asking whether the wildcard genuinely reflects real uncertainty about which concrete type the method returns.

## Best practices

- State this lesson's guiding principle to yourself while designing any generic signature: accept the least restrictive useful input, return the most precise honest result.
- Prefer `Iterable<T>` over `List<T>` (or any other more specific collection interface) whenever a method's logic only needs single-pass iteration.
- Return an exact type (`List<Task>`) rather than a wildcarded one (`List<? extends Task>`) unless the implementation genuinely, truthfully might return different concrete subtypes.
- Remove any type parameter that does not connect at least two things in a signature; replace it with a wildcard if the method still needs to accept "any type" at that position.
- Document a generic API's ownership and mutability contract explicitly, since its generic type alone cannot express either.

## Summary

- A well-designed generic API accepts the least restrictive useful input and returns the most precise, honest result — every other guideline in this lesson is a specific application of that one sentence.
- `Function<? super T, ? extends R>` combines PECS correctly for a method that both consumes and produces generic values.
- A wildcarded return type forces every caller to manage unknown-type uncertainty the implementation may not actually have; return an exact type whenever the method genuinely always produces one.
- Accepting `Iterable<T>` instead of `List<T>` (or any narrower interface than a method's logic truly requires) is a free, strictly more flexible choice whenever only single-pass iteration is needed.
- A type parameter that appears in only one place in a signature, connecting nothing, is usually unnecessary; a wildcard expresses the same acceptance of "any type" more honestly.
- Ownership and mutability are never expressed by generics alone; document them explicitly, just as Chapter 4 taught for defensive copying and immutable design generally.

## Practice

Warm-up:

1. Write a generic method that accepts a `List<T>` but only ever iterates over it once; change its parameter type to `Iterable<T>` and confirm every existing caller still compiles.
2. Find a method signature (in this chapter's own examples, or code you have written) whose return type is wildcarded even though the implementation always returns one exact concrete type, and rewrite it to return that exact type.
3. Identify a type parameter in one of your own past exercises that appears in only one place in its signature, and replace it with a wildcard.

Core:

1. Design and implement a generic `static <T, R> R reduce(List<T> input, R initial, BiFunction<R, ? super T, R> accumulator)` method (a preview of the fold/reduce pattern Chapter 14 covers in depth with streams), applying PECS correctly to the accumulator's parameter.
2. Write a method that reads through any `Iterable<Integer>` and returns the sum, and demonstrate it working identically with a `List<Integer>`, a `Set<Integer>`, and any other `Iterable<Integer>` you construct.
3. Take `TransformDemo.transform` and write a short paragraph explaining, using this lesson's vocabulary, why its return type is `List<R>` and not `List<? extends R>`, referencing whether the implementation's actual behavior would ever justify the wildcard.

Challenge:

1. Design a small generic utility class with at least three methods, applying every principle from this lesson: correct PECS usage where applicable, the least restrictive input types you can justify, no return-type wildcards unless genuinely truthful, no decorative type parameters, and a short comment on each method documenting its ownership/mutability contract for any collection it returns.
2. Take a generic method you wrote in an earlier chapter-8 exercise and perform a deliberate "API review" on it using this lesson's checklist (input restrictiveness, return-type honesty, unnecessary type parameters, documented mutability), writing down at least one genuine improvement you make as a result, even if the original version already compiled correctly.

## Check your understanding

1. What is this lesson's one-sentence guiding principle for designing a generic API?
2. Why does returning `List<? extends Task>` from a method that always actually returns a `List<Task>` create an unnecessary burden for callers?
3. When is `Iterable<T>` a better parameter type choice than `List<T>`, and why does it cost nothing to use it in that situation?
4. What is the signal that a generic method's type parameter is unnecessary, and what should replace it?
5. Why can't a generic return type by itself tell a caller whether the returned collection is safe to mutate?
6. In `Function<? super T, ? extends R>`, which part reflects the function being a consumer of `T`, and which part reflects it being a producer of `R`?
