# Retries, deadlines, backoff, jitter, circuit breakers, and bulkheads

Every lesson in this chapter has been building toward one central, uncomfortable fact: a network call can fail in ways that give you no information about what actually happened on the other end. A timeout after sending a payment request does not tell you whether the payment succeeded, failed, or is still processing — it only tells you that *you* stopped waiting. This closing lesson is about designing for that uncertainty deliberately: which failures are safe to retry, how to retry without making things worse, and how to protect a struggling downstream service (and your own system) from being overwhelmed by everyone retrying it at once.

What you will learn:

- Why a timeout is fundamentally ambiguous about the remote effect of a request
- Which failures are safe to retry unconditionally, which need idempotency, and which should never be retried
- Exponential backoff, and why fixed-delay retries make things worse under load
- Jitter, and the specific failure mode (a retry storm) it prevents
- Deadlines that span an entire call chain, not just one attempt
- The circuit breaker pattern: stopping calls to a service that is clearly failing
- The bulkhead pattern: isolating failures so one dependency cannot exhaust resources needed by others

## The fundamental ambiguity of a timeout

Consider a client that sends `POST /payments` and the connection times out before any response arrives. What actually happened on the server, from the client's point of view, is genuinely unknowable from the timeout alone:

- The request never reached the server at all (network failure before delivery).
- The request reached the server, but the server crashed before processing it.
- The server processed the request and committed it, but the response was lost on the way back.
- The server is still processing it, and will complete (successfully or not) after the client has already given up.

All four look identical to the client: no response arrived within the deadline. This is why, as the previous lesson established, idempotency is not a nice-to-have property for retryable operations — it is the *only* thing that makes it safe to resolve this ambiguity by simply trying again. For an idempotent operation (a `PUT`, or a `POST` with a server-deduplicated idempotency key), retrying resolves all four cases correctly: if the original request never took effect, the retry makes it take effect once; if it already took effect, the retry is a safe no-op from the server's perspective.

## What is, and is not, safe to retry

A retry policy needs to classify failures, not treat every failure identically:

| Failure | Safe to retry? | Reasoning |
|---|---|---|
| Connection refused / DNS failure (never reached the server) | Yes, for any method | The request provably never took effect |
| Timeout waiting for a response | Only for idempotent operations | The request may or may not have taken effect |
| `503 Service Unavailable`, `429 Too Many Requests` | Yes, generally, honoring `Retry-After` if present | The server explicitly signaled a temporary condition |
| `500 Internal Server Error` | Depends — often yes for idempotent operations, cautiously | The server encountered an error, but whether it partially committed is often unclear |
| `400 Bad Request`, `422 Unprocessable Entity` | No | The request itself is malformed; retrying unmodified fails identically every time |
| `401 Unauthorized`, `403 Forbidden` | No (without first fixing credentials/permissions) | Retrying without changing anything cannot succeed |
| `409 Conflict` | No, generally | Usually means the request needs to change based on current state, not simply repeat |

A retry policy that retries every failure identically — including `400`s — wastes calls on requests that can never succeed and can amplify load on an already-struggling service with pointless retries of client-caused errors, exactly the pattern the next section addresses more generally.

## Exponential backoff: why fixed delays make things worse

The naive retry policy — wait a fixed interval, then retry, repeat — has a specific, dangerous failure mode under real outage conditions: if a service degrades and starts timing out for *every* client simultaneously, every client's fixed-delay retry fires at roughly the same moment, hitting the already-struggling service with another synchronized wave of load just as it might have started recovering. **Exponential backoff** — doubling (or otherwise increasing) the delay after each successive failure — spreads retries out over time instead:

```java
public class ExponentialBackoff {

    static final long BASE_DELAY_MS = 1_000;
    static final long MAX_DELAY_MS = 30_000;

    // Doubles the delay per attempt, capped at a maximum, exactly like Chapter 18's retryDelay lab.
    static long delayForAttempt(int attempt) {
        int clampedAttempt = Math.max(attempt, 0);
        long exponential = BASE_DELAY_MS * (1L << Math.min(clampedAttempt, 5)); // cap shift to avoid overflow
        return Math.min(exponential, MAX_DELAY_MS);
    }

    public static void main(String[] args) {
        for (int attempt = 0; attempt <= 6; attempt++) {
            System.out.println("attempt " + attempt + " -> wait " + delayForAttempt(attempt) + " ms");
        }
    }
}
```

