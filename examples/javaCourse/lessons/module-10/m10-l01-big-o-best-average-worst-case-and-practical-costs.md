# Big-O, best/average/worst case, and practical costs

Two functions can both "work correctly" and still be worlds apart the moment your data grows: one search finishes instantly on a million-row table, another one — computing the identical answer — takes minutes. **Big-O notation** is the vocabulary developers use to describe *how an algorithm's cost grows* as its input grows, independent of any particular computer's speed. This lesson builds that vocabulary from first principles, with real measurements, not just abstract formulas.

What you will learn:

- Why Big-O describes growth rate, not exact running time, and why constant factors are deliberately ignored
- How to recognize the common growth rates — O(1), O(log n), O(n), O(n log n), O(n squared) — from code shape
- Why nested loops over the same input commonly produce O(n squared) work, using a worked pair-counting example
- The difference between best case, worst case, and average case, and why worst case is usually the one that matters for guarantees
- Why two O(n) algorithms can still run at very different real-world speeds, and why Big-O deliberately does not capture that difference

## What Big-O actually describes

Big-O answers one specific question: *if the input size doubles, roughly how much more work does the algorithm do?* It deliberately ignores constant multipliers and lower-order details, because those depend on hardware, JVM warmup, and implementation quality — details that would make the notation useless for comparing algorithms in the abstract. What Big-O captures is the **shape** of growth.

| Notation | Name | Doubling the input roughly... | Example |
|---|---|---|---|
| O(1) | constant | changes nothing | reading `array[0]` |
| O(log n) | logarithmic | adds one more step | binary search (next lesson) |
| O(n) | linear | doubles the work | scanning every element once |
| O(n log n) | linearithmic | slightly more than doubles | efficient sorting (Lesson 3) |
| O(n squared) | quadratic | quadruples the work | comparing every pair of elements |

## Recognizing growth rate from code shape

The clearest way to build intuition is to count actual operations, not guess from formulas:

```java
public class NestedPairs {
    static int countDistinctPairs(int[] values) {
        int count = 0;
        for (int i = 0; i < values.length; i++) {
            for (int j = i + 1; j < values.length; j++) {
                count++;
            }
        }
        return count;
    }

    public static void main(String[] args) {
        for (int n : new int[] {2, 4, 8, 16, 32}) {
            int[] values = new int[n];
            int pairs = countDistinctPairs(values);
            System.out.printf("n=%-3d pairs=%-4d n*(n-1)/2=%d%n", n, pairs, n * (n - 1) / 2);
        }
    }
}
```

Output:

```text
n=2   pairs=1    n*(n-1)/2=1
n=4   pairs=6    n*(n-1)/2=6
n=8   pairs=28   n*(n-1)/2=28
n=16  pairs=120  n*(n-1)/2=120
n=32  pairs=496  n*(n-1)/2=496
```

`countDistinctPairs` visits every **distinct pair** of positions exactly once — this is precisely the chapter's concept-check scenario. The inner loop starts at `i + 1` specifically so each pair is counted once, not twice. The exact count matches the formula n(n-1)/2 perfectly at every size tested, and that formula is a polynomial in n of degree 2 — as n grows, the `n squared` term dominates every other term, which is exactly why this shape of computation is called O(n squared), even though the precise count is not literally n squared. Doubling n from 16 to 32 took the pair count from 120 to 496 — roughly quadrupling, exactly as the "doubling the input roughly quadruples the work" rule for O(n squared) predicts.

Two nested loops over the same collection, where the inner loop's range depends on the outer loop's variable (or simply repeats the full range), is the single most common shape that produces O(n squared) work — recognizing this shape by eye, without needing to derive a formula every time, is the practical skill this lesson is building.

## Best case, worst case, and average case

The exact number of operations an algorithm performs can depend on more than just the *size* of the input — it can depend on the input's actual *content* and on what you are searching for. Linear search demonstrates all three cases clearly:

```java
public class BestAverageWorst {
    static int linearSearch(int[] values, int target) {
        for (int i = 0; i < values.length; i++) {
            if (values[i] == target) {
                return i;
            }
        }
        return -1;
    }

    public static void main(String[] args) {
        int[] values = new int[1000];
        for (int i = 0; i < values.length; i++) values[i] = i;

        int bestCaseIndex = linearSearch(values, 0);
        int worstCaseIndex = linearSearch(values, -1);
        int averageCaseIndex = linearSearch(values, 500);

        System.out.println("best case (target at index 0): found at " + bestCaseIndex);
        System.out.println("worst case (target absent): found at " + worstCaseIndex + " (scanned all 1000)");
        System.out.println("typical case (target in the middle): found at " + averageCaseIndex);
    }
}
```

Output:

```text
best case (target at index 0): found at 0
worst case (target absent): found at -1 (scanned all 1000)
typical case (target in the middle): found at 500
```

