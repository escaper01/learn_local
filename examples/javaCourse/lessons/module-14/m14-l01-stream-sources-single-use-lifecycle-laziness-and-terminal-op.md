# Stream sources, single-use lifecycle, laziness, and terminal operations

A `Stream` is not a collection, and treating it like one is the single most common source of confusion for programmers new to Java's Stream API. A `List` holds elements and can be looked at as many times as you like; a `Stream` describes a **pipeline of work** over a source of elements, runs that pipeline exactly once, and is worthless afterward. This lesson covers where streams come from, why they can only be traversed once, why nothing in a pipeline actually runs until you ask for a final answer, and what "asking for a final answer" (a terminal operation) actually means.

What you will learn:

- Creating streams from collections, arrays, varargs, ranges, and other sources
- Why a stream can be traversed exactly once, and what happens if you try to reuse one
- Laziness: why building a pipeline with `filter` and `map` does nothing at all until a terminal operation runs
- Why elements are processed one at a time through the *entire* pipeline, rather than one stage at a time across all elements
- Terminal operations: the specific category of method that actually triggers traversal and produces a result

## Where streams come from

A stream can be created from a collection's `.stream()` method, directly from values with `Stream.of`, from an array with `Arrays.stream`, from a numeric range with `IntStream.range`/`rangeClosed`, or as a deliberately empty stream with `Stream.empty()`.

```java
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;

public class StreamSources {
    public static void main(String[] args) {
        Stream<String> fromCollection = List.of("a", "b", "c").stream();
        System.out.println("from collection: " + fromCollection.toList());

        Stream<String> fromVarargs = Stream.of("x", "y", "z");
        System.out.println("from Stream.of: " + fromVarargs.toList());

        int[] numbers = {1, 2, 3, 4};
        Stream<Integer> fromArray = Arrays.stream(numbers).boxed();
        System.out.println("from array (boxed): " + fromArray.toList());

        IntStream range = IntStream.rangeClosed(1, 5);
        System.out.println("from IntStream.rangeClosed: " + range.boxed().toList());

        Stream<Integer> empty = Stream.empty();
        System.out.println("empty stream count: " + empty.count());
    }
}
```

Output:

```text
from collection: [a, b, c]
from Stream.of: [x, y, z]
from array (boxed): [1, 2, 3, 4]
from IntStream.rangeClosed: [1, 2, 3, 4, 5]
empty stream count: 0
```

`Arrays.stream(int[])` produces an `IntStream` (a primitive-specialized stream, covered in depth in Lesson 3), so `.boxed()` converts each `int` into an `Integer` to obtain an ordinary `Stream<Integer>`. `IntStream.rangeClosed(1, 5)` produces `1` through `5` inclusive; the more commonly seen `IntStream.range(1, 5)` would stop at `4`, excluding the upper bound — the same inclusive/exclusive distinction Chapter 7 taught for array and list index bounds.

## Single-use: a stream can be traversed exactly once

A stream is not a reusable data structure — it represents one specific traversal, and once a **terminal operation** has run, that same stream object is permanently spent. Attempting to use it again throws `IllegalStateException`, regardless of which operation you try second.

```java
import java.util.stream.Stream;

public class SingleUseLifecycle {
    public static void main(String[] args) {
        Stream<String> stream = Stream.of("one", "two", "three");
        long count = stream.count();
        System.out.println("first terminal operation, count: " + count);

        try {
            stream.forEach(System.out::println);
        } catch (IllegalStateException e) {
            System.out.println("reusing the same stream failed: " + e.getMessage());
        }

        Stream<String> freshStream = Stream.of("one", "two", "three");
        freshStream.forEach(s -> System.out.println("fresh stream element: " + s));
    }
}
```

Output:

```text
first terminal operation, count: 3
reusing the same stream failed: stream has already been operated upon or closed
fresh stream element: one
fresh stream element: two
fresh stream element: three
```

Calling `.count()` consumes `stream` completely; calling `.forEach` on that same reference afterward is never allowed, no matter what the second operation is. If you need to traverse the same underlying data more than once, you must build a **new** stream from the original source each time (`someList.stream()` again, for instance) — a stream itself is a one-time traversal plan, not the data it traverses.

## Laziness: nothing runs until you ask for a result

Every method on `Stream` that returns another `Stream` (`filter`, `map`, `sorted`, `distinct`, and similar) is an **intermediate operation**. Calling one does not process a single element — it only records a step to be performed later. Nothing in the pipeline actually executes until a **terminal operation** is called.

