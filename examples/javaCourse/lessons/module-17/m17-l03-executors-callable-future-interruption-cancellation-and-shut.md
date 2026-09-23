# Executors, Callable, Future, interruption, cancellation, and shutdown

Creating threads by hand with `new Thread(...)` works for learning, but production code almost never does it. Threads are relatively expensive to create, every one needs a name and an error policy, and a program that starts a thread per request will happily start ten thousand of them under load and fall over. Professional Java code hands *tasks* to an **executor** that owns the threads, and gets back a **future** that represents the eventual result. Just as important is the other end of the lifecycle: how you *stop* work. A task that cannot be cancelled, or an executor that is never shut down, is how applications end up hanging on exit, leaking threads, or burning CPU on results nobody wants anymore.

What you will learn:

- Why separating tasks from threads matters, and what the `Executor` and `ExecutorService` interfaces provide
- The standard executor factories and what each one is for
- `Runnable` versus `Callable`, and `execute` versus `submit` versus `invokeAll`
- How `Future` reports results, failures (`ExecutionException`), timeouts, and cancellation
- How Java's cooperative interruption works, and the correct ways to handle `InterruptedException`
- The difference between a timed wait on a future and stopping the task itself
- How to bound pools and queues, and what rejection policies do
- How to shut an executor down deliberately, including Java 21's `close()`
- How to schedule delayed and periodic work with `Timer` and `ScheduledExecutorService`

## Separate the task from the thread

A **task** is a unit of work: "resize this image", "load this customer". A **thread** is a worker that runs tasks. An **executor** is the manager that assigns tasks to workers. The analogy is a restaurant kitchen: customers (your code) hand orders (tasks) to the pass, and a fixed team of cooks (threads) picks them up. You do not hire a new cook for every order.

The interfaces in `java.util.concurrent`:

- `Executor`: one method, `execute(Runnable)`.
- `ExecutorService`: adds `submit`, `invokeAll`, `invokeAny`, and lifecycle methods (`shutdown`, `shutdownNow`, `awaitTermination`, `isShutdown`, `isTerminated`, and in Java 19 and later `close()`).
- `ScheduledExecutorService`: adds delayed and periodic scheduling.

| Factory in `Executors` | Threads | Queue | Good for |
|---|---|---|---|
| `newFixedThreadPool(n)` | Exactly `n` platform threads | Unbounded `LinkedBlockingQueue` | CPU-bound work sized to cores |
| `newCachedThreadPool()` | Grows without limit, idle threads die after 60 s | Hand-off (no queue) | Many short tasks; dangerous under load |
| `newSingleThreadExecutor()` | One thread | Unbounded | Strictly sequential background work |
| `newScheduledThreadPool(n)` | `n` threads | Delay queue | Delayed and periodic tasks |
| `newVirtualThreadPerTaskExecutor()` | One new virtual thread per task (Java 21) | None | Many blocking I/O tasks (lesson 5) |
| `newWorkStealingPool()` | A `ForkJoinPool` sized to cores | Per-worker deques | Recursive, divide-and-conquer work |

## Runnable, Callable, and Future

`Runnable.run()` returns nothing and cannot throw checked exceptions. `Callable<V>.call()` returns a `V` and may throw any `Exception`. Submitting either one to an `ExecutorService` returns a `Future`:

- `get()` waits until the task is done, then returns its value or throws.
- `get(timeout, unit)` waits at most that long, then throws `TimeoutException`.
- `isDone()`, `isCancelled()`, and (Java 19+) `state()`, `resultNow()`, `exceptionNow()` inspect it without waiting.
- `cancel(mayInterruptIfRunning)` attempts to cancel it.

Submitting a task happens-before the task runs, and the task's completion happens-before a successful `get()` returns. That is why you can safely read a result produced on another thread through a future without any extra locking.

