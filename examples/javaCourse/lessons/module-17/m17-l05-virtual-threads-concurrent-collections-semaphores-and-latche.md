# Virtual threads, concurrent collections, semaphores, and latches

## Virtual threads suit blocking workloads
```java
try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
    var result = executor.submit(() -> "loaded");
    System.out.println(result.get());
}
```
Virtual threads are supported in Java 21. They reduce the cost of many waiting threads, not the CPU cost of computation. Do not pool virtual threads merely to limit database access; bound the scarce downstream resource with a semaphore or connection pool. Java 21 has pinning limitations, including blocking while holding certain monitors, so measure the target runtime.

## Concurrent structures
ConcurrentHashMap supports thread-safe operations, but get-then-put is still a compound protocol; use compute/merge where appropriate. BlockingQueue combines transfer with waiting. CountDownLatch waits for a fixed count; Semaphore bounds permits. CopyOnWriteArrayList favors frequent iteration and rare mutation because each write copies storage.

## Practice
Design 100 independent blocking tasks with at most 5 simultaneous dependency calls. Release permits in finally and preserve interruption. Explain how unbounded task submission can still consume excessive memory despite cheap virtual threads. Avoid timing-sensitive tests based only on sleeps.
