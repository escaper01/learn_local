# Structured logging, levels, correlation, metrics, and traces

A `System.out.println` scattered through production code is not observability — it is a guess about what future-you will need to know when something goes wrong, written before you actually knew what would go wrong. This lesson covers the practical discipline of making a running system's behavior genuinely inspectable after the fact: structured, machine-parseable log lines, the meaning behind log levels, correlating scattered log lines from a single logical request, and the specific, easy-to-miss danger of exploding a metrics system's storage with unbounded label values.

What you will learn:

- Structured logging: emitting machine-parseable key-value fields instead of free-form sentences
- Log levels (`TRACE`/`DEBUG`/`INFO`/`WARN`/`ERROR`): what each one means, and how a threshold filters what actually gets emitted
- Correlation IDs: tagging every log line produced while handling one logical request, so related lines can be grouped even under concurrent traffic
- Why an unbounded label value (like a user ID) can silently overload a metrics backend, and what "cardinality" means concretely
- A brief orientation to distributed tracing: spans, trace IDs, and how they extend correlation across service boundaries

## Structured logging: fields instead of sentences

A plain log line like `"User u-42 placed order 1001 successfully"` is easy for a human to read once, but hard for a machine — or a person searching thousands of similar lines — to reliably query: extracting the user ID or order number back out requires fragile string parsing tuned to that exact sentence's wording. **Structured logging** instead emits explicit key-value fields, so every piece of data is unambiguously named and directly queryable.

```java
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public class StructuredVsPlainLogging {
    static String structured(String event, Map<String, Object> fields) {
        StringBuilder line = new StringBuilder();
        line.append("timestamp=").append(Instant.parse("2024-06-15T12:00:00Z"));
        line.append(" level=INFO event=").append(event);
        for (Map.Entry<String, Object> field : fields.entrySet()) {
            line.append(' ').append(field.getKey()).append('=').append(field.getValue());
        }
        return line.toString();
    }

    public static void main(String[] args) {
        System.out.println("plain: User u-42 placed order 1001 successfully");

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("userId", "u-42");
        fields.put("orderId", 1001);
        String line = structured("order_placed", fields);
        System.out.println("structured: " + line);

        String[] tokens = line.split(" ");
        long fieldCount = 0;
        for (String token : tokens) {
            if (token.contains("=")) {
                fieldCount++;
            }
        }
        System.out.println("machine-parseable key=value pairs found: " + fieldCount);
    }
}
```

Output:

```text
plain: User u-42 placed order 1001 successfully
structured: timestamp=2024-06-15T12:00:00Z level=INFO event=order_placed userId=u-42 orderId=1001
machine-parseable key=value pairs found: 5
```

The plain sentence and the structured line carry the *same underlying information*, but only the structured version has a `userId` field a log-aggregation tool can reliably filter on ("show me every log line where `userId=u-42`") without guessing at sentence phrasing that might change between code versions. Real logging frameworks typically emit this same structure as JSON rather than hand-built `key=value` text, but the underlying principle is identical: name every piece of data explicitly, rather than folding it into a sentence meant primarily for a human's eyes.

## Log levels: severity, and a threshold that filters what is actually emitted

Log levels express a message's relative importance — `TRACE` (extremely fine-grained detail), `DEBUG` (development-time diagnostic detail), `INFO` (normal, expected operational events), `WARN` (something unexpected but recoverable), `ERROR` (something failed). A configured **threshold** determines which levels actually get emitted; every level below the threshold is silently dropped.

```java
public class LogLevelFiltering {
    enum Level { TRACE, DEBUG, INFO, WARN, ERROR }

    static Level threshold = Level.INFO;

    static void log(Level level, String message) {
        if (level.ordinal() >= threshold.ordinal()) {
            System.out.println(level + ": " + message);
        }
    }

    public static void main(String[] args) {
        log(Level.DEBUG, "connecting to database");
        log(Level.INFO, "server started on port 8080");
        log(Level.WARN, "cache miss rate above 50%");
        log(Level.ERROR, "failed to process payment");

        System.out.println("raising threshold to DEBUG:");
        threshold = Level.DEBUG;
        log(Level.DEBUG, "connecting to database");
    }
}
```

Output:

```text
INFO: server started on port 8080
WARN: cache miss rate above 50%
ERROR: failed to process payment
raising threshold to DEBUG:
DEBUG: connecting to database
```

With the threshold set to `INFO`, the first `DEBUG` call produces no output at all — it is filtered out before ever reaching the console, exactly the behavior a `enum`'s declaration order and `ordinal()` naturally provide (`DEBUG` sorts below `INFO`, so `level.ordinal() >= threshold.ordinal()` is false). Lowering the threshold to `DEBUG` at runtime (as many real logging frameworks allow, without a restart) immediately lets that same `DEBUG` message through — this is exactly why production systems typically run at `INFO` or `WARN` by default, temporarily lowering to `DEBUG` only while actively investigating a specific issue, rather than permanently drowning every log stream in fine-grained detail nobody is currently looking for.

