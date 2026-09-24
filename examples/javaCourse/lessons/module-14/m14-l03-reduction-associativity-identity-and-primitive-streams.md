# Reduction, associativity, identity, and primitive streams

`reduce` is the general-purpose tool for combining every element of a stream into a single result: a sum, a product, a maximum, a concatenation — anything that can be built up one element at a time from an accumulated running value. It looks deceptively simple, but its correctness under parallel execution depends on two mathematical properties, associativity and a genuine identity value, that are easy to overlook and produce silently wrong answers when violated. This lesson also covers the primitive-specialized streams (`IntStream`, `LongStream`, `DoubleStream`) that avoid the boxing overhead an ordinary `Stream<Integer>` pays for every numeric operation.

What you will learn:

- `reduce`'s two overloads: with an explicit identity value, and without one (returning an `Optional`)
- Associativity: the property `reduce` requires from its combining operation, and what goes wrong when that property does not hold
- Why subtraction is unsafe as a parallel reduction, even though it works perfectly well sequentially
- Why the identity value must be a genuine identity element for the operation, not merely a convenient starting number
- Primitive streams (`IntStream` and its relatives) and their specialized reductions, statistics, and `Optional` types

## reduce: combining every element into one result

`reduce` comes in two forms: one takes an explicit **identity** value (the result when the stream is empty) and an accumulator function; the other has no identity, and returns an `Optional` instead, since there is no sensible answer to give for an empty stream without one.

```java
import java.util.List;
import java.util.Optional;

public class ReduceBasics {
    public static void main(String[] args) {
        List<Integer> numbers = List.of(1, 2, 3, 4, 5);

        int sum = numbers.stream().reduce(0, Integer::sum);
        System.out.println("sum with identity: " + sum);

        int product = numbers.stream().reduce(1, (a, b) -> a * b);
        System.out.println("product with identity: " + product);

        Optional<Integer> maxWithoutIdentity = numbers.stream().reduce(Integer::max);
        System.out.println("max without identity: " + maxWithoutIdentity.get());

        Optional<Integer> emptyReduce = List.<Integer>of().stream().reduce(Integer::sum);
        System.out.println("reduce on empty stream without identity: " + emptyReduce);

        int emptyWithIdentity = List.<Integer>of().stream().reduce(0, Integer::sum);
        System.out.println("reduce on empty stream with identity: " + emptyWithIdentity);
    }
}
```

Output:

```text
sum with identity: 15
product with identity: 120
max without identity: 5
reduce on empty stream without identity: Optional.empty
reduce on empty stream with identity: 0
```

Notice the identity chosen matches the operation: `0` for addition (`x + 0 = x` for any `x`), `1` for multiplication (`x * 1 = x` for any `x`). `reduce(Integer::max)` with no identity has no such neutral value to fall back on for an empty stream, which is exactly why that overload returns `Optional<Integer>` rather than a plain `int` — an empty stream genuinely has no maximum, and `Optional.empty()` says so honestly rather than returning some arbitrary sentinel number.

## Associativity: why subtraction breaks under parallel reduction

`reduce`'s contract requires the combining operation to be **associative**: regrouping how the operands are combined must never change the final result — `(a op b) op c` must equal `a op (b op c)`. Addition and multiplication satisfy this; subtraction does not, since `(a - b) - c` and `a - (b - c)` are generally different numbers. Sequentially, `reduce` always combines strictly left to right, so it produces a specific, well-defined answer even with a non-associative operator — the danger appears specifically once the stream runs in **parallel**, because a parallel reduction is free to split the source into chunks, reduce each chunk independently, and combine the partial results in whatever grouping is convenient.

```java
import java.util.stream.IntStream;

public class AssociativityMatters {
    public static void main(String[] args) {
        int n = 100_000;

        int sequentialSubtract = IntStream.rangeClosed(1, n).boxed().reduce(0, (a, b) -> a - b);
        int parallelSubtract = IntStream.rangeClosed(1, n).boxed().parallel().reduce(0, (a, b) -> a - b);
        System.out.println("sequential reduce with subtraction: " + sequentialSubtract);
        System.out.println("parallel reduce with the same subtraction operator: " + parallelSubtract);
        System.out.println("sequential and parallel agree: " + (sequentialSubtract == parallelSubtract));

        int sequentialSum = IntStream.rangeClosed(1, n).boxed().reduce(0, Integer::sum);
        int parallelSum = IntStream.rangeClosed(1, n).boxed().parallel().reduce(0, Integer::sum);
        System.out.println("sequential and parallel sum agree: " + (sequentialSum == parallelSum));
    }
}
```

