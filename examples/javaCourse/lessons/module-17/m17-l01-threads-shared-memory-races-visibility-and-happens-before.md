# Threads, shared memory, races, visibility, and happens-before

Almost every real Java program is concurrent, whether its author planned it or not. A web server handles many requests at once, a desktop app keeps its window responsive while it loads a file, a batch job uses every CPU core to finish faster, and a test framework runs suites in parallel. The moment two threads touch the same data, a whole new family of bugs appears: results that are wrong only once in a million runs, loops that never finish on one machine but work on another, and updates that silently vanish. These bugs do not show up reliably in tests, so you cannot debug your way out of them. You have to *reason* your way out, using the rules of the Java Memory Model.

This lesson builds that reasoning from the ground up. It is long on purpose: the vocabulary you learn here is used by every later concurrency lesson.

What you will learn:

- The difference between synchronous, asynchronous, concurrent, and parallel execution
- How processes and threads relate, and what a thread owns versus what it shares
- How to create threads (subclassing `Thread` versus passing a `Runnable`) and why `start` is not `run`
- How to manage threads with `start`, `join`, `sleep`, daemon status, names, and priorities
- What happens to an exception thrown inside a thread, and how uncaught exception handlers work
- The six thread states and how a thread moves between them
- What a race condition is, why `count++` is not atomic, and how thread confinement avoids races
- How `ThreadLocal` gives each thread its own copy of a value
- What *visibility* means and why one thread may never see another thread's write
- The happens-before relationship: the only rules that guarantee one thread sees another's writes

## Synchronous, asynchronous, concurrent, and parallel

These four words are often used loosely. Professionals use them precisely.

- **Synchronous**: the caller starts an operation and waits until it finishes before doing anything else. Calling a method normally is synchronous.
- **Asynchronous**: the caller starts an operation and continues immediately; the result arrives later (through a callback, a future, or a join).
- **Concurrent**: several tasks are *in progress* during the same period. Their steps may interleave on a single CPU core.
- **Parallel**: several tasks are *executing at the same instant* on different cores.

A kitchen analogy helps. A single cook who puts pasta on to boil and chops salad while waiting is working *concurrently* and *asynchronously*: two jobs are in progress, but only one pair of hands moves at a time. Two cooks each working on their own dish are working in *parallel*. Concurrency is about structure (dealing with many things); parallelism is about execution (doing many things at once). A concurrent program can run on one core; a parallel program needs several.

| Style | Who waits? | Needs multiple cores? | Typical Java tool |
|---|---|---|---|
| Synchronous | The caller blocks until done | No | A plain method call |
| Asynchronous | Nobody waits immediately; result collected later | No | `Thread`, `Future`, `CompletableFuture` |
| Concurrent | Tasks interleave over time | No | Threads, executors, virtual threads |
| Parallel | Tasks run simultaneously | Yes | Thread pools sized to cores, parallel streams |

The following complete program runs two simulated slow lookups first synchronously, then asynchronously on two threads.

```java
public class SyncAsyncParallel {

    static void slowLookup(String what) {
        try {
            Thread.sleep(300); // simulate waiting on a disk or network
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("  finished " + what + " on " + Thread.currentThread().getName());
    }

    public static void main(String[] args) throws InterruptedException {
        System.out.println("process id: " + ProcessHandle.current().pid());
        System.out.println("cpu cores visible to the JVM: "
                + Runtime.getRuntime().availableProcessors());

        // Synchronous: the caller waits for each step before starting the next
        long start = System.nanoTime();
        slowLookup("prices");
        slowLookup("stock");
        System.out.printf("synchronous took ~%d ms%n", (System.nanoTime() - start) / 1_000_000);

        // Asynchronous: start work elsewhere, keep going, collect the result later
        start = System.nanoTime();
        Thread prices = new Thread(() -> slowLookup("prices"), "worker-1");
        Thread stock = new Thread(() -> slowLookup("stock"), "worker-2");
        prices.start();
        stock.start();
        System.out.println("  main is free to do other work while lookups run");
        prices.join();
        stock.join();
        System.out.printf("overlapped took ~%d ms%n", (System.nanoTime() - start) / 1_000_000);
    }
}
```

