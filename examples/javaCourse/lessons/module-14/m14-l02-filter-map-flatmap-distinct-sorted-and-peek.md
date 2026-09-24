# filter, map, flatMap, distinct, sorted, and peek

Lesson 1 established the vocabulary of a stream pipeline — lazy intermediate operations, single-use traversal, and a terminal operation that finally triggers execution. This lesson covers the specific intermediate operations you will reach for constantly: transforming elements, removing duplicates or unwanted values, ordering results, and flattening nested structures — plus one operation, `peek`, whose only honest use is looking at a pipeline while you debug it.

What you will learn:

- `filter`: keeping only elements that satisfy a condition
- `map`: transforming each element into something else, one-to-one
- `flatMap`: mapping each element to its *own* stream and flattening every one of those streams into a single stream
- `distinct` and `sorted`: removing duplicates (via `equals`) and ordering elements (naturally or with a `Comparator`)
- `peek`: a debugging-only operation that is not guaranteed to run for every element, and must never carry real program logic

## filter and map: the two workhorses

`filter` keeps only the elements for which a `Predicate` returns `true`, discarding the rest; `map` transforms every remaining element into something else, one input element always producing exactly one output element.

```java
import java.util.List;

public class FilterMapBasics {
    public static void main(String[] args) {
        List<String> words = List.of("apple", "kiwi", "banana", "fig", "cherry");

        List<String> longWords = words.stream()
                .filter(w -> w.length() > 4)
                .toList();
        System.out.println("words longer than 4 chars: " + longWords);

        List<Integer> lengths = words.stream()
                .map(String::length)
                .toList();
        System.out.println("lengths: " + lengths);

        List<String> upperLongWords = words.stream()
                .filter(w -> w.length() > 4)
                .map(String::toUpperCase)
                .toList();
        System.out.println("upper long words: " + upperLongWords);
    }
}
```

Output:

```text
words longer than 4 chars: [apple, banana, cherry]
lengths: [5, 4, 6, 3, 6]
upper long words: [APPLE, BANANA, CHERRY]
```

`filter` never changes an element's type or value — it only decides whether that element continues down the pipeline. `map` never changes the *count* of elements — five words in, five lengths out, even though the type changed from `String` to `Integer`. Chaining `filter` before `map` (as the third example does) applies each stage in the element-by-element order Lesson 1 described: a word is checked for length first, and only a word that passes is then uppercased — a rejected word is never even passed to `map` at all.

## flatMap: one element in, many elements out, all flattened together

`map` is fundamentally one-to-one. When each input element should produce *several* output elements — words from a sentence, or elements from a nested list — `flatMap` is the correct tool: it maps each element to its own stream, then flattens all of those individual streams into a single combined stream.

```java
import java.util.Arrays;
import java.util.List;

public class FlatMapDemo {
    public static void main(String[] args) {
        List<List<Integer>> nested = List.of(List.of(1, 2), List.of(3, 4, 5), List.of());

        List<List<Integer>> withMap = nested.stream()
                .map(list -> list)
                .toList();
        System.out.println("map alone leaves nested structure: " + withMap);

        List<Integer> flattened = nested.stream()
                .flatMap(List::stream)
                .toList();
        System.out.println("flatMap flattens into one stream: " + flattened);

        List<String> sentences = List.of("java sql", "python go");
        List<String> words = sentences.stream()
                .flatMap(s -> Arrays.stream(s.split(" ")))
                .toList();
        System.out.println("words from all sentences: " + words);
    }
}
```

Output:

```text
map alone leaves nested structure: [[1, 2], [3, 4, 5], []]
flatMap flattens into one stream: [1, 2, 3, 4, 5]
words from all sentences: [java, sql, python, go]
```