```java
import java.util.List;
import java.util.stream.Stream;

public class Laziness {
    public static void main(String[] args) {
        System.out.println("building the pipeline (nothing has run yet):");
        Stream<String> pipeline = List.of("a", "b", "c").stream()
                .filter(s -> {
                    System.out.println("  filtering " + s);
                    return true;
                })
                .map(s -> {
                    System.out.println("  mapping " + s);
                    return s.toUpperCase();
                });
        System.out.println("pipeline built, nothing printed above except this message");

        System.out.println("now calling a terminal operation, forEach:");
        pipeline.forEach(s -> System.out.println("  terminal received " + s));
    }
}
```

Output:

```text
building the pipeline (nothing has run yet):
pipeline built, nothing printed above except this message
now calling a terminal operation, forEach:
  filtering a
  mapping a
  terminal received A
  filtering b
  mapping b
  terminal received B
  filtering c
  mapping c
  terminal received C
```

This is exactly the chapter's concept-check question: **a terminal operation is what starts ordinary lazy stream traversal**, not the moment the stream variable is created and not the moment `filter` is declared. Notice, too, the *order* the lines print in once traversal begins: `filtering a`, `mapping a`, `terminal received A` — the entire pipeline runs to completion for `"a"` before `"b"` is even touched. Streams generally process one element at a time, threading it through every stage of the pipeline before moving to the next element, rather than running `filter` across every element first and only then running `map` across every element. This "vertical," element-by-element execution is precisely what makes an unbounded or infinite source usable at all (a topic Lesson 5 covers directly): the pipeline never needs to fully materialize the "filtered results" before starting to map, because it never processes stage-by-stage across the whole source in the first place.

## Terminal operations: what actually triggers the work

A terminal operation produces a result that is not itself a stream — a `List`, a `long`, a `boolean`, an `Optional`, or simply performing an action per element — and it is the only thing that ever causes a stream's elements to actually be pulled through the pipeline.

```java
import java.util.List;
import java.util.Optional;

public class TerminalOperations {
    public static void main(String[] args) {
        List<Integer> numbers = List.of(3, 1, 4, 1, 5, 9);

        long count = numbers.stream().filter(n -> n > 2).count();
        System.out.println("count > 2: " + count);

        Optional<Integer> max = numbers.stream().max(Integer::compareTo);
        System.out.println("max: " + max.get());

        boolean anyEven = numbers.stream().anyMatch(n -> n % 2 == 0);
        System.out.println("any even: " + anyEven);

        Optional<Integer> first = numbers.stream().filter(n -> n > 3).findFirst();
        System.out.println("first > 3: " + first.get());

        int sum = numbers.stream().mapToInt(Integer::intValue).sum();
        System.out.println("sum: " + sum);
    }
}
```

Output:

```text
count > 2: 4
max: 9
any even: true
first > 3: 4
sum: 23
```

Each call here begins with a brand-new `numbers.stream()`, precisely because the previous section already established that a spent stream cannot be reused — five separate questions asked of the same `List` genuinely require five separate streams. `count`, `max`, `anyMatch`, `findFirst`, and `sum` (by way of `mapToInt`) are all terminal operations: each one is the specific call that finally causes traversal to happen and a concrete answer to come back, in contrast to `filter`, which by itself never processes anything at all.

> **Tip:** `.toList()` (used throughout this lesson) is a convenient shorthand, added in Java 16, for the far more general `.collect(Collectors.toCollection(...))` family that Lesson 4 covers in depth. It always returns an unmodifiable `List`; reach for the full `Collectors` API whenever you need a specific, mutable, or otherwise customized collection type back instead.

## What happens under the hood

Internally, a stream pipeline is built as a chain of lightweight, linked stage objects rather than as any kind of buffered, materialized collection — calling `filter` or `map` simply appends a new stage description to that chain and returns a new `Stream` wrapper referencing it. Only when a terminal operation is invoked does the stream implementation walk the *source* once, pushing each element through every stage of that chain in sequence, which is exactly why the elements are processed one at a time, end to end, rather than one pipeline stage at a time across the whole source: there is no intermediate collection sitting between stages for a stage-by-stage approach to even operate on.

## Common mistakes

**1. Storing a stream in a field or reusing a stream variable after a terminal operation has already run.** It throws `IllegalStateException`; build a fresh stream from the original source instead.

**2. Assuming `filter` or `map` does any work by itself.** Intermediate operations only record steps; nothing executes until a terminal operation is called.

**3. Expecting a stream's elements to be processed in separate full passes, one operation at a time.** They are processed one element at a time, through the entire pipeline, in most cases.

