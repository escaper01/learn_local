# Sorting algorithms, stability, and comparator correctness

## Sorting rules and algorithm choice
Insertion sort repeatedly inserts the next value into the sorted prefix. It is simple and can perform well on small or nearly sorted data, but worst-case shifts are quadratic.
```java
for (int i = 1; i < values.length; i++) {
    int current = values[i], j = i - 1;
    while (j >= 0 && values[j] > current) {
        values[j + 1] = values[j];
        j--;
    }
    values[j + 1] = current;
}
```
Using > preserves the relative order of equal values in this algorithm. Stability matters when equal-key records should keep their earlier order. Merge sort combines sorted halves in O(n log n) time and typically needs O(n) extra storage.

## Production practice
Prefer library sorting unless implementing the algorithm is the learning objective. Object sorting and primitive sorting have different implementation and stability contracts. A malformed comparator can produce incorrect results or runtime rejection.

## Practice
Trace reverse-sorted, already-sorted, all-equal, and empty arrays. Count moves rather than only comparisons. Implement merge for two sorted arrays, preserving every duplicate. Explain whether the operation mutates caller-owned data and copy first if the contract promises otherwise.