This is exactly the chapter's concept-check question: **`flatMap` is the operation that flattens nested element streams**, not `peek` and not `map` used alone. `map(list -> list)` leaves the result a `List<List<Integer>>` — still nested, one inner list per outer element, three elements in and three elements out. `flatMap(List::stream)` instead converts each inner `List<Integer>` into its own `Stream<Integer>` and merges every one of those streams into a single flat sequence — three inner lists in, but five total integers out, because the element count is no longer required to match one-to-one. The `sentences` example applies the identical idea to text: each sentence becomes its own stream of words (via `String.split` and `Arrays.stream`), and `flatMap` merges every sentence's words into one combined stream of words — precisely the fix the chapter's own debug lab requires, since using `map` there would leave a stream of nested word-streams instead of a stream of actual words.

This is the same "flatten one level of nesting" idea Chapter 13 taught for `Optional.flatMap`, generalized from "zero or one value" to "any number of values": `Optional.flatMap` avoids producing an `Optional<Optional<T>>`, and `Stream.flatMap` avoids producing a `Stream<Stream<T>>`, for exactly the same underlying reason — a plain `map` cannot itself know that its transformation produces another container that ought to be merged into the outer one, so `flatMap` exists specifically to do that merging step.

## distinct and sorted: deduplication and ordering

`distinct` removes duplicate elements using `equals()` (record types and most well-behaved classes make this straightforward, since Chapter 6 already established how `equals`/`hashCode` should be implemented); `sorted()` orders elements either by their natural ordering (if they implement `Comparable`) or by an explicit `Comparator` you supply.

```java
import java.util.Comparator;
import java.util.List;

public class DistinctAndSorted {
    record Person(String name, int age) {}

    public static void main(String[] args) {
        List<Integer> numbers = List.of(3, 1, 4, 1, 5, 9, 2, 6, 5);
        List<Integer> unique = numbers.stream().distinct().toList();
        System.out.println("distinct: " + unique);

        List<Integer> sortedNatural = numbers.stream().distinct().sorted().toList();
        System.out.println("distinct + natural sort: " + sortedNatural);

        List<Person> people = List.of(
                new Person("Ada", 36),
                new Person("Bob", 24),
                new Person("Cy", 24)
        );
        List<Person> byAgeThenName = people.stream()
                .sorted(Comparator.comparingInt(Person::age).thenComparing(Person::name))
                .toList();
        System.out.println("sorted by age then name: " + byAgeThenName);
    }
}
```

Output:

```text
distinct: [3, 1, 4, 5, 9, 2, 6]
distinct + natural sort: [1, 2, 3, 4, 5, 6, 9]
sorted by age then name: [Person[name=Bob, age=24], Person[name=Cy, age=24], Person[name=Ada, age=36]]
```

`distinct()` preserves the first occurrence's relative order and simply drops later duplicates (`1` appears once in the output, at its first position). `sorted()` with no argument uses `Integer`'s natural ordering; `sorted(Comparator...)` lets you build an arbitrary ordering, and `Comparator.comparingInt(...).thenComparing(...)` chains a primary key with a tie-breaking secondary key — Bob and Cy share the same age, so the secondary comparator (name) decides their relative order, while Ada's distinctly different age alone determines her position. Both `distinct` and `sorted` are **stateful** intermediate operations: unlike `filter` or `map`, which can make an immediate decision about one element in isolation, they must see every element (or at least remember enough of them) before producing any output at all — `sorted`, in particular, cannot emit its first result until the entire upstream source has been consumed.

## peek: debugging only, never real logic

`peek` lets you look at each element as it flows through a pipeline, without otherwise changing it — useful for temporarily seeing what a pipeline is actually doing. It is *not* a safe place to put logic your program depends on, because the Stream API explicitly reserves the right to skip calling `peek`'s action for elements it can determine the pipeline does not actually need to inspect.