**4. Confusing a `Stream` with the collection it was created from.** The `Stream` is a one-time traversal plan; the original `List` or array is unaffected and can still be used to create additional streams.

**5. Forgetting that some terminal operations (like `findFirst` or `anyMatch`) can short-circuit and stop consuming the source early**, meaning not every element is guaranteed to pass through every stage on every run.

**6. Calling `.stream()` on a collection once and expecting to branch it into two separate downstream computations.** A single `Stream` instance supports exactly one terminal operation; two separate computations over the same data need two separate `.stream()` calls.

## Best practices

- Treat every stream as single-use: build a new one from the source each time you need to traverse it again.
- Remember that intermediate operations are purely descriptive until a terminal operation runs; do not expect side effects inside `filter`/`map` to happen "eagerly."
- Choose the terminal operation that matches what you actually need (`count`, `anyMatch`, `findFirst`, `collect`, `reduce`, and similar) rather than always materializing a full list and inspecting it afterward.
- Keep intermediate-operation lambdas free of side effects wherever possible; this lesson's `filter`/`map` prints are for demonstrating execution order only, not a pattern to copy into real pipelines.
- Reach for `IntStream`/`LongStream`/`DoubleStream` (via `mapToInt` and similar) when a computation is fundamentally numeric, avoiding unnecessary boxing.
- When two different questions need to be asked of the same underlying collection, create two separate streams rather than trying to reuse or branch one.

## Summary

- Streams can be created from collections, varargs, arrays, numeric ranges, and other sources; `Arrays.stream` on a primitive array yields a primitive-specialized stream.
- A stream can be traversed exactly once; calling any operation on an already-consumed stream throws `IllegalStateException`.
- Intermediate operations (`filter`, `map`, `sorted`, and similar) are purely lazy descriptions of work; nothing runs until a terminal operation is invoked.
- Elements generally flow through the entire pipeline one at a time, rather than being processed stage by stage across the whole source.
- Terminal operations (`count`, `forEach`, `collect`, `reduce`, `anyMatch`, `findFirst`, and similar) are the only calls that actually trigger traversal and produce a concrete result.

## Practice

Warm-up:

1. Create streams from a `List`, an array (using `Arrays.stream`), and `Stream.of`, and print each one's contents using `.toList()`.
2. Deliberately reuse a stream variable after calling a terminal operation on it, and confirm it throws `IllegalStateException`.
3. Create an empty stream with `Stream.empty()` and confirm that calling a terminal operation like `count()` or `findFirst()` on it behaves sensibly rather than throwing.
4. Build a pipeline with a `filter` containing a print statement, and confirm nothing prints until you add a terminal operation.

Core:

1. Write a pipeline with both `filter` and `map` stages, each containing a print statement, over a list of at least four elements, and confirm the printed order shows each element passing through the entire pipeline before the next one begins.
2. Using a single `List<Integer>`, compute at least three different terminal results (`count`, `sum` via `mapToInt`, and `max`), each from its own freshly created stream.
3. Write a method that demonstrates `findFirst()` short-circuiting: include a print statement inside a `filter` and confirm it does not run for elements past the first match.
4. Create a stream from `IntStream.range` (exclusive upper bound) and a separate one from `IntStream.rangeClosed` (inclusive upper bound) over the same numbers, and print both to confirm the exact difference in their final elements.

Challenge:

1. Design a small experiment using `peek` (a diagnostic-only intermediate operation) to print each element right before and right after a `map` stage, confirming your understanding of the one-element-through-the-whole-pipeline execution model.
2. Research (and briefly document, in a comment) why `Stream` does not implement `Iterable` in a way that allows a simple repeated `for` loop over the same stream instance, connecting your answer to this lesson's single-use lifecycle rule.

## Check your understanding

1. What specifically starts ordinary lazy stream traversal: creating the stream, declaring an intermediate operation, or calling a terminal operation?
2. What exception is thrown when you attempt to reuse a stream after a terminal operation has already run on it?
3. Why does building a pipeline with `filter` and `map` produce no output at all until a terminal operation is added?
4. In what order does a typical stream pipeline process its elements: one operation across all elements, or one element across all operations?
5. Name three different terminal operations and the general category of result each one produces.
6. Why can `Arrays.stream` on an `int[]` produce a stream that needs `.boxed()` before it becomes a plain `Stream<Integer>`?
7. If you need to compute both the count and the sum of the same list's elements, why does that require two separate `.stream()` calls rather than one shared stream?
8. What does calling `.count()` on `Stream.empty()` return, and why does that not throw an exception the way reusing a spent stream does?