A representative run (the process id, core count, timings, and the order of the two `finished` lines in the second half vary from run to run):

```text
process id: 1
cpu cores visible to the JVM: 16
  finished prices on main
  finished stock on main
synchronous took ~605 ms
  main is free to do other work while lookups run
  finished prices on worker-1
  finished stock on worker-2
overlapped took ~301 ms
```

Because the lookups mostly *wait*, overlapping them halves the elapsed time even without extra CPU work. That is the core value of concurrency for I/O-heavy programs.

## Processes and threads

A **process** is a running program with its own private memory, file handles, and security identity. The operating system isolates processes from each other: one process cannot read another's variables. Your JVM is one process.

A **thread** is a path of execution *inside* a process. Every thread in a JVM has its own:

- **call stack** (method frames, local variables, parameters)
- **program counter** (which instruction it is executing)
- **name, id, state, priority, and daemon flag**

But all threads in the same JVM **share the heap**: every object, every array, every static field. That sharing is what makes threads cheap to communicate with and dangerous to get wrong. A local variable of primitive type is always confined to one thread. An object reachable from two threads is shared, and you must decide how to protect it.

| Aspect | Process | Thread |
|---|---|---|
| Memory | Private address space | Shares the process heap |
| Creation cost | High (OS-level) | Lower (platform thread) to very low (virtual thread) |
| Communication | Pipes, sockets, files | Shared objects in memory |
| Failure isolation | A crash usually stays inside the process | An uncaught error ends only that thread, but corrupted shared state affects everyone |
| Java handle | `ProcessBuilder`, `ProcessHandle` | `Thread` |

## Threads are objects

In Java a thread is represented by an instance of `java.lang.Thread`. Creating the object does *not* create an operating-system thread; calling `start()` does. `Thread.currentThread()` returns the object representing whichever thread is executing that line, which is how code can ask "who am I?".

There are three common ways to give a thread its work:

1. Subclass `Thread` and override `run()`.
2. Implement `Runnable` and pass it to `new Thread(runnable)`.
3. Pass a lambda, which is just a compact `Runnable`.

```java
public class ThreeWaysToCreateThreads {

    public static void main(String[] args) throws InterruptedException {
        System.out.println("main runs on: " + Thread.currentThread().getName());

        // 1. Subclass Thread and override run()
        Thread a = new GreeterThread("subclass-worker");

        // 2. Pass a Runnable object to the Thread constructor
        Thread b = new Thread(new GreeterTask(), "runnable-worker");

        // 3. Pass a lambda (a Runnable written inline)
        Thread c = new Thread(
                () -> System.out.println("hello from " + Thread.currentThread().getName()),
                "lambda-worker");

        System.out.println("state before start: " + a.getState());
        a.start();
        b.start();
        c.start();

        a.join();
        b.join();
        c.join();
        System.out.println("state after join: " + a.getState());

        // Calling run() directly does NOT create a thread
        new GreeterThread("never-started").run();
        System.out.println("main done");
    }
}

class GreeterThread extends Thread {
    GreeterThread(String name) {
        super(name);
    }

    @Override
    public void run() {
        System.out.println("hello from " + Thread.currentThread().getName());
    }
}

class GreeterTask implements Runnable {
    @Override
    public void run() {
        System.out.println("hello from " + Thread.currentThread().getName());
    }
}
```

A representative run. The three `hello from ...worker` lines can appear in any order; the other lines are ordered by `join`:

```text
main runs on: main
state before start: NEW
hello from subclass-worker
hello from runnable-worker
hello from lambda-worker
state after join: TERMINATED
hello from main
main done
```

Notice the last greeting: `run()` called directly executed on `main`. It is an ordinary method call. Only `start()` asks the JVM to create a new thread that then calls `run()` for you. Calling `start()` twice on the same `Thread` throws `IllegalThreadStateException`: a thread object is single-use.

