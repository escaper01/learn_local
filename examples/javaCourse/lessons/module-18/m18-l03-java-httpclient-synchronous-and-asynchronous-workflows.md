# Java HttpClient synchronous and asynchronous workflows

Java's standard library has shipped a modern HTTP client since Java 11 (`java.net.http.HttpClient`), replacing the old, awkward `HttpURLConnection` for new code. This lesson applies the HTTP semantics from the previous lesson and the `CompletableFuture` composition from Chapter 17 to `HttpClient`'s actual API: how to build a request, how `send` differs fundamentally from what many developers expect regarding status codes, how to set real deadlines, and how to issue the same call asynchronously without blocking a thread.

What you will learn:

- How to build an `HttpClient`, an `HttpRequest`, and choose a `BodyHandler`
- What `send` actually throws versus what it returns — and why a 404 is not an exception
- How to set connect timeouts and per-request timeouts, and why both matter
- How to send JSON request bodies and read JSON response bodies (with a JSON library, not the JDK alone)
- How `sendAsync` returns a `CompletableFuture<HttpResponse<T>>` and composes with Chapter 17's tools
- How to reuse a client instance instead of creating one per call

## Building a client and a request

`HttpClient` instances are expensive to configure but cheap to reuse, and are explicitly documented as thread-safe — create one per application (or per logical group of settings) and share it, rather than building a new one for every call:

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class HttpClientBasics {

    // Shared, reusable client: connect timeout applies to establishing the TCP connection.
    static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    public static void main(String[] args) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.example.internal/orders/42"))
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(5)) // per-request timeout, separate from connectTimeout
                .GET()
                .build();

        HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println("status: " + response.statusCode());
        System.out.println("body: " + response.body());
    }
}
```

`HttpRequest` and `HttpClient` are both built with an immutable builder pattern: `.build()` produces a fixed, reusable object rather than something you mutate further. The `BodyHandler` (`ofString()`, `ofByteArray()`, `ofInputStream()`, `ofFile(path)`) determines how the response body is materialized — choosing `ofString()` for a response you expect to be gigabytes in size defeats the point of ever using `ofInputStream()` or a bounded reader instead, exactly the same size-awareness this course's other boundary-handling lessons emphasize.

## What `send` actually throws — and what it does not

This is the single most important, and most commonly misunderstood, fact about `HttpClient`: **`send` does not throw an exception for a non-2xx status code.** A `404`, `500`, or any other HTTP response is a *successfully received response* as far as `HttpClient` is concerned — `send` returns an `HttpResponse<T>` with that status code, and it is your code's responsibility to inspect `statusCode()` and branch accordingly, exactly as the previous lesson's status-code table requires.

`send` *does* throw for genuine transport-level failures: `IOException` (connection refused, DNS failure, the connection dropped mid-response) and `InterruptedException` (the calling thread was interrupted while blocked in `send`). These are distinct failure categories from an HTTP-level error response, and conflating them is a common source of bugs:

```java
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class StatusVersusException {

    static final HttpClient CLIENT = HttpClient.newHttpClient();

    // WRONG: assumes send() throwing means "the request failed" and a returned response means "success."
    static String fetchNaively(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).GET().build();
            HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
            return response.body(); // returned even for a 404 or 500 response!
        } catch (IOException | InterruptedException e) {
            return "transport failure"; // never reached for a 404 — that path returns above, silently
        }
    }

    // CORRECT: send() succeeding only means a response was received; statusCode() must be checked.
    static String fetchCorrectly(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url)).GET().build();
        HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new IOException("unexpected status " + response.statusCode() + ": " + response.body());
        }
        return response.body();
    }
}
```

`fetchNaively` silently returns an error page's body as if it were a successful result, because nothing ever inspected `statusCode()`. This is exactly the "treat status under 500 as success" mistake from the previous lesson, expressed at the API level: `HttpClient` will happily hand you a `404` response object without complaint, and it is entirely on you to decide what counts as success for your application.

## Timeouts: connect versus per-request

`HttpClient.Builder.connectTimeout(...)` bounds how long establishing the TCP connection (and TLS handshake, for HTTPS) may take. `HttpRequest.Builder.timeout(...)` bounds the entire request-response exchange once the connection exists — how long to wait for the complete response after sending the request. Both throw `HttpConnectTimeoutException` or `HttpTimeoutException` (subclasses of `IOException`) respectively when exceeded, and, exactly as with the raw sockets in Lesson 1, a request with no `.timeout(...)` set can block indefinitely against a peer that accepted the connection but never finishes responding.

```java
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
// ... inside a method that calls CLIENT.send(request, handler):
try {
    return CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
} catch (HttpConnectTimeoutException e) {
    System.out.println("could not establish a connection in time");
    throw e;
} catch (HttpTimeoutException e) {
    System.out.println("connected, but the response did not arrive in time");
    throw e;
}
```

Distinguishing the two matters for the same reason distinguishing connect and read timeouts mattered for raw sockets: a connect timeout usually indicates the service is entirely unreachable (DNS, network, or the service is down), while a request timeout after a successful connection usually indicates the service is up but slow or stuck — different situations that may call for different handling, and both are exactly the kind of ambiguity Lesson 5's retry-safety discussion depends on being able to name precisely.

## Sending and receiving JSON

The JDK's standard library does not ship a general-purpose JSON object mapper (that gap is filled by declaring a library dependency such as Jackson or Gson, as the next lesson covers in depth); `HttpRequest.BodyPublishers` and `HttpResponse.BodyHandlers` only work with raw text, bytes, files, and streams. Combining `HttpClient` with a JSON library looks like this:

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

public class JsonOverHttpClient {

    record OrderRequest(String customerId, int totalCents) {}
    record OrderResponse(String orderId, String status) {}

    static final HttpClient CLIENT = HttpClient.newHttpClient();
    static final ObjectMapper MAPPER = new ObjectMapper();

    static OrderResponse createOrder(OrderRequest order) throws Exception {
        String requestBody = MAPPER.writeValueAsString(order);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.example.internal/orders"))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 201) {
            throw new IllegalStateException("order creation failed: " + response.statusCode() + " " + response.body());
        }
        return MAPPER.readValue(response.body(), OrderResponse.class);
    }
}
```

