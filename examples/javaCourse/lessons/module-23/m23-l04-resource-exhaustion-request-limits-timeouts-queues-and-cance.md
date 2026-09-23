# Resource exhaustion, request limits, timeouts, queues, and cancellation

## Bound every scarce resource
A request can consume CPU, memory, disk, connections, threads, queue slots, and downstream capacity. Validate sizes before allocation and enforce limits during streaming when declared lengths cannot be trusted.

```java
static byte[] readSmall(java.io.InputStream input, int maximum)
        throws java.io.IOException {
    if (maximum < 0 || maximum > 1_000_000) throw new IllegalArgumentException();
    byte[] bytes = input.readNBytes(maximum + 1);
    if (bytes.length > maximum) throw new java.io.IOException("too large");
    return bytes;
}
```
The upper bound prevents maximum+1 overflow and constrains allocation. The caller owns input closure and read deadlines.

## Beyond body size
Bound decompressed size, nesting depth, regex complexity, concurrency, queued work, and output. Rate limits and admission control should apply before expensive work where practical. Cancellation must release resources.

## Practice
Test exactly-at-limit and one-byte-over inputs, slow input, compressed expansion, and abandoned clients. Define a consistent rejection response. Explain why an unbounded queue merely converts overload into memory pressure and latency rather than solving it.
