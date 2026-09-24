# Sorting algorithms, stability, and comparator correctness

You have used `Arrays.sort` and `Collections.sort` since Chapter 4, trusting them to "just work." This lesson opens up what is actually happening inside a sort, building three classic algorithms from scratch to see exactly why some are simple but slow and others are fast but subtle — and then turns to a real, professional hazard: a **broken comparator** does not merely sort incorrectly, it can corrupt a sort in ways that are surprisingly hard to notice.

What you will learn:

- Bubble sort: the simplest sorting idea, and why it is O(n squared)
- Insertion sort: how it builds a sorted prefix one element at a time, and why it is fast on nearly-sorted data
- Merge sort: how divide-and-conquer achieves O(n log n), traced through its recursive splits and merges
- **Stability**: what it means for equal-key elements to keep their original relative order, and why it matters for real data
- Why implementing a comparator with subtraction (`a - b`) is a classic, dangerous bug, and what to use instead

## Bubble sort: repeatedly swap adjacent out-of-order pairs

Bubble sort repeatedly scans the array, swapping any adjacent pair that is out of order, so that on each full pass the largest remaining unsorted value "bubbles up" to its correct position at the end:

```java
import java.util.Arrays;

public class BubbleSortDemo {
    static void bubbleSort(int[] values) {
        int n = values.length;
        for (int pass = 0; pass < n - 1; pass++) {
            boolean swapped = false;
            for (int i = 0; i < n - 1 - pass; i++) {
                if (values[i] > values[i + 1]) {
                    int temp = values[i];
                    values[i] = values[i + 1];
                    values[i + 1] = temp;
                    swapped = true;
                }
            }
            System.out.println("  after pass " + (pass + 1) + ": " + Arrays.toString(values));
            if (!swapped) {
                System.out.println("  no swaps; already sorted, stopping early");
                break;
            }
        }
    }

    public static void main(String[] args) {
        int[] values = {5, 2, 8, 1, 9, 3};
        System.out.println("start: " + Arrays.toString(values));
        bubbleSort(values);
        System.out.println("final: " + Arrays.toString(values));
    }
}
```

Output:

```text
start: [5, 2, 8, 1, 9, 3]
  after pass 1: [2, 5, 1, 8, 3, 9]
  after pass 2: [2, 1, 5, 3, 8, 9]
  after pass 3: [1, 2, 3, 5, 8, 9]
  after pass 4: [1, 2, 3, 5, 8, 9]
  no swaps; already sorted, stopping early
final: [1, 2, 3, 5, 8, 9]
```

Each pass performs up to n-1 comparisons, and up to n-1 passes may be needed — the nested-loop shape from Lesson 1's Big-O lesson, giving O(n squared) worst-case time. The `swapped` flag is a genuine, useful optimization: if an entire pass makes no swaps, the array is already sorted, and the algorithm can stop early — exactly what happened after pass 3 here. Bubble sort is simple to understand and implement correctly, but O(n squared) makes it impractical for large data; it survives mainly as a teaching tool for the *idea* of comparison-and-swap.

## Insertion sort: build a sorted prefix one element at a time

Insertion sort maintains a sorted prefix at the start of the array and repeatedly inserts the next element into its correct position within that prefix, shifting larger elements right to make room:

```java
import java.util.Arrays;

public class InsertionSortDemo {
    static void insertionSort(int[] values) {
        for (int i = 1; i < values.length; i++) {
            int key = values[i];
            int j = i - 1;
            while (j >= 0 && values[j] > key) {
                values[j + 1] = values[j];
                j--;
            }
            values[j + 1] = key;
            System.out.println("  after inserting index " + i + ": " + Arrays.toString(values));
        }
    }

    public static void main(String[] args) {
        int[] values = {5, 2, 8, 1, 9, 3};
        System.out.println("start: " + Arrays.toString(values));
        insertionSort(values);
        System.out.println("final: " + Arrays.toString(values));

        int[] nearlySorted = {1, 2, 3, 5, 4, 6};
        System.out.println("nearly sorted start: " + Arrays.toString(nearlySorted));
        insertionSort(nearlySorted);
    }
}
```

Output:

```text
start: [5, 2, 8, 1, 9, 3]
  after inserting index 1: [2, 5, 8, 1, 9, 3]
  after inserting index 2: [2, 5, 8, 1, 9, 3]
  after inserting index 3: [1, 2, 5, 8, 9, 3]
  after inserting index 4: [1, 2, 5, 8, 9, 3]
  after inserting index 5: [1, 2, 3, 5, 8, 9]
final: [1, 2, 3, 5, 8, 9]
nearly sorted start: [1, 2, 3, 5, 4, 6]
  after inserting index 1: [1, 2, 3, 5, 4, 6]
  after inserting index 2: [1, 2, 3, 5, 4, 6]
  after inserting index 3: [1, 2, 3, 5, 4, 6]
  after inserting index 4: [1, 2, 3, 4, 5, 6]
  after inserting index 5: [1, 2, 3, 4, 5, 6]
```