## Correlation IDs: grouping scattered log lines back into one request

A single incoming request often produces log lines from several different methods, and under real concurrent traffic, many requests' log lines interleave in the same output stream. A **correlation ID** — a unique value generated once per request and attached to every log line produced while handling it — lets you filter back to exactly one request's full story, regardless of how many other requests were being processed at the same time.

```java
public class CorrelationIdDemo {
    static final ThreadLocal<String> correlationId = new ThreadLocal<>();

    static void log(String message) {
        System.out.println("correlationId=" + correlationId.get() + " " + message);
    }

    static void validate() {
        log("validating input");
    }

    static void handleRequest(String id) {
        correlationId.set(id);
        try {
            log("received request");
            validate();
            log("request completed");
        } finally {
            correlationId.remove();
        }
    }

    public static void main(String[] args) {
        handleRequest("req-abc-123");
        handleRequest("req-xyz-789");
    }
}
```

Output:

```text
correlationId=req-abc-123 received request
correlationId=req-abc-123 validating input
correlationId=req-abc-123 request completed
correlationId=req-xyz-789 received request
correlationId=req-xyz-789 validating input
correlationId=req-xyz-789 request completed
```

`correlationId` is a `ThreadLocal<String>` — a value that is genuinely per-thread rather than shared, which matters enormously the moment a real server handles many requests concurrently on separate threads: each thread's `correlationId.get()` sees only the value *that thread* set, never another thread's, so log lines from concurrent requests never cross-contaminate each other's correlation ID. `validate()` never receives the correlation ID as an explicit parameter — it reads it from the thread-local automatically, which is exactly what lets *every* method along a request's call path log with the correct ID without threading an extra parameter through every single method signature. The `try`/`finally` with `correlationId.remove()` is essential and easy to forget: without it, a thread reused from a pool (common in real server frameworks) would silently carry a stale correlation ID into its *next*, entirely unrelated request.

## Metrics and cardinality: why a label's possible values matters

A metric like a request counter is typically **labeled** — broken down by dimensions such as HTTP status code or endpoint — and each distinct combination of label values creates its own separate, independently-stored time series in most metrics backends. **Cardinality** is the number of distinct values a label can take; a label with unbounded cardinality (a user ID, a raw email address, a UUID) can create an unbounded, ever-growing number of time series, degrading or overwhelming the metrics system's storage.

```java
import java.util.HashSet;
import java.util.Set;

public class MetricCardinalityDemo {
    public static void main(String[] args) {
        Set<String> boundedSeries = new HashSet<>();
        Set<String> unboundedSeries = new HashSet<>();

        String[] statusCodes = {"200", "404", "500", "200", "200", "404"};
        String[] userIds = {"u-1", "u-2", "u-3", "u-4", "u-5", "u-6"};

        for (String code : statusCodes) {
            boundedSeries.add("http_requests_total{status=\"" + code + "\"}");
        }
        for (String userId : userIds) {
            unboundedSeries.add("http_requests_total{user=\"" + userId + "\"}");
        }

        System.out.println("requests processed: " + statusCodes.length);
        System.out.println("distinct time series keyed by status code (bounded): " + boundedSeries.size());
        System.out.println("distinct time series keyed by user id (unbounded): " + unboundedSeries.size());
        System.out.println("every additional new user creates a brand-new time series that never goes away");
    }
}
```

Output:

```text
requests processed: 6
distinct time series keyed by status code (bounded): 3
distinct time series keyed by user id (unbounded): 6
every additional new user creates a brand-new time series that never goes away
```

Both label choices summarize the exact same six requests, but the results diverge sharply: HTTP status codes come from a small, known, effectively fixed set, so `boundedSeries` stays small (`3`) no matter how much traffic the system ever handles — it plateaus. Labeling by user ID instead produced one series *per distinct user* (`6`, matching the input exactly), and every genuinely new user who ever makes a request creates yet another permanent time series a real metrics backend must continue storing indefinitely. This is exactly the chapter's concept-check answer: **unbounded cardinality can overload metric storage**, not merely bloat a single log file (that concern applies to logs, not metrics) and not something a compile-time restriction on label values would prevent (label values are ordinary runtime strings, chosen entirely by the code emitting the metric). The fix is never to use an unbounded value as a metric *label* — log it as a structured field instead (where high cardinality is normal and expected) and reserve metric labels for values drawn from a small, genuinely bounded set.

## Traces: extending correlation across service boundaries

**Distributed tracing** generalizes the correlation-ID idea from "one process" to "an entire request's journey across multiple services": a single trace ID is generated at the request's entry point and propagated (typically via an HTTP header) to every downstream service call, while each individual unit of work along the way — a database query, an outbound API call, a specific function — is recorded as a **span**, with its own start time, duration, and parent span. Viewed together, a trace's spans reconstruct a request's full timeline across every service it touched, showing exactly which downstream call was slow or failed, in a way individual services' separate, uncorrelated logs cannot show on their own. The correlation ID from this lesson's example is, conceptually, a trace ID for the simplest possible case: a single process, no downstream services to propagate it to yet.