### Subclass Thread or implement Runnable?

Prefer `Runnable` (or a lambda). It separates *what to do* (the task) from *how it runs* (the thread). The same `Runnable` can later be handed to an executor or a virtual thread without change, and your class stays free to extend something else. Subclassing `Thread` is justified only when you are genuinely customising thread behaviour itself, which is rare.

| Approach | Reusable with executors? | Uses up single inheritance? | Recommended? |
|---|---|---|---|
| `extends Thread` | No, it *is* a thread | Yes | Rarely |
| `implements Runnable` | Yes | No | Yes |
| Lambda `() -> ...` | Yes | No | Yes, for short tasks |
| `Callable<V>` (next lessons) | Yes, returns a value | No | Yes, when you need a result |

## Managing threads: start, join, sleep, daemon, priority, name

- `start()` moves a thread from `NEW` to runnable and returns immediately.
- `join()` makes the *caller* wait until the target thread terminates. `join(millis)` waits at most that long. Both throw `InterruptedException`.
- `Thread.sleep(millis)` pauses the *current* thread. It does not release locks it holds, and it guarantees nothing about other threads.
- `setDaemon(true)` marks a background thread. The JVM exits when only daemon threads remain, abandoning them mid-work. It must be called before `start()`.
- `setPriority(n)` accepts 1 (`MIN_PRIORITY`) to 10 (`MAX_PRIORITY`), default 5. It is only a *hint*; operating systems may ignore it. Never use priority for correctness.
- `setName` and the `new Thread(runnable, name)` constructor make stack traces and logs readable. Always name threads you create.

### Exceptions in threads

An exception thrown inside `run()` cannot propagate to the thread that called `start()`: the starting thread has long since moved on, and they have separate stacks. If nothing catches it, the thread terminates and its **uncaught exception handler** runs. The default handler prints a stack trace to standard error, which is easy to miss in production. You can install a handler per thread (`setUncaughtExceptionHandler`) or globally (`Thread.setDefaultUncaughtExceptionHandler`).

```java
public class ThreadFailures {

    public static void main(String[] args) throws InterruptedException {
        // 1. A thread's exception does not reach the thread that started it
        Thread failing = new Thread(() -> {
            throw new IllegalStateException("boom in worker");
        }, "failing-worker");
        failing.setUncaughtExceptionHandler((thread, error) ->
                System.out.println("handler caught '" + error.getMessage()
                        + "' from " + thread.getName()));
        try {
            failing.start();
            failing.join();
        } catch (RuntimeException e) {
            System.out.println("never printed: main cannot catch it here");
        }
        System.out.println("main is still alive, worker state: " + failing.getState());

        // 2. Daemon threads do not keep the JVM alive
        Thread heartbeat = new Thread(() -> {
            while (true) {
                try {
                    Thread.sleep(1_000);
                } catch (InterruptedException e) {
                    return;
                }
            }
        }, "heartbeat");
        heartbeat.setDaemon(true); // must be called before start()
        heartbeat.start();
        System.out.println("heartbeat is daemon: " + heartbeat.isDaemon());

        // 3. Priority is only a hint to the scheduler
        Thread low = new Thread(() -> { }, "low");
        low.setPriority(Thread.MIN_PRIORITY);
        System.out.println("priorities: min=" + Thread.MIN_PRIORITY
                + " norm=" + Thread.NORM_PRIORITY + " max=" + Thread.MAX_PRIORITY
                + " low=" + low.getPriority());

        System.out.println("main returns; the daemon heartbeat will not block exit");
    }
}
```

```text
handler caught 'boom in worker' from failing-worker
main is still alive, worker state: TERMINATED
heartbeat is daemon: true
priorities: min=1 norm=5 max=10 low=1
main returns; the daemon heartbeat will not block exit
```

The heartbeat loops forever, yet the program ends: once `main` returns, only a daemon thread remains. Without `setDaemon(true)` the JVM would run until you killed it. Use daemons only for work that is safe to abandon at any instant; never for writing files or committing data.