```text
attempt 0 -> wait 1000 ms
attempt 1 -> wait 2000 ms
attempt 2 -> wait 4000 ms
attempt 3 -> wait 8000 ms
attempt 4 -> wait 16000 ms
attempt 5 -> wait 30000 ms
attempt 6 -> wait 30000 ms
```

Capping the shift amount before it is applied (rather than capping only the final result) avoids a subtle overflow bug: without the `Math.min(clampedAttempt, 5)` guard, a large enough attempt count would shift `1L` far enough to overflow or produce a nonsensical negative delay before the `Math.min` against `MAX_DELAY_MS` ever gets a chance to clamp it — exactly the boundary this chapter's coding lab specifically tests.

## Jitter: preventing synchronized retry storms

Exponential backoff alone still has a subtler version of the same synchronization problem: if a thousand clients all fail at the same instant (a brief total outage) and all compute the *same* backoff delay, they still all retry at the same moment, just one delay interval later instead of immediately — a **retry storm** that recurs at every backoff step. **Jitter** — adding randomness to the computed delay — spreads those synchronized clients out in time:

```java
import java.util.concurrent.ThreadLocalRandom;

public class BackoffWithJitter {

    static long delayForAttempt(int attempt) {
        long base = ExponentialBackoff.delayForAttempt(attempt);
        // "Full jitter": a uniformly random delay between 0 and the computed exponential value.
        return ThreadLocalRandom.current().nextLong(base + 1);
    }
}
```

"Full jitter" (choosing uniformly between zero and the exponential value) is one common strategy; "equal jitter" (half the exponential value, plus a random amount up to the other half) trades some of the spread for a guaranteed minimum wait. Either is a significant improvement over no jitter at all, because even a small handful of retrying clients spread over a window, rather than firing in lockstep, meaningfully reduces the peak load a recovering service sees at any single instant.

## Deadlines: bounding the whole call chain, not just one attempt

A per-attempt timeout (from Lesson 3) bounds one HTTP call. A **deadline** bounds the *entire* logical operation, including every retry attempt combined — without one, a retry loop with exponential backoff can keep trying for minutes after the caller (a user, or an upstream service with its own timeout) has stopped caring about the answer at all.

```java
import java.time.Duration;
import java.time.Instant;

public class DeadlineAwareRetry {

    interface Attempt<T> { T tryOnce() throws Exception; }

    static <T> T callWithRetryAndDeadline(Attempt<T> attempt, Duration overallDeadline) throws Exception {
        Instant deadline = Instant.now().plus(overallDeadline);
        int attemptNumber = 0;
        Exception lastFailure = null;

        while (Instant.now().isBefore(deadline)) {
            try {
                return attempt.tryOnce();
            } catch (Exception e) {
                lastFailure = e;
                long delayMs = BackoffWithJitter.delayForAttempt(attemptNumber++);
                long remainingMs = Duration.between(Instant.now(), deadline).toMillis();
                if (remainingMs <= 0) break;
                Thread.sleep(Math.min(delayMs, remainingMs)); // never sleep past the deadline
            }
        }
        throw new IllegalStateException("exceeded overall deadline of " + overallDeadline, lastFailure);
    }
}
```

