# Infinite streams, resource streams, parallelism, and interference

This final lesson on streams covers four remaining topics that each involve a stream doing something outside the simple "wrap a fixed, in-memory collection" model: sources with no defined end at all, sources that hold a real external resource that must be released, running a pipeline across multiple threads, and the specific danger of mutating a stream's source while that stream is still being traversed.

What you will learn:

- `Stream.iterate` and `Stream.generate`: producing streams with no inherent end, safely bounded with `limit` or a `hasNext`-style predicate
- Why `Files.lines` (and similar resource-backed streams) must be closed, ideally via try-with-resources
- Interference: why mutating a stream's underlying source during traversal throws `ConcurrentModificationException` or produces undefined behavior
- When `.parallel()`/`.parallelStream()` genuinely helps, and when its overhead makes a pipeline slower rather than faster

## Infinite streams: iterate, generate, and bounding them safely

`Stream.iterate(seed, next)` produces an unbounded stream by repeatedly applying `next` to the previous value; `Stream.generate(supplier)` produces an unbounded stream by calling a `Supplier` with no relationship between successive elements at all. Neither one can be collected or counted without first bounding it — `limit(n)` caps the number of elements, and a three-argument `Stream.iterate(seed, hasNext, next)` overload stops automatically once a predicate becomes false.

```java
import java.util.List;
import java.util.stream.Stream;

public class InfiniteStreams {
    public static void main(String[] args) {
        List<Integer> firstFive = Stream.iterate(1, n -> n * 2)
                .limit(5)
                .toList();
        System.out.println("powers of two: " + firstFive);

        List<Integer> boundedByPredicate = Stream.iterate(1, n -> n < 100, n -> n * 2)
                .toList();
        System.out.println("iterate with a hasNext predicate: " + boundedByPredicate);

        List<Double> constantSupplier = Stream.generate(() -> 0.5)
                .limit(3)
                .toList();
        System.out.println("generate (constant supplier here): " + constantSupplier);
    }
}
```

Output:

```text
powers of two: [1, 2, 4, 8, 16]
iterate with a hasNext predicate: [1, 2, 4, 8, 16, 32, 64]
generate (constant supplier here): [0.5, 0.5, 0.5]
```

Both `Stream.iterate(1, n -> n * 2).limit(5)` and the whole point of Lesson 1's laziness lesson connect directly here: the stream never actually computes "all" powers of two (there is no such thing) — it lazily produces exactly as many elements as the downstream `limit(5)` or terminal operation actually asks for, one at a time. The three-argument `iterate` overload (with an explicit `hasNext` predicate, `n -> n < 100`) is generally clearer than an unbounded `iterate` paired with a separately-computed `limit`, since the stopping condition is stated directly in terms of the values themselves rather than a element count you would otherwise have to calculate by hand. Forgetting to bound an infinite stream at all — calling `.toList()` directly on `Stream.iterate(1, n -> n * 2)` with no `limit` — would simply never terminate.

## Resource streams: Files.lines must be closed

Most streams wrap plain in-memory data and need no cleanup at all. `Files.lines(path, charset)` (introduced in Chapter 12) is different: it opens a real file handle behind the scenes, and that handle stays open until the stream itself is closed — `Stream` implements `AutoCloseable` specifically to support cases exactly like this one.

```java
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

public class ResourceStreamDemo {
    public static void main(String[] args) throws Exception {
        Path file = Files.createDirectories(Path.of("/work")).resolve("lines.txt");
        Files.writeString(file, "first\nsecond\nthird\n", StandardCharsets.UTF_8);

        List<String> upperLines;
        try (Stream<String> lines = Files.lines(file, StandardCharsets.UTF_8)) {
            upperLines = lines.map(String::toUpperCase).toList();
        }
        System.out.println("read and closed safely via try-with-resources: " + upperLines);

        Stream<String> notYetClosed = Files.lines(file, StandardCharsets.UTF_8);
        long count = notYetClosed.count();
        System.out.println("counted lines without try-with-resources: " + count);
        notYetClosed.close();
        System.out.println("manually closed as a fallback here; always prefer try-with-resources instead");
    }
}
```

