# Linear search, binary search, and insertion points

Finding a value in a collection is one of the most common operations in any program, and the previous lesson's Big-O vocabulary lets us finally answer, precisely, *why* one search strategy dramatically outperforms another as data grows. This lesson covers the two fundamental search algorithms — linear and binary — and a subtler, extremely useful variant of binary search: finding not just *whether* a value is present, but exactly *where* it would belong if it were inserted.

What you will learn:

- Linear search's O(n) worst case, and why it needs no precondition on the data
- Binary search's O(log n) worst case, and the precondition it absolutely requires: sorted data
- How to trace binary search step by step, watching its search range roughly halve on every comparison
- Why binary search on unsorted data does not throw an error — it simply, silently returns wrong answers
- `lowerBound`: finding the first insertion point for a value, including what it returns when every element is too small

## Linear search: no precondition, O(n) worst case

Linear search checks each element in order until it finds a match or exhausts the collection. It works on **any** collection, sorted or not, because it makes no assumption about the data's arrangement at all:

```java
public class LinearSearchDemo {
    static int linearSearch(int[] values, int target) {
        int comparisons = 0;
        for (int i = 0; i < values.length; i++) {
            comparisons++;
            if (values[i] == target) {
                System.out.println("  found after " + comparisons + " comparison(s)");
                return i;
            }
        }
        System.out.println("  not found after " + comparisons + " comparison(s)");
        return -1;
    }

    public static void main(String[] args) {
        int[] values = {8, 3, 15, 1, 9, 22, 4};
        System.out.println("search 9:");
        linearSearch(values, 9);
        System.out.println("search 99:");
        linearSearch(values, 99);
    }
}
```

Output:

```text
search 9:
  found after 5 comparison(s)
search 99:
  not found after 7 comparison(s)
```

As the previous lesson established, this is O(n) in the worst case: a missing target (or one at the very end) requires checking every element. Its one genuine advantage is that it works on data in **any** order — there is no precondition to violate.

## Binary search: O(log n), but only on sorted data

Binary search exploits sorted order to eliminate roughly **half** of the remaining candidates with every single comparison, instead of eliminating just one:

```java
public class BinarySearchDemo {
    static int binarySearch(int[] sorted, int target) {
        int lo = 0, hi = sorted.length - 1;
        int comparisons = 0;
        while (lo <= hi) {
            comparisons++;
            int mid = lo + (hi - lo) / 2;
            System.out.println("  lo=" + lo + " hi=" + hi + " mid=" + mid + " value=" + sorted[mid]);
            if (sorted[mid] == target) {
                System.out.println("  found after " + comparisons + " comparison(s)");
                return mid;
            } else if (sorted[mid] < target) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        System.out.println("  not found after " + comparisons + " comparison(s)");
        return -1;
    }

    public static void main(String[] args) {
        int[] sorted = {1, 3, 4, 8, 9, 15, 22, 30, 41, 55, 67, 80, 91, 100, 120};
        System.out.println("search 91 (length " + sorted.length + "):");
        binarySearch(sorted, 91);
        System.out.println("search 5:");
        binarySearch(sorted, 5);

        System.out.println("java.util.Arrays.binarySearch agrees: " + java.util.Arrays.binarySearch(sorted, 91));
    }
}
```

Output:

```text
search 91 (length 15):
  lo=0 hi=14 mid=7 value=30
  lo=8 hi=14 mid=11 value=80
  lo=12 hi=14 mid=13 value=100
  lo=12 hi=12 mid=12 value=91
  found after 4 comparison(s)
search 5:
  lo=0 hi=14 mid=7 value=30
  lo=0 hi=6 mid=3 value=8
  lo=0 hi=2 mid=1 value=3
  lo=2 hi=2 mid=2 value=4
  not found after 4 comparison(s)
```

Trace the search for 91: the first comparison at index 7 (value 30) is too small, so the entire left half — indices 0 through 7 — is eliminated in one step; the search range shrinks from 15 candidates to 7. The second comparison (index 11, value 80) is still too small, shrinking the range to 3 candidates. The third (index 13, value 100) is too large, shrinking to 1 candidate, which the fourth comparison confirms. Four comparisons resolved a 15-element search — compare that to linear search's worst case of 15. `mid = lo + (hi - lo) / 2` is written this specific way, rather than the more obvious `(lo + hi) / 2`, specifically to avoid an integer overflow in `lo + hi` on very large arrays — a real, documented historical bug in early binary search implementations, and a nice concrete callback to Chapter 2's overflow lesson.

## Why this is O(log n): halving, not subtracting

Each comparison in binary search roughly **halves** the remaining search range — the previous lesson's growth-rate vocabulary calls this pattern **logarithmic**, and the practical consequence is dramatic:

