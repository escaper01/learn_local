# Big-O, best/average/worst case, and practical costs

## Measure growth
O(1) work does not grow with input length; O(n) scans once; O(n log n) commonly describes efficient comparison sorting; O(n²) often arises from comparing every pair. State what n represents and whether you mean worst, expected, or amortized cost.
```java
int comparisons = 0;
for (int i = 0; i < n; i++)
    for (int j = i + 1; j < n; j++) comparisons++;
```
This visits n(n-1)/2 pairs, hence quadratic growth. Doubling n approximately quadruples pair work for large n. A loop with i *= 2 takes logarithmically many iterations under a safe bound.

## Space and reality
An algorithm may trade O(n) extra memory for faster lookup. Recursive stack frames count as space. A hash operation's expected constant time depends on hashing assumptions. I/O and allocations can dominate a theoretically better algorithm on real workloads.

## Practice
Count operations for nested loops, sequential loops, and halving searches. Analyze a method that copies then sorts an array. Record time and auxiliary space separately. Compare measured results over several sizes and explain deviations without claiming that Big-O predicts milliseconds.