Output:

```text
sequential reduce with subtraction: -705082704
parallel reduce with the same subtraction operator: 0
sequential and parallel agree: false
sequential and parallel sum agree: true
```

The sequential and parallel runs use the **exact same** subtraction lambda over the **exact same** 100,000 numbers, yet produce completely different results (`-705082704` versus `0`) — because the parallel version genuinely did split the work into independently-reduced chunks and combine those partial results together, and subtraction's regrouping-sensitivity turned that internal implementation detail into a visibly wrong answer. The sum, by contrast, agrees exactly between sequential and parallel, because addition genuinely is associative (even accounting for `int` overflow — modular addition remains associative regardless of wraparound, which is why the sums still match bit-for-bit). This is precisely the chapter's concept-check answer: **subtraction is unsafe as a parallel reduction because regrouping its operands changes the result**, not because of anything related to a missing `synchronized` block or a compile-time restriction on the identity value.

## The identity value must be a genuine identity element

The identity argument to `reduce` is not merely "a starting number that happens to work sequentially" — under parallel execution, it is combined once per independently-reduced chunk, not once overall. If it is not a genuine identity element for the operation (a value that changes nothing when combined with any other value), a parallel reduction silently applies it multiple times, introducing bias that grows with however many chunks the runtime happens to create.

```java
import java.util.stream.IntStream;

public class IdentityRequirement {
    public static void main(String[] args) {
        int n = 100_000;

        int correctSum = IntStream.rangeClosed(1, n).boxed().reduce(0, Integer::sum);
        System.out.println("correct sequential sum with neutral identity 0: " + correctSum);

        int biasedParallel = IntStream.rangeClosed(1, n).boxed().parallel().reduce(5, Integer::sum);
        System.out.println("parallel reduce with non-neutral identity 5: " + biasedParallel);
        System.out.println("expected if identity were applied exactly once: " + (correctSum + 5));
        System.out.println("matches expectation: " + (biasedParallel == correctSum + 5));
    }
}
```

Output:

```text
correct sequential sum with neutral identity 0: 705082704
parallel reduce with non-neutral identity 5: 705083024
expected if identity were applied exactly once: 705082709
matches expectation: false
```

Using `5` instead of `0` as the "identity" for a sum is a mistake that a purely sequential mental model would predict just adds `5` once, giving `705082709` — but the actual parallel result, `705083024`, is off by far more than `5`, because `5` was folded into the total once for *every* chunk the parallel machinery happened to split the stream into, not once overall. The exact amount of extra bias depends on however many chunks the runtime created — an implementation detail you do not control and should never depend on — which is exactly why the identity value must be a real identity element (`0` for sum, `1` for product, `Integer.MIN_VALUE` or an empty/sentinel-safe choice for max, and so on), never simply "a value that happens to produce the right answer when applied exactly once."

## Primitive streams: avoiding boxing for numeric work

`IntStream`, `LongStream`, and `DoubleStream` are specialized stream types for primitive numeric data, avoiding the cost of boxing every value into `Integer`/`Long`/`Double` the way an ordinary `Stream<Integer>` would. They come with their own built-in reductions (`sum`, `max`, `min`, `average`) and a combined statistics object that computes several of these in a single pass.

```java
import java.util.IntSummaryStatistics;
import java.util.OptionalInt;
import java.util.stream.IntStream;

public class PrimitiveStreamsAndStats {
    public static void main(String[] args) {
        int[] scores = {85, 92, 78, 95, 88};

        int sum = IntStream.of(scores).sum();
        OptionalInt max = IntStream.of(scores).max();
        double average = IntStream.of(scores).average().orElse(0);

        System.out.println("sum: " + sum + ", max: " + max.getAsInt() + ", average: " + average);

        IntSummaryStatistics stats = IntStream.of(scores).summaryStatistics();
        System.out.println("stats: count=" + stats.getCount() + ", min=" + stats.getMin()
                + ", max=" + stats.getMax() + ", sum=" + stats.getSum() + ", average=" + stats.getAverage());

        OptionalInt emptyMax = IntStream.empty().max();
        System.out.println("max of empty IntStream: " + emptyMax);
    }
}
```