Insertion sort is also O(n squared) in the worst case (a reverse-sorted array forces every element to shift all the way to the front), but notice the nearly-sorted second example: most insertions do **no shifting at all**, because `values[j] > key` is immediately false — only the single out-of-place `4` triggers any real work. This is insertion sort's real practical strength: it is genuinely fast, close to O(n), on data that is already mostly sorted, which is common enough in real systems (appending a few new records to an already-sorted log, for instance) that some production sorting implementations, including the one behind `Collections.sort`, actually switch to an insertion-sort-like strategy for small or nearly-sorted runs.

## Merge sort: divide, conquer, and combine

Merge sort takes a fundamentally different approach: split the array in half, recursively sort each half, then **merge** the two already-sorted halves back together in one linear pass:

```java
import java.util.Arrays;

public class MergeSortDemo {
    static void mergeSort(int[] values, int left, int right, String indent) {
        if (right - left <= 1) {
            return;
        }
        int mid = left + (right - left) / 2;
        System.out.println(indent + "split " + Arrays.toString(Arrays.copyOfRange(values, left, right))
                + " into " + Arrays.toString(Arrays.copyOfRange(values, left, mid))
                + " and " + Arrays.toString(Arrays.copyOfRange(values, mid, right)));
        mergeSort(values, left, mid, indent + "  ");
        mergeSort(values, mid, right, indent + "  ");
        merge(values, left, mid, right);
        System.out.println(indent + "merged into " + Arrays.toString(Arrays.copyOfRange(values, left, right)));
    }

    static void merge(int[] values, int left, int mid, int right) {
        int[] leftPart = Arrays.copyOfRange(values, left, mid);
        int[] rightPart = Arrays.copyOfRange(values, mid, right);
        int i = 0, j = 0, k = left;
        while (i < leftPart.length && j < rightPart.length) {
            if (leftPart[i] <= rightPart[j]) {
                values[k++] = leftPart[i++];
            } else {
                values[k++] = rightPart[j++];
            }
        }
        while (i < leftPart.length) values[k++] = leftPart[i++];
        while (j < rightPart.length) values[k++] = rightPart[j++];
    }

    public static void main(String[] args) {
        int[] values = {8, 3, 5, 1, 9, 2};
        System.out.println("start: " + Arrays.toString(values));
        mergeSort(values, 0, values.length, "");
        System.out.println("final: " + Arrays.toString(values));
    }
}
```

Output:

```text
start: [8, 3, 5, 1, 9, 2]
split [8, 3, 5, 1, 9, 2] into [8, 3, 5] and [1, 9, 2]
  split [8, 3, 5] into [8] and [3, 5]
    split [3, 5] into [3] and [5]
    merged into [3, 5]
  merged into [3, 5, 8]
  split [1, 9, 2] into [1] and [9, 2]
    split [9, 2] into [9] and [2]
    merged into [2, 9]
  merged into [1, 2, 9]
merged into [1, 2, 3, 5, 8, 9]
```

Notice the shape: the array is recursively split in half until each piece has at most one element (trivially "sorted" on its own), and then pairs of already-sorted pieces are merged back together, each merge step being a simple linear scan comparing the fronts of two sorted runs. This gives merge sort a genuinely different — and better — growth rate than the previous two algorithms: **O(n log n)**. The `log n` comes from the recursive halving (exactly the same halving idea as binary search in the previous lesson — there are only about log n levels of splitting), and the `n` comes from the fact that each full level of merging does a total of O(n) work across all the merges at that level combined. O(n log n) grows dramatically slower than O(n squared) as data scales, which is why merge sort (and its relatives) is what real sorting libraries actually use for large data, not bubble or insertion sort.

## Stability: does relative order survive equal keys?

