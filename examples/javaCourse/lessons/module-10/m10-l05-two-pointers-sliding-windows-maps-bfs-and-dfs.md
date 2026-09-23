# Two pointers, sliding windows, maps, BFS, and DFS

## Match a pattern to its invariant
Two pointers shrink a search region, sliding windows maintain a property of a contiguous range, and frequency maps remember counts without rescanning. Prefix sums answer repeated range totals by subtraction. None is universally applicable.

## BFS and DFS
```java
var queue = new java.util.ArrayDeque<Integer>();
var visited = new java.util.HashSet<Integer>();
queue.addLast(start);
visited.add(start);
while (!queue.isEmpty()) {
    int node = queue.removeFirst();
    for (int next : graph.getOrDefault(node, java.util.List.of())) {
        if (visited.add(next)) queue.addLast(next);
    }
}
```
graph is a Map<Integer,List<Integer>>. Marking visited when enqueuing avoids duplicate queued work. BFS explores by edge distance and finds shortest path length in an unweighted graph. DFS explores one branch deeply and is useful for reachability and cycle analysis with suitable state.

## Practice
Trace a cycle A->B->C->A and a disconnected vertex. Add predecessor tracking to reconstruct a BFS path. Explain why weighted edges require another shortest-path algorithm. Implement a frequency-based duplicate detector and compare it with the pairwise quadratic version.