```java
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class ExecutorBasics {

    public static void main(String[] args) throws InterruptedException, ExecutionException {
        // Java 21: ExecutorService is AutoCloseable; close() waits for submitted tasks
        try (ExecutorService pool = Executors.newFixedThreadPool(3)) {

            // Runnable: no result
            pool.execute(() -> System.out.println("runnable on " + Thread.currentThread().getName()));

            // Callable: returns a value and may throw checked exceptions
            List<Future<Integer>> futures = new ArrayList<>();
            for (int n = 1; n <= 5; n++) {
                int input = n;
                Callable<Integer> square = () -> {
                    Thread.sleep(50); // pretend this is slow
                    return input * input;
                };
                futures.add(pool.submit(square)); // submit everything first
            }

            int total = 0;
            for (Future<Integer> f : futures) {
                total += f.get(); // then collect; get() blocks until that result is ready
            }
            System.out.println("sum of squares = " + total);

            // invokeAll submits a batch and waits for all of them
            List<Callable<String>> batch = List.of(() -> "alpha", () -> "beta", () -> "gamma");
            for (Future<String> f : pool.invokeAll(batch)) {
                System.out.println("invokeAll result: " + f.get());
            }
        } // pool.close(): no new tasks, waits for running ones, then returns
        System.out.println("pool closed");
    }
}
```

A representative run (the worker thread name for the runnable may differ):

```text
runnable on pool-1-thread-1
sum of squares = 55
invokeAll result: alpha
invokeAll result: beta
invokeAll result: gamma
pool closed
```

Two design points deserve attention. First, the program **submits all tasks before calling `get` on any of them**. If you wrote `pool.submit(task).get()` inside the loop, each task would finish before the next was submitted and you would have written a slow sequential loop with extra steps. Second, the results are combined by the *caller* from the futures; the tasks share no mutable state at all. That is the cleanest concurrency design available: tasks compute, futures hand off, the owner combines.

`execute` versus `submit` also matters for failures: with `execute`, an exception from a `Runnable` goes to the worker thread's uncaught exception handler; with `submit`, it is captured in the `Future` and only seen when someone calls `get`. A submitted task whose future is dropped fails silently.

## Every way a future can end

A future ends in exactly one of three states: completed with a value, completed with a failure, or cancelled. The caller sees these as:

| Outcome | `get()` behaviour | `state()` |
|---|---|---|
| Task returned a value | Returns the value | `SUCCESS` |
| Task threw an exception | Throws `ExecutionException` whose `getCause()` is the original exception | `FAILED` |
| Task was cancelled | Throws `CancellationException` | `CANCELLED` |
| Caller waited too long with `get(timeout)` | Throws `TimeoutException`; the future is **unchanged** | still `RUNNING` |
| Caller's own thread was interrupted while waiting | Throws `InterruptedException` | unchanged |

The fourth row is the one beginners get wrong. A timed `get` bounds how long **the caller waits**. It does not touch the task. The task keeps running on its worker thread, holding its thread, memory, and any connection it opened, until it finishes by itself or someone cancels it *and* the task cooperates. The executor is not shut down either. If you want the work to stop, you must say so with `cancel(true)`, and the task must respond to interruption.

```java
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class FutureOutcomes {

    public static void main(String[] args) throws InterruptedException {
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {

            // 1. A failing task: the exception is stored in the Future
            Future<Integer> failing = pool.submit(() -> {
                if (true) throw new IllegalArgumentException("bad input 42");
                return 0;
            });
            try {
                failing.get();
            } catch (ExecutionException e) {
                System.out.println("wrapper: " + e.getClass().getSimpleName());
                System.out.println("cause:   " + e.getCause());
            }

            // 2. A slow task and a timed get: the WAIT ends, the TASK keeps running
            Future<String> slow = pool.submit(() -> {
                long start = System.nanoTime();
                try {
                    Thread.sleep(2_000);
                    return "slow result";
                } catch (InterruptedException e) {
                    long ms = (System.nanoTime() - start) / 1_000_000;
                    System.out.println("slow task interrupted after ~" + ms + " ms, cleaning up");
                    throw e;
                }
            });
            try {
                slow.get(200, TimeUnit.MILLISECONDS);
            } catch (TimeoutException e) {
                System.out.println("get timed out; task done? " + slow.isDone());
                Thread.sleep(300);
                System.out.println("300 ms later, still running? " + !slow.isDone());
                // 3. Ask the task to stop: cancel(true) interrupts the worker thread
                boolean cancelled = slow.cancel(true);
                System.out.println("cancel(true) returned " + cancelled);
            } catch (ExecutionException e) {
                System.out.println("unexpected failure " + e.getCause());
            }

            try {
                slow.get();
            } catch (CancellationException e) {
                System.out.println("get after cancel throws CancellationException");
            } catch (ExecutionException e) {
                System.out.println("unexpected failure " + e.getCause());
            }
            System.out.println("state: " + slow.state()); // Future.state() is new in Java 19
        }
    }
}
```

