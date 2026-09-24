# Chapter 14 assessment and deliberate practice

This chapter turned "processing a collection" into a deliberate design discipline: understanding exactly when a pipeline actually runs, choosing the right shaping operation for one-to-one versus one-to-many transformations, knowing which operations are safe to run in parallel and which quietly are not, collecting results into the right structure with an explicit collision policy, and correctly handling the specific sources — infinite generators, open file handles — that do not behave like a plain in-memory list. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Stream sources, single-use lifecycle, laziness, and terminal operations

Streams can be created from collections, arrays, varargs, and numeric ranges. A stream can be traversed exactly once; reusing one after a terminal operation throws `IllegalStateException`. Intermediate operations (`filter`, `map`) are purely lazy descriptions of work — nothing runs until a terminal operation (`count`, `forEach`, `collect`, `reduce`, and similar) is invoked, and elements generally flow through the entire pipeline one at a time rather than one stage at a time across the whole source.

### Lesson 2: filter, map, flatMap, distinct, sorted, and peek

`filter` keeps elements satisfying a condition; `map` transforms each element one-to-one; `flatMap` maps each element to its own stream and flattens all of those streams into one, the correct tool whenever one input element should produce many output elements. `distinct` (via `equals`) and `sorted` (naturally or via a `Comparator`) are stateful operations that must see the entire source. `peek` is debugging-only — the Stream API may skip its action whenever it can prove the final result is unaffected, so it must never carry logic a program's correctness depends on.

### Lesson 3: Reduction, associativity, identity, and primitive streams

`reduce` combines every element into one result, using an identity value for empty streams or returning an `Optional` without one. Its combining operation must be associative — regrouping operands must never change the result — because a parallel reduction is free to combine partial results in whatever grouping is convenient; subtraction is a concrete example that breaks under parallel execution despite working correctly sequentially. The identity value must be a genuine identity element, since a parallel reduction applies it once per chunk, not once overall. `IntStream`/`LongStream`/`DoubleStream` avoid boxing and provide dedicated reductions like `sum`, `max`, and `summaryStatistics`.

### Lesson 4: Collectors, grouping, partitioning, mapping, and merge policies

`Collectors.toMap` throws `IllegalStateException` on a duplicate key unless a merge function is supplied, specifying exactly how colliding values combine. `groupingBy` classifies elements into buckets and composes with downstream collectors (`counting`, `summingInt`, `mapping`, and similar) to control each bucket's contents. `partitioningBy` is a boolean-specialized grouping guaranteeing exactly two keys, `true` and `false`, are always present, even when one bucket is empty.

### Lesson 5: Infinite streams, resource streams, parallelism, and interference

`Stream.iterate`/`generate` produce unbounded streams that must always be paired with `limit` or a `hasNext` predicate. `Files.lines` and other resource-backed streams own an external resource (a file handle) and must be closed, ideally via try-with-resources. Mutating a stream's source during traversal causes interference, typically `ConcurrentModificationException`. `.parallel()` helps for large, CPU-bound, associative workloads and hurts (via pure coordination overhead) for small ones — and its performance benefit is a separate question from whether its use is even correct in the first place.

## Cheat sheet

### Stream lifecycle

| Concept | Rule |
|---|---|
| Creating a stream | From a collection, array, varargs, or numeric range |
| Reusing a stream | Never; a fresh stream is required per traversal |
| Intermediate operations | Lazy; recorded but not executed until a terminal operation runs |
| Terminal operations | The only calls that actually trigger traversal |

### Shaping operations

| Operation | Element count | Stateful? |
|---|---|---|
| `filter` | Same or fewer | No |
| `map` | Same (one-to-one) | No |
| `flatMap` | Any (one-to-many, flattened) | No |
| `distinct` | Same or fewer | Yes |
| `sorted` | Same, reordered | Yes |
| `peek` | Same, unchanged | No, but not guaranteed to run for every element |

### Reduction and collection

| Situation | Correct choice |
|---|---|
| Combining elements with a non-associative operation | Never safe under `.parallel()` |
| Identity value for a parallel reduction | Must be a genuine identity element, applied correctly regardless of chunk count |
| Duplicate keys possible in `toMap` | Supply a merge function |
| Classifying by a boolean condition | `partitioningBy`, not `groupingBy` |
| Numeric aggregation | Prefer `IntStream`/`Collectors` built-ins over hand-written `reduce` |

### Sources requiring care