Note the deadline governs the *whole* retry loop, and the sleep before the next attempt is itself capped by whatever time remains — sleeping the full backoff delay even when it would blow through the deadline wastes time the caller has already indicated it does not have. In a distributed system, this deadline ideally propagates across service boundaries (an incoming request's "give up after 2 seconds" budget shrinking as it passes through each downstream call), so that a slow leaf service does not cause every caller up the chain to separately wait out its own full, uncoordinated timeout.

## Circuit breakers: stopping calls to a service that is clearly failing

Retrying with backoff and jitter still assumes retrying is worth attempting at all. When a downstream service is *clearly* down — not intermittently slow, but consistently failing — continuing to send it retries wastes your own resources (threads, connections) waiting on calls virtually certain to fail, and can itself contribute to keeping the downstream service overloaded during its recovery. A **circuit breaker** tracks recent failure rates and, once a threshold is crossed, stops attempting calls entirely for a cooldown period, failing fast instead:

| State | Behavior |
|---|---|
| Closed | Calls proceed normally; failures are counted |
| Open | Calls fail immediately, without even attempting the network call, once the failure threshold is crossed |
| Half-open | After a cooldown, a limited number of trial calls are allowed through to test whether the dependency has recovered |

```java
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;

public class SimpleCircuitBreaker {

    enum State { CLOSED, OPEN, HALF_OPEN }

    private volatile State state = State.CLOSED;
    private final AtomicInteger consecutiveFailures = new AtomicInteger();
    private volatile Instant openedAt;
    private final int failureThreshold;
    private final Duration cooldown;

    SimpleCircuitBreaker(int failureThreshold, Duration cooldown) {
        this.failureThreshold = failureThreshold;
        this.cooldown = cooldown;
    }

    boolean allowCall() {
        if (state == State.OPEN) {
            if (Instant.now().isAfter(openedAt.plus(cooldown))) {
                state = State.HALF_OPEN; // allow one trial call through
                return true;
            }
            return false; // fail fast: do not even attempt the call
        }
        return true; // CLOSED or HALF_OPEN both allow the call to proceed
    }

    void recordSuccess() {
        consecutiveFailures.set(0);
        state = State.CLOSED;
    }

    void recordFailure() {
        if (state == State.HALF_OPEN || consecutiveFailures.incrementAndGet() >= failureThreshold) {
            state = State.OPEN;
            openedAt = Instant.now();
        }
    }
}
```

Failing fast when the breaker is open is the entire point: instead of a caller waiting out a full timeout on a call that is virtually certain to fail, `allowCall()` returning `false` lets the caller respond immediately (with a cached value, a degraded response, or a clear error), and stops adding load to a service that is trying to recover.

## Bulkheads: isolating one dependency's failure from everything else

A **bulkhead** (named for a ship's watertight compartments) isolates the resources used to call one dependency from the resources used to call others, so a single failing or slow dependency cannot exhaust a shared pool and take down calls to *unrelated* dependencies along with it. Without this isolation, a shared, unbounded thread pool used for every outbound call means a slow payment service backing up hundreds of threads waiting on it can starve the thread pool that would otherwise be serving fast, healthy calls to an inventory service.

```java
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BulkheadDemo {

    // Separate, bounded executors per downstream dependency: a slow paymentService
    // cannot exhaust the threads available for inventoryService calls.
    static final ExecutorService paymentServicePool = Executors.newFixedThreadPool(5);
    static final ExecutorService inventoryServicePool = Executors.newFixedThreadPool(5);
}
```

This directly reuses Chapter 17's bounded-executor discipline, applied per dependency rather than as one shared pool for all outbound calls — the same `Semaphore`-based bounding from the virtual threads lesson is another valid bulkhead implementation, limiting concurrent calls to one specific dependency regardless of how many virtual threads the rest of the application happens to be running.

## What happens under the hood: from a failed call to a decision

1. An attempt is made against a deadline-aware retry loop; a per-attempt timeout (Lesson 3) bounds that single attempt, while the overall deadline bounds every attempt combined.
2. On failure, the failure is classified: a genuinely non-retryable failure (a `400`, a validation error) stops the loop immediately; a retryable one proceeds.
3. If a circuit breaker guards this dependency, `allowCall()` is checked *before* even attempting the network call — an open breaker fails fast without consuming a thread or connection on a call almost certain to fail.
4. If the call is allowed and fails again, the breaker's failure count updates, potentially tripping it open for a cooldown period.
5. Before the next retry attempt, a backoff delay (with jitter) is computed and slept, capped by whatever time remains before the overall deadline.
6. Resources used for this call (a thread from a bounded pool, a semaphore permit) are scoped to this dependency's own bulkhead, so its failures cannot starve resources reserved for other, healthy dependencies.

## Common mistakes

**Mistake 1: retrying a non-idempotent operation on timeout without an idempotency key.** As the previous lesson established, this can duplicate an effect that already committed. Fix: only retry blindly when the operation is idempotent or protected by a deduplication key.

**Mistake 2: fixed-delay retries with no jitter.** Under a real outage affecting many clients simultaneously, this produces synchronized retry storms that can prevent the recovering service from ever stabilizing. Fix: exponential backoff plus jitter.

**Mistake 3: a per-attempt timeout with no overall deadline.** A retry loop can keep trying long after the original caller has stopped waiting for an answer. Fix: bound the entire operation with a deadline, and stop retrying once it is exceeded.

**Mistake 4: continuing to retry a service that is clearly, persistently down.** This wastes resources on calls almost certain to fail and can hinder the service's own recovery. Fix: a circuit breaker that fails fast once a failure threshold is crossed.

**Mistake 5: sharing one unbounded thread pool (or connection pool) across all outbound dependencies.** A single slow or failing dependency can then starve calls to every other, healthy dependency. Fix: bulkhead resources per dependency with separate, bounded pools or semaphores.

## Best practices

- Classify failures before deciding whether to retry: never retry a `4xx` client error unmodified; be selective and idempotency-aware for timeouts and `5xx` errors.
- Always use exponential backoff with jitter for retries, never a fixed delay.
- Bound the entire retry sequence with an overall deadline, not just each individual attempt.
- Add a circuit breaker in front of a dependency that can fail persistently, so failures are detected and responded to quickly rather than retried indefinitely.
- Isolate resources per downstream dependency (bulkheads) so one failing dependency cannot exhaust resources needed by calls to healthy ones.
- Honor a server's `Retry-After` header when present, rather than computing your own backoff blindly.

## Summary

- A timeout is fundamentally ambiguous about whether the remote operation took effect; only idempotency (or an idempotency key) makes blind retrying safe.
- Failures should be classified before retrying: some (client errors) should never be retried; others (timeouts, `5xx`, `503`/`429`) may be, depending on idempotency.
- Exponential backoff spreads retries out over increasing delays; jitter adds randomness to prevent synchronized retry storms across many clients.
- A deadline bounds an entire multi-attempt operation, distinct from the per-attempt timeout that bounds a single call.
- A circuit breaker fails fast against a persistently failing dependency instead of continuing to retry it, and recovers through a half-open trial state.
- A bulkhead isolates the resources used for one dependency so its failure cannot exhaust resources needed by calls to other, healthy dependencies.

## Practice

1. **Warm-up:** A `PUT` request times out. Explain, referencing idempotency, why retrying it is safe even though the original request's actual effect is unknown.
2. **Warm-up:** Explain, concretely, why a thousand clients using fixed-delay retries with no jitter can make an already-struggling service's recovery harder rather than easier.
3. **Core:** Implement the exponential backoff with jitter shown above, and write a small simulation with ten "clients" retrying against a service, showing (by printing each retry's timestamp) that jittered delays spread out compared to unjittered ones.
4. **Core:** Extend a retry loop with an overall deadline, and demonstrate it giving up (with a clear error naming the deadline, not a generic failure) once the deadline is exceeded, even mid-backoff.
5. **Challenge:** Implement a simple circuit breaker (closed/open/half-open) around a simulated flaky dependency, and demonstrate it moving through all three states: tripping open after repeated failures, then recovering to closed after a successful half-open trial call.

## Check your understanding

1. Why can a client never conclusively determine, from a timeout alone, whether a request's effect actually occurred on the server?
2. Which HTTP status codes should generally never be retried, and why would retrying them unmodified never help?
3. What specific problem does jitter solve that exponential backoff alone does not?
4. What is the difference between a per-attempt timeout and an overall deadline, and why does a retry loop need both?
5. What does a circuit breaker's "half-open" state accomplish that jumping directly from "open" back to "closed" would not?
6. Why can a shared, unbounded thread pool used for calls to multiple downstream dependencies let one failing dependency affect calls to unrelated, healthy ones?