A representative run. The `interrupted after` line comes from the worker thread and may appear anywhere after the cancel:

```text
wrapper: ExecutionException
cause:   java.lang.IllegalArgumentException: bad input 42
get timed out; task done? false
300 ms later, still running? true
cancel(true) returned true
get after cancel throws CancellationException
state: CANCELLED
slow task interrupted after ~501 ms, cleaning up
```

Trace what happened to the slow task:

1. At 0 ms it starts sleeping on a worker thread.
2. At 200 ms the caller's timed `get` gives up. The task is still sleeping.
3. At 500 ms it is *still* running, proving the timeout did nothing to it.
4. `cancel(true)` marks the future cancelled and interrupts the worker.
5. `Thread.sleep` responds to the interrupt by throwing `InterruptedException`, so the task runs its cleanup and ends.

Had the task been a tight loop that never checked for interruption, step 5 would never happen: the future would say `CANCELLED`, yet the thread would keep computing until the loop ended.

## Interruption: Java's cooperative cancellation

Java has no safe way to forcibly kill a thread (`Thread.stop` is deprecated for removal because it could leave locks and objects half-updated). Instead, every thread carries an **interrupted flag**, and cancellation is a *request*:

- `thread.interrupt()` sets the target's flag. If the target is blocked in `sleep`, `wait`, `join`, `BlockingQueue.take`, `Future.get`, `lockInterruptibly`, and similar methods, that method wakes up and throws `InterruptedException`, **clearing the flag** as it does so.
- `Thread.currentThread().isInterrupted()` reads the flag without changing it.
- The static `Thread.interrupted()` reads **and clears** the current thread's flag.

Code that runs a long computation without blocking must check the flag itself at sensible points. Code that blocks gets the check for free, but must then decide what to do with the exception.

```java
public class InterruptionDemo {

    public static void main(String[] args) throws InterruptedException {
        // 1. A blocking call reacts to interruption by throwing InterruptedException
        Thread sleeper = new Thread(() -> {
            try {
                Thread.sleep(10_000);
                System.out.println("sleeper woke normally");
            } catch (InterruptedException e) {
                // Throwing InterruptedException CLEARS the interrupted flag
                System.out.println("sleeper interrupted; flag now "
                        + Thread.currentThread().isInterrupted());
            }
        }, "sleeper");
        sleeper.start();
        sleeper.interrupt();
        sleeper.join();

        // 2. CPU-bound code must check the flag itself
        Thread cruncher = new Thread(() -> {
            long primes = 0;
            for (long n = 2; ; n++) {
                if (Thread.currentThread().isInterrupted()) {
                    System.out.println("cruncher noticed interruption and stopped cleanly");
                    return;
                }
                if (isPrime(n)) primes++;
            }
        }, "cruncher");
        cruncher.start();
        Thread.sleep(100);
        cruncher.interrupt();
        cruncher.join();

        // 3. A helper that cannot rethrow must restore the flag for its caller
        Thread.currentThread().interrupt();
        swallowing();
        System.out.println("after swallowing helper, main interrupted? "
                + Thread.currentThread().isInterrupted());
        Thread.currentThread().interrupt();
        restoring();
        System.out.println("after restoring helper, main interrupted? "
                + Thread.interrupted()); // interrupted() reads AND clears the flag
    }

    static void swallowing() {
        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {
            // flag was cleared when the exception was thrown; now it is lost
        }
    }

    static void restoring() {
        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); // re-assert for code further up the stack
        }
    }

    static boolean isPrime(long n) {
        for (long d = 2; d * d <= n; d++) if (n % d == 0) return false;
        return true;
    }
}
```