```java
import java.util.stream.Stream;

public class PeekIsForDebuggingOnly {
    public static void main(String[] args) {
        System.out.println("peek before count(), with no filter (size already known upfront):");
        long n = Stream.of("a", "b", "c")
                .peek(s -> System.out.println("  peek saw " + s))
                .count();
        System.out.println("count: " + n);

        System.out.println("peek before count(), after a filter (size no longer known upfront):");
        long m = Stream.of("a", "b", "c")
                .filter(s -> true)
                .peek(s -> System.out.println("  peek saw " + s))
                .count();
        System.out.println("count: " + m);
    }
}
```

Output:

```text
peek before count(), with no filter (size already known upfront):
count: 3
peek before count(), after a filter (size no longer known upfront):
  peek saw a
  peek saw b
  peek saw c
count: 3
```

In the first pipeline, `count()` can determine the answer (`3`) directly from the known source size, without ever needing to actually visit each element — so the JDK's implementation skips running `peek`'s action entirely, and nothing prints. Adding a `filter` before `peek` removes that shortcut (the final count now genuinely depends on evaluating the filter per element), so `peek` correctly runs for every element in the second pipeline. Both pipelines report the identical, correct `count: 3` — the optimization never changes the *result* of a well-formed pipeline, only whether a purely observational `peek` actually gets a chance to run. If your program's correctness depended on that first `peek` running, this exact difference would produce a silent, environment-and-JDK-implementation-dependent bug — the reason `peek` should carry nothing but throwaway diagnostic printing, never actual program logic.

> **Tip:** `Stream.concat(a, b)` combines two existing streams end to end into one, which is a different tool from `flatMap`: `concat` joins two already-separate streams together, while `flatMap` produces those per-element streams itself, one per input element, before merging all of them.

## What happens under the hood

`filter` and `map` are **stateless** intermediate operations — each output element depends only on the one input element currently being processed, which is exactly what allows the one-element-through-the-whole-pipeline execution model from Lesson 1 to work at all. `distinct` and `sorted` are **stateful** — the implementation must retain state across elements (a set of already-seen values for `distinct`, a growing buffer for `sorted`) — which is also exactly why a stream pipeline's overall implementation is permitted to apply optimizations like the `peek`/`count` shortcut shown above: it is free to reorganize or skip work whenever it can prove the final result would be identical either way.

## Common mistakes

**1. Using `map` where `flatMap` was needed**, leaving a nested structure (a stream of streams, or a stream of lists) instead of a properly flattened one.

**2. Relying on `peek` to perform logic the program's correctness actually depends on.** The Stream API explicitly permits skipping `peek`'s action when it can prove the result is unaffected; use `map` or `forEach` for logic that must always run.

**3. Assuming `distinct()` works on arbitrary objects without a properly implemented `equals`/`hashCode` pair.** Records and well-designed value classes handle this correctly by construction; classes relying on default identity-based `equals` will not deduplicate meaningfully.

**4. Expecting `sorted()` to produce results before the entire upstream source has been consumed.** It is a stateful operation and must see every element first.

**5. Chaining `filter` after `map` when the filter condition could have been checked on the original, pre-transformed value**, doing unnecessary transformation work on elements that will be discarded anyway.

**6. Confusing `Stream.concat` with `flatMap`.** `concat` joins two already-existing streams together; `flatMap` generates a per-element stream itself and merges all of those.

**7. Assuming a stateless operation like `map` must fully process the source before a stateful one like `sorted` can start.** It is the other way around: `sorted` is the one forced to wait for the whole source, while stateless stages ahead of it still run per element as they feed it.

## Best practices

- Reach for `flatMap` the moment a transformation would naturally produce more than one output element per input element.
- Order `filter` before `map` when possible, so elements are transformed only after they have already been confirmed relevant.
- Use `peek` exclusively for temporary, throwaway debugging output; remove it (or replace it with `forEach`/`map`) once its diagnostic purpose is served.
- Prefer `Comparator.comparing(...).thenComparing(...)` chains over a single hand-written comparison method when sorting by more than one key.
- Remember that `distinct` and `sorted` are stateful operations that must process the entire source before completing, unlike `filter` and `map`.
- Reach for `Stream.concat` when you genuinely have two separate, already-existing streams to join, rather than reshaping the problem to force `flatMap` to do it.