A sort is **stable** if, whenever two elements compare as equal under the sorting key, their original relative order is preserved in the output. This matters far more than it might first appear:

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class StabilityDemo {
    record Student(String name, int grade) {}

    public static void main(String[] args) {
        List<Student> students = new ArrayList<>(List.of(
                new Student("Amina", 90),
                new Student("Karim", 85),
                new Student("Lina", 90),
                new Student("Omar", 85),
                new Student("Sara", 90)
        ));
        System.out.println("before: " + students);

        students.sort(Comparator.comparingInt(Student::grade));
        System.out.println("after stable sort by grade: " + students);
        System.out.println("within each grade, original relative order (Amina before Lina before Sara; Karim before Omar) is preserved");
    }
}
```

Output:

```text
before: [Student[name=Amina, grade=90], Student[name=Karim, grade=85], Student[name=Lina, grade=90], Student[name=Omar, grade=85], Student[name=Sara, grade=90]]
after stable sort by grade: [Student[name=Karim, grade=85], Student[name=Omar, grade=85], Student[name=Amina, grade=90], Student[name=Lina, grade=90], Student[name=Sara, grade=90]]
within each grade, original relative order (Amina before Lina before Sara; Karim before Omar) is preserved
```

Three students share grade 90: Amina, Lina, and Sara, in that original order. After sorting by grade, they still appear in exactly that relative order among themselves — the sort did not need to distinguish them further, so it left their original arrangement alone. This is precisely the chapter's concept-check question: **stability preserves the original relative order of equal-key elements specifically**, not "all elements" (elements with genuinely different keys are of course reordered) and not "a fixed number of comparisons" (that describes something else entirely — algorithmic cost, not ordering behavior).

Stability matters enormously in practice: imagine a table already sorted alphabetically by name, which a user then sorts by department. A stable sort keeps everyone within the same department still in alphabetical order, exactly as a user intuitively expects from "sort by department, then by name" without needing to specify the secondary key explicitly. `List.sort` (and `Collections.sort`, and `Arrays.sort` for object arrays) are all specified to be stable in Java; `Arrays.sort` for **primitive** arrays is explicitly permitted to be unstable, though this distinction rarely matters in practice since primitives have no separate "identity" beyond their value to preserve order for.

## Comparator correctness: the subtraction trap

A `Comparator<T>` must return a negative number, zero, or a positive number — Chapter 7 taught this — but a shockingly common, genuinely broken shortcut is computing that result by subtracting two `int` values directly. This is a real, classic bug, not a theoretical one:

```java
import java.util.Arrays;
import java.util.Comparator;