Output:

```text
sum: 438, max: 95, average: 87.6
stats: count=5, min=78, max=95, sum=438, average=87.6
max of empty IntStream: OptionalInt.empty
```

`IntStream.of(scores).max()` returns an `OptionalInt` (a primitive-specialized `Optional` avoiding boxing an `int` into an `Integer` just to wrap it), unwrapped here with `getAsInt()`. `summaryStatistics()` is the efficient choice whenever you need several of these numbers together (count, min, max, sum, average) — it computes all of them in a single pass over the data rather than requiring five separate streams the way asking for five separate `Stream<Integer>`-based terminal operations would (exactly the single-use lifecycle Lesson 1 established: five separate questions would otherwise cost five separate streams). Note `average()` itself returns `OptionalDouble`, correctly reflecting that an empty stream has no meaningful average either — `orElse(0)` supplies a fallback exactly as Chapter 13 taught for `Optional`.

## The three-argument overload: reducing to a different type

`reduce(identity, accumulator)`'s accumulator must be a `BinaryOperator<T>` — it takes two values of the stream's element type and returns another value of that *same* type. That is impossible when the result you want is genuinely a different type than the stream's elements — reducing a `Stream<String>` down to an `int` total length, for instance. The three-argument overload, `reduce(identity, accumulator, combiner)`, exists specifically for this case: the accumulator folds one element into a running result of a different type, and the combiner merges two partial results of that result type together, which is what a parallel execution needs in order to stitch chunk-level results back together.

```java
import java.util.List;

public class ThreeArgReduce {
    public static void main(String[] args) {
        List<String> words = List.of("stream", "reduce", "identity");

        int totalLength = words.stream().reduce(
                0,
                (partialLength, word) -> partialLength + word.length(),
                Integer::sum
        );
        System.out.println("total length across all words: " + totalLength);

        int totalLengthParallel = words.parallelStream().reduce(
                0,
                (partialLength, word) -> partialLength + word.length(),
                Integer::sum
        );
        System.out.println("same computation, run in parallel: " + totalLengthParallel);
    }
}
```

Output:

```text
total length across all words: 20
same computation, run in parallel: 20
```

The accumulator here (`(partialLength, word) -> partialLength + word.length()`) takes an `int` (the running total so far) and a `String` (the current element), returning an `int` — a type combination the two-argument overload's `BinaryOperator<T>` constraint simply cannot express. The combiner, `Integer::sum`, is never actually exercised by the sequential run (there is only ever one running total to combine with anything), but it is required regardless, and it is exactly what the parallel run needs to merge two chunks' independently-computed partial lengths back into one final total — correctly, in this case, since addition is associative and `0` is a genuine identity for it, exactly the properties this lesson has emphasized throughout.

## What happens under the hood

