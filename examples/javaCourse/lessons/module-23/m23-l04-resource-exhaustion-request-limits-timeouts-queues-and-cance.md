# Resource exhaustion, request limits, timeouts, queues, and cancellation

A well-authenticated, well-authorized, injection-free service can still be brought down by nothing more exotic than too many legitimate-looking requests arriving faster than it can process them — and the fixes are not new material at this point in the course, but a direct, deliberate application of the bounding discipline this course has built chapter by chapter: bounded thread pools and queues from the concurrency chapter, timeouts from the networking chapter, and now framed explicitly as a security concern, because unbounded resource consumption is exactly what a denial-of-service attack (or an entirely well-meaning traffic spike) exploits.

What you will learn:

- Why resource exhaustion is a security concern, not merely a performance or capacity-planning one
- Why an unbounded queue does not solve overload — it only changes the failure's shape
- Request-level limits: body size, concurrent requests, and rate limiting
- Timeouts and deadlines as a mandatory defense, not an optional tuning parameter
- Cancellation: stopping wasted work once a caller has already given up
- Designing every resource limit deliberately, as a stated policy, not an accident of default configuration

## Resource exhaustion as a security concern

Every chapter in this course that introduced a bounding discipline — bounded thread pools and queues (concurrency), timeouts on sockets and HTTP calls (networking), bounded JSON parsing (JSON boundaries), bounded LearnPack archive extraction (this project's own security boundaries) — was addressing the same underlying threat from a different angle: **an attacker (or simply enough legitimate traffic) can exhaust a finite resource** — memory, threads, file descriptors, CPU, database connections — by sending requests that consume it faster than the system can reclaim it. This is a **denial-of-service (DoS)** vulnerability in the same category as SQL injection or a broken authorization check, just aimed at *availability* rather than confidentiality or data integrity, and it deserves the same deliberate, reviewed design attention: every resource a request can consume needs an explicit, stated bound, chosen on purpose, not left as whatever the default happened to be.

## Why an unbounded queue does not solve overload

This chapter's concept-check question makes the point directly and precisely: an unbounded queue in front of a fixed-capacity worker pool does **not** solve overload — it only **converts overload into growing memory use and latency**, deferring the failure rather than preventing it.

```java
// UNBOUNDED: accepts work indefinitely, regardless of how fast it can actually be processed.
ExecutorService workers = new ThreadPoolExecutor(
        10, 10, 0L, TimeUnit.MILLISECONDS,
        new LinkedBlockingQueue<>()); // no capacity bound at all
```

If requests arrive faster than ten workers can process them, sustained over any meaningful period, the queue grows without limit: every queued request holds memory (its own payload, any state captured in its task object) for as long as it waits, and its **latency** — the time from arrival to actually being processed — grows in direct proportion to how deep the queue has grown, since a request submitted now sits behind every request already queued ahead of it. Eventually, one of two things happens: the process runs out of memory (an `OutOfMemoryError`, per the previous chapter, now triggered by an attacker or a traffic spike rather than a leak), or every request's latency grows so large that clients time out and give up anyway — at which point the work being done was already wasted, since nobody is still waiting for its result. Neither outcome is "handling" the overload; both are simply different, worse shapes of the same failure, arrived at later and with more collateral damage than an immediate, clear rejection would have caused.

```java
// BOUNDED: genuine back-pressure. A full queue means new work is explicitly rejected
// NOW, with a clear, immediate signal, rather than accepted and left to degrade everything.
ExecutorService boundedWorkers = new ThreadPoolExecutor(
        10, 10, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(200),
        new ThreadPoolExecutor.AbortPolicy()); // reject immediately once full
```

Rejecting a request immediately, with a `429 Too Many Requests` (from the networking chapter's status-code vocabulary) or an equivalent clear signal, is a **better** outcome than accepting it into an ever-growing queue: the caller learns immediately that the system is overloaded and can back off, retry with backoff and jitter (per the networking chapter's resilience patterns), or fail fast to its own caller — rather than waiting, uninformed, for a response that arrives so late it is no longer useful, while the queue's continued growth risks bringing down the entire process for every other request too.

## Request-level limits: body size, concurrency, and rate

Beyond the queue itself, several limits should be enforced at the very edge of a request's handling, before any real processing work begins:

```java
// Body size: reject an oversized request body before reading all of it into memory,
// exactly the JSON-parsing-limits discipline from the networking chapter, applied
// at the transport layer where it is cheapest to enforce.
server.setMaxRequestBodySize(10 * 1024 * 1024); // 10 MiB, chosen deliberately for this endpoint's actual needs

// Concurrent requests per client: prevents one caller from monopolizing capacity
// that should be shared fairly across all callers.
Semaphore perClientConcurrency = new Semaphore(5); // per-client-identity permit count

// Rate limiting: bounds total requests over TIME, not just concurrency at an instant —
// a client sending requests sequentially, one at a time, but extremely fast, would not
// be caught by a concurrency limit alone.
RateLimiter perClientRateLimit = RateLimiter.create(20.0); // 20 requests per second, per client
```

These three limits catch different attack (or accidental-overload) shapes: a body-size limit stops a single oversized payload from exhausting memory before any application logic even runs; a concurrency limit stops one client from occupying a disproportionate share of the shared worker pool at any given instant; a rate limit stops a client from sending an excessive *total volume* of requests over time, even if each individual request is small and each is processed quickly. None of the three substitutes for the others — a system with only a concurrency limit is still vulnerable to a client sending an enormous body in a single request; a system with only a body-size limit is still vulnerable to a client opening many small, cheap, rapid-fire requests.

## Timeouts as a mandatory defense

The networking chapter established timeouts as necessary to avoid a hung thread waiting indefinitely on a slow peer; from a security perspective, a **missing** timeout is directly exploitable: a malicious (or simply very slow) client that opens a connection and sends data at an artificially slow trickle — a **slow-loris**-style attack — can tie up a server thread or connection slot for an extended period using very little of its own resources, and enough such connections, held open simultaneously, can exhaust the server's available connection slots or worker threads entirely, denying service to every legitimate client.

```java
// Every layer needs its own timeout, exactly as the networking chapter established —
// but now understood as a mandatory defense against a deliberately slow adversary,
// not merely a tuning parameter for ordinary network variability.
server.setConnectionTimeout(Duration.ofSeconds(10));   // time to complete the initial handshake/headers
server.setRequestReadTimeout(Duration.ofSeconds(30));  // time to receive the full request body
server.setIdleTimeout(Duration.ofSeconds(60));         // time a keep-alive connection may sit idle
```

Each of these timeouts closes a distinct exploitable gap: without a connection timeout, a client can open a connection and never send anything at all; without a request-read timeout, a client can send a request's headers and then trickle its body in at one byte per minute; without an idle timeout, a client can hold an otherwise-finished, keep-alive connection open indefinitely, consuming a connection slot that could otherwise serve another client. Treating every one of these as a mandatory, deliberately chosen configuration value — not an unconfigured default left at "no timeout" — is the direct, practical consequence of understanding resource exhaustion as a security concern rather than merely a performance one.

## Cancellation: stopping wasted work once nobody is waiting

The concurrency and networking chapters both established that a *timeout* on the caller's side does not, by itself, stop the underlying task from continuing to run — the task must be explicitly cancelled, and must itself be interruption-aware, for the timeout to actually free the resources the task was consuming. This matters directly for resource exhaustion: a service that accepts a request, begins processing it, and continues consuming CPU, memory, and downstream connections even after the original caller has disconnected or timed out is wasting exactly the resources that legitimate, still-waiting requests need.

```java
public String handleRequest(HttpServletRequest request, HttpServletResponse response) throws Exception {
    AsyncContext asyncContext = request.startAsync();
    Future<String> resultFuture = workerPool.submit(() -> expensiveComputation(request));

    asyncContext.addListener(new AsyncListener() {
        @Override
        public void onTimeout(AsyncEvent event) {
            resultFuture.cancel(true); // caller gave up (or timed out); stop the wasted work now
        }
        @Override
        public void onError(AsyncEvent event) {
            resultFuture.cancel(true); // the connection dropped; same principle applies
        }
        // ... onComplete, onStartAsync omitted for brevity ...
    });

    return resultFuture.get(); // simplified; a real handler would not block the request thread here
}
```

Propagating cancellation all the way down a request's own call chain — cancelling the database query, the downstream HTTP call, and any CPU-bound work the moment the original caller is known to be gone — is what actually reclaims those resources for other, still-legitimate requests, rather than merely hiding the waste from the disconnected caller while it continues silently in the background.

## Designing limits as a deliberate, stated policy

The cumulative point of this lesson: every resource a request can consume — body size, processing time, concurrent connections, queue depth, downstream calls — needs an explicit, chosen limit, decided deliberately as part of the system's design and documented as policy, not left to whatever a framework's unconfigured default happens to be (which is very often "unbounded," precisely because a general-purpose framework cannot know an application's actual capacity in advance). This is the same discipline the LearnLocal project's own security boundaries apply to sandbox execution — bounded memory, CPU, PIDs, and output for every learner code execution — generalized to any service accepting external requests: a stated, reviewed limit for every consumable resource is what turns "the framework's defaults happened to protect us" (an accident) into "we decided this service can safely handle this much load, and enforce that decision explicitly" (a deliberate security posture).

## What happens under the hood: from an overloaded system to a rejected request

1. Requests arrive faster than the configured worker pool can process them; with a bounded queue, the queue fills to its configured capacity while workers continue processing at their maximum sustainable rate.
2. Once the queue is full, a new arriving request is rejected immediately by the configured rejection policy (an `AbortPolicy`-style immediate rejection, or an equivalent explicit `429`/`503` response) — this rejection happens without ever occupying a worker thread or consuming further memory for that request beyond the immediate rejection response itself.
3. A client whose request is rejected (or whose own client-side timeout expires while genuinely still queued) can back off and retry with the exponential-backoff-and-jitter discipline from the networking chapter, rather than the server accepting an ever-growing backlog it can never actually work through in time to matter.
4. If cancellation is wired through the request's full processing chain, a request whose caller has disconnected or timed out triggers cancellation signals down into whatever work is still in progress — a running query is cancelled, a downstream HTTP call is aborted, a CPU-bound computation checks its interrupted flag and stops — freeing those resources for the remaining, still-legitimate in-flight requests.
5. Timeouts at every layer (connection, request-read, idle) independently bound how long any single slow or malicious peer can occupy a connection slot or thread, regardless of whether that peer is failing to respond due to genuine network trouble or is deliberately trickling data to exploit an unbounded wait.

## Common mistakes

**Mistake 1: using an unbounded queue in front of a fixed worker pool, believing it "handles" traffic spikes.** It only defers the failure into growing memory use and latency, arriving later and with more collateral damage. Fix: bound the queue and reject immediately once full, giving callers a clear, actionable signal.

**Mistake 2: enforcing only a concurrency limit, with no body-size or rate limit, or vice versa.** Each limit catches a different attack shape; relying on only one leaves the others exploitable. Fix: enforce body size, concurrency, and rate limits together, each chosen deliberately for the endpoint's actual needs.

**Mistake 3: leaving any layer's timeout unconfigured, assuming "the framework probably has a sane default."** A missing connection, request-read, or idle timeout is directly exploitable by a deliberately slow client. Fix: set every layer's timeout explicitly, as a mandatory security control, not an optional tuning parameter.

**Mistake 4: not propagating cancellation when a caller disconnects or times out.** Work continues consuming resources for a caller who is no longer waiting, wasting capacity legitimate requests need. Fix: wire cancellation through the full request-processing chain, down to every downstream call and CPU-bound step.

## Best practices

- Treat every consumable resource (body size, concurrent requests, request rate, queue depth, processing time) as needing an explicit, deliberately chosen limit — never an unconfigured default.
- Reject overload immediately with a bounded queue and a clear signal, rather than accepting unbounded backlog that only defers and worsens the failure.
- Set timeouts at every layer (connection, request-read, idle) as a mandatory defense against a deliberately slow adversary, not an optional tuning knob.
- Propagate cancellation through a request's full processing chain the moment its original caller is known to be gone.
- Document chosen limits as a stated policy, reviewable and adjustable deliberately, rather than as an accident of whatever a framework's default happened to be.

## Summary

- Resource exhaustion is a security concern (a denial-of-service vulnerability), not merely a performance-tuning matter, and deserves the same deliberate design review as injection or authorization flaws.
- An unbounded queue does not solve overload; it converts it into unbounded memory growth and unbounded latency, a worse failure arriving later.
- Body-size limits, per-client concurrency limits, and rate limits each catch a distinct overload or attack shape; none substitutes for the others.
- Timeouts at every layer (connection, request-read, idle) are a mandatory defense against a deliberately slow client, not an optional tuning parameter.
- Cancellation must be propagated through a request's full processing chain once its caller is gone, to actually reclaim resources rather than merely hiding wasted work from a disconnected caller.
- Every resource limit should be a deliberate, stated design decision, not an accident of unconfigured framework defaults.

## Practice

1. **Warm-up:** Explain precisely why an unbounded queue in front of a fixed-size worker pool does not prevent an overloaded system from eventually failing, only changes how that failure manifests.
2. **Warm-up:** Name a specific attack shape a body-size limit alone would catch, and a different one a rate limit alone would catch, that the other would miss.
3. **Core:** Configure a bounded thread pool with an explicit rejection policy, a body-size limit, and a connection/request/idle timeout for a small service, and demonstrate each limit being enforced with a deliberately crafted request that exceeds it.
4. **Core:** Wire cancellation through a simulated request-processing chain (an async handler, a worker submitting a `Callable`, a simulated downstream call) so that a client disconnect or timeout actually stops the in-progress work rather than letting it run to completion silently.
5. **Challenge:** Design a complete resource-limit policy (body size, concurrency, rate limit, every layer's timeout, queue depth and rejection policy) for a hypothetical public API endpoint, and justify each specific number chosen based on the endpoint's expected legitimate traffic and worst-case abuse scenario.

## Check your understanding

1. Why is resource exhaustion classified as a security concern rather than purely a performance or capacity-planning issue?
2. Why does an unbounded queue fail to solve overload, and what does it convert the problem into instead?
3. Name the three request-level limits this lesson covers, and one distinct attack or overload shape each one specifically catches.
4. Why is a missing connection or request-read timeout directly exploitable by a deliberately slow client?
5. Why does a caller's timeout alone not stop the resources a request's processing is consuming, and what additional mechanism is required?
6. What distinguishes a deliberate, stated resource-limit policy from an accidental one, and why does that distinction matter for security?
