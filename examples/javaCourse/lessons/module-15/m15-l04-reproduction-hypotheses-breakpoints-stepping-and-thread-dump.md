# Reproduction, hypotheses, breakpoints, stepping, and thread dumps

## Distinguish symptom and cause
Start with the smallest reproducing input and expected behavior. Form a hypothesis that can be disproved by one observation. If a sorted result is wrong, inspect the comparator before changing storage or adding logging everywhere.

```java
int[] values = {2, 4};
int total = 0;
for (int i = 0; i < values.length - 1; i++) total += values[i];
// Expected 6, actual 2: inspect the final loop condition.
```
A breakpoint on the loop lets you inspect i and total. Conditional breakpoints pause only for a chosen input. Watch expressions may invoke methods and cause side effects; inspect carefully.

## Threads and stacks
A thread dump shows where threads are running, waiting, or blocked. Several blocked threads are not automatically a deadlock; look for a cycle of held and requested locks. Stack traces locate failure paths, while heap evidence helps retained-memory problems.

## Practice
Write the hypothesis “the final element is skipped,” verify it, and make the smallest fix. Keep a regression test for a singleton array, where this bug returns zero. Document a failed hypothesis as well as the successful one so the reasoning is reproducible.