## Summary

- `filter` keeps elements satisfying a condition; `map` transforms each element one-to-one; neither changes the other's fundamental behavior when chained together.
- `flatMap` maps each element to its own stream and flattens every one of those streams into a single combined stream — the correct tool whenever one input element should produce many output elements.
- `distinct` removes duplicates using `equals()`; `sorted()` orders elements naturally or via a supplied `Comparator`, and both are stateful operations that must see the entire source.
- `peek` is a debugging-only operation whose action is not guaranteed to run for every element, since the Stream API may skip it whenever the final result is provably unaffected.
- Stateless operations (`filter`, `map`) process one element in isolation; stateful operations (`distinct`, `sorted`) must retain information across elements, which is also what permits certain pipeline-level optimizations.
- `Stream.concat` joins two already-separate streams together; it solves a different problem from `flatMap`, which generates each per-element stream itself before merging them.

## Practice

Warm-up:

1. Filter a list of numbers for evenness, then map the survivors to their squares, and print the result.
2. Reorder the same pipeline as `map` then `filter` on the squared values, and confirm both orderings produce the same final set of numbers here, then explain in a comment why that would not hold if the filter condition depended on the pre-squared value instead.
3. Given a `List<List<String>>`, use `flatMap` to produce a single flat `List<String>` of every inner element.
4. Deduplicate a list containing repeated values with `distinct()`, then sort the result naturally, and print both intermediate and final results.

Core:

1. Given a list of sentences, use `flatMap` to produce a flat list of every distinct word across all sentences, combining `flatMap`, `distinct`, and `sorted` in one pipeline.
2. Sort a list of a record type you define by two fields using `Comparator.comparing(...).thenComparing(...)`, and print the result to confirm the tie-breaking behavior.
3. Sort the same list of records in reverse order using `Comparator.reverseOrder()` or `.reversed()`, and confirm the ordering is exactly the inverse of the ascending result.
4. Reproduce this lesson's `peek`/`count` experiment with your own pipeline, and write a short explanation, in your own words, of why the same `peek` call runs in one case and not the other.
5. Combine two separate lists into one stream using `Stream.concat`, and separately combine a `List<List<Integer>>` into one flat stream using `flatMap`, writing a short comment noting how the two operations differ.

Challenge:

1. Design a small "search index" pipeline that takes a list of documents (each a `List<String>` of words), uses `flatMap` to produce every distinct word across the whole index, and reports each word alongside how many documents contain it (without using `Collectors`, which Lesson 4 introduces — a manual loop over the flattened result is fine here).
2. Research (and briefly document, in a comment) one other Stream API method besides `count()` whose specification explicitly permits skipping some elements' processing under certain conditions, and explain why relying on `peek` for real logic anywhere in such a pipeline would be unsafe.
3. Build a pipeline combining `filter`, `flatMap`, `distinct`, and `sorted` in one chain over a data set of your choosing, and write a short comment describing, stage by stage, what each operation contributes.

## Check your understanding

1. What is the fundamental difference in element count between what `filter`, `map`, and `flatMap` each produce?
2. Why does `map(list -> list)` leave a nested structure that `flatMap(List::stream)` correctly flattens?
3. What determines whether `distinct()` treats two elements as duplicates?
4. Why are `distinct` and `sorted` described as "stateful" operations, unlike `filter` and `map`?
5. Why did `peek`'s action fail to run in one version of this lesson's `count()` example but run in the other, even though both pipelines reported the same correct count?
6. Why should `peek` never be used to perform logic a program's correctness actually depends on?
7. How does `Stream.flatMap` relate to the `Optional.flatMap` Chapter 13 already taught, and what problem does each one solve in its own context?
8. What is the difference between what `Stream.concat` and `flatMap` each combine?