> **Note:** Executors (lesson 3) capture task exceptions inside a `Future` instead of passing them to the uncaught exception handler. A failed task you never call `get()` on can therefore fail silently.

## The six thread states

`Thread.getState()` returns one of the constants of `Thread.State`:

| State | Meaning | How a thread gets there |
|---|---|---|
| `NEW` | Created, not yet started | `new Thread(...)` |
| `RUNNABLE` | Running or ready to run (the OS decides which) | `start()` |
| `BLOCKED` | Waiting to enter a `synchronized` block held by another thread | Contended monitor |
| `WAITING` | Waiting indefinitely for another thread's action | `join()`, `Object.wait()`, `LockSupport.park()` |
| `TIMED_WAITING` | Waiting with a time limit | `sleep(ms)`, `join(ms)`, `wait(ms)` |
| `TERMINATED` | `run()` has returned or thrown | End of `run()` |

A thread blocked on socket I/O is reported as `RUNNABLE`: from the JVM's perspective it is executing a native call. The following program walks threads through most states:

```java
public class ThreadStatesTour {

    private static final Object LOCK = new Object();

    public static void main(String[] args) throws InterruptedException {
        Thread sleeper = new Thread(() -> {
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "sleeper");
        System.out.println("sleeper after new:     " + sleeper.getState());

        sleeper.start();
        Thread.sleep(100); // give it time to reach sleep (demo only, not synchronization)
        System.out.println("sleeper while sleeping: " + sleeper.getState());

        Thread blocked;
        synchronized (LOCK) {
            blocked = new Thread(() -> {
                synchronized (LOCK) {
                    System.out.println("blocked thread finally got the lock");
                }
            }, "blocked");
            blocked.start();
            Thread.sleep(100);
            System.out.println("blocked while main holds lock: " + blocked.getState());
        }

        Thread waiter = new Thread(() -> {
            try {
                sleeper.join(); // waits with no timeout
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "waiter");
        waiter.start();
        Thread.sleep(100);
        System.out.println("waiter joining sleeper: " + waiter.getState());

        sleeper.join();
        waiter.join();
        blocked.join();
        System.out.println("sleeper at the end:    " + sleeper.getState());
    }
}
```

A representative run. The `sleep(100)` calls make these states *likely* on an idle machine, but they are not guaranteed; on a heavily loaded machine a thread might not have reached its expected state yet:

```text
sleeper after new:     NEW
sleeper while sleeping: TIMED_WAITING
blocked while main holds lock: BLOCKED
blocked thread finally got the lock
waiter joining sleeper: WAITING
sleeper at the end:    TERMINATED
```

That caveat is important and leads into the rest of this lesson: `sleep` makes some orderings *probable*, never *certain*.

## Shared data and race conditions

A **race condition** is a bug whose outcome depends on the unpredictable timing of threads. A **data race** is the specific case where two threads access the same variable, at least one writes, and no synchronization orders the accesses.

The classic example is `count++`. It looks like one operation, but the JVM executes three steps: read the current value, add one, write the result back. Here is one possible interleaving of two threads:

1. Thread A reads `count` and gets 0.
2. Thread B reads `count` and gets 0.
3. Thread A computes 1 and writes 1.
4. Thread B computes 1 and writes 1.

Two increments happened, but the counter says 1. One update is **lost**.

```java
public class LostUpdates {

    private static int sharedCounter = 0; // shared, unsynchronized: a data race

    public static void main(String[] args) throws InterruptedException {
        final int perThread = 1_000_000;

        // Version 1: two threads race on the same field
        Runnable racer = () -> {
            for (int i = 0; i < perThread; i++) {
                sharedCounter++; // read, add, write: three steps
            }
        };
        Thread t1 = new Thread(racer);
        Thread t2 = new Thread(racer);
        t1.start();
        t2.start();
        t1.join();
        t2.join();
        System.out.println("expected: " + (2 * perThread));
        System.out.println("racy result: " + sharedCounter);

        // Version 2: thread confinement. Each worker owns its own total,
        // and main combines them only after join().
        long[] partial = new long[2];
        Thread w1 = new Thread(() -> {
            long local = 0;
            for (int i = 0; i < perThread; i++) local++;
            partial[0] = local;
        });
        Thread w2 = new Thread(() -> {
            long local = 0;
            for (int i = 0; i < perThread; i++) local++;
            partial[1] = local;
        });
        w1.start();
        w2.start();
        w1.join(); // join creates a happens-before edge: w1's writes are visible now
        w2.join();
        System.out.println("confined result: " + (partial[0] + partial[1]));
    }
}
```

