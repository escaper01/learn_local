# HTTP methods, status codes, headers, media types, and idempotency

HTTP is a text-based (at the framing level) request-response protocol built on top of the TCP sockets from the previous lesson, and every framework that hides it still ultimately produces and consumes exactly the request and response structure this lesson covers. Getting the semantics right — which method to use, what a status code actually promises, whether an operation is safe to retry — is what separates an API that behaves predictably under real-world failure from one that silently corrupts data the first time a client retries a timed-out call.

What you will learn:

- The standard HTTP methods and the semantic promise each one makes
- What "safe" and "idempotent" mean precisely, and why they are different properties
- How to read a status code by its class, and what each class actually commits to
- The role of key headers: `Content-Type`, `Content-Length`, `Cache-Control`, and conditional headers
- Why media type (`Content-Type`) matters as much as the bytes themselves
- Why idempotency is what makes safe retries possible at all — the foundation for Lesson 5

## Methods and their semantic promises

HTTP methods are not just verbs picked by convention; each one makes a specific promise a well-behaved client and server both rely on:

| Method | Promise | Safe? | Idempotent? |
|---|---|---|---|
| `GET` | Retrieve a representation; must not modify state | Yes | Yes |
| `HEAD` | Same as `GET` but headers only, no body | Yes | Yes |
| `OPTIONS` | Discover what the server supports for this resource | Yes | Yes |
| `PUT` | Replace the resource entirely with the given representation | No | Yes |
| `DELETE` | Remove the resource | No | Yes |
| `POST` | Submit data to be processed however the resource defines (often creates a new resource) | No | No (in general) |
| `PATCH` | Apply a partial modification to the resource | No | No (in general) |

**Safe** means the method must not change server state at all — a `GET` that increments a view counter as a side effect is, strictly, not safe, even though many real systems do exactly that pragmatically. **Idempotent** is a distinct, weaker promise: performing the same request multiple times produces the same *end state* as performing it once, even though each individual response, or an intervening side effect like a logged audit entry, need not be identical. `PUT /accounts/42 {"balance": 100}` is idempotent because repeating it still leaves the balance at 100; `POST /accounts/42/deposits {"amount": 100}` is not, because repeating it deposits 100 twice.

## Why idempotency, not safety, is the property that matters for retries

A client that times out waiting for a response to a `PUT` can safely retry it: whether the original request's response was lost in transit, or the original request never arrived at all, sending the same `PUT` again leaves the resource in the same final state either way. A client that times out waiting for a `POST /payments` response cannot safely retry blindly: if the original request *did* reach the server and *did* commit, an unconditional retry double-charges the customer. This single distinction — idempotent methods are safe to retry unconditionally; non-idempotent methods are not — is the foundation for every retry policy in Lesson 5, and for why many real APIs add an **idempotency key** (a client-generated unique identifier the server deduplicates against) specifically to make `POST` retry-safe when the business operation itself cannot be naturally idempotent.

```java
// A client-supplied idempotency key lets the server recognize a retried POST
// as "the same logical request," even though POST itself makes no such promise.
// POST /payments
// Idempotency-Key: 7f3c2e1a-9b4d-4e2f-8a11-5c6d7e8f9012
// {"amount": 4999, "currency": "USD"}
```

## Status codes: read the class, then the specific code

Status codes are grouped into five classes, and the class alone already tells you most of what you need before reading the specific number:

| Class | Meaning | Client's next move |
|---|---|---|
| `1xx` Informational | Request received, processing continues | Rare to handle explicitly at the application level |
| `2xx` Success | The request was received, understood, and accepted | Proceed with the response body |
| `3xx` Redirection | Further action needed to complete the request | Usually follow the `Location` header (often automatic) |
| `4xx` Client error | The request itself is wrong somehow | Do not retry unmodified; fix the request or surface the error |
| `5xx` Server error | The server failed to fulfill an apparently valid request | May be safe to retry, especially for idempotent methods |

A handful of specific codes deserve exact recall, because their precise meaning is often confused:

