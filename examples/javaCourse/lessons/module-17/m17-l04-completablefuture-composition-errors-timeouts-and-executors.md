# CompletableFuture composition, errors, timeouts, and executors

## Compose eventual results
```java
var result = java.util.concurrent.CompletableFuture
    .supplyAsync(() -> 21)
    .thenApply(n -> n * 2)
    .thenApply(Object::toString);
System.out.println(result.join()); // 42
```
thenApply transforms a value; thenCompose flattens a stage returning another future; thenCombine combines independent results. Non-async continuations may execute on the completing thread. Async methods without an explicit executor generally use the shared common pool.

## Failure and lifetime
exceptionally maps a failure to a fallback; handle sees both result and failure; whenComplete observes completion but can itself fail. Do not turn every error into a success value that conceals outages. join wraps exceptional completion in CompletionException.

Timeout completion and cancellation do not necessarily stop underlying I/O. Propagate deadlines to the actual operation and release its resources. Avoid blocking inside stages that need the same small executor to make progress.

## Practice
Combine two independent calculations and implement a dependent third using thenCompose. Inject one failure and prove which stages run. Provide an explicit executor, close it after completion, and explain the difference between observing an error and recovering from it.