Output:

```text
read and closed safely via try-with-resources: [FIRST, SECOND, THIRD]
counted lines without try-with-resources: 3
manually closed as a fallback here; always prefer try-with-resources instead
```

This is exactly the chapter's concept-check question: **`Files.lines` must be closed because its stream owns an external file resource**, not because closing is somehow required to "start" filtering, and not because a buffered reader closes itself automatically when the JVM exits (relying on process exit to release resources is exactly the kind of fragile assumption Chapter 11's resource-management lessons warned against). The second half of this example works correctly, but only because it is manually closed immediately afterward — in real code, any exception thrown between opening and that manual `close()` call would skip the cleanup entirely, precisely the failure mode try-with-resources exists to prevent. Every `Files.lines` call should be wrapped in try-with-resources, exactly like every other closeable resource this course has covered.

## Interference: never mutate a stream's source during traversal

**Interference** is what happens when a stream's underlying source is modified while that stream is being traversed. For most standard collections, this is actively detected and rejected with `ConcurrentModificationException`, rather than silently producing some unpredictable partial result.

```java
import java.util.ArrayList;
import java.util.ConcurrentModificationException;
import java.util.List;

public class Interference {
    public static void main(String[] args) {
        List<Integer> numbers = new ArrayList<>(List.of(1, 2, 3, 4, 5));

        try {
            numbers.stream().forEach(n -> {
                if (n == 3) {
                    numbers.add(100);
                }
            });
        } catch (ConcurrentModificationException e) {
            System.out.println("modifying the source during traversal failed: " + e.getClass().getSimpleName());
        }

        List<Integer> safeCopy = new ArrayList<>(numbers);
        List<Integer> doubled = safeCopy.stream().map(n -> n * 2).toList();
        System.out.println("operating on a separate, unmodified snapshot instead: " + doubled);
    }
}
```

Output:

```text
modifying the source during traversal failed: ConcurrentModificationException
operating on a separate, unmodified snapshot instead: [2, 4, 6, 8, 10, 200]
```

Calling `numbers.add(100)` from inside the very `forEach` lambda that is traversing `numbers` mutates the list mid-traversal — `ArrayList`'s iterator tracks a modification count specifically to detect exactly this and fails fast with `ConcurrentModificationException` rather than continuing with corrupted, unpredictable iteration state. Note that the `add(100)` call itself already succeeded before the exception surfaced on the *next* iteration step, which is why `numbers` (and therefore `safeCopy`) ends up containing `100` despite the failure — the lesson here is not "the mutation never happened," but "never attempt this at all": if a computation legitimately needs both to read a collection via a stream and to modify that same collection, do the modification against a separate copy, or after the stream has fully finished, never from inside the traversal itself.

## Parallelism: when it helps, and when it does not

`.parallel()`/`.parallelStream()` splits a pipeline's work across multiple threads using the common `ForkJoinPool` — genuinely valuable for a large, CPU-bound, associative computation, and genuinely harmful (pure overhead with no benefit) for a small workload, where the cost of coordinating multiple threads exceeds whatever time the actual computation would have taken sequentially.

```java
import java.util.stream.IntStream;

public class ParallelismTradeoffs {
    static boolean isPrime(int n) {
        if (n < 2) {
            return false;
        }
        for (int i = 2; (long) i * i <= n; i++) {
            if (n % i == 0) {
                return false;
            }
        }
        return true;
    }

    static long time(Runnable action) {
        long start = System.nanoTime();
        action.run();
        return (System.nanoTime() - start) / 1_000_000;
    }

    public static void main(String[] args) {
        int smallN = 20;
        long smallSequential = time(() -> IntStream.range(0, smallN).filter(ParallelismTradeoffs::isPrime).count());
        long smallParallel = time(() -> IntStream.range(0, smallN).parallel().filter(ParallelismTradeoffs::isPrime).count());
        System.out.println("small workload (n=" + smallN + "): sequential=" + smallSequential + "ms, parallel=" + smallParallel + "ms");

        int largeN = 2_000_000;
        long largeSequential = time(() -> IntStream.range(0, largeN).filter(ParallelismTradeoffs::isPrime).count());
        long largeParallel = time(() -> IntStream.range(0, largeN).parallel().filter(ParallelismTradeoffs::isPrime).count());
        System.out.println("large workload (n=" + largeN + "): sequential=" + largeSequential + "ms, parallel=" + largeParallel + "ms");
    }
}
```

