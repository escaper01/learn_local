# CompletableFuture composition, errors, timeouts, and executors

`Future` from the previous lesson answers "has it finished, and what did it return", but it cannot answer "run this next, once that finishes" without blocking a thread on `get()` to find out. `CompletableFuture` solves that: it is a future you can attach continuations to, chain into pipelines, combine with other futures, and recover from failure — all without a thread sitting idle waiting for a result it could instead be notified about.

What you will learn:

- Why blocking on `get()` to chain work wastes a thread, and how callbacks avoid it
- `thenApply`, `thenAccept`, `thenRun`, and why choosing the right one matters
- `thenCompose` versus `thenApply` when a continuation itself returns a future
- Combining independent futures with `thenCombine` and `allOf`/`anyOf`
- How failures propagate through a chain, and how `exceptionally`, `handle`, and `whenComplete` differ
- Controlling which executor runs each stage, and why the default matters
- Adding a timeout to a `CompletableFuture` in Java 21

## From blocking to callbacks

A plain `Future` forces you to choose between blocking (`get()`, wasting a thread) or polling (`isDone()`, wasting CPU). `CompletableFuture<T>` instead lets you register what should happen *when* the result arrives, and the executor running the async work invokes that callback itself:

```java
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BasicComposition {

    public static void main(String[] args) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            CompletableFuture<Integer> priceInCents = CompletableFuture.supplyAsync(() -> {
                sleep(100);
                return 1999; // pretend this called a pricing service
            }, pool);

            CompletableFuture<String> receipt = priceInCents
                    .thenApply(cents -> cents / 100.0)                  // transform the value
                    .thenApply(dollars -> String.format("$%.2f", dollars));

            System.out.println(receipt.get());
        }
    }

    static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

```text
$19.99
```

`supplyAsync` starts the work on the given executor immediately and returns a `CompletableFuture` right away; `thenApply` registers a transformation that runs once the previous stage completes — on whichever thread completes it, unless a different executor is specified (more on that below). No thread blocks waiting between stages; the chain itself is the plan, executed as each piece becomes ready.

## Choosing the right continuation: apply, accept, run, compose

| Method | Continuation shape | Returns |
|---|---|---|
| `thenApply(Function<T,R>)` | Takes the value, returns a new value | `CompletableFuture<R>` |
| `thenAccept(Consumer<T>)` | Takes the value, returns nothing | `CompletableFuture<Void>` |
| `thenRun(Runnable)` | Takes nothing, returns nothing | `CompletableFuture<Void>` |
| `thenCompose(Function<T, CompletableFuture<R>>)` | Takes the value, returns *another future* | `CompletableFuture<R>` (flattened) |

The distinction between `thenApply` and `thenCompose` is exactly the one between `map` and `flatMap` on a stream, and it matters for the same reason: if the continuation itself returns a `CompletableFuture`, `thenApply` would produce a `CompletableFuture<CompletableFuture<R>>` — a future of a future, useless without manually unwrapping it. `thenCompose` flattens that automatically.

```java
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ComposeVersusApply {

    record Customer(int id, String name) {}
    record Order(int customerId, double total) {}

    static CompletableFuture<Customer> lookupCustomer(int id, ExecutorService pool) {
        return CompletableFuture.supplyAsync(() -> new Customer(id, "Ada"), pool);
    }

    static CompletableFuture<Order> latestOrder(Customer customer, ExecutorService pool) {
        return CompletableFuture.supplyAsync(() -> new Order(customer.id(), 42.50), pool);
    }

    public static void main(String[] args) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            // Wrong shape: nested future, unusable without unwrapping it yourself
            CompletableFuture<CompletableFuture<Order>> nested =
                    lookupCustomer(7, pool).thenApply(customer -> latestOrder(customer, pool));
            System.out.println("nested type needs get().get(): " + nested.get().get());

            // Correct shape: thenCompose flattens the nested future
            CompletableFuture<Order> flat =
                    lookupCustomer(7, pool).thenCompose(customer -> latestOrder(customer, pool));
            System.out.println("flat result: " + flat.get());
        }
    }
}
```

```text
nested type needs get().get(): Order[customerId=7, total=42.5]
flat result: Order[customerId=7, total=42.5]
```

Both print the same value here, but only the `thenCompose` version composes cleanly into a longer chain — nesting futures three levels deep with `thenApply` produces a type that is unusable without repeated, error-prone unwrapping.

## Combining independent futures

`thenApply`/`thenCompose` chain *dependent* steps, where each needs the previous result. When two futures are independent and you need both results together, use `thenCombine`; when you need every result from a whole batch, use `allOf`; when you only need whichever finishes first, use `anyOf`.

```java
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

