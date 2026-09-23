# Linear search, binary search, and insertion points

## Binary search needs a sorted contract
```java
static int lowerBound(int[] sorted, int target) {
    int low = 0, high = sorted.length;
    while (low < high) {
        int mid = low + (high - low) / 2;
        if (sorted[mid] < target) low = mid + 1;
        else high = mid;
    }
    return low;
}
```
The interval is half-open [low,high). Values before low are below target; values at or beyond high are at least target. Each iteration shrinks the interval. The result may equal length, which is a valid insertion point but not a readable element index.

Linear search does not require sorting and is often appropriate for one query on small unsorted data. Sorting solely to run one binary search adds cost. Binary search on a linked list loses efficient random access.

## Practice
Trace [1,3,3,8] for targets 0,3,5,9. Verify the first duplicate index is returned. Test empty input. Explain why low+(high-low)/2 avoids one overflow risk in (low+high)/2. Convert the insertion point into found/not-found without reading past the end.
