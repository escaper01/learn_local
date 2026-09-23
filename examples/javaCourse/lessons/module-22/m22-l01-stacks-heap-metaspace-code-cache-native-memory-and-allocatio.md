# Stacks, heap, metaspace, code cache, native memory, and allocation

## Memory is larger than the Java heap
Heap holds ordinary objects; each thread has stack frames; metaspace holds class metadata; compiled native code occupies a code cache. Direct buffers, native libraries, and thread structures also consume process memory. A container limit covers the process, so setting the heap equal to the entire container limit leaves no headroom.

```java
long used = Runtime.getRuntime().totalMemory()
    - Runtime.getRuntime().freeMemory();
System.out.println("Approximate heap use: " + used);
```
This is a rough instantaneous heap estimate, not a full retained-size or process-memory measurement.

## Allocation
Object allocation is often cheap through thread-local allocation buffers, but retained graphs and allocation churn affect collection. The JVM may eliminate some allocations when observable behavior permits it; source-level new does not define an exact measured allocation cost.

## Practice
Compare heap measurements with process memory during a controlled load. Distinguish heap exhaustion, native-thread failure, metaspace growth, and direct-buffer pressure. Do not prescribe larger -Xmx for every OutOfMemoryError; identify the exhausted resource and retaining or workload cause.
