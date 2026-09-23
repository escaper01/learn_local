# Structured logging, levels, correlation, metrics, and traces

## Record events with useful context
```java
var logger = java.util.logging.Logger.getLogger("academy.orders");
logger.log(java.util.logging.Level.INFO,
    "Order completed: id={0}, items={1}", new Object[] {orderId, itemCount});
```
The standard logger needs no external library. SLF4J and implementations such as Logback require declared dependencies; select an abstraction and backend deliberately. Include stable event names and correlation identifiers, and retain throwable objects when logging failures.

## Logs, metrics, traces
Logs describe individual events. Metrics aggregate counts and distributions. Traces connect spans across a request path. Do not place user IDs or unbounded URLs into metric labels: cardinality can overwhelm storage. Never log credentials, tokens, or unnecessary personal data.

Log an exception once at the boundary that owns its response; lower layers should preserve context through causes rather than duplicate the same stack trace.

## Practice
Design events for task_created, task_rejected, and storage_unavailable. Define severity and safe fields. Trace a failed request from correlation ID to the cause. Add a duration metric using a monotonic time source and explain why wall-clock adjustments can invalidate elapsed-time calculations.
