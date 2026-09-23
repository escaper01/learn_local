# Reachability, generations, collectors, pauses, throughput, and latency

## Reachability, not reference counting
An object is reclaimable when no GC root can reach it. Cycles are reclaimable if the entire cycle is unreachable. Roots include thread-associated references and static/class-associated state. A reachable cache entry is retained even if no user still needs it.

Collectors balance throughput, pause latency, concurrent CPU work, and footprint. Generational designs exploit the observation that many objects die young; the actual collector and options must match the target JDK and workload.

```text
java -Xlog:gc* -jar application.jar
```
Use a controlled external experiment and inspect event timing, heap changes, and pause distributions. Calling System.gc is only a request and is not a reliable application memory-management strategy.

## Practice
Allocate temporary objects versus objects retained in a static list and compare GC evidence. State a latency objective before changing collector configuration. Evaluate tail latency and throughput together. Explain why reducing allocations may improve throughput without necessarily fixing a leak caused by a single unbounded retention structure.