Output (exact milliseconds vary by machine, but the direction is consistent):

```text
small workload (n=20): sequential=1ms, parallel=3ms
large workload (n=2000000): sequential=231ms, parallel=42ms
```

For the tiny workload, parallel execution is **slower** — checking primality for 20 small numbers is so fast sequentially that the overhead of splitting the range, dispatching work to the `ForkJoinPool`, and merging results back together costs more than it saves. For the large workload, parallel execution is dramatically **faster** — over five times, here — because the actual per-element computation (primality testing) is expensive enough, and the workload large enough, that spreading it across multiple CPU cores meaningfully outweighs the coordination overhead. This is the concrete trade-off behind the chapter's judgment question: parallelism helps specifically when the workload is large and the per-element work is substantial, and hurts for small or already-fast workloads — a decision that must also, per this chapter's own Lesson 3, first confirm the pipeline's operations are genuinely associative and free of shared mutable state before parallelism is even a safe option to consider at all.

> **Tip:** `IntStream.iterate`/`generate` exist too, alongside their `LongStream`/`DoubleStream` counterparts, avoiding boxing for infinite numeric sequences exactly as Lesson 3's primitive streams avoided it for finite ones.

## What happens under the hood

`Stream.iterate`/`Stream.generate` are backed by a `Spliterator` reporting an unknown or infinite size, which is exactly why laziness (Lesson 1) is not merely a performance nicety for these sources but a strict requirement — nothing else makes an infinite source usable at all. `Files.lines` wraps a `BufferedReader` internally, registering that reader's `close()` to run when the stream's own `close()` is called, which is why try-with-resources on the `Stream` itself is sufficient without separately managing the reader. `.parallel()` delegates the pipeline's execution to the JVM's shared `ForkJoinPool.commonPool()`, recursively splitting the source via its `Spliterator` until chunks are small enough to process directly, then combining partial results — the same fork/join divide-and-conquer strategy underlying the three-argument `reduce` and `Collector` combiner functions from Lessons 3 and 4.

## Common mistakes

**1. Calling a terminal operation on an unbounded `Stream.iterate`/`Stream.generate` with no `limit` or `hasNext` predicate.** It will never terminate.

**2. Calling `Files.lines` without try-with-resources.** The underlying file handle stays open until `close()` is called, which an exception between opening and a manually-placed `close()` call would skip entirely.

**3. Mutating a stream's source collection from within a lambda that stream is currently traversing.** This causes interference, typically surfacing as `ConcurrentModificationException`.

**4. Reaching for `.parallel()` reflexively on small or already-fast pipelines.** The coordination overhead can make the parallel version slower than the sequential one.

**5. Parallelizing a pipeline before confirming its operations are associative and free of shared mutable state**, exactly the correctness prerequisites Lesson 3 established, regardless of whether the workload is large enough for parallelism to otherwise help performance.

**6. Reaching for a boxed `Stream<Integer>` with `Stream.iterate` for an infinite numeric sequence**, when `IntStream.iterate` avoids the same boxing overhead Lesson 3 covered for finite primitive streams.

## Best practices

- Always bound an infinite stream with `limit` or a `hasNext`-style predicate before any terminal operation.
- Wrap every `Files.lines` call (and any other resource-backed stream) in try-with-resources.
- Never mutate a stream's underlying source from within that same stream's traversal; work against a separate copy or defer the mutation until after traversal completes.
- Measure before and after adding `.parallel()`, on realistic data sizes, rather than assuming it always helps.
- Confirm associativity and freedom from shared mutable state before parallelizing a reduction or collection, independent of whether the workload is large enough to benefit performance-wise.
- Reach for `IntStream.iterate`/`generate` (and the `LongStream`/`DoubleStream` equivalents) instead of a boxed `Stream<Integer>` for infinite numeric sequences.