| Code | Exact meaning |
|---|---|
| `200 OK` | Success, response has a body describing the result |
| `201 Created` | Success, a new resource was created (commonly with a `Location` header pointing to it) |
| `204 No Content` | Success, deliberately no body (common for `DELETE` or a `PUT` with nothing more to say) |
| `400 Bad Request` | The request is malformed or fails validation; retrying it unmodified will fail the same way |
| `401 Unauthorized` | Missing or invalid authentication; the client is not who it claims to be |
| `403 Forbidden` | Authenticated, but not permitted to perform this action |
| `404 Not Found` | No resource at this URI (or, deliberately, used to hide the existence of a resource the caller is not permitted to know about) |
| `409 Conflict` | The request conflicts with the current state (e.g., a version mismatch on update) |
| `429 Too Many Requests` | Rate limited; often paired with a `Retry-After` header |
| `500 Internal Server Error` | An unhandled failure on the server; no information about whether the operation had any effect |
| `503 Service Unavailable` | The server is temporarily unable to handle the request (overloaded, in maintenance); often retry-appropriate, often paired with `Retry-After` |

A very common mistake is treating "anything under 500" as success, or "anything not exactly 200" as failure. Neither is correct: `201`, `204`, and `202 Accepted` are all success codes with different implications about the body and about whether processing is complete yet; `404` and `400` are both client errors under 500 but mean entirely different things about what the client should do next.

## Headers: metadata that changes how the body is interpreted

A request or response's headers are not decoration — several of them change how the body must be parsed or how the exchange should behave at all:

| Header | Purpose |
|---|---|
| `Content-Type` | The media type of the body (e.g., `application/json`, `text/plain`, `multipart/form-data`) — parsing a body without checking this is asking for the wrong parser to run against it |
| `Content-Length` | The exact byte length of the body, letting the receiver know when it has read the whole thing without relying on the connection closing |
| `Accept` | What media types the client is willing to receive back |
| `Cache-Control` | Caching directives (`no-store`, `max-age=3600`, `must-revalidate`) that govern whether and how long a response may be reused |
| `ETag` / `If-None-Match` | An opaque version identifier for conditional requests: "only send me the body if it has changed since I last saw ETag X" |
| `Retry-After` | On a `429` or `503`, how long the server is asking the client to wait before retrying |
| `Authorization` | Credentials for the request (a bearer token, basic auth, and similar schemes) |

`Content-Type` deserves particular attention because it is the header most often assumed rather than checked: a client that always parses the response body as JSON, without confirming `Content-Type: application/json`, will crash or silently misparse the moment the server returns an HTML error page (a common outcome from a misconfigured proxy or a server crash) instead of the expected JSON body.

## Conditional requests and caching, briefly

`ETag` plus `If-None-Match` let a client avoid re-downloading a resource it may already have: the client sends the `ETag` value it last saw, and the server responds `304 Not Modified` (with no body at all) if that value still matches the resource's current state, or a full `200` response with the new content and new `ETag` if it does not. `Cache-Control` headers govern this independently of conditional requests, controlling whether an intermediate cache (a CDN, a browser cache, a reverse proxy) may serve a stored copy at all without even contacting the origin server. Both are optimizations that trade a network round-trip against a small risk of staleness, governed entirely by the headers the server chooses to send — a server that omits caching headers should be assumed non-cacheable by default, not optimistically cached.

## What happens under the hood: from a request line to a parsed response

1. The client opens (or reuses, via HTTP keep-alive) a TCP connection to the server, exactly as in the previous lesson.
2. It sends a request line (`POST /payments HTTP/1.1`), a set of headers, a blank line, and — for methods that carry one — a body, whose length the `Content-Length` header (or chunked transfer encoding) declares so the server knows where the body ends.
3. The server processes the request and sends back a status line (`HTTP/1.1 201 Created`), its own headers, a blank line, and a body.
4. The client reads the status line first and decides, from its class and the specific code, how to interpret the rest — a `4xx`/`5xx` response still has a normally framed body (often an error description) that must be read and consumed correctly, not merely detected and discarded, or the connection cannot be safely reused for the next request.
5. If the connection is kept alive (the default in HTTP/1.1 unless `Connection: close` is sent), the same TCP connection is reused for a subsequent request, which is why correctly consuming the entire declared body — not just the parts you care about — matters even for error responses.

