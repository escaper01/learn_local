# Chapter 17 assessment and deliberate practice

This chapter built a full model of concurrency in Java: what actually goes wrong when threads share memory (races and visibility), the tools that fix each problem deliberately (`synchronized`, `volatile`, locks, atomics), the executor-and-future model that replaces raw thread management, the callback-based composition `CompletableFuture` adds on top of it, and finally virtual threads and the coordination primitives suited to blocking-I/O-heavy workloads. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Threads, shared memory, races, visibility, and happens-before

Every real Java program is effectively concurrent. A race condition happens when two threads access shared mutable state without coordination and the result depends on timing; `count++` is not atomic because it is really a read, a modify, and a write. Visibility is a separate problem from atomicity: without a proper happens-before relationship, one thread may never observe another thread's write at all, regardless of how "obviously" sequential the code looks. `start`, `join`, a monitor's release/acquire, and `volatile` writes/reads are examples of actions that establish happens-before edges; ordinary unsynchronized reads and writes, and `Thread.sleep`, are not.

### Lesson 2: synchronized, volatile, locks, conditions, and atomics

Start every concurrency decision from the invariant you need to protect, then pick the tool that protects it. `synchronized` provides mutual exclusion and visibility together through a monitor; every access path to protected state must use the *same* lock, or the protection is illusory. `volatile` guarantees visibility and ordering for a single variable but not compound atomicity (`volatile int count; count++;` is still a race). Atomic classes use compare-and-set to make single-variable updates atomic without blocking. `ReentrantLock` adds `tryLock`, timeouts, interruptible acquisition, and fairness that `synchronized` cannot offer. Deadlock forms when two threads acquire the same two locks in opposite order; consistent lock ordering prevents it.

### Lesson 3: Executors, Callable, Future, interruption, cancellation, and shutdown

Executors decouple tasks from threads; `Callable` returns a value and may throw, and submitting it returns a `Future`. A timed `get` only bounds how long the *caller* waits — it does not stop the task, which keeps running until it finishes or is cooperatively cancelled with `cancel(true)` and responds to interruption. Interruption is a request, not a command: blocking methods throw `InterruptedException` and clear the flag; CPU-bound loops must check the flag themselves; code that cannot propagate the exception must restore the flag with `Thread.currentThread().interrupt()`. Bounded queues and rejection policies provide back-pressure that an unbounded queue does not, and whoever creates an executor is responsible for shutting it down.

### Lesson 4: CompletableFuture composition, errors, timeouts, and executors

`CompletableFuture` lets you register continuations instead of blocking a thread to chain dependent work. `thenApply` transforms a value; `thenCompose` flattens a continuation that itself returns a future, exactly as `flatMap` does for streams. Failures propagate past every non-error-handling stage until `exceptionally` or `handle` catches them; `whenComplete` observes without changing the outcome. Non-`Async` continuations run on whichever thread completes the previous stage, so real work should be given an explicit, appropriately sized executor rather than relying on the shared common pool. `orTimeout`/`completeOnTimeout` bound the pipeline's wait, not the underlying task's actual lifetime.

### Lesson 5: Virtual threads, concurrent collections, semaphores, and latches

Virtual threads are cheap, JVM-managed threads that unmount from their carrier during blocking operations, making very large numbers of concurrent blocking-I/O tasks practical — but they do nothing for CPU-bound work, and they do not remove the need to bound access to a fixed-capacity downstream resource. `ConcurrentHashMap`, `CopyOnWriteArrayList`, and `BlockingQueue` each trade off differently between read/write frequency and locking strategy. `Semaphore` bounds concurrent access to a limited resource; `CountDownLatch` is a one-time wait-for-N-events gate; `CyclicBarrier` is a reusable rendezvous point. Blocking inside a `synchronized` block pins a virtual thread to its carrier, defeating the point of using one.

## Cheat sheet

### Diagnosing a shared-state bug

| Symptom | Likely cause | Fix |
|---|---|---|
| Lost updates under load (counter undercounts) | Atomicity: a compound operation is not indivisible | `synchronized`, an atomic class, or a lock around the whole compound operation |
| A worker never notices a flag another thread set | Visibility: no happens-before edge exists | `volatile`, a lock, or an atomic reference |
| The program hangs with no progress | Deadlock: inconsistent lock acquisition order | Acquire locks in one global, consistent order |
| Shutdown hangs or `cancel(true)` seems to do nothing | A task swallows `InterruptedException` or never checks the interrupted flag | Propagate or restore the flag; check it in CPU-bound loops |

### Concurrency tool selection

| Need | Tool |
|---|---|
| Protect a multi-field invariant with mutual exclusion and visibility | `synchronized` or `ReentrantLock` |
| A single flag or reference, visibility only | `volatile` |
| A single counter/accumulator updated from many threads | `AtomicInteger`/`AtomicLong`/`LongAdder` |
| Run tasks off the calling thread, get results back | `ExecutorService` + `Callable`/`Future` |
| Chain dependent async steps without blocking to wait | `CompletableFuture` |
| Many concurrent blocking-I/O tasks | Virtual threads (`newVirtualThreadPerTaskExecutor`) |
| Bound concurrent access to a limited resource | `Semaphore` |
| Wait once for N events, then proceed | `CountDownLatch` |
| Repeated rendezvous across phases | `CyclicBarrier` |

### Future outcomes