public class SubtractionOverflow {
    public static void main(String[] args) {
        Integer[] values = {Integer.MAX_VALUE - 1, Integer.MIN_VALUE + 2, 0, Integer.MAX_VALUE, Integer.MIN_VALUE};

        Comparator<Integer> broken = (a, b) -> a - b;
        Integer[] brokenResult = values.clone();
        try {
            Arrays.sort(brokenResult, broken);
            System.out.println("broken comparator result: " + Arrays.toString(brokenResult));
        } catch (IllegalArgumentException e) {
            System.out.println("broken comparator threw: " + e.getMessage());
        }

        Comparator<Integer> correct = Integer::compare;
        Integer[] correctResult = values.clone();
        Arrays.sort(correctResult, correct);
        System.out.println("correct comparator result: " + Arrays.toString(correctResult));
    }
}
```

Output:

```text
broken comparator result: [2147483646, -2147483646, 0, 2147483647, -2147483648]
correct comparator result: [-2147483648, -2147483646, 0, 2147483646, 2147483647]
```

The `correct` comparator (`Integer::compare`, using the exact-arithmetic method) produces a genuinely, verifiably sorted result. The `broken` comparator (`a - b`) produces a result that is not sorted at all: `2147483647` (the maximum value) does not belong right before `-2147483648` (the minimum value) in ascending order — this is exactly the Chapter 2 integer-overflow bug from the very start of this course, now corrupting a sort instead of a simple arithmetic calculation. `Integer.MAX_VALUE - Integer.MIN_VALUE`, computed as `int` subtraction, overflows and produces a small or even negative number, making the comparator report that a very large value is "less than" a very small one. The sort algorithm trusts the comparator's answers completely; when those answers are internally inconsistent (as this one is, whenever the operands' difference does not fit in an `int`), the sort's own internal logic can be corrupted in ways that produce a nonsensical final order — and, depending on the sort implementation and data pattern, Java's own sort machinery sometimes detects the resulting inconsistency and throws `IllegalArgumentException: Comparator violates its general contract!` instead of silently misbehaving, though as this exact run shows, that detection is not guaranteed to trigger for every violation.

Never write `(a, b) -> a - b` for numeric comparators. Use `Integer.compare(a, b)` (or the analogous `Long.compare`, `Double.compare`, and so on), or the `Comparator.comparingInt`/`comparing` factory methods from Chapter 7, every one of which is implemented correctly and cannot overflow this way.

## What happens under the hood

Every sorting algorithm in this lesson is built from the same two primitive operations: **comparing** two elements and **moving** an element (a swap, a shift, or a write during a merge). Their Big-O differences come entirely from how cleverly they arrange those comparisons and moves — bubble and insertion sort compare and move adjacent or nearby elements repeatedly, giving O(n squared) total work in the worst case, while merge sort's divide-and-conquer structure guarantees that no element is ever compared against more than roughly log n "levels" of other elements, giving O(n log n) total work. Java's own `Arrays.sort`/`Collections.sort` for objects uses a highly-tuned hybrid algorithm (TimSort) that combines exactly the ideas from this lesson: it detects and exploits already-sorted or nearly-sorted runs the way insertion sort benefits from them, and merges larger runs together the way merge sort does — which is precisely why understanding these two "simple" algorithms genuinely helps you understand what a production sort is actually doing internally, not just how to call it.

## Common mistakes

**1. Using bubble or insertion sort on large, non-nearly-sorted data in production code.** Both are O(n squared) in general; use the standard library's sort, which is O(n log n) and highly tuned.

**2. Writing a numeric comparator as `(a, b) -> a - b`.** This overflows for sufficiently large or small values, corrupting the sort silently or triggering an unpredictable `IllegalArgumentException`. Use `Type.compare(a, b)` instead.

**3. Assuming sort stability when it is not guaranteed.** `List.sort`/`Collections.sort`/`Arrays.sort` for objects are stable in Java; `Arrays.sort` for primitive arrays is explicitly not guaranteed to be.

**4. Forgetting that merge sort's recursive splits need a genuine base case.** A split that does not shrink toward single elements (or an off-by-one in the midpoint calculation) risks infinite recursion or missed elements.

**5. Believing a "sort by one field, then by another" requirement always needs an explicit secondary comparator key.** If the sort is stable and the data was already in the desired secondary order, sorting by only the primary key preserves that secondary order for free.

## Best practices

- Use the standard library's sort (`Collections.sort`, `List.sort`, `Arrays.sort`) for real work; implement sorting algorithms yourself only to learn how they work, exactly as this lesson does.
- Always implement numeric comparators with `Type.compare(a, b)`, never subtraction.
- Rely on stability deliberately when you need it (chained sorts, "sort by X, keeping Y order for ties"), and verify a sort is documented as stable before depending on that behavior.
- When choosing (or explaining) a sorting algorithm, connect its behavior to the shape of the data: insertion sort for small or nearly-sorted data, merge sort (or the standard library's tuned hybrid) for everything else at scale.
- Trace an unfamiliar sort implementation by hand on a small example, the way this lesson did for all three algorithms, before trusting or modifying it.

## Summary

- Bubble sort repeatedly swaps adjacent out-of-order pairs; it is simple but O(n squared).
- Insertion sort builds a sorted prefix one element at a time; also O(n squared) worst case, but genuinely fast on nearly-sorted data.
- Merge sort recursively splits the input in half and merges sorted halves back together, achieving O(n log n) by ensuring no element is compared against more than about log n "levels" of others.
- A stable sort preserves the original relative order of elements that compare as equal under the sort key; Java's object sorts are guaranteed stable, primitive-array sorts are not.
- Implementing a numeric comparator with subtraction (`a - b`) overflows for sufficiently extreme values, corrupting the sort silently or unpredictably; always use `Type.compare(a, b)` instead.

## Practice

Warm-up:

1. Trace bubble sort by hand on `{4, 1, 3, 2}`, writing the array after each pass, then verify with code.
2. Trace insertion sort by hand on the same array, writing the array after each insertion.
3. Sort an `Integer[]` array containing both `Integer.MAX_VALUE` and `Integer.MIN_VALUE` using a subtraction-based comparator and using `Integer.compare`, and compare the two results.

Core:

1. Modify this lesson's `bubbleSort` to count and print the total number of swaps performed, and compare that count across a sorted, reverse-sorted, and random input of the same size.
2. Extend the stability demonstration with a second field to sort by (for example, sort `Student` records by grade, then verify sorting by name afterward keeps students with the same name in their prior grade-sorted relative order, if any share a name).
3. Implement merge sort for an array of a custom record type using a `Comparator<T>` parameter instead of relying on natural ordering, keeping the divide-and-conquer structure identical to this lesson's version.

Challenge:

1. Implement quicksort (partition around a pivot, recursively sort each side) and compare its worst-case behavior (already-sorted input with a naive pivot choice) against merge sort's consistent O(n log n) behavior.
2. Write a test that deliberately constructs a comparator violating transitivity (for example, comparing strings by length except for one special-cased pair that breaks the pattern), sort a small array with it, and describe, based on this lesson's subtraction example, why the result is not reliably meaningful even if it happens to look plausible.

## Check your understanding

1. Why is bubble sort O(n squared), and what specific optimization in this lesson's implementation lets it sometimes finish early?
2. Why is insertion sort a reasonable practical choice for data that is already nearly sorted, even though its worst-case complexity is the same as bubble sort's?
3. Where does the "log n" part of merge sort's O(n log n) complexity come from, structurally?
4. What does it mean for a sort to be "stable," precisely, and which specific elements' order does stability actually guarantee?
5. Why does `(a, b) -> a - b` fail as a general-purpose integer comparator, and what should be used instead?
6. Is `Arrays.sort` on an `int[]` guaranteed to be stable in Java? Does that guarantee change for `Arrays.sort` on an `Integer[]`?