```text
sleeper interrupted; flag now false
cruncher noticed interruption and stopped cleanly
after swallowing helper, main interrupted? false
after restoring helper, main interrupted? true
```

Note that a thread interrupted *before* it calls `sleep` gets the exception immediately: the flag is checked on entry. That is why part 3 works even though the flag was set first.

### The three correct responses to InterruptedException

1. **Propagate it**: declare `throws InterruptedException` and let the caller decide. This is the best default for library code.
2. **Restore and return**: if your method signature cannot throw it (for example inside `Runnable.run`), call `Thread.currentThread().interrupt()` and exit or wrap it in an unchecked exception, so that code further up the stack can still see the request.
3. **Finish the cancellation yourself**: only the code that *owns* the thread (for example the loop at the top of a worker) may decide the interruption has been fully handled and end.

What is never correct is an empty `catch` block. Swallowing the exception erases the only signal that someone wants this thread to stop, so executor shutdown, `cancel(true)`, and application exit can all hang waiting for a thread that no longer knows it was asked to finish.

## Bounded pools, queues, and rejection

`newFixedThreadPool(4)` bounds the *threads* but its queue is unbounded. If tasks arrive faster than four threads can finish them, the queue grows until memory runs out, and latency grows with it. For services, build a `ThreadPoolExecutor` with an explicit bounded queue and a **rejection policy** that decides what happens when both threads and queue are full:

| Policy | Behaviour when saturated |
|---|---|
| `AbortPolicy` (default) | Throws `RejectedExecutionException` to the submitter |
| `CallerRunsPolicy` | The submitting thread runs the task itself, which naturally slows submission |
| `DiscardPolicy` | Silently drops the new task (rarely acceptable) |
| `DiscardOldestPolicy` | Drops the oldest queued task and retries (rarely acceptable) |

```java
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class BoundedPoolDemo {

    public static void main(String[] args) throws InterruptedException {
        AtomicInteger threadNumber = new AtomicInteger();
        ThreadPoolExecutor pool = new ThreadPoolExecutor(
                2, 2,                                  // core and max threads
                0, TimeUnit.SECONDS,                   // keep-alive for extra threads
                new ArrayBlockingQueue<>(3),           // at most 3 waiting tasks
                r -> new Thread(r, "report-" + threadNumber.incrementAndGet()),
                new ThreadPoolExecutor.AbortPolicy()); // reject when full

        int accepted = 0;
        for (int i = 1; i <= 8; i++) {
            int id = i;
            try {
                pool.execute(() -> {
                    try {
                        Thread.sleep(200);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
                accepted++;
            } catch (RejectedExecutionException e) {
                System.out.println("task " + id + " rejected: pool and queue are full");
            }
        }
        System.out.println("accepted " + accepted + " tasks, queued now: " + pool.getQueue().size());

        // Graceful shutdown pattern
        pool.shutdown(); // stop accepting; already-submitted tasks still run
        if (!pool.awaitTermination(5, TimeUnit.SECONDS)) {
            pool.shutdownNow(); // interrupt stragglers
            if (!pool.awaitTermination(5, TimeUnit.SECONDS)) {
                System.out.println("pool did not terminate");
            }
        }
        System.out.println("terminated: " + pool.isTerminated()
                + ", completed tasks: " + pool.getCompletedTaskCount());
    }
}
```

```text
task 6 rejected: pool and queue are full
task 7 rejected: pool and queue are full
task 8 rejected: pool and queue are full
accepted 5 tasks, queued now: 3
terminated: true, completed tasks: 5
```

Two tasks run, three wait, and the rest are refused immediately instead of piling up. The thread factory also gives every worker a meaningful name, which will make thread dumps readable.

## Shutting down deliberately

An executor's threads are non-daemon by default, so a pool you forget to shut down can keep the JVM alive forever. The lifecycle methods:

- `shutdown()`: stop accepting new tasks; let submitted ones finish. Returns immediately.
- `awaitTermination(timeout, unit)`: wait for termination; returns `false` on timeout.
- `shutdownNow()`: stop accepting, remove queued tasks (returning them as a list), and **interrupt** running ones. Tasks that ignore interruption keep running.
- `close()` (Java 19+, so available in Java 21): `shutdown()` then wait until terminated; if the waiting thread is interrupted, it calls `shutdownNow()`. It lets you write `try (var pool = ...) { ... }`.