A sequential `reduce` is a simple left-to-right fold: apply the accumulator to the identity and the first element, then to that result and the second element, and so on, needing nothing more than the associativity property to define "the" answer unambiguously in the first place — sequentially, even a non-associative operator like subtraction still produces a well-defined result, because there is only ever one possible grouping when nothing runs concurrently. A parallel `reduce` instead recursively splits the source (via the stream's underlying `Spliterator`), reduces each piece independently using the identity and accumulator, and merges the partial results together using a combiner — a fundamentally different grouping of the same operations, which is exactly why associativity is not a stylistic preference but a hard correctness requirement the moment `.parallel()` enters the picture.

## Common mistakes

**1. Using a non-associative operation (subtraction, division, string formatting order, and similar) inside `reduce` on a stream that might ever run in parallel.** It produces a well-defined but implementation-detail-dependent, effectively unpredictable result.

**2. Choosing an identity value that "happens to work" sequentially rather than a genuine identity element for the operation.** Under parallel execution, it is applied once per chunk, not once overall, silently introducing bias.

**3. Assuming a stream automatically becomes parallel, or automatically stays sequential, without checking whether `.parallel()`/`.parallelStream()` was actually called somewhere in the pipeline.**

**4. Using `reduce` for a numeric computation that a primitive stream's dedicated method (`sum`, `max`, `average`, `summaryStatistics`) already provides**, paying unnecessary boxing overhead and writing more code than necessary.

**5. Forgetting that `reduce` without an identity returns an `Optional` (or `OptionalInt`/`OptionalLong`/`OptionalDouble` for primitive streams), which must be unwrapped rather than treated as a plain value.**

## Best practices

- Only use `reduce` with an operation you can confirm is genuinely associative, especially for any stream that might run in parallel now or in the future.
- Choose an identity value that is a true identity element for the operation, not merely a value that happens to produce a correct-looking result in a purely sequential test.
- Prefer a primitive stream's dedicated methods (`sum`, `max`, `min`, `average`, `summaryStatistics`) over a hand-written `reduce` for straightforward numeric aggregation.
- Use the identity-less `reduce` overload (returning an `Optional`) when there genuinely is no sensible default for an empty stream, and handle that `Optional` explicitly.
- Avoid reaching for `.parallel()` casually; confirm both associativity and a genuine identity value before doing so, and measure whether parallelism actually helps before keeping it (Lesson 5 covers this decision directly).

## Summary

- `reduce(identity, accumulator)` always returns a plain value, using the identity for an empty stream; `reduce(accumulator)` with no identity returns an `Optional`, since an empty stream has no sensible default otherwise.
- `reduce`'s combining operation must be associative — regrouping the operands must never change the result — because a parallel reduction is free to combine partial results in whatever grouping is convenient.
- Subtraction is a concrete example of a non-associative operation: it produces a well-defined answer sequentially but a different, implementation-detail-dependent answer under parallel execution.
- The identity value must be a genuine identity element for the operation; a merely convenient starting value is applied once per chunk under parallel execution, silently introducing bias.
- `IntStream`/`LongStream`/`DoubleStream` avoid boxing for numeric work and provide dedicated reductions like `sum`, `max`, `average`, and `summaryStatistics`, along with primitive-specialized `Optional` types.

## Practice

Warm-up:

1. Use `reduce` with an explicit identity to compute the sum and the product of the same list of numbers, printing both.
2. Use the identity-less `reduce` overload to find the minimum of a list, and separately confirm it returns `Optional.empty()` for an empty list.
3. Compute the sum, max, and average of an `int[]` array using `IntStream`'s dedicated methods, without using `reduce` at all.

Core:

1. Reproduce this lesson's subtraction experiment with your own choice of a reasonably large numeric range, confirming sequential and parallel results disagree, and write a one-paragraph explanation of why in your own words.
2. Reproduce this lesson's non-neutral-identity experiment with a different operation of your choosing (for example, multiplication with a non-`1` identity), confirming the same class of bias appears.
3. Use `IntSummaryStatistics` to compute count, min, max, sum, and average of a data set in one pass, and compare the code required against computing each of those five values with five separate streams.

Challenge:

1. Design a small "safe reduce" helper method that documents, in its own Javadoc-style comment, the associativity and identity requirements its caller must satisfy, and use it correctly for at least one genuinely associative operation.
2. Research (and briefly document, in a comment) what the three-argument `reduce(identity, accumulator, combiner)` overload is for, and explain a scenario (such as reducing to a different result type than the stream's element type) where the two-argument overload cannot be used at all.

## Check your understanding

1. What is the difference between `reduce`'s identity-based overload and its identity-less overload, and why does the identity-less one return an `Optional`?
2. What does it mean for an operation to be associative, and why does `reduce` require it?
3. Why did subtraction produce different results between sequential and parallel execution in this lesson's example, when addition did not?
4. Why did using `5` as the identity for a parallel sum produce a result off by more than `5`, rather than exactly `5`?
5. What advantage does `IntStream` offer over an ordinary `Stream<Integer>` for numeric computation, and what does `summaryStatistics()` compute in a single pass?
6. Why does `IntStream.empty().max()` return `OptionalInt.empty()` rather than throwing an exception or returning a sentinel number like `0`?