A representative run. The racy number changes every run and is *occasionally* correct, which is exactly what makes races dangerous:

```text
expected: 2000000
racy result: 1902507
confined result: 2000000
```

Version 2 shows the simplest fix of all: **do not share**. Each worker writes only to its own slot, and the main thread reads the slots only after `join`. The next lesson covers fixes for data that genuinely must be shared (`synchronized`, atomics, locks).

Other common race shapes:

- **Check-then-act**: `if (!map.containsKey(k)) map.put(k, v);` Another thread can insert between the check and the put.
- **Read-modify-write**: `balance = balance - amount;` Same lost-update problem as `count++`.
- **Unsafe publication**: one thread builds an object and stores it in a shared field; another thread sees the reference but not the fully initialised fields.

## ThreadLocal: one value per thread

Sometimes you want a variable that looks global but holds a different value for each thread: a request id for logging, a per-thread buffer, or a non-thread-safe formatter such as the old `SimpleDateFormat`. `ThreadLocal<T>` provides exactly that. Each thread that calls `get()` sees only the value that *it* set.

```java
import java.util.ArrayList;
import java.util.List;

public class RequestContextDemo {

    // Each thread sees its own independent value
    private static final ThreadLocal<String> REQUEST_ID = ThreadLocal.withInitial(() -> "none");

    static void log(String message) {
        System.out.println("[" + REQUEST_ID.get() + "] " + message);
    }

    static void handle(String requestId) {
        REQUEST_ID.set(requestId);
        try {
            log("validating");
            log("saving");
        } finally {
            REQUEST_ID.remove(); // essential when threads are reused by a pool
        }
    }

    public static void main(String[] args) throws InterruptedException {
        List<Thread> threads = new ArrayList<>();
        for (String id : List.of("req-1", "req-2", "req-3")) {
            Thread t = new Thread(() -> handle(id));
            threads.add(t);
            t.start();
        }
        for (Thread t : threads) {
            t.join();
        }
        log("main never set a value");
    }
}
```

A representative run. Requests may interleave in any order, but each line always carries its own thread's id:

```text
[req-2] validating
[req-2] saving
[req-1] validating
[req-1] saving
[req-3] validating
[req-3] saving
[none] main never set a value
```

Two cautions. First, in a thread pool the same thread serves many tasks, so a value left behind leaks into the next task: always `remove()` in `finally`. Second, with millions of virtual threads, a large object per thread multiplies memory use. `ThreadLocal` is a tool for per-thread *context*, not a replacement for passing parameters. (Java 21 also previews `ScopedValue`, a safer immutable alternative; it is a preview feature in 21 and requires `--enable-preview`.)

## Visibility: when one thread cannot see another's write

Races are not only about lost updates. There is a subtler problem: a write made by one thread may **never become visible** to another thread at all.

Modern hardware and compilers make programs fast by caching values in CPU registers and caches, and by reordering instructions when the reordering is invisible *to a single thread*. The JIT compiler is allowed to transform this fragment:

```java
// Fragment: a broken stop flag (do not copy)
private static boolean stopRequested = false; // not volatile

// worker thread
while (!stopRequested) {
    doWork();
}

// main thread, later
stopRequested = true;
```

into, effectively, `if (!stopRequested) while (true) doWork();`, because nothing in the loop tells the compiler that another thread might change the field. The worker can then spin forever even though `main` set the flag. On some machines and JVM versions it stops quickly, on others never; both behaviours are allowed. That is what makes visibility bugs so hard to find by testing.