- **Best case**: the target happens to be the very first element checked — one comparison, regardless of how large the array is.
- **Worst case**: the target is not present at all (or is the very last element) — every single element must be checked, giving O(n) work.
- **Average case**: for a target that is present and uniformly likely to be anywhere, roughly half the array is scanned on average.

Professional discussions of an algorithm's cost almost always mean the **worst case** by default, unless stated otherwise, because worst case is the only one that gives you a genuine *guarantee* — a promise that holds no matter what specific data your program happens to receive in production, including the unlucky inputs you never tested with. A best-case or average-case number can look reassuring in a demo and then fail badly the day a real user supplies exactly the input that triggers the worst case.

## Why Big-O hides real, measurable differences on purpose

Two algorithms with the identical Big-O classification can still run at meaningfully different real speeds, because Big-O deliberately discards constant factors — the fixed amount of extra work done on *every* iteration, regardless of how many iterations there are:

```java
public class ConstantFactors {
    static long sumSimple(int[] values) {
        long total = 0;
        for (int v : values) {
            total += v;
        }
        return total;
    }

    static long sumWithLogging(int[] values) {
        long total = 0;
        for (int v : values) {
            total += v;
            String message = "processed value " + v;
            if (message.length() > 1_000_000) {
                System.out.println(message);
            }
        }
        return total;
    }

    static long time(Runnable action) {
        long start = System.nanoTime();
        action.run();
        return (System.nanoTime() - start) / 1000;
    }

    public static void main(String[] args) {
        int[] values = new int[500_000];
        for (int i = 0; i < values.length; i++) values[i] = i;

        long simpleMicros = time(() -> sumSimple(values));
        long loggingMicros = time(() -> sumWithLogging(values));

        System.out.println("both are O(n); constant-factor difference from extra work per iteration:");
        System.out.println("sumSimple:       " + simpleMicros + " us");
        System.out.println("sumWithLogging:  " + loggingMicros + " us");
    }
}
```

Output (exact microsecond counts vary by machine, but the ratio is representative):

```text
both are O(n); constant-factor difference from extra work per iteration:
sumSimple:       1337 us
sumWithLogging:  24374 us
```

