# Chapter 10 assessment and deliberate practice

This chapter gave you a vocabulary for reasoning about *cost*, not just correctness: which of two working solutions will still perform acceptably as data grows, and which specific technique closes the gap when a naive approach is too slow. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Big-O, best/average/worst case, and practical costs

Big-O describes how cost grows with input size, deliberately ignoring constant factors and hardware details. Nested loops over the same input commonly produce O(n squared) work. Best, worst, and average case can differ substantially for one algorithm; worst case is the standard default because it is the only guarantee holding for every input. Two algorithms with identical Big-O can still differ enormously in real speed due to constant factors Big-O does not capture — use direct, warmed-up measurement to compare those.

### Lesson 2: Linear search, binary search, and insertion points

Linear search is O(n) and needs no precondition; binary search is O(log n) but strictly requires sorted data, and violating that precondition produces silently wrong answers, not an exception. `lowerBound` finds the first index whose value is at least the target, returning the array's length — never `-1` — when every element is too small.

### Lesson 3: Sorting algorithms, stability, and comparator correctness

Bubble and insertion sort are O(n squared) in the worst case; insertion sort is genuinely fast on nearly-sorted data. Merge sort achieves O(n log n) through recursive splitting and linear merging. A stable sort preserves the original relative order of equal-key elements. Implementing a numeric comparator with subtraction overflows for extreme values, corrupting a sort silently; always use `Type.compare(a, b)`.

### Lesson 4: Recursion, call stacks, divide-and-conquer, and backtracking

Each recursive call is a genuine stack frame; a missing or unreachable base case produces `StackOverflowError`, not an infinite loop. Naive recursion on overlapping subproblems (like Fibonacci) is exponential; memoization caches results to fix it. Backtracking explores choices by making one, recursing, and undoing it — forgetting the undo step corrupts every subsequent result's content without necessarily changing how many results are produced.

### Lesson 5: Two pointers, sliding windows, maps, BFS, and DFS

Two pointers converge from both ends of sorted data to turn an O(n squared) pair search into O(n). A sliding window updates a running value incrementally instead of recomputing it. A `HashMap` remembering values already seen replaces an inner loop with an O(1) expected lookup. BFS explores level by level with a queue and guarantees shortest paths by edge count in an unweighted graph; DFS explores deeply before backtracking and offers no such guarantee.

## Cheat sheet

### Recognizing growth rate

| Shape | Classification |
|---|---|
| Fixed number of operations regardless of input | O(1) |
| Halving the remaining candidates each step | O(log n) |
| One pass over the input | O(n) |
| A sort built from splitting and merging | O(n log n) |
| Nested loops over the same input | O(n squared) |

### From O(n squared) to something better

| Naive pattern | Faster technique | New complexity |
|---|---|---|
| Check every pair with nested loops | Two pointers (sorted data) or a `HashMap` | O(n) |
| Recompute every window's sum | Sliding window, incremental update | O(n) |
| Recompute overlapping recursive subproblems | Memoization | often O(n) |
| Re-explore already-visited graph nodes | Track a `visited` set | visits each node once |

### Search and sort quick reference

| Need | Tool | Precondition |
|---|---|---|
| Find a value, any order | Linear search | none |
| Find a value fast, repeatedly | Binary search | data must be sorted |
| Find an insertion point | `lowerBound` | data must be sorted |
| General-purpose sort | Standard library sort | none (handles it for you) |
| Numeric comparator | `Type.compare(a, b)` | never subtraction |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does a binary-search-family method assume sorted data without the caller having guaranteed it?
- Does `lowerBound` return `-1` anywhere instead of a valid index from `0` to `length`?
- Is a numeric comparator implemented with subtraction instead of `Type.compare`?
- Does a recursive method have a base case that is reachable for every valid input?
- Does a backtracking algorithm undo every mutation it makes, in every branch, before returning?
- Does a graph traversal track visited nodes to avoid infinite re-exploration on a cyclic graph?

## The judgment question

The judgment question asks what must be documented when an optimization trades more memory for a better time complexity — going from O(n squared) to O(n), for instance, the way `HashMap`-based lookup or memoization did in this chapter's own examples. The answer is the tradeoff itself and the assumptions it depends on: what input sizes and shapes make the memory cost acceptable, what happens if the input is much larger than expected, and any precondition the faster approach relies on (sorted data for binary search and `lowerBound`, for instance). A future maintainer — quite possibly you — needs this context to know when the optimization remains a good trade and when it might need to be revisited, since neither "faster" nor "smaller" is unconditionally better without knowing the actual constraints.