public class CombiningFutures {

    public static void main(String[] args) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
            // Two independent calls, combined once both finish
            CompletableFuture<Double> price = CompletableFuture.supplyAsync(() -> 49.99, pool);
            CompletableFuture<Double> taxRate = CompletableFuture.supplyAsync(() -> 0.08, pool);
            CompletableFuture<Double> total = price.thenCombine(taxRate, (p, t) -> p * (1 + t));
            System.out.printf("total with tax: %.2f%n", total.get());

            // A batch of independent calls; allOf tells you WHEN they are all done,
            // but does not itself return their combined results.
            List<CompletableFuture<String>> lookups = List.of(
                    CompletableFuture.supplyAsync(() -> "warehouse-A: 12 units", pool),
                    CompletableFuture.supplyAsync(() -> "warehouse-B: 0 units", pool),
                    CompletableFuture.supplyAsync(() -> "warehouse-C: 5 units", pool)
            );
            CompletableFuture<Void> allDone = CompletableFuture.allOf(lookups.toArray(new CompletableFuture[0]));
            CompletableFuture<List<String>> combined = allDone.thenApply(v ->
                    lookups.stream().map(CompletableFuture::join).collect(Collectors.toList()));
            System.out.println("all warehouse results: " + combined.get());
        }
    }
}
```

```text
total with tax: 53.99
all warehouse results: [warehouse-A: 12 units, warehouse-B: 0 units, warehouse-C: 5 units]
```

`allOf` returns `CompletableFuture<Void>` deliberately: it only signals *completion*, not a combined value, because the futures in the array can have different result types. Collecting the actual values afterward with `join()` (an unchecked-exception cousin of `get()`, convenient inside a stream lambda) is the standard pattern, and it is safe here specifically because `allOf` already guarantees every future is complete before this line runs.

## Error handling: exceptionally, handle, and whenComplete

A failure in any stage of a chain propagates forward, skipping every `thenApply`/`thenCompose` in between, until something handles it:

| Method | Sees success? | Sees failure? | Can change the result? |
|---|---|---|---|
| `exceptionally(Function<Throwable,T>)` | No | Yes | Yes — supplies a fallback value |
| `handle(BiFunction<T,Throwable,R>)` | Yes | Yes | Yes — always runs, decides the outcome |
| `whenComplete(BiConsumer<T,Throwable>)` | Yes | Yes | No — for side effects like logging; rethrows the original outcome |

```java
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ErrorHandling {

    public static void main(String[] args) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {

            // exceptionally: supply a fallback only on failure
            CompletableFuture<Integer> withFallback = CompletableFuture
                    .supplyAsync(() -> { throw new IllegalStateException("pricing service down"); }, pool)
                    .exceptionally(ex -> {
                        System.out.println("recovered from: " + ex.getCause().getMessage());
                        return -1;
                    });
            System.out.println("fallback result: " + withFallback.get());

            // handle: runs on BOTH success and failure, decides the final outcome
            CompletableFuture<String> handled = CompletableFuture
                    .supplyAsync(() -> 100, pool)
                    .thenApply(n -> n / 0) // ArithmeticException, wrapped as the failure cause
                    .handle((value, ex) -> ex != null ? "handled failure: " + ex.getCause() : "value: " + value);
            System.out.println(handled.get());

            // whenComplete: observes but does not change the outcome; it still propagates
            CompletableFuture<Integer> observed = CompletableFuture
                    .supplyAsync(() -> 42, pool)
                    .whenComplete((value, ex) -> System.out.println("observed value=" + value + " ex=" + ex));
            System.out.println("observed still returns: " + observed.get());
        }
    }
}
```

```text
recovered from: pricing service down
handled failure: java.lang.ArithmeticException: / by zero
observed value=42 ex=null
observed still returns: 42
```

Note that the exception seen inside `exceptionally` and `handle` is always the cause wrapped by `CompletionException` (analogous to `ExecutionException` for plain futures) — the original exception is `ex.getCause()` when caught as `CompletionException`, but already unwrapped if you catch the specific type directly in a `get()` call's `ExecutionException`. Reading `getCause()` correctly, rather than logging the wrapper type, is what makes error messages actually useful.

## Which executor runs each stage

Every `...Async` method (`supplyAsync`, `thenApplyAsync`, `thenComposeAsync`, and so on) accepts an optional `Executor` as its last argument. Without one, `supplyAsync`/`runAsync` use the shared `ForkJoinPool.commonPool()`, and non-`Async` continuations (`thenApply`, not `thenApplyAsync`) run **on whichever thread completes the previous stage** — which could be the common pool, or the calling thread itself if the future was already complete when the continuation was attached.

```java
CompletableFuture.supplyAsync(() -> slowLookup())      // runs on commonPool()
        .thenApply(this::transform)                    // runs on whatever thread completed supplyAsync
        .thenApplyAsync(this::furtherWork, dbPool);     // explicitly runs on dbPool
