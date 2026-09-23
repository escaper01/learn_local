# Memory leaks, ThreadLocal, listeners, queues, and bounded caches

## Leaks are unwanted reachability
Typical retaining structures include static maps, registered listeners, ThreadLocal values in long-lived workers, unbounded queues, and caches with no eviction.
```java
try {
    requestContext.set(context);
    handleRequest();
} finally {
    requestContext.remove();
}
```
This fragment assumes an existing ThreadLocal. remove prevents one reused worker from retaining a completed request or exposing its context to later work.

## Cache policy
A cache needs maximum size or weight, expiry, invalidation, ownership, and hit/miss/eviction metrics. A bounded count can still retain too much memory if each value varies greatly in size. Weak references have specialized semantics and do not replace a coherent retention policy.

## Practice
Create a listener registration that returns an unsubscribe handle, and test teardown. Load a cache beyond its limit and verify eviction. Distinguish memory that rises then plateaus from memory growing without bound under a stable workload. Explain why increasing heap size delays, rather than repairs, an unbounded cache defect.