## Approaching the implementation lab

The lab asks for `lowerBound`: the first index in a sorted array whose value is at least the target, or the array's length when no such index exists.

1. Write the contract first, exactly as Lesson 2 stated it: what should the method return when the target is smaller than everything, larger than everything, exactly matches one or more elements, or falls between two elements?
2. Build a boundary table: an empty array, a target below every element, a target above every element, a target matching the first element, a target matching the last element, and a target matching a run of duplicates.
3. Recall the specific structural detail Lesson 2 emphasized: `hi` should start at the array's length (not `length - 1`), and the loop condition should be `lo < hi`, with no early-exit equality check — the search must keep narrowing until `lo` and `hi` converge on the true leftmost qualifying position.
4. Keep the method deterministic and free of side effects, consistent with every function lab in this course.

## Approaching the debug lab

The debug lab's binary search uses `a[mid] <= 3` as its narrowing condition, which computes an *upper* bound (the index just past the last matching duplicate) instead of a *lower* bound (the first index at least equal to the target).

1. Run the program and confirm it prints `3` instead of the expected `1` for `{1, 3, 3, 8}` searching for `3`.
2. Recall exactly why: `a[mid] <= 3` treats a matching element (`a[mid] == 3`) the same as a definitely-too-small element, pushing `lo` past every `3` instead of stopping at the first one.
3. Change the comparison so that only strictly-too-small elements (`a[mid] < target`) advance `lo`; any match or larger value should instead pull `hi` down, exactly as Lesson 2's `lowerBound` implementation did.
4. Confirm your fix preserves the demonstrated array and target exactly as written, and now prints `1`.

## Approaching the project lab

The project lab asks for a small, self-contained record-processing pipeline: parse pipe-delimited lines, validate each field, reject malformed or duplicate-ID lines while counting errors, then sort and format the survivors.

1. Separate the concerns exactly as this course's earlier chapters have modeled: parsing and validation first (Chapter 2's console-input discipline — syntax then semantics), then storage with an explicit uniqueness policy (Chapter 9's collection contracts — a `Map` keyed by ID is a natural fit for "keep the first accepted record per ID"), then sorting (this chapter's Lesson 3 — descending priority, then ascending ID, is a two-key comparator built with `Comparator.comparingInt(...).thenComparingInt(...)` and `reversed()` from Chapter 7), then formatting.
2. Represent one accepted record as a `record` (Chapter 6), giving you correct equality and a clean, immutable representation for free.
3. Build a boundary table before writing code: an empty input, a line with too few or too many pipe-separated fields, a non-numeric or non-positive ID, a priority outside 1 to 3, a blank title, a title containing a pipe character, and a repeated ID (which must be rejected while keeping the first occurrence).
4. Keep the counting and the accepting logic honest: every rejected line, for any reason, increments the same `ERRORS` counter exactly once; a repeated ID is a rejection of the *later* line, not the first.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Take a nested-loop algorithm you wrote in an earlier chapter, identify its Big-O classification, and rewrite it using one of this chapter's techniques (two pointers, a sliding window, or a `HashMap`) to improve it, then verify both versions produce identical results on the same test data.
2. Implement quicksort from scratch, compare its behavior against merge sort's on both random and already-sorted input, and explain the difference you observe.
3. Write a small graph of your own choosing and implement both BFS and DFS on it, printing each traversal's visit order and comparing them.
4. Take a recursive method you wrote for this chapter's practice and add memoization to it if it has overlapping subproblems, measuring the call-count improvement as this chapter's Fibonacci example did.

## Self-assessment

You are ready for Chapter 11 when you can do all of the following without notes:

- Classify a piece of code's growth rate by its loop and recursion structure, and state whether that classification refers to best, worst, or average case.
- Explain why binary search requires sorted data and what happens, precisely, if that precondition is violated.
- Implement `lowerBound` correctly, including its behavior when every element is too small.
- Explain why a numeric comparator must never be implemented with subtraction.
- Trace a recursive method's call stack by hand and identify its base case and recursive case.
- Explain why forgetting to undo a mutation in a backtracking algorithm corrupts results without necessarily changing how many are produced.
- Choose the right technique (two pointers, sliding window, map-based lookup, BFS, or DFS) for a described problem, and justify the choice by the problem's actual shape.