Reordering causes a second problem. If one thread writes `data = 42; ready = true;`, another thread may observe `ready == true` and still read the old `data`, because without synchronization there is no guarantee that the two writes become visible in program order.

### Under the hood: why caches and reordering are allowed

Each thread effectively works on its own view of memory. The Java Memory Model (JLS chapter 17) does not describe caches directly. Instead it defines which writes a read is *allowed* to see. Unless a happens-before relationship connects a write to a read, the read may see an older value, the newer value, or (for reordered code) a surprising mix. The JVM is not buggy when this happens; your program is.

## Happens-before: the rules that guarantee visibility

**Happens-before** is a relationship between two actions. If action A happens-before action B, then everything A's thread did up to A is visible to B's thread at B, and appears ordered before B. It is the only thing the language promises about cross-thread visibility. The key rules:

1. **Program order**: within a single thread, each action happens-before every later action in that thread.
2. **Monitor lock**: unlocking a monitor (leaving a `synchronized` block) happens-before every later lock of that *same* monitor.
3. **Volatile variable**: a write to a `volatile` field happens-before every later read of that same field.
4. **Thread start**: a call to `thread.start()` happens-before every action in the started thread.
5. **Thread termination**: every action in a thread happens-before another thread successfully returns from `join()` on it (or sees `isAlive()` return false).
6. **Interruption**: calling `t.interrupt()` happens-before `t` detects the interrupt.
7. **Transitivity**: if A happens-before B and B happens-before C, then A happens-before C.
8. **Library guarantees**: `java.util.concurrent` documents its own edges, for example placing an item in a `BlockingQueue` happens-before taking it, and submitting a task to an executor happens-before the task runs.

Now trace the confined version of `LostUpdates` against these rules:

1. `w1.start()` happens-before everything `w1` does (rule 4).
2. Inside `w1`, `partial[0] = local` is its last action before termination.
3. Every action in `w1`, including that write, happens-before `main` returns from `w1.join()` (rule 5).
4. `main` reads `partial[0]` after `join` in program order (rule 1).
5. By transitivity (rule 7), the write happens-before the read, so `main` is guaranteed to see the final value.

Just as important is what is **not** on the list. `Thread.sleep`, `Thread.yield`, busy-waiting on a plain field, `System.out.println`, and "it worked 10,000 times in testing" create no happens-before edge. The JLS states explicitly that `sleep` and `yield` have no synchronization semantics: the compiler need not reload cached values after a sleep. Sleeping longer only changes the odds of a bad interleaving; it never turns a data race into a correct program. When you want one thread to see another's write, point to the rule that connects them.

| Mechanism | Creates happens-before? | Notes |
|---|---|---|
| `start()` / `join()` | Yes | Start publishes to the new thread; join publishes back |
| `synchronized` on the same object | Yes | Unlock-then-lock of the same monitor |
| `volatile` write then read | Yes | Same field; no atomicity for compound updates |
| `java.util.concurrent` hand-offs | Yes | Queues, futures, latches, executors, atomics |
| `final` fields after construction | Yes, for safely constructed objects | Do not leak `this` from the constructor |
| `Thread.sleep` / `yield` | No | Timing only |
| Plain field writes and reads | No | Data race if concurrent and at least one writes |

## Common mistakes

### Calling run instead of start

```java
// Wrong
Thread worker = new Thread(task);
worker.run();   // runs task on the current thread; no concurrency
```

Nothing fails; the program simply is not concurrent. Fix: call `worker.start()`.

### Sleeping instead of joining

```java
// Wrong
worker.start();
Thread.sleep(1000);                 // "surely it has finished by now"
System.out.println(result[0]);      // may be stale or unfinished
```

On a slow CI machine the worker may not have finished, and even if it has, there is no happens-before edge, so the read may see a stale value. Fix: `worker.join()` before reading, or use a proper hand-off such as a `Future` or `CountDownLatch`.

### Swallowing failures in threads