## Summary

- `Stream.iterate` and `Stream.generate` produce unbounded streams; they must always be paired with `limit` or a `hasNext` predicate before being consumed by a terminal operation.
- `IntStream`/`LongStream`/`DoubleStream` offer their own `iterate`/`generate` equivalents, avoiding boxing for infinite numeric sequences just as their finite counterparts do for ordinary numeric work.
- `Files.lines` and other resource-backed streams must be closed, ideally via try-with-resources, because they own an external resource like a file handle rather than merely wrapping in-memory data.
- Mutating a stream's source collection during traversal causes interference, typically detected and rejected as `ConcurrentModificationException`.
- `.parallel()`/`.parallelStream()` helps for large, CPU-bound, associative workloads and hurts (through pure coordination overhead) for small or already-fast ones — measure rather than assume.
- Parallelism's performance benefit and its correctness requirements (associativity, no shared mutable state) are two entirely separate questions, and both must be satisfied before reaching for `.parallel()`.
- `IntStream`/`LongStream`/`DoubleStream` each provide their own `iterate`/`generate` methods, extending Lesson 3's boxing-avoidance benefit to infinite numeric sequences as well as finite ones.

## Practice

Warm-up:

1. Use `Stream.iterate` with `limit` to generate the first ten Fibonacci-like values of your choosing, and print them.
2. Rewrite the same generator using `IntStream.iterate` instead of a boxed `Stream<Integer>`, and confirm the results match.
3. Read a small text file's lines using `Files.lines` inside try-with-resources, transforming each line, and print the result.
4. Deliberately trigger `ConcurrentModificationException` by mutating a `List` from inside a stream traversing it, and confirm the exception's type.

Core:

1. Rewrite an unbounded `Stream.iterate` call to use the three-argument `hasNext`-predicate overload instead of a separately-computed `limit`, and explain in a comment why the predicate form is often clearer.
2. Reproduce this lesson's small-versus-large parallelism timing experiment with a computation of your own choosing, and report at what rough size parallel execution starts to outperform sequential on your machine.
3. Rewrite this lesson's `ResourceStreamDemo`'s unsafe manual-close section using try-with-resources instead, and add a deliberately thrown exception between opening and the end of the block to confirm the file handle is still released correctly.
4. Design a method that needs to both read and filter a `List` and then conditionally remove elements from it, correctly avoiding interference by collecting the elements to remove first and only mutating the list after the stream has fully finished.

Challenge:

1. Build a small "line counter" utility that safely reads and counts lines from several files in sequence, using try-with-resources for each individual `Files.lines` call, and confirm no file handle is ever left open even if one file's reading throws partway through.
2. Build a small infinite-sequence generator using `IntStream.iterate` with a `hasNext` predicate, and confirm it produces the identical output as an equivalent boxed `Stream.iterate` version, aside from avoiding boxing.
3. Research (and briefly document, in a comment) `Collection.removeIf`, and explain why it is a safer way to conditionally remove elements from a collection than mutating that same collection from inside a stream traversing it.
4. Design a small experiment measuring at what input size, on your own machine, `.parallel()` first becomes faster than sequential execution for a computation of your choosing, and report the crossover point you observed.

## Check your understanding

1. Why can `Stream.iterate(1, n -> n * 2)` never be safely collected into a `List` without first bounding it?
2. Why must `Files.lines` be closed, and what specifically does it own that requires cleanup?
3. What causes `ConcurrentModificationException` when a stream's source is mutated during traversal, and what should you do instead?
4. In this lesson's parallelism experiment, why was the parallel version slower for the small workload but faster for the large one?
5. What two separate questions must both be answered "yes" before parallelizing a stream pipeline is both correct and worthwhile?
6. Why does `.parallel()` rely on the same fork/join, split-and-combine strategy that the three-argument `reduce` overload and `Collector` combiners use?
7. Why would `IntStream.iterate` be preferred over a boxed `Stream<Integer>` built with `Stream.iterate` for an infinite sequence of numbers?
8. Why does `Collection.removeIf` avoid the interference problem that mutating a collection from inside a stream traversing it would cause?