```java
public class GrowthComparison {
    static int linearComparisons(int n) {
        return n;
    }

    static int binaryComparisons(int n) {
        int comparisons = 0;
        while (n > 1) {
            n /= 2;
            comparisons++;
        }
        return comparisons + 1;
    }

    public static void main(String[] args) {
        System.out.printf("%-12s %-20s %-20s%n", "n", "linear (worst case)", "binary (worst case)");
        for (int n : new int[] {10, 100, 1_000, 1_000_000, 1_000_000_000}) {
            System.out.printf("%-12d %-20d %-20d%n", n, linearComparisons(n), binaryComparisons(n));
        }
    }
}
```

Output:

```text
n            linear (worst case)  binary (worst case) 
10           10                   4                   
100          100                  7                   
1000         1000                 10                  
1000000      1000000              20                  
1000000000   1000000000           30                  
```

The contrast is stark: searching a billion sorted elements takes at most about 30 comparisons with binary search, while linear search's worst case grows in direct, unbounded proportion to the data size. This is precisely what "O(log n)" buys you in practice — the cost barely grows at all as the input becomes enormous, which is exactly why every sorted, indexable data structure you use professionally (database indexes, `Arrays.binarySearch`, `TreeMap`'s internal lookups from Chapter 9) relies on this exact halving idea.

## The precondition binary search does not check

Binary search's speed comes entirely from trusting that the data is sorted — and it does not verify that assumption. Violate it, and binary search does not throw an exception or warn you; it simply, silently, returns a **wrong answer**:

```java
public class UnsortedBinarySearchTrap {
    static int binarySearch(int[] sorted, int target) {
        int lo = 0, hi = sorted.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (sorted[mid] == target) {
                return mid;
            } else if (sorted[mid] < target) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return -1;
    }

    public static void main(String[] args) {
        int[] notSorted = {8, 3, 15, 1, 9, 22, 4};
        System.out.println("array (not sorted): " + java.util.Arrays.toString(notSorted));
        System.out.println("4 is present at index 6");
        System.out.println("binarySearch for 4: " + binarySearch(notSorted, 4));
        System.out.println("linear search would have found it; binary search assumed a sorted precondition it never checked");
    }
}
```

Output:

```text
array (not sorted): [8, 3, 15, 1, 9, 22, 4]
4 is present at index 6
binarySearch for 4: -1
linear search would have found it; binary search assumed a sorted precondition it never checked
```

The value `4` genuinely exists in the array, at index 6 — yet `binarySearch` reports `-1`, "not found," because its halving logic makes decisions ("go left" or "go right") based on an ordering assumption that this particular array does not satisfy. This is exactly the kind of silent contract violation Chapter 4 and Chapter 7 both warned about repeatedly: no exception, no crash, just a plausible-looking but wrong result, discovered only if someone happens to notice the missing value later. This is also precisely why `java.util.Arrays.binarySearch`'s own documentation states explicitly: **if the array is not sorted, the results are undefined.** Never call binary search — your own, or the standard library's — on data you have not actually sorted (Lesson 3 covers sorting), or already know to be sorted by construction.

## Finding an insertion point: lowerBound

Sometimes the real question is not "does this value exist?" but "where would this value belong?" — useful for inserting into a sorted array while keeping it sorted, or for counting how many elements are below a threshold. `lowerBound` answers exactly this: it returns the **first index** whose value is greater than or equal to the target.

```java
public class LowerBoundDemo {
    static int lowerBound(int[] sorted, int target) {
        int lo = 0, hi = sorted.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (sorted[mid] < target) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    public static void main(String[] args) {
        int[] sorted = {1, 3, 3, 3, 8, 10};

        System.out.println("lowerBound(target=3): " + lowerBound(sorted, 3) + " (first index whose value is at least 3)");
        System.out.println("lowerBound(target=0): " + lowerBound(sorted, 0) + " (every element is at least 0)");
        System.out.println("lowerBound(target=11): " + lowerBound(sorted, 11) + " (every element is below 11, so length is returned)");
        System.out.println("lowerBound(target=4): " + lowerBound(sorted, 4) + " (insertion point between 3s and 8)");

        int[] empty = {};
        System.out.println("lowerBound on empty array: " + lowerBound(empty, 5));
    }
}
```

Output:

```text
lowerBound(target=3): 1 (first index whose value is at least 3)
lowerBound(target=0): 0 (every element is at least 0)
lowerBound(target=11): 6 (every element is below 11, so length is returned)
lowerBound(target=4): 4 (insertion point between 3s and 8)
lowerBound on empty array: 0
```

This is exactly the chapter's concept-check question: when *every* element is below the target, `lowerBound` returns the array's **length** — a valid, meaningful "insert here, at the very end" answer, not `-1` and not an exception. Compare this deliberately with `hi`'s starting value: ordinary binary search starts `hi` at `sorted.length - 1` (the last valid *index*), while `lowerBound` starts `hi` at `sorted.length` itself (one *past* the last valid index) — because `lowerBound`'s return value is not necessarily an existing element's position; it can legitimately be "one past the end," meaning "nothing here is big enough, insert after everything." The loop condition is also `lo < hi`, not `lo <= hi`, and there is no equality check inside the loop at all — `lowerBound` never stops early on finding a match; it keeps narrowing until `lo` and `hi` converge on the exact leftmost valid insertion point, correctly handling the run of three `3`s in the example by returning the position of the *first* one, not any arbitrary match among them.