Everything comes back to cooperation: `shutdownNow`, `close`, and `cancel(true)` all *ask* through interruption. A task that swallows the interrupt or never checks it can delay shutdown indefinitely.

**Ownership rule**: whoever creates an executor shuts it down. A helper method that receives an `ExecutorService` as a parameter must not shut it down, because the caller may still be using it. A method that creates its own executor must shut it down before returning, normally with try-with-resources.

## Timers: Timer versus ScheduledExecutorService

Two APIs run code later or repeatedly:

- `java.util.Timer` (legacy, since Java 1.3) runs all its `TimerTask`s on **one** background thread. A slow task delays every other task, and a task that throws an unchecked exception kills the timer thread, silently cancelling all remaining tasks. It uses the wall clock, so changing the system time can affect it.
- `ScheduledExecutorService` uses a pool, works with `Callable` and futures, and isolates failures: a failing periodic task stops only itself.

```java
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class SchedulingDemo {

    public static void main(String[] args) throws Exception {
        long start = System.nanoTime();

        // Legacy: java.util.Timer runs every task on ONE background thread
        Timer timer = new Timer("legacy-timer", true);
        timer.schedule(new TimerTask() {
            @Override
            public void run() {
                System.out.printf("Timer task at ~%d ms%n", elapsed(start));
            }
        }, 100);
        Thread.sleep(200);
        timer.cancel();

        // Modern: ScheduledExecutorService
        try (ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1)) {
            ScheduledFuture<String> once = scheduler.schedule(() -> "delayed value", 100, TimeUnit.MILLISECONDS);
            System.out.println("one-shot returned: " + once.get());

            AtomicInteger ticks = new AtomicInteger();
            ScheduledFuture<?> heartbeat = scheduler.scheduleAtFixedRate(() ->
                    System.out.printf("tick %d at ~%d ms%n", ticks.incrementAndGet(), elapsed(start)),
                    0, 100, TimeUnit.MILLISECONDS);

            // A periodic task whose run throws is silently cancelled; guard the body
            scheduler.scheduleWithFixedDelay(() -> {
                try {
                    throw new IllegalStateException("flaky job");
                } catch (RuntimeException e) {
                    System.out.println("caught inside periodic job: " + e.getMessage());
                }
            }, 150, 1_000, TimeUnit.MILLISECONDS);

            Thread.sleep(350);
            heartbeat.cancel(false); // stop one periodic task explicitly
        } // close() calls shutdown(), which by default cancels remaining periodic tasks
        System.out.println("scheduler closed");
    }

    static long elapsed(long start) {
        return (System.nanoTime() - start) / 1_000_000;
    }
}
```

A representative run (timings vary by a few milliseconds and the number of ticks can differ by one):

```text
Timer task at ~100 ms
one-shot returned: delayed value
tick 1 at ~305 ms
tick 2 at ~405 ms
caught inside periodic job: flaky job
tick 3 at ~505 ms
tick 4 at ~605 ms
scheduler closed
```

`scheduleAtFixedRate` aims for start times spaced by the period (a late run is followed by catch-up runs, never concurrent overlap); `scheduleWithFixedDelay` waits the delay *after* each run ends. If a periodic task throws, its future completes exceptionally and later runs are suppressed without any log line, which is why production periodic jobs catch and log inside their body.

| Need | Use |
|---|---|
| New code, delayed or periodic work | `ScheduledExecutorService` |
| Maintaining old code that already uses `Timer` | Keep it, but catch exceptions in every `TimerTask` |
| Precise calendar schedules (cron-like, time zones) | A scheduling library or framework, not either of these |

## Common mistakes

### Submit and wait inside the loop

```java
// Wrong: sequential in disguise
for (Callable<Integer> task : tasks) {
    total += pool.submit(task).get();
}
```

Fix: submit all tasks into a list of futures, then collect in a second loop (or use `invokeAll`).

### Assuming a timed get stops the task