| Source | Requirement |
|---|---|
| `Stream.iterate`/`generate` | Must be bounded with `limit` or a `hasNext` predicate |
| `Files.lines` | Must be closed, ideally via try-with-resources |
| A mutable collection's `.stream()` | Must not be mutated during that stream's traversal |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Is a stream variable reused after a terminal operation has already run on it?
- Is `map` used where `flatMap` was actually needed, leaving a nested structure?
- Does `peek` carry any logic the program's correctness actually depends on?
- Is a non-associative operation (like subtraction) used inside a `reduce` that might ever run in parallel?
- Does a `Collectors.toMap` call omit a merge function despite duplicate keys being possible?
- Is an infinite `Stream.iterate`/`generate` call missing a `limit` or `hasNext` predicate?
- Is `Files.lines` used without try-with-resources?
- Is a collection mutated from inside a stream currently traversing it?

## The judgment question

The judgment question describes a parallel reduction giving inconsistent results, and asks what should be checked — the correct answer is **associativity and shared mutable state**, not merely the terminal method's spelling and not merely whether `parallel()`/`parallelStream()` was called. Lesson 3 demonstrated exactly this failure mode directly: the same subtraction lambda produced different, wrong results under parallel execution specifically because subtraction is not associative, and a parallel reduction is free to combine partial results in whatever grouping the runtime happens to choose. Shared mutable state introduces a second, independent way parallel execution can misbehave — if an accumulator or combiner reads or writes state shared across threads without synchronization, results become not just wrong but genuinely non-deterministic, varying from run to run. Neither problem has anything to do with a terminal method's name or whether `.parallel()` was spelled correctly; both are correctness properties of the *operation itself* that must hold before parallel execution is even a safe option to consider.

## Approaching the implementation lab

The lab asks for `evenSquares`: return the sum of the squares of all even integers in the input array.

1. Write the precondition and boundary table first: an empty array, an array with no even numbers, an array containing a negative even number, and an array containing only odd numbers.
2. Recall Lesson 2's ordering guidance: filter for evenness first, then map to squares, then sum — checking evenness on the smaller original values rather than on already-squared ones, though either order happens to work correctly here since squaring does not change a number's parity.
3. Use a primitive stream (`Arrays.stream(value1)`, an `IntStream`) and its `sum()` method, following Lesson 3's guidance to prefer built-in numeric reductions over a hand-written `reduce` for straightforward aggregation.
4. Keep the method deterministic and side-effect-free, exactly as every function lab in this course requires.

## Approaching the debug lab

The debug lab's pipeline uses `map(s -> Arrays.stream(s.split(" ")))`, producing a stream of nested per-line word-streams rather than a flat stream of words, so `count()` incorrectly reports `2` (the number of lines) instead of the required `3` (the total number of words).

1. Run the program and confirm it currently prints `2` instead of the expected `3`.
2. Recall Lesson 2's exact distinction: `map` here produces one `Stream<String>` object per input line, leaving a `Stream<Stream<String>>` overall; `count()` on that outer stream simply counts how many inner stream objects exist, not how many words they collectively contain.
3. Change `.map(s -> Arrays.stream(s.split(" ")))` to `.flatMap(s -> Arrays.stream(s.split(" ")))`, keeping the same split-and-count structure otherwise unchanged.
4. Confirm your fix now prints `3`, and be ready to explain, without consulting the answer, why `flatMap` versus `map` changes what `count()` actually measures in this specific pipeline.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Build a pipeline combining `filter`, `flatMap`, `distinct`, and `sorted` over a data set of your choosing, and write a short comment describing what each stage contributes.
2. Reproduce Lesson 3's associativity experiment with your own non-associative operation, confirming sequential and parallel results disagree, and explain why in your own words.
3. Design a `groupingBy` pipeline with at least one downstream collector (`counting`, `summingInt`, or `mapping`), and a separate `partitioningBy` pipeline, over the same underlying data, comparing what each produces.
4. Build a small utility using `Files.lines` inside try-with-resources to process a real text file, and confirm no file handle is left open even when an exception is deliberately triggered mid-processing.
5. Measure, on your own machine, at what rough input size `.parallel()` starts to outperform sequential execution for a computation of your choosing.

## Self-assessment

You are ready for Chapter 15 when you can do all of the following without notes:

- Explain why a stream can only be traversed once, and what triggers its actual execution.
- Choose correctly between `map` and `flatMap` based on whether a transformation is one-to-one or one-to-many.
- Explain why `peek` must never carry logic a program's correctness depends on.
- Explain what associativity means for `reduce`, and describe a concrete example of an operation that violates it.
- Explain why a `Collectors.toMap` call needs a merge function when duplicate keys are possible, and what `partitioningBy` guarantees that `groupingBy` with a boolean classifier does not.
- Explain why `Files.lines` must be closed, and what causes `ConcurrentModificationException` when a stream's source is mutated during traversal.
- Explain when `.parallel()` genuinely helps performance, and why that question is entirely separate from whether using it is even correct in the first place.