## What happens under the hood

A structured logging framework typically buffers log lines and writes them asynchronously in batches for performance, and formats each line (commonly as JSON) using a consistent schema so downstream tooling can parse every line the same way regardless of which part of the codebase emitted it. `ThreadLocal` storage (used for the correlation ID here) is implemented as a small per-thread map keyed by the `ThreadLocal` instance itself, which is exactly why it isolates values correctly between concurrently running threads without any explicit synchronization — each thread only ever sees its own map's entry.

## Common mistakes

**1. Logging free-form sentences instead of structured key-value fields**, making the log line hard to reliably query or aggregate at scale.

**2. Running production systems permanently at `DEBUG` or `TRACE`**, drowning genuinely important `WARN`/`ERROR` signals in high-volume, low-value detail.

**3. Forgetting to clear a `ThreadLocal` correlation ID (or similar per-thread state) before a pooled thread is reused**, silently leaking a stale value into an unrelated later request.

**4. Using an unbounded value (a user ID, an email address, a raw UUID) as a metric label**, creating unbounded cardinality that can overload a metrics backend's storage.

**5. Confusing what belongs in a log versus a metric.** High-cardinality detail belongs in a structured log field; a metric label should be drawn from a small, bounded set of possible values.

## Best practices

- Prefer structured, key-value (or JSON) log output over free-form sentences for anything that might need to be queried or aggregated later.
- Choose a log level based on the message's actual operational significance, and keep production thresholds high enough to avoid drowning important signals.
- Generate a correlation ID once per request and propagate it (via `ThreadLocal` or an explicit parameter) to every log line produced while handling that request, always clearing it in a `finally` block.
- Never use an unbounded-cardinality value as a metric label; log it as a structured field instead, where high cardinality is normal.
- Understand distributed tracing as the multi-service generalization of a single-process correlation ID, useful the moment a request crosses more than one service boundary.

## Summary

- Structured logging emits explicit, machine-parseable key-value fields instead of free-form sentences, making logs reliably queryable.
- Log levels express relative severity, and a configured threshold filters out every level below it, letting production systems suppress high-volume, low-value detail by default.
- A correlation ID (often stored per-thread via `ThreadLocal`) tags every log line produced while handling one logical request, letting related lines be grouped even under concurrent traffic — and must always be cleared before a pooled thread is reused.
- Metric labels create a separate time series per distinct value combination; an unbounded label (like a user ID) can create unbounded, ever-growing storage cost, which is why metric labels must be drawn from a small, bounded set.
- Distributed tracing generalizes correlation across service boundaries: a trace ID travels with a request across every service it touches, while individual spans record each unit of work's own timing within that larger trace.

## Practice

Warm-up:

1. Convert a plain-sentence log statement of your choosing into a structured, key-value log line, and write a short comment explaining what became easier to query.
2. Implement a simple leveled logger (like this lesson's `LogLevelFiltering`) and demonstrate changing its threshold at runtime to reveal previously suppressed messages.
3. Add a correlation ID to a small multi-method call chain, confirming every log line produced along that chain carries the same ID.

Core:

1. Simulate two concurrent "requests" using two separate threads, each with its own correlation ID set via `ThreadLocal`, and confirm their log lines never cross-contaminate each other's ID.
2. Reproduce this lesson's cardinality experiment with your own choice of a bounded label (a small enum-like set of values) and an unbounded one (something that grows with real usage), and report the resulting series counts.
3. Design a small structured logger that emits JSON-shaped output (a hand-built string is fine; no external library needed) for at least three different fields per log line.

Challenge:

1. Design a small "span" class recording a name, a start time, and a duration once closed (an `AutoCloseable` implementation is a natural fit here), and use nested spans to represent a request that makes two sequential "downstream calls," printing a simple textual representation of the resulting trace.
2. Research (and briefly document, in a comment) how a real distributed tracing system (such as OpenTelemetry) propagates a trace ID across an HTTP call to another service, and explain what header is typically used for that propagation.

## Check your understanding

1. What makes a structured log line more useful than an equivalent free-form sentence for later querying or aggregation?
2. What does a logging threshold do, and why did the first `DEBUG` call in this lesson's example produce no output at all?
3. Why is a correlation ID typically stored per-thread (via `ThreadLocal`) rather than as a global variable, and what must always happen before a pooled thread is reused?
4. Why can an unbounded-cardinality label overload a metrics backend, when the same information logged as a structured field would not cause the same problem?
5. What is the difference between a trace and a span in distributed tracing?
6. Why should metric labels be restricted to values drawn from a small, bounded set, while log fields have no such restriction?