```java
// Wrong
try {
    return future.get(1, TimeUnit.SECONDS);
} catch (TimeoutException e) {
    return fallback;   // the task is still running and consuming resources
}
```

Fix: call `future.cancel(true)` in the timeout branch, and make sure the task responds to interruption.

### Swallowing InterruptedException

```java
// Wrong
try { queue.take(); } catch (InterruptedException e) { }
```

The interruption request is lost and shutdown may hang. Fix: propagate it, or restore the flag with `Thread.currentThread().interrupt()` and stop.

### Ignoring the cause of ExecutionException

```java
// Wrong
catch (ExecutionException e) { log.error("task failed"); }
```

Fix: inspect or rethrow `e.getCause()`; the wrapper itself carries no business meaning.

### Never shutting down

A `static final ExecutorService` created with `newFixedThreadPool` and never closed keeps the JVM running after `main` returns. Fix: own the lifecycle explicitly, with try-with-resources or `shutdown` plus `awaitTermination`.

## Best practices

- Use executors, not raw threads, and give pool threads meaningful names through a `ThreadFactory`.
- Bound both threads and queues for services, and choose a rejection policy deliberately.
- Keep tasks free of shared mutable state; return results through futures and combine them in one place.
- Always handle the four outcomes: value, failure cause, cancellation, and interruption of the waiting thread.
- On timeout, decide explicitly whether to cancel; a timeout alone is only a limit on waiting.
- Make long tasks interruption-aware; never write an empty catch for `InterruptedException`.
- The creator of an executor shuts it down; helpers must not shut down executors they were given.
- Prefer `ScheduledExecutorService` over `Timer`, and catch and log inside periodic tasks.

## Summary

- Executors decouple tasks from threads and manage worker lifecycles.
- `Callable` returns values and may throw; `Future.get` delivers the value, an `ExecutionException` wrapping the cause, or a `CancellationException`.
- `get(timeout)` only bounds the caller's wait; the task continues until it completes or cooperatively responds to cancellation.
- Interruption is a request; blocking methods respond by throwing and clearing the flag, compute loops must check the flag, and code that cannot propagate must restore it.
- Fixed pools have unbounded queues by default; bounded queues plus rejection policies provide back-pressure.
- `shutdown`, `shutdownNow`, `awaitTermination`, and Java 21's `close()` end the executor lifecycle; all depend on tasks cooperating.
- `ScheduledExecutorService` replaces `Timer` for delayed and periodic work.

## Practice

### Warm-up

1. Submit three `Callable<String>` tasks to a fixed pool of two threads, print each result and the thread name that produced it, and close the pool with try-with-resources.
2. Submit a task that throws `IOException` and print the class of the exception you catch and of its cause.

### Core

1. Write a method that runs a list of tasks with an overall time budget: collect results that arrive in time, cancel the rest with `cancel(true)`, and print how many were cancelled. Verify that cancelled tasks actually stop by logging from their interrupt handler.
2. Write a CPU-bound task (for example counting primes up to a large limit) that checks the interrupted flag every 10,000 iterations. Show that `shutdownNow()` stops it quickly, then remove the check and show that it no longer does.
3. Build a `ThreadPoolExecutor` with two threads, a queue of five, and `CallerRunsPolicy`. Submit 20 tasks and print which thread ran each. Explain why the submitting thread appears.

### Challenge

1. Write a periodic health check with `scheduleAtFixedRate` that occasionally throws. First observe that it silently stops; then make it robust and log each failure.
2. Design (in prose and code) a service class that accepts an `ExecutorService` in its constructor. Document who owns the executor, and write a test that proves the service never shuts it down.

## Check your understanding

1. What are the differences between `execute` and `submit` when a task throws an exception?
2. After a timed `get` throws `TimeoutException`, what is the state of the task, the future, and the executor?
3. Why does `Thread.sleep` clear the interrupted flag when it throws, and what must a `catch` block do as a result?
4. What does `shutdownNow()` actually do to a running task, and when can it fail to stop it?
5. Why can `newFixedThreadPool` still run out of memory, and how does a bounded queue with a rejection policy help?
6. Give two reasons to prefer `ScheduledExecutorService` over `java.util.Timer`.
