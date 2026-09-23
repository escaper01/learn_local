# Recursion, call stacks, divide-and-conquer, and backtracking

## A recursive call must reduce the problem
```java
static long sum(int[] a, int index) {
    if (index == a.length) return 0;
    return a[index] + sum(a, index + 1);
}
```
The base case stops at the array boundary. Each invocation keeps its index and pending addition on the stack. This costs O(n) time and O(n) stack space, whereas an iterative accumulator uses O(1) auxiliary space. Java does not guarantee tail-call optimization.

## Backtracking restores state
For choosing subsets, each level chooses include or exclude, explores the smaller problem, then restores any mutable working list before the next branch. Failing to remove an added choice contaminates later branches. Copy a completed result before storing it so subsequent mutation cannot change past solutions.

Divide-and-conquer differs from a single recursive chain: it solves independent smaller pieces and combines them, as merge sort does.

## Practice
Draw the call tree for all subsets of three elements and predict eight results. Add pruning for a bounded positive-sum target. State why pruning based on exceeding the target is invalid if later numbers may be negative. Compare stack depth with total number of explored nodes.