Both methods are unambiguously O(n): each one performs one pass over the array, and doubling the array's length doubles each one's own running time. But `sumWithLogging` builds a `String` on every single iteration (an object allocation, exactly the kind of per-element cost Chapter 4's memory lessons discussed) even though that string is never actually printed for any of these values — and that per-iteration overhead is a **constant factor** roughly eighteen times larger here, entirely invisible to Big-O notation. This is not a flaw in Big-O; it is a deliberate scope decision — Big-O tells you how cost *scales* as input grows, which is exactly the right tool for comparing an O(n) algorithm to an O(n squared) one at large sizes, but it is the *wrong* tool for deciding between two already-O(n) implementations, where you need to actually measure.

## What happens under the hood

Real running time on a real machine is influenced by far more than the algorithm's shape alone: JVM warmup and just-in-time compilation (which Chapter 22 covers in depth), memory access patterns and cache behavior (Chapter 9 covered this for `ArrayList` versus `LinkedList`), and even which specific values happen to be in the array. This is precisely why professional performance comparisons run many iterations, discard early "warming up" measurements, and vary input sizes across a wide enough range that the underlying growth trend becomes visible through the noise — a technique you can see reflected in how this lesson's own measurement code was structured, and one you will need whenever you benchmark your own code rather than trusting a single run's numbers.

```java
public class GrowthMeasured {
    static long linearWork(int[] values) {
        long total = 0;
        for (int v : values) total += v;
        return total;
    }

    static long quadraticWork(int[] values) {
        long count = 0;
        for (int i = 0; i < values.length; i++) {
            for (int j = 0; j < values.length; j++) {
                count++;
            }
        }
        return count;
    }

    static long time(Runnable action) {
        long start = System.nanoTime();
        action.run();
        return (System.nanoTime() - start) / 1000;
    }

    public static void main(String[] args) {
        int[] warmupData = new int[2000];
        for (int i = 0; i < 3000; i++) {
            linearWork(warmupData);
            quadraticWork(warmupData);
        }

        for (int n : new int[] {1000, 2000, 4000, 8000}) {
            int[] values = new int[n];
            for (int i = 0; i < n; i++) values[i] = i;

            long linearMicros = time(() -> linearWork(values));
            long quadraticMicros = time(() -> quadraticWork(values));
            System.out.printf("n=%-6d linear=%6d us   quadratic=%8d us%n", n, linearMicros, quadraticMicros);
        }
    }
}
```

Output (again, exact numbers vary by machine and are naturally noisy at the microsecond scale):

```text
n=1000   linear=     2 us   quadratic=       9 us
n=2000   linear=     1 us   quadratic=      67 us
n=4000   linear=     0 us   quadratic=     157 us
n=8000   linear=     0 us   quadratic=     535 us
```

Notice two things. First, a "warm-up" loop runs both methods thousands of times *before* any measurement begins — without it, the JIT compiler would still be optimizing the code during the early, small-`n` measurements, producing misleadingly slow early numbers that could make the trend look backwards. Second, even after warming up, the linear timings are so fast they round down to a few microseconds or less — too fast for this simple timer to distinguish reliably at this scale — while the quadratic timings clearly and consistently grow as `n` grows. This is exactly why `NestedPairs`'s exact operation count, not a wall-clock timer, is the rigorous way to confirm a growth rate; timing gives you a real-world sanity check, but counting operations gives you proof.

## Common mistakes

**1. Treating Big-O as an exact prediction of running time.** It describes growth *shape*, not seconds; two O(n) algorithms can differ enormously in actual speed, as `ConstantFactors` demonstrated.

**2. Reporting only the best case or a single lucky test run as "the" performance of an algorithm.** Production code meets adversarial or simply unlucky inputs eventually; the worst case is the guarantee that actually holds.

**3. Missing a hidden nested loop.** A method that calls another method containing its own loop, inside an outer loop, is just as much O(n squared) work as two loops written literally next to each other.

**4. Benchmarking without a warm-up phase.** Early JIT-uncompiled runs can be dramatically slower than steady-state performance, producing a misleading, non-monotonic trend exactly like the one this lesson's first, unwarmed benchmark attempt produced.

**5. Assuming average case behavior is guaranteed.** An algorithm that is "usually fast" can still be pathologically slow on specific, real inputs; state which case a claimed complexity refers to.

## Best practices

- State which case (best, worst, or average) a complexity claim describes; "this is O(n)" without qualification is usually understood as worst case, but say so explicitly when it matters.
- Recognize nested-loop shapes over the same input as an O(n squared) warning sign worth examining, even when the loops are not textually adjacent.
- Use Big-O to compare algorithms of genuinely different growth shapes, and use real measurement (with proper warm-up) to compare two implementations that already share the same Big-O classification.
- Count operations directly, as `NestedPairs` did, when you want rigorous confirmation of a growth rate rather than noisy wall-clock timing.
- Consider realistic worst-case inputs deliberately when testing performance-sensitive code, not just the inputs that happened to be convenient to construct.

## Summary

- Big-O describes how an algorithm's cost grows as input size grows, deliberately ignoring constant factors and hardware-specific details.
- Common growth rates, from cheapest to most expensive: O(1), O(log n), O(n), O(n log n), O(n squared).
- Nested loops that each range over (a portion of) the same input commonly produce O(n squared) work, confirmable by directly counting operations.
- Best case, worst case, and average case can differ substantially for the same algorithm; worst case is the standard default because it is the only guarantee that holds for every possible input.
- Two algorithms with the same Big-O classification can still have very different real-world speed due to constant factors Big-O deliberately does not capture; use direct measurement, with proper JIT warm-up, to compare them.

## Practice

Warm-up:

1. Classify each of these by Big-O: printing the first element of an array; printing every element once; printing every pair of elements (including a pair with itself).
2. For linear search over an unsorted array, describe an input and target that produce the best case, and one that produces the worst case.
3. Write two methods that both sum an array in O(n) time, but make one of them measurably slower by adding unnecessary per-iteration work (as `sumWithLogging` did), and time both with a warm-up phase.

Core:

1. Write a method that checks whether an array contains any duplicate values using a nested-loop, all-pairs comparison, and identify its Big-O classification. Then write a second version using a `HashSet` (Chapter 9) and compare their classifications.
2. Write a method `countPairsSummingTo(int[] values, int target)` using nested loops, count its exact number of comparisons for several array sizes as `NestedPairs` did, and confirm the counts match the n(n-1)/2 formula.
3. For a method of your choosing that processes a `List`, write one input that triggers its best case and one that triggers its worst case, and measure both with proper warm-up.

Challenge:

1. Implement two different ways to find the maximum value in an array — one that also (uselessly) checks whether the array contains any duplicates via nested loops, and one that does only a single pass — and measure the real difference at several sizes, connecting the result explicitly to Big-O classification versus constant factors.
2. Write a short report (in comments or prose) analyzing a method from an earlier chapter's exercises: state its Big-O classification, identify its best/worst/average case behavior, and note any constant-factor concerns a reviewer should be aware of.

## Check your understanding

1. What does it mean for an algorithm to be O(n squared), in terms of what happens to its cost when the input size doubles?
2. Two nested loops both range over the full length of the same array. What is their combined growth rate, and why?
3. Why do professional discussions of "the" complexity of an algorithm usually mean its worst case, unless stated otherwise?
4. Give an example of two algorithms that are both O(n) but have meaningfully different real-world running times, and explain why Big-O does not distinguish them.
5. Why is a warm-up phase necessary before measuring and comparing two methods' wall-clock running times on the JVM?
6. Why is directly counting operations (as in `NestedPairs`) more rigorous evidence of a growth rate than a single wall-clock timing run?