| Outcome | What the caller sees |
|---|---|
| Success | `get()`/`join()` returns the value |
| Task threw | `ExecutionException`/`CompletionException` wrapping the real cause |
| Cancelled | `CancellationException` |
| Caller's wait timed out | `TimeoutException`; the task itself is unaffected and keeps running |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does a compound operation (check-then-act, read-modify-write) run without a lock or atomic class protecting it end to end?
- Is a `volatile` field used where a compound update actually needs full mutual exclusion?
- Does any `catch (InterruptedException e)` block do nothing at all, neither propagating nor restoring the flag?
- Does code assume a timed `get` or `orTimeout` stopped the underlying task, without an explicit `cancel`?
- Is an executor ever shut down by a method that did not create it, or never shut down by the method that did?
- Does a virtual-thread-heavy code path block inside a `synchronized` block, risking carrier pinning?

## The judgment question

The judgment question describes a task that ignores interruption and blocks shutdown, and asks what contract is missing — the correct answer is **cooperative cancellation and bounded lifecycle management**, not a larger integer accumulator and not a volatile reference alone. This is the central theme running through Lessons 3 through 5: Java has no safe way to forcibly stop a thread, so every cancellation and shutdown mechanism (`cancel(true)`, `shutdownNow()`, `close()`) works by *requesting* cooperation through interruption. A task that never checks the interrupted flag in a long-running loop, or that swallows `InterruptedException` in an empty catch block, has no way to hear that request — no accumulator size or `volatile` field addresses that at all, because the problem is not a data race, it is a missing response to a cancellation signal.

## Approaching the implementation lab

The lab asks for `parallelSum(int[] values)`: submit one `Callable<Integer>` per value to an executor, collect every `Future`, and return their sum.

1. Write the precondition and boundary table first: an empty array (sum `0`), a single value, negative values mixed with positive ones, and a full-size input near the 1000-value limit.
2. Submit every task into a list of futures *before* calling `get` on any of them, exactly as this chapter's executor lesson demonstrated — calling `submit(...).get()` inside the same loop iteration would run everything sequentially instead of concurrently.
3. Own the executor's lifecycle: create it inside the method (try-with-resources fits `AutoCloseable` executors well), and never leave it running past the method's return.
4. On `InterruptedException` from a blocking `get`, restore the interrupt with `Thread.currentThread().interrupt()` and throw `IllegalStateException` with the original exception as its cause, exactly as the instructions specify; for any other task failure surfaced through `ExecutionException`, unwrap and rethrow (or wrap) its cause rather than the wrapper itself.
5. Keep the method itself free of shared mutable state between tasks: each `Callable` should depend only on the one value it was given, with the sum computed by the caller from the collected results.

## Approaching the debug lab

The debug lab's starter code interrupts the current thread, then swallows the resulting `InterruptedException` in an empty catch block, which silently erases the interruption request — exactly the "never correct" response this chapter's executor lesson named explicitly.

1. Run the program and confirm it currently prints `false` instead of the required `true`.
2. Recall Lesson 1's and Lesson 3's shared point: `Thread.sleep` throwing `InterruptedException` **clears** the interrupted flag as it throws, so an empty catch block leaves the flag permanently `false` with no trace the interruption ever happened.
3. Fix the catch block to restore the flag — `Thread.currentThread().interrupt();` — instead of doing nothing, while preserving the surrounding `try`/`catch` structure.
4. Confirm your fix now prints `true`, and be ready to explain why restoring the flag, rather than hard-coding the print statement, is what actually makes the interruption observable to code further up the call stack.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Write a counter incremented by ten threads with plain `count++`, run it under load, and observe lost updates; then fix it three different ways (`synchronized`, `AtomicInteger`, and a `ReentrantLock`) and confirm each produces the correct total.
2. Build two threads that acquire two shared locks in opposite order, reproduce a deadlock, then fix it with consistent lock ordering and confirm the program now always completes.
3. Write a method that submits a batch of tasks with an overall time budget, cancels the stragglers with `cancel(true)`, and logs from inside each task's interrupt handler to prove cancellation actually reached it.
4. Build a `CompletableFuture` pipeline with at least one `thenCompose` and one `exceptionally`, deliberately fail one stage, and trace exactly which stages ran and which were skipped.
5. Simulate a downstream service with a `Semaphore` of a small fixed size, hit it with a `newVirtualThreadPerTaskExecutor` running far more concurrent tasks than the semaphore's permit count, and confirm the observed concurrency never exceeds the semaphore's limit.

## Self-assessment

You are ready for Chapter 18 when you can do all of the following without notes:

- Explain the difference between an atomicity bug and a visibility bug, and name a fix appropriate to each.
- Name at least three actions that establish a happens-before relationship, and explain why `Thread.sleep` is not one of them.
- Explain why a timed `Future.get` or `CompletableFuture.orTimeout` does not stop the underlying task, and what would actually stop it.
- State the three correct responses to a caught `InterruptedException`, and explain why an empty catch block is never correct.
- Explain why virtual threads help blocking-I/O workloads but not CPU-bound work, and why downstream capacity still needs bounding regardless of thread count.
- Choose between `Semaphore`, `CountDownLatch`, and `CyclicBarrier` for a given coordination need, and justify the choice.
- Explain why blocking inside a `synchronized` block can defeat the benefit of running on a virtual thread.