## What happens under the hood

Binary search and `lowerBound` are really the same halving idea, applied to two subtly different questions: "does an exact match exist, and where" versus "where does this value's rightful place begin, whether or not it already exists." The second framing turns out to be strictly more general — with a small comparison after the call, you can recover "is it present?" from `lowerBound`'s result, but you cannot easily go the other direction — which is exactly why `lowerBound`-style search (sometimes called "binary search for the first true predicate") shows up so often as the underlying building block inside sorted collection implementations, insertion logic, and range-counting algorithms throughout professional code.

## Common mistakes

**1. Running binary search on data that has not actually been sorted.** It will not throw; it will silently return wrong, unpredictable results — always sort first, or know for certain the data is already sorted.

**2. Writing `(lo + hi) / 2` instead of `lo + (hi - lo) / 2`.** For very large arrays, `lo + hi` can overflow `int` (Chapter 2), producing a corrupted midpoint.

**3. Confusing binary search's `hi = sorted.length - 1` with `lowerBound`'s `hi = sorted.length`.** They encode genuinely different things: "last valid index" versus "one past the end," and mixing them up produces off-by-one errors.

**4. Expecting `lowerBound` to return `-1` when nothing matches.** By design, it never does — it always returns a valid insertion index from `0` to `length`, inclusive.

**5. Assuming binary search on an array containing duplicate target values returns a *specific* one of them.** Ordinary binary search (unlike `lowerBound`) can land on any matching index among duplicates; use `lowerBound` (or `upperBound`, its mirror image) when you specifically need the first or last occurrence.

## Best practices

- Reach for linear search when data is unsorted and searched only occasionally; reach for binary search only after confirming (or establishing) sorted order, especially if searching repeatedly.
- Always write `lo + (hi - lo) / 2` for a midpoint calculation, as a defensive habit against overflow on large ranges.
- Use `lowerBound`-style search whenever you need an insertion point, a count of elements below a threshold, or the first/last of several duplicate matches, rather than reaching for ordinary binary search and trying to adapt it awkwardly afterward.
- Never call `java.util.Arrays.binarySearch` (or your own binary search) on data you have not verified is sorted; the method's own contract explicitly disclaims correctness otherwise.

## Summary

- Linear search is O(n) in the worst case but works on data in any order.
- Binary search is O(log n) in the worst case, but strictly requires the data to already be sorted.
- Each binary search comparison eliminates roughly half of the remaining candidates, which is why its comparison count grows so slowly even for enormous inputs.
- Violating binary search's sorted-data precondition does not throw an exception — it silently produces wrong results, exactly the kind of contract violation earlier chapters warned about.
- `lowerBound` finds the first index whose value is at least the target, correctly returning the array's length when every element is smaller — never `-1`.

## Practice

Warm-up:

1. Trace binary search by hand for the array `{2, 5, 8, 12, 16, 23, 38, 45}` searching for `23`, writing down `lo`, `hi`, and `mid` at each step, then verify with code.
2. Explain, in your own words, why `mid = lo + (hi - lo) / 2` avoids the overflow risk that `(lo + hi) / 2` has.
3. Call `lowerBound` on an array where the target is smaller than every element, and confirm it returns `0`.

Core:

1. Implement `upperBound`, the mirror image of `lowerBound`: the first index whose value is *strictly greater* than the target. Test it on an array with a run of duplicate values and confirm it returns the position just past the last duplicate.
2. Write a method `countInRange(int[] sorted, int low, int high)` (inclusive bounds) using two calls to `lowerBound`/`upperBound`-style searches, and verify it against a brute-force linear count for several test arrays.
3. Deliberately call your binary search on unsorted data with a target that exists in the array, find an example where it returns the wrong result, and explain exactly which comparison made the wrong decision.

Challenge:

1. Implement binary search recursively instead of iteratively, and compare its call-stack behavior (a preview of the next lesson) to the iterative version's loop-based behavior.
2. Using only `lowerBound`, implement a method that inserts a new value into a sorted array (returning a new, larger array, following Chapter 4's non-mutation discipline) while keeping it sorted, and test it with insertions at the beginning, middle, end, and among duplicates.

## Check your understanding

1. Why does linear search need no precondition on its input, while binary search absolutely does?
2. Roughly how many comparisons does binary search need in the worst case for one million sorted elements, and why is that number so much smaller than one million?
3. What happens, precisely, when binary search is run on data that is not actually sorted — does it throw, or does something else happen?
4. What does `lowerBound` return when every element in the array is smaller than the target, and why is that choice more useful than returning `-1`?
5. Why does `lowerBound` start its `hi` variable at `sorted.length` rather than `sorted.length - 1`?
6. If an array contains three copies of the value `7`, what index does `lowerBound(array, 7)` return, and how does that differ from what ordinary binary search might return for the same search?
