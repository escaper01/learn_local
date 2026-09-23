# Infinite streams, resource streams, parallelism, and interference

## Boundedness and resources
```java
var firstFive = java.util.stream.Stream.iterate(1, n -> n + 1)
    .limit(5).toList();
try (var lines = java.nio.file.Files.lines(path)) {
    long matches = lines.filter(line -> line.contains("ERROR")).count();
}
```
The generated stream is infinite unless bounded or short-circuited. Sorting an unbounded source cannot finish. Files.lines owns an open resource and must be closed even when traversal fails.

## Parallel judgment
Parallel streams divide work and combine results. Operations must avoid interference with the source and shared mutable state. CPU-heavy independent work may benefit; blocking I/O, small inputs, synchronization, and ordering can erase the gain. The default parallel execution environment is shared, so use explicit task management when isolation and cancellation matter.

Java 21 does not include the later Stream Gatherers API as a stable feature. Keep course examples within the declared baseline.

## Practice
Compare filter().limit() and limit().filter() on a generated source. Explain why they can return different numbers of results. Benchmark a realistic pure CPU pipeline and record workload size and environment before claiming a speedup.
