# Chapter 18 assessment and deliberate practice

This chapter specified what it means for a process boundary to remain correct under real-world failure: TCP gives ordered bytes but no message boundaries, so framing and bounded reads are your responsibility; HTTP methods make specific, exact promises (safety, idempotency) that determine what a client is ever allowed to assume is safe to repeat; Java's `HttpClient` returns error responses as ordinary values, not exceptions; JSON parsing is boundary code needing the same bounding discipline as any other untrusted input; and a timeout is fundamentally ambiguous about whether a remote operation actually took effect, which is why retries, deadlines, circuit breakers, and bulkheads all exist. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: TCP sockets, byte-stream framing, timeouts, limits, and cleanup

TCP guarantees ordered, reliable bytes, not message boundaries — one write is never guaranteed to correspond to one read. Framing (length-prefixing or delimiters) recovers message boundaries explicitly, and any declared length must be validated against a maximum before a buffer is allocated for it. Every blocking socket call needs an explicit timeout, since an unresponsive peer otherwise blocks a thread forever. Partial reads and writes must be looped over until the expected amount of data has moved. Sockets and their streams are real OS resources and must be closed on every exit path, including exceptional ones.

### Lesson 2: HTTP methods, status codes, headers, media types, and idempotency

HTTP methods carry specific promises: `GET`/`HEAD`/`OPTIONS` are safe; `PUT`/`DELETE` are idempotent but not safe; `POST`/`PATCH` are generally neither. Idempotency — not safety — is what makes blind retries acceptable, which is why a non-idempotent `POST` needs an idempotency key to retry safely. Status codes should be read by class first (`2xx`/`3xx`/`4xx`/`5xx`), never by an arbitrary numeric threshold like "under 500." `Content-Type` governs how a body must be parsed and should always be checked, never assumed.

### Lesson 3: Java HttpClient synchronous and asynchronous workflows

`HttpClient.send` returning normally only means a response was received — a `404` or `500` is not an exception, and `statusCode()` must always be checked explicitly. `send` throws only for genuine transport failures (`IOException`, `InterruptedException`), a distinct category from an HTTP-level error status. Connect timeout and per-request timeout are separate settings bounding different phases. `HttpClient` has no built-in JSON support; that requires a declared library. `sendAsync` returns a `CompletableFuture<HttpResponse<T>>` that composes directly with Chapter 17's tools.

### Lesson 4: JSON types, schemas, parsing limits, DTOs, and compatibility

JSON has a single number type, which risks silent precision loss for large integers or money deserialized into `double`; use strings, `long`, or `BigDecimal` instead. DTOs should stay separate from domain models so internal refactors do not silently become breaking API changes. JSON parsed from untrusted input needs explicit size and nesting-depth limits, exactly like any socket message. "Absent," "explicitly null," and "present with a value" are three distinct states a partial-update endpoint must be able to tell apart. Additive, optional schema changes are backward compatible; removing, renaming, or retyping a field is breaking and needs versioning.

### Lesson 5: Retries, deadlines, backoff, jitter, circuit breakers, and bulkheads

A timeout tells you only that no response arrived — never whether the remote operation actually took effect, which is why only idempotent (or idempotency-key-protected) operations are safe to retry blindly. Exponential backoff spreads retries over increasing delays; jitter adds randomness so many simultaneously failing clients do not retry in lockstep, which fixed delays alone would cause. A deadline bounds an entire multi-attempt operation, distinct from each attempt's own timeout. A circuit breaker fails fast against a persistently failing dependency instead of continuing to retry it. A bulkhead isolates resources per dependency so one failing dependency cannot starve calls to unrelated, healthy ones.

## Cheat sheet

### Method semantics

| Method | Safe | Idempotent | Retry on timeout without extra protection? |
|---|---|---|---|
| `GET`/`HEAD`/`OPTIONS` | Yes | Yes | Yes |
| `PUT`/`DELETE` | No | Yes | Yes |
| `POST`/`PATCH` | No | No | Only with an idempotency key |

### Status code classes

| Class | Meaning | Retry-appropriate? |
|---|---|---|
| `2xx` | Success | N/A |
| `3xx` | Redirection | Follow, do not retry as failure |
| `4xx` | Client error | No — fix the request instead |
| `5xx` | Server error | Sometimes, for idempotent methods |

### Retry-safety decision

| Failure | Retry? |
|---|---|
| Connection refused / DNS failure | Yes, any method |
| Timeout | Only if idempotent or idempotency-key-protected |
| `429`/`503` | Yes, honoring `Retry-After` |
| `400`/`401`/`403`/`409` | No |

### Resilience patterns

