# Retries, deadlines, backoff, jitter, circuit breakers, and bulkheads

## Retries need an effect model
A timeout means the result is unknown: the remote server may already have committed. Retrying a payment without an idempotency key can charge twice. Retry only selected transient failures and operations whose repetition is safe.

```java
long cappedDelay = Math.min(30_000L, 1_000L << Math.min(attempt, 5));
// Choose a random delay from 0 through cappedDelay for full jitter.
```
Validate nonnegative attempt values. Backoff reduces retry pressure; jitter prevents synchronized clients from retrying together. Apply a maximum attempt count and total deadline, not only a per-attempt timeout. Respect server retry guidance where appropriate.

## Other controls
A circuit breaker temporarily stops calls after failure thresholds. A bulkhead isolates capacity so one dependency cannot consume all workers. Neither replaces authentication, timeouts, or bounded queues.

## Practice
Simulate a request that commits and then loses its response. Design an idempotency record scoped to the caller and operation, with payload matching and expiry rules. Test permanent rejection, transient failure, exhausted deadline, and duplicate requests. Record retry counts without logging sensitive payloads.