## Common mistakes

**Mistake 1: treating `POST` as safe to retry unconditionally on timeout.** A timeout gives no information about whether the original request was processed; blindly retrying a non-idempotent `POST` can duplicate the effect. Fix: use an idempotency key for retry-sensitive `POST` operations, or require an explicit user confirmation before retrying.

**Mistake 2: branching on "status code under 500" as if that means success.** `400`, `401`, `403`, `404`, and `409` are all under 500 and are all failures the client caused and must handle, not retry blindly. Fix: check the specific status class (`2xx` for success) rather than an arbitrary numeric threshold.

**Mistake 3: parsing a response body without checking `Content-Type`.** An error page, a proxy's own HTML response, or a misconfigured endpoint can return a body that is not what the client expects, and parsing it blindly produces a confusing failure far from its real cause. Fix: check `Content-Type` before choosing a parser, and handle the mismatch explicitly.

**Mistake 4: confusing "idempotent" with "has no side effects."** A `DELETE` is idempotent (deleting an already-deleted resource still leaves it deleted) but obviously not side-effect-free the first time. Fix: keep the two concepts distinct — idempotency is about the *end state* after repetition, not about whether any effect happened at all.

## Best practices

- Choose the HTTP method by the semantic promise you actually need (safe, idempotent, or neither), not by habit.
- Never retry a non-idempotent operation without an idempotency key or another mechanism that makes the retry provably safe.
- Read the status code's class first, then the specific code, before deciding how to handle a response.
- Always check `Content-Type` before parsing a body; never assume the format based on what you expect to receive.
- Honor `Retry-After` when a server sends one, rather than retrying immediately or on your own arbitrary schedule.
- Fully consume a response body, including on error responses, when reusing a keep-alive connection for further requests.

## Summary

- HTTP methods carry specific promises: `GET`/`HEAD`/`OPTIONS` are safe; `PUT`/`DELETE` are idempotent but not safe; `POST`/`PATCH` are generally neither.
- Idempotency, not safety, is what makes blind retries acceptable; a non-idempotent operation needs an idempotency key or explicit confirmation to retry safely.
- Status codes should be read by class first: `2xx` success, `3xx` redirection, `4xx` client error (do not retry unmodified), `5xx` server error (sometimes retry-appropriate).
- `Content-Type` governs how a body must be parsed and should always be checked, not assumed.
- Conditional requests (`ETag`/`If-None-Match`) and `Cache-Control` let clients and intermediaries avoid unnecessary transfers, entirely under the server's control via headers.

## Practice

1. **Warm-up:** For each of `GET`, `PUT`, `POST`, and `DELETE`, state whether it is safe, whether it is idempotent, and give a one-sentence justification for each answer.
2. **Warm-up:** A client receives a `409 Conflict`. Explain what this status class tells you about whether retrying the exact same request is likely to help.
3. **Core:** Design an idempotency-key scheme for a `POST /orders` endpoint: what the client sends, what the server stores, and what response the server returns for a retried request with the same key.
4. **Core:** Write a small response-classification function that maps a status code to one of `SUCCESS`, `CLIENT_ERROR`, `SERVER_ERROR`, or `OTHER`, and test it against at least one code from each class in this lesson's table.
5. **Challenge:** Design a caching strategy for a read-heavy endpoint using `ETag` and `Cache-Control`, explaining what a `304 Not Modified` response saves compared to a full `200`, and what happens if the server forgets to update the `ETag` when the underlying data changes.

## Check your understanding

1. What is the precise difference between a "safe" method and an "idempotent" method, and which category does `DELETE` fall into?
2. Why is it unsafe, in general, to retry a `POST` request automatically after a timeout, and what technique makes such a retry safe?
3. Why is checking only "status code under 500" an insufficient way to decide whether a request succeeded?
4. What role does the `Content-Type` header play, and what can go wrong if a client parses a body without checking it?
5. What does a `304 Not Modified` response tell the client, and what header pair makes it possible?
6. Why must a client fully read an error response's body on a keep-alive connection, even if it does not need the content?