| Pattern | Protects against |
|---|---|
| Exponential backoff + jitter | Synchronized retry storms overwhelming a recovering service |
| Deadline | A retry loop continuing long after the caller stopped waiting |
| Circuit breaker | Wasting resources retrying a service that is clearly, persistently down |
| Bulkhead | One failing dependency exhausting resources needed by calls to healthy ones |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does code assume `HttpClient.send` throwing is the only failure mode, without checking `statusCode()`?
- Is a non-idempotent `POST` retried on timeout without an idempotency key?
- Does a retry delay computation risk overflow before its cap is applied, rather than clamping the attempt count first?
- Is any socket or JSON parser accepting input with no size or nesting limit?
- Does a status-code check use an arbitrary threshold (like "under 500") instead of checking for the `2xx` class explicitly?
- Is a shared, unbounded resource pool used for calls to multiple independent downstream dependencies?

## The judgment question

The judgment question describes a remote write that times out and asks what a retry policy must consider — the correct answer is **the write may already have committed**, not that timeout proves no effect and not that retry is always safe. This is the chapter's central theme, stated most directly in Lesson 5: a timeout tells the client only that no response arrived within its wait budget, and gives no information whatsoever about whether the server received, processed, or committed the write before the connection was lost. Assuming "timeout means nothing happened" is exactly the mistake that leads to a duplicated effect (a double charge, a duplicate order) when a retry is issued unconditionally against a non-idempotent operation. "Retry is always safe" ignores Lesson 2's idempotency distinction entirely; only an idempotent operation, or a non-idempotent one protected by an idempotency key, can be retried without risking exactly this kind of duplication.

## Approaching the implementation lab

The lab asks for `retryDelay(attempt)`: return `min(1000 * 2^attempt, 30000)`, treating negative attempts as zero.

1. Write the precondition and boundary table first: `attempt = 0` (`1000`), `attempt = 1` (`2000`), a large attempt that should already be capped at `30000`, a negative attempt (treated as `0`), and the maximum possible `int` value, which must not be allowed to overflow the shift before the cap applies.
2. Clamp negative attempts to zero first, exactly as Lesson 5's `ExponentialBackoff.delayForAttempt` demonstrates, so a negative shift amount is never attempted.
3. Clamp the (already non-negative) attempt count itself to a small maximum (5 is enough, since `1000 * 2^5 = 32000` already exceeds the `30000` cap) *before* computing `1000 << attempt` — this is what prevents the hidden test with `attempt = 2147483647` from ever computing an overflowing or undefined shift.
4. Apply `Math.min(...)` against `30000` only after the clamped shift, matching every test case in the JSON, including both boundary cases (`attempt = 5` and the `Integer.MAX_VALUE` case) landing exactly at `30000`.

## Approaching the debug lab

The debug lab's starter code treats any status under 500 as success (`status<500 ? "SUCCESS" : "ERROR"`), which is exactly the "arbitrary threshold instead of status class" mistake this chapter's second and third lessons both warn against — a `404` is a client error, not a success, even though it is numerically under 500.

1. Run the program and confirm it currently prints `SUCCESS` instead of the required `ERROR` for `status = 404`.
2. Recall Lesson 2's exact point: only the `2xx` class represents success; `4xx` and `5xx` are both failure classes, and "under 500" incorrectly folds every `4xx` code into "success."
3. Correct the condition to check for the `2xx` range specifically (for example, `status >= 200 && status < 300`) rather than an arbitrary upper bound, preserving the surrounding branching structure.
4. Confirm your fix now prints `ERROR` for `status = 404`, and be ready to explain why a real HTTP client that treated every non-5xx response as success would silently misreport failed requests to its caller.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Implement a length-prefixed message protocol over a loopback socket with an explicit maximum length check, and demonstrate both a correctly framed round-trip and a rejected oversized declared length.
2. Write a small classification function mapping an HTTP status code to `SUCCESS`, `CLIENT_ERROR`, `SERVER_ERROR`, or `OTHER`, then use it to decide, for each of a list of sample outcomes, whether a caller should retry.
3. Using `HttpClient`, write a call that checks `statusCode()` explicitly, handles a non-2xx response by throwing a descriptive exception, and separately catches `IOException`/`InterruptedException` for genuine transport failures — logging which category each simulated failure fell into.
4. Configure a JSON mapper with explicit maximum nesting depth and size limits, and demonstrate it rejecting an oversized or deeply nested payload that an unconfigured mapper would accept.
5. Implement exponential backoff with jitter and an overall deadline together, and simulate ten clients retrying against a flaky dependency, showing (via timestamps) that jitter spreads their retries out rather than synchronizing them.

## Self-assessment

You are ready for Chapter 19 when you can do all of the following without notes:

- Explain why TCP's guarantees do not include message boundaries, and why framing must be handled explicitly at the application level.
- State which HTTP methods are safe, which are idempotent, and why idempotency (not safety) is what makes a retry acceptable.
- Explain why `HttpClient.send` returning a `404` is not an exception, and what `send` does throw for.
- Explain why DTOs should be kept separate from domain models, and name one risk of representing money or large IDs as a JSON number deserialized into `double`.
- Explain why a timeout gives no information about whether a remote write actually took effect, and why that makes idempotency essential for safe retries.
- Explain the difference between exponential backoff and jitter, and what specific problem each one solves.
- Explain what a circuit breaker and a bulkhead each protect against, and how they differ.