Note the explicit `Content-Type: application/json` on the *request* (telling the server how to parse the body you sent) and the check of the *response's* status code before attempting to deserialize its body — deserializing an error response's body as if it were a successful `OrderResponse` would fail confusingly, or worse, silently produce a half-populated object if the JSON library is lenient about missing fields.

## Asynchronous requests with sendAsync

`sendAsync` issues the same request without blocking the calling thread, returning a `CompletableFuture<HttpResponse<T>>` that composes directly with everything from Chapter 17:

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.CompletableFuture;
import java.util.List;
import java.util.stream.Collectors;

public class AsyncHttpDemo {

    static final HttpClient CLIENT = HttpClient.newHttpClient();

    static CompletableFuture<String> fetchAsync(String url) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url)).GET().build();
        return CLIENT.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(response -> {
                    if (response.statusCode() / 100 != 2) {
                        throw new RuntimeException("unexpected status " + response.statusCode());
                    }
                    return response.body();
                });
    }

    public static void main(String[] args) {
        List<String> urls = List.of(
                "https://api.example.internal/inventory/1",
                "https://api.example.internal/inventory/2",
                "https://api.example.internal/inventory/3"
        );

        List<CompletableFuture<String>> futures = urls.stream()
                .map(AsyncHttpDemo::fetchAsync)
                .collect(Collectors.toList());

        CompletableFuture<Void> all = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]));
        all.thenRun(() -> {
            List<String> bodies = futures.stream().map(CompletableFuture::join).collect(Collectors.toList());
            System.out.println("all inventory responses: " + bodies);
        }).join();
    }
}
```

This is exactly the `allOf`-plus-`join` pattern from Chapter 17 applied to real network calls: three requests run concurrently on `HttpClient`'s internal executor, and the caller only blocks (via the final `join()`) once, after issuing all three, rather than sequentially waiting for each one to finish before starting the next. `sendAsync`'s failure modes map onto `CompletableFuture`'s: a transport failure or non-2xx status handled inside `thenApply` surfaces as a failed future, catchable with `exceptionally`/`handle` exactly as in the previous chapter.

## What happens under the hood: from `send` to a materialized response

1. `HttpClient` resolves the target host (DNS), establishes a TCP connection (or reuses a pooled one from an earlier request to the same host, subject to `connectTimeout` for a new connection), and performs a TLS handshake for HTTPS.
2. It writes the request line, headers, and body (if any) over that connection, exactly as the raw-socket framing from Lesson 1 describes at a lower level, but handled internally.
3. It reads the response status line and headers, then streams the body according to the chosen `BodyHandler` — `ofString()` buffers the entire body into memory before `send` returns; `ofInputStream()` returns as soon as headers arrive, letting you stream the body without buffering it all at once.
4. `send` blocks the calling thread until this entire exchange completes or the per-request timeout elapses; `sendAsync` instead returns immediately with an incomplete `CompletableFuture` that completes when the same exchange finishes, driven by `HttpClient`'s own internal executor.
5. Any status code, `2xx` through `5xx`, results in `send` returning normally (or `sendAsync`'s future completing successfully) — only a transport-level failure (`IOException`) or a timeout throws or fails the future.

## Common mistakes

**Mistake 1: assuming `send` throwing means the request failed, and a returned response means success.** `send` returning a `404` or `500` is a *normal, non-exceptional* outcome. Fix: always check `response.statusCode()` explicitly, regardless of whether `send` returned without throwing.

**Mistake 2: no per-request timeout.** Without `.timeout(...)` on the request, a slow or stuck server can block `send` indefinitely, exactly like an untimed socket read. Fix: always set both `connectTimeout` on the client and `.timeout(...)` on each request.

**Mistake 3: parsing a JSON response body without checking `Content-Type` or the status code first.** An error page or an unexpected content type deserialized as if it were the expected DTO produces a confusing failure far from its real cause. Fix: check status and `Content-Type` before deserializing.

**Mistake 4: creating a new `HttpClient` per request.** This discards connection pooling and repeats expensive setup for no benefit. Fix: build one shared, reusable client (or one per distinct configuration) and reuse it across calls.

**Mistake 5: blocking with `send` inside code that should stay non-blocking, or forgetting to eventually `join`/`get` an async result at all.** The former wastes the benefit of an async design; the latter can silently drop a failure that was never observed. Fix: use `sendAsync` consistently through an async call chain, and always eventually consume the resulting future's outcome.

## Best practices

- Reuse a single `HttpClient` instance across calls to the same or related services.
- Always check `response.statusCode()`; never assume a returned response means success.
- Set both a connect timeout (on the client) and a per-request timeout (on the request) for every call.
- Check `Content-Type` and status before deserializing a response body with a JSON library.
- Use `sendAsync` and `CompletableFuture` composition for concurrent or non-blocking call patterns, applying Chapter 17's error-handling tools (`exceptionally`, `handle`) consistently.
- Choose the `BodyHandler` deliberately based on expected response size — do not default to buffering everything into a `String` for large or unbounded responses.

## Summary

- `HttpClient` is thread-safe and expensive to configure; build one and reuse it, rather than creating one per call.
- `send` returning normally only means a response was received — a 404 or 500 is not an exception; `statusCode()` must always be checked explicitly.
- `send` throws `IOException`/`InterruptedException` only for genuine transport failures, a distinct category from an HTTP-level error status.
- Connect timeout and per-request timeout are separate settings bounding different phases of the exchange.
- JSON handling requires a separate declared library; `HttpClient` itself only moves text, bytes, files, and streams.
- `sendAsync` returns a `CompletableFuture<HttpResponse<T>>` that composes directly with Chapter 17's `thenApply`/`thenCompose`/`exceptionally`/`allOf` tools.

## Practice

1. **Warm-up:** Explain, precisely, why a call to `CLIENT.send(...)` that returns a `404` response is not caught by a `catch (IOException e)` block.
2. **Warm-up:** A request has no `.timeout(...)` set. Describe a concrete scenario in which this causes a thread to block far longer than intended, even though the connection itself was established successfully.
3. **Core:** Write a method using `HttpClient` that sends a JSON request body (using a JSON library) and correctly handles a non-2xx response by throwing a descriptive exception built from the status code and body, without attempting to deserialize the error body as the expected success type.
4. **Core:** Rewrite that method using `sendAsync`, returning a `CompletableFuture` of the deserialized result, with `exceptionally` supplying a typed error result instead of letting a raw exception propagate.
5. **Challenge:** Issue five concurrent `sendAsync` calls to different endpoints, combine them with `allOf`, and handle the case where exactly one of the five fails while the other four succeed — decide and justify what the combined result should be in that case.

## Check your understanding

1. Why is checking `response.statusCode()` always necessary, regardless of whether `send` threw an exception?
2. What two distinct failure categories does `send` throw for, and how do they differ from an HTTP-level error status?
3. What is the difference between the client's `connectTimeout` and a request's `.timeout(...)`, and what does each one bound?
4. Why does the JDK's `HttpClient` not, by itself, give you JSON serialization or deserialization?
5. What does `sendAsync` return, and how does that let it integrate directly with `CompletableFuture` composition from Chapter 17?
6. Why should an application generally reuse one `HttpClient` instance rather than creating a new one per request?