```java
// Wrong
new Thread(() -> importFile(path)).start();  // exception prints to stderr and vanishes
```

The caller believes the import succeeded. Fix: name the thread, install an uncaught exception handler that logs, or (better) submit the work to an executor and inspect the `Future`.

### Treating a daemon as a normal worker

```java
// Wrong
Thread writer = new Thread(() -> saveReport());
writer.setDaemon(true);
writer.start();   // JVM may exit while the file is half-written
```

Fix: use non-daemon threads for work that must complete, and `join` them before exiting.

### Forgetting to remove a ThreadLocal value

Leaving a user id in a `ThreadLocal` on a pooled thread means the *next* request on that thread sees the previous user's identity. Fix: `set` then `try { ... } finally { remove(); }`.

## Best practices

- Prefer **not sharing**: confine data to one thread and combine results after `join` or through a `Future`.
- If data must be shared, make it **immutable** (records, `final` fields, `List.copyOf`) whenever possible.
- For mutable shared data, identify the **happens-before rule** that protects every access, and write it down in a comment.
- Always **name threads**, and make sure failures are logged by a handler or surfaced through a future.
- Implement `Runnable` or `Callable` rather than extending `Thread`.
- Never use `sleep`, priorities, or "it passed locally" as a correctness argument.
- In production code, create threads through executors (lesson 3) rather than `new Thread` scattered through the code base.

## Summary

- Synchronous code waits; asynchronous code continues and collects results later; concurrency means overlapping progress; parallelism means simultaneous execution on several cores.
- A process owns memory; its threads each have a private stack but share the heap.
- A `Thread` object is created in `NEW`; only `start()` creates a real thread. `run()` is just a method.
- `join` waits for termination; `sleep` pauses only the current thread; daemons do not keep the JVM alive; priority is a hint.
- An uncaught exception ends only its own thread and goes to the uncaught exception handler, not to the starter.
- Threads move through `NEW`, `RUNNABLE`, `BLOCKED`, `WAITING`, `TIMED_WAITING`, and `TERMINATED`.
- `count++` is read-modify-write and loses updates under contention.
- `ThreadLocal` gives each thread its own value; always remove it when threads are reused.
- Visibility is guaranteed only through happens-before edges: start, join, monitor unlock/lock, volatile write/read, interruption, and documented concurrency utilities. Timing tricks create no edge.

## Practice

### Warm-up

1. Write a program that starts four named threads, each printing its name and `Thread.currentThread().threadId()` (Java 19 and later; the older `getId()` is deprecated), then joins them all. Run it several times and record whether the order changes.
2. Change one thread to call `run()` instead of `start()` and explain the new output.

### Core

1. Reproduce the lost-update race with four threads and 500,000 increments each. Record five results. Then rewrite it with thread confinement so each worker returns a partial sum, and justify the correctness of the final read by naming the happens-before rules involved.
2. Install a default uncaught exception handler that prints the thread name and exception type. Start three threads, one of which throws. Show that the other two finish normally.
3. Use `ThreadLocal` to give each of three threads its own `StringBuilder`, append five items, and print the result from each thread. Add `remove()` and explain why it matters in a pool.

### Challenge

1. Write the broken stop-flag loop with a plain `boolean` and run it with a busy loop body (no printing, no sleeping). Record whether it terminates on your machine. Then list the happens-before rules you could use to repair it, without implementing the repair yet; the next lesson covers the tools.
2. Draw a timeline of two threads for the `data = 42; ready = true;` example and mark which reads are allowed to see which values with and without a happens-before edge.

## Check your understanding

1. What is the difference between concurrency and parallelism, and can a single-core machine run a concurrent program?
2. Which memory areas does a thread own privately, and which does it share with other threads in the same JVM?
3. Why does calling `run()` directly produce no new thread, and what happens if you call `start()` twice?
4. Where does an exception thrown inside a thread's `run()` go if nothing catches it?
5. List four actions that create a happens-before edge between threads, and name two common actions that do not.
6. Why can a race-condition test pass thousands of times and still be wrong?