```

Relying on the default common pool for real applications is a common source of surprising behavior: it is shared process-wide, sized to the number of CPU cores by default, and a blocking call placed in a `thenApply` continuation on that pool can starve unrelated async work elsewhere in the same JVM. Production code should pass an explicit, appropriately sized executor to every async stage that does real work, exactly as the previous lesson argued for explicit, bounded pools over ad hoc thread creation.

## Timeouts on a CompletableFuture

Java 9 added `orTimeout` and `completeOnTimeout` directly on `CompletableFuture`, avoiding the manual scheduled-task workaround earlier versions needed:

```java
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class TimeoutDemo {

    public static void main(String[] args) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            CompletableFuture<String> tooSlow = CompletableFuture.supplyAsync(() -> {
                try { Thread.sleep(2_000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                return "eventually";
            }, pool).orTimeout(200, TimeUnit.MILLISECONDS);

            try {
                tooSlow.get();
            } catch (java.util.concurrent.ExecutionException e) {
                System.out.println("failed with: " + e.getCause().getClass().getSimpleName());
            }

            CompletableFuture<String> withDefault = CompletableFuture.supplyAsync(() -> {
                try { Thread.sleep(2_000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                return "eventually";
            }, pool).completeOnTimeout("fallback value", 200, TimeUnit.MILLISECONDS);

            System.out.println("completeOnTimeout result: " + withDefault.get());
        }
    }
}
```

```text
failed with: TimeoutException
completeOnTimeout result: fallback value
```

Exactly as with a plain `Future.get(timeout, unit)`, `orTimeout` and `completeOnTimeout` bound how long the *pipeline* waits for a result — they do not cancel or interrupt the underlying task, which keeps running to completion (or forever) on its executor unless it is separately cancelled. A timeout on the future and cancellation of the task are still two different concerns, exactly as the previous lesson established for plain futures.

## What happens under the hood: from a stage completing to a continuation running

1. `supplyAsync` submits the supplier to the given executor (or the common pool) and immediately returns an incomplete `CompletableFuture`.
2. Calling `thenApply`/`thenCompose`/etc. registers a continuation on that future without blocking; if the future is already complete, the continuation runs immediately on the calling thread instead of being queued.
3. When the underlying task finishes, the executor's worker thread completes the future and then runs every registered continuation itself (for non-`Async` variants), one after another.
4. If a continuation itself returns another `CompletableFuture` (as in `thenCompose`), the outer future does not complete until that inner future also completes; its completion is what triggers the outer future's own downstream continuations.
5. A failure sets the future's outcome to a wrapped exception instead of a value; every subsequent non-error-handling stage (`thenApply`, `thenCompose`, `thenAccept`) is skipped entirely, and the first `exceptionally`/`handle` in the chain receives the wrapped cause.
6. `get()`/`join()` block the calling thread only at the point they are called, unwrapping the final value or rethrowing the (possibly wrapped) failure.

## Common mistakes

**Mistake 1: using `thenApply` where the continuation returns a future.**

```java
CompletableFuture<CompletableFuture<Order>> nested = customer.thenApply(c -> fetchOrder(c));
```

Fix: use `thenCompose` whenever the continuation itself returns a `CompletableFuture`.

**Mistake 2: relying on the default common pool for blocking or CPU-heavy work.** A slow database call in a plain `thenApply` continuation ties up a shared, process-wide pool that other unrelated async code also depends on. Fix: pass an explicit, appropriately sized executor to every stage that does real work.

**Mistake 3: assuming a timeout cancels the underlying task.** `orTimeout` only stops the *pipeline* from waiting; the original task keeps running. Fix: if the task must actually stop, cancel it explicitly and make sure it is interruption-aware, exactly as with plain futures.

**Mistake 4: logging the `CompletionException` wrapper instead of its cause.** The wrapper type is never the useful information. Fix: always read `ex.getCause()` inside `exceptionally`/`handle`.

**Mistake 5: forgetting that `whenComplete` does not change the outcome.** Using it to "handle" a failure leaves the original exception still propagating past it. Fix: use `handle` or `exceptionally` when the outcome itself needs to change.

## Best practices

- Prefer `thenCompose` over nested nested futures whenever a continuation itself returns a `CompletableFuture`.
- Pass an explicit executor to every async stage that does real work; do not depend on the shared common pool for anything beyond trivial, non-blocking transformations.
- Handle failure explicitly with `exceptionally`/`handle` at the point where a fallback or final decision makes sense, not by letting it propagate unexamined to a bare `get()`.
- Treat a `CompletableFuture` timeout the same as a plain `Future` timeout: it bounds waiting, not the task's actual lifetime.
- Read `getCause()`, never the wrapper exception type, when reporting a failed async chain.

## Summary

- `CompletableFuture` lets you attach continuations instead of blocking a thread to chain dependent work.
- `thenApply` transforms a value; `thenCompose` flattens a continuation that itself returns a future — exactly `map` versus `flatMap`.
- `thenCombine` merges two independent futures; `allOf` signals when a whole batch is done (without merging their values itself); `anyOf` resolves on the first to finish.
- Failures propagate past every non-error-handling stage until `exceptionally` or `handle` catches them; `whenComplete` observes without changing the outcome.
- Non-`Async` continuations run on whichever thread completes the previous stage; explicit executors should be passed for real work instead of relying on the shared common pool.
- `orTimeout`/`completeOnTimeout` bound how long the pipeline waits, not how long the underlying task actually runs.

## Practice

1. **Warm-up:** Rewrite a `thenApply` call whose function returns a `CompletableFuture<R>` to use `thenCompose` instead, and explain what type the original version actually produced.
2. **Warm-up:** For a chain of three `thenApply` stages where the first one throws, predict which stages run and which are skipped, then verify with a small program.
3. **Core:** Build a pipeline that fetches two independent values concurrently with `supplyAsync`, combines them with `thenCombine`, and adds a `completeOnTimeout` fallback for the combined result.
4. **Core:** Deliberately cause a failure partway through a chain, add both `exceptionally` and `handle` versions, and compare what each receives and returns.
5. **Challenge:** Build a batch of five independent `supplyAsync` calls on a bounded executor you create yourself (not the common pool), combine their results with `allOf` plus `join`, and add a case where one of the five fails, showing how that failure surfaces when you eventually call `join` on it.

## Check your understanding

1. Why does using `thenApply` on a continuation that returns a `CompletableFuture<R>` produce a nested, awkward type, and what does `thenCompose` do differently?
2. What is the practical difference between `allOf` and `thenCombine`, and why does `allOf` return `CompletableFuture<Void>` rather than a combined value?
3. Name one thing `handle` can do that `exceptionally` cannot.
4. Why does relying on the default common pool for blocking work risk affecting unrelated code elsewhere in the same JVM?
5. Does `orTimeout` stop the underlying asynchronous task from continuing to run? Explain.
6. Why should you read `getCause()` rather than logging a caught `CompletionException` directly?
