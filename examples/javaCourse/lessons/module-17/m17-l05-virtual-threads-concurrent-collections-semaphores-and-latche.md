# Virtual threads, concurrent collections, semaphores, and latches

Everything in this chapter so far has treated platform threads — thin wrappers over an OS thread — as scarce, which is why executors bound pool sizes and queues so carefully. Java 21 introduces **virtual threads**, which are cheap enough to create millions of, and which change the calculus for one specific, common workload: code that spends most of its time blocked waiting on I/O. This closing lesson covers virtual threads, the concurrent collections that let multiple threads share data safely without a single global lock, and two coordination primitives — semaphores and latches — that solve problems `synchronized` and `Future` do not.

What you will learn:

- What makes a virtual thread different from a platform thread, and why that only helps *blocking* workloads
- Why virtual threads do not remove the need to bound work elsewhere in the system
- `ConcurrentHashMap`, `CopyOnWriteArrayList`, and `BlockingQueue`, and when each fits
- `Semaphore` for bounding concurrent access to a limited resource
- `CountDownLatch` and `CyclicBarrier` for one-time and repeating coordination points
- Why pinning a virtual thread (via `synchronized`) can defeat its benefit

## What a virtual thread actually is

A **platform thread** is a thin wrapper around an operating system thread: creating one reserves a large stack (typically around 1MB) and an OS-level scheduling entity, which is why platform threads are numbered in the thousands at most on ordinary hardware. A **virtual thread** (JEP 444, finalized in Java 21) is a lightweight thread managed entirely by the JVM. Many virtual threads share a small pool of platform **carrier threads**; when a virtual thread blocks on typical blocking I/O, the JVM unmounts it from its carrier, freeing that carrier to run a different virtual thread, and remounts it (possibly on a different carrier) once the blocking operation completes.

```java
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public class VirtualThreadBasics {

    public static void main(String[] args) throws InterruptedException {
        AtomicInteger completed = new AtomicInteger();
        // One new virtual thread per submitted task; no pool sizing decision to make
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 10_000; i++) {
                int id = i;
                executor.submit(() -> {
                    try {
                        Thread.sleep(50); // simulates a blocking network call
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    completed.incrementAndGet();
                });
            }
        } // close() waits for all submitted tasks
        System.out.println("completed: " + completed.get());
    }
}
```

```text
completed: 10000
```

Ten thousand `Thread.sleep` calls running "concurrently" would be unthinkable with ten thousand platform threads on typical hardware — the memory for the stacks alone would be prohibitive, well before considering OS scheduling overhead. With virtual threads, each blocked `sleep` unmounts its virtual thread from its carrier, so a small number of carrier threads (by default, matching the number of CPU cores) services all ten thousand of them as they each briefly need a carrier to resume on.

## What virtual threads do not fix

Virtual threads make **cheap, blocking-friendly threads** abundant. They do nothing at all for CPU-bound work: a virtual thread running a tight computational loop still occupies its carrier thread exactly as a platform thread would, because there is no I/O block for the JVM to unmount it during. Virtual threads are a solution to "I have many blocking I/O tasks and not enough platform threads to dedicate one to each," not to "my code is slow."

More importantly, cheap threads do not make a downstream resource cheap. If ten thousand virtual threads each try to open a connection to a database whose connection pool is capped at twenty, nineteen thousand of them still queue for a connection — the bottleneck simply moved from "not enough threads to make the calls" to "the database's actual, fixed capacity," which was always the real limit. Bounding downstream calls — connection pools, rate limiters, semaphores — remains exactly as necessary with virtual threads as it was with platform threads; what changes is that the thread itself is no longer the artificially scarce resource standing in front of that real limit.

```java
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;

public class BoundingDownstreamCalls {

    // Even with unlimited virtual threads, the downstream service can only take 5 concurrent calls.
    static final Semaphore downstreamCapacity = new Semaphore(5);

    static void callDownstreamService(int id) throws InterruptedException {
        downstreamCapacity.acquire();
        try {
            Thread.sleep(100); // pretend this is a call to a service with real, fixed capacity
        } finally {
            downstreamCapacity.release();
        }
    }

    public static void main(String[] args) throws InterruptedException {
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 100; i++) {
                int id = i;
                executor.submit(() -> {
                    try {
                        callDownstreamService(id);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
            }
        }
        System.out.println("all 100 calls completed, never more than 5 concurrent");
    }
}
```

The semaphore, not the thread count, is what protects the downstream service — this pattern is unchanged from platform threads, and remains necessary precisely because virtual threads removed the thread-count bottleneck, not the downstream one.

## Concurrent collections

Wrapping every access to a plain `HashMap` or `ArrayList` in `synchronized` works but serializes every reader behind every writer, even readers that could safely run concurrently. The `java.util.concurrent` collections trade that blanket lock for finer-grained or lock-free strategies suited to specific access patterns:

| Collection | Strategy | Best fit |
|---|---|---|
| `ConcurrentHashMap` | Fine-grained internal locking / lock-free reads | Frequent reads and writes from many threads |
| `CopyOnWriteArrayList` | Copies the whole array on every write | Many reads, rare writes (e.g., a listener list) |
| `BlockingQueue` (`ArrayBlockingQueue`, `LinkedBlockingQueue`) | Blocks the caller when empty (on take) or full (on put) | Producer-consumer handoff |
| `ConcurrentLinkedQueue` | Lock-free, non-blocking | High-throughput queue where blocking is unwanted |

```java
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public class ConcurrentCollectionsDemo {

    public static void main(String[] args) throws InterruptedException {
        var wordCounts = new ConcurrentHashMap<String, AtomicInteger>();
        List<String> words = List.of("build", "test", "build", "deploy", "test", "build");

        try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
            for (String word : words) {
                pool.submit(() ->
                        wordCounts.computeIfAbsent(word, w -> new AtomicInteger()).incrementAndGet());
            }
        }
        System.out.println("build=" + wordCounts.get("build") + ", test=" + wordCounts.get("test"));

        // CopyOnWriteArrayList: safe to iterate from one thread while another mutates it
        CopyOnWriteArrayList<String> listeners = new CopyOnWriteArrayList<>(List.of("audit", "metrics"));
        for (String listener : listeners) {
            if (listener.equals("audit")) {
                listeners.add("late-registered"); // safe: iteration sees a snapshot, no ConcurrentModificationException
            }
            System.out.println("notified: " + listener);
        }
        System.out.println("final listeners: " + listeners);
    }
}
```

```text
build=3, test=2
notified: audit
notified: metrics
final listeners: [audit, metrics, late-registered]
```

`computeIfAbsent` on `ConcurrentHashMap` performs the check-then-act atomically, which a plain `HashMap` plus manual locking would need explicit synchronization around to get right (recall the atomicity-versus-visibility distinction from the second lesson). `CopyOnWriteArrayList`'s iterator reflects the list's state *at the moment iteration began*, which is exactly why it never throws `ConcurrentModificationException` even when another thread appends during iteration — at the cost of copying the entire backing array on every mutation, which is only cheap when writes are rare.

## BlockingQueue: producer-consumer without hand-rolled waiting

A `BlockingQueue` blocks a producer when the queue is full and a consumer when it is empty, which is exactly the coordination a producer-consumer pipeline needs, without either side manually calling `wait`/`notify`:

```java
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;

public class ProducerConsumerDemo {

    public static void main(String[] args) throws InterruptedException {
        BlockingQueue<Integer> queue = new ArrayBlockingQueue<>(3);

        Thread producer = new Thread(() -> {
            for (int i = 1; i <= 5; i++) {
                try {
                    queue.put(i); // blocks if the queue is already full
                    System.out.println("produced " + i);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }, "producer");

        Thread consumer = new Thread(() -> {
            for (int i = 1; i <= 5; i++) {
                try {
                    int value = queue.take(); // blocks if the queue is empty
                    System.out.println("consumed " + value);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }, "consumer");

        producer.start();
        consumer.start();
        producer.join();
        consumer.join();
    }
}
```

The queue's fixed capacity (3) is itself back-pressure: a producer racing far ahead of a slow consumer blocks on `put` instead of growing an unbounded buffer in memory, exactly the bounded-queue discipline the previous lesson applied to executor task queues.

## Semaphore: bounding concurrent access to a resource

A `Semaphore` holds a fixed number of permits. `acquire()` blocks until a permit is available and takes one; `release()` returns one. Unlike a lock, a semaphore is not tied to "one owner" — it bounds *how many* threads may proceed concurrently, which is exactly the shape of "at most N concurrent calls to this resource":

```java
import java.util.concurrent.Semaphore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public class SemaphoreDemo {

    public static void main(String[] args) throws InterruptedException {
        Semaphore connectionLimit = new Semaphore(2); // at most 2 concurrent "connections"
        AtomicInteger concurrentNow = new AtomicInteger();
        AtomicInteger maxObserved = new AtomicInteger();

        try (ExecutorService pool = Executors.newFixedThreadPool(6)) {
            for (int i = 0; i < 6; i++) {
                int id = i;
                pool.submit(() -> {
                    try {
                        connectionLimit.acquire();
                        int now = concurrentNow.incrementAndGet();
                        maxObserved.updateAndGet(max -> Math.max(max, now));
                        Thread.sleep(100);
                        concurrentNow.decrementAndGet();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        connectionLimit.release();
                    }
                });
            }
        }
        System.out.println("max concurrent connections observed: " + maxObserved.get());
    }
}
```

```text
max concurrent connections observed: 2
```

`release()` in a `finally` block is essential for exactly the same reason a lock's `unlock()` belongs in `finally`: a permit acquired but never released under an exceptional path permanently shrinks the semaphore's effective capacity.

## CountDownLatch: waiting for a fixed number of events, once

A `CountDownLatch` starts with a count and lets any number of threads call `await()`, which blocks until the count reaches zero via calls to `countDown()`. It is single-use: once it reaches zero, it stays open forever.

```java
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CountDownLatchDemo {

    public static void main(String[] args) throws InterruptedException {
        int workerCount = 3;
        CountDownLatch startSignal = new CountDownLatch(1);   // one event: "go"
        CountDownLatch doneSignal = new CountDownLatch(workerCount); // three events: each worker finishing

        try (ExecutorService pool = Executors.newFixedThreadPool(workerCount)) {
            for (int i = 0; i < workerCount; i++) {
                int id = i;
                pool.submit(() -> {
                    try {
                        startSignal.await();          // every worker waits for the same "go"
                        System.out.println("worker " + id + " started");
                        Thread.sleep(50);
                        System.out.println("worker " + id + " finished");
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        doneSignal.countDown();
                    }
                });
            }
            System.out.println("releasing all workers at once");
            startSignal.countDown();  // fires once; every waiting worker proceeds together
            doneSignal.await();       // main waits until all three have finished
            System.out.println("all workers done");
        }
    }
}
```

The two latches serve different directions of coordination: `startSignal` synchronizes workers to begin together, and `doneSignal` lets the main thread know when every worker has finished — neither is reusable, which is fine here since each is needed exactly once.

## CyclicBarrier: a reusable rendezvous point

Where `CountDownLatch` fires once, `CyclicBarrier` lets a fixed number of threads repeatedly wait for each other at a point, then resets automatically for the next round — useful for work done in synchronized phases:

```java
import java.util.concurrent.BrokenBarrierException;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CyclicBarrierDemo {

    public static void main(String[] args) {
        int parties = 3;
        CyclicBarrier phaseBarrier = new CyclicBarrier(parties,
                () -> System.out.println("--- all workers reached the barrier; starting next phase ---"));

        try (ExecutorService pool = Executors.newFixedThreadPool(parties)) {
            for (int id = 0; id < parties; id++) {
                int workerId = id;
                pool.submit(() -> {
                    try {
                        for (int phase = 1; phase <= 2; phase++) {
                            System.out.println("worker " + workerId + " working on phase " + phase);
                            Thread.sleep(20L * (workerId + 1));
                            phaseBarrier.await(); // waits until all 3 workers reach this point
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } catch (BrokenBarrierException e) {
                        System.out.println("barrier broken: another party failed or was interrupted");
                    }
                });
            }
        }
    }
}
```

The barrier's action (printed here between phases) runs exactly once per round, on one of the arriving threads, after the last party arrives and before any of them is released — a natural place to aggregate or checkpoint each phase's results before the next phase begins.

## Pinning: when a virtual thread cannot unmount

A virtual thread can only unmount from its carrier at specific points, and older-style blocking `synchronized` blocks are one case where it currently cannot: a virtual thread that blocks *inside* a `synchronized` block or method stays **pinned** to its carrier for the block's duration, behaving like a platform thread for that stretch instead of freeing the carrier for other virtual threads.

```java
public class PinningExample {
    private static final Object lock = new Object();

    static void blockingWorkInsideSynchronized() {
        synchronized (lock) {
            try {
                Thread.sleep(1000); // pins the carrier thread for a full second
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
```

If many virtual threads regularly pin on the same code path, the small pool of carrier threads can be exhausted exactly as if platform threads were being used directly, defeating the reason virtual threads were introduced. The practical fix is to replace `synchronized` blocks that guard *blocking* operations with `java.util.concurrent.locks.ReentrantLock`, which virtual threads can unmount across cleanly; `synchronized` around genuinely short, non-blocking critical sections is unaffected and remains fine.

## What happens under the hood: from a blocked virtual thread to a freed carrier

1. A virtual thread executing on a carrier platform thread reaches a blocking operation the JVM recognizes (socket I/O, `Thread.sleep`, most `java.util.concurrent` blocking calls).
2. Instead of blocking the carrier itself, the JVM saves the virtual thread's continuation state and **unmounts** it from the carrier.
3. The now-free carrier thread is returned to the small scheduler pool and can immediately run a different virtual thread that is ready to make progress.
4. When the original blocking operation completes (data arrives, the sleep interval elapses), the virtual thread becomes runnable again and is **mounted** onto some available carrier — not necessarily the same one — to continue exactly where it left off.
5. If the virtual thread instead blocks inside a `synchronized` block, this unmount step is skipped, and the carrier stays occupied (pinned) for the duration.

## Common mistakes

**Mistake 1: assuming virtual threads remove the need to bound downstream calls.** Cheap threads still queue behind a fixed-capacity database pool or external service. Fix: keep semaphores, connection pools, and rate limiters exactly as before; virtual threads only remove the artificial thread-count bottleneck in front of them.

**Mistake 2: using virtual threads for CPU-bound work expecting a speedup.** A tight computational loop occupies its carrier exactly like a platform thread would, since there is no I/O block to unmount during. Fix: use a bounded platform-thread pool (or a work-stealing pool) sized to CPU cores for CPU-bound work; reserve virtual threads for blocking-I/O-heavy workloads.

**Mistake 3: leaving blocking calls inside `synchronized` blocks on virtual-thread-heavy code paths.** This pins the carrier, silently reintroducing the exact scarcity virtual threads were meant to remove. Fix: replace with `ReentrantLock` where the guarded section can block.

**Mistake 4: forgetting `release()` in a `finally` around a `Semaphore.acquire()`.** An exception between acquire and release permanently shrinks the semaphore's effective capacity. Fix: always release in `finally`, mirroring lock discipline.

**Mistake 5: reusing a `CountDownLatch` expecting it to reset.** It is single-use by design; calling `countDown()` after it reaches zero has no effect, and it can never count back up. Fix: use `CyclicBarrier` for a repeating rendezvous instead.

## Best practices

- Use virtual threads for many concurrent blocking-I/O tasks; keep bounded platform-thread pools for CPU-bound work.
- Keep bounding downstream capacity (semaphores, connection pools) regardless of how many virtual threads you have available.
- Prefer `ConcurrentHashMap`'s atomic methods (`computeIfAbsent`, `merge`) over separate check-then-act calls guarded by external locking.
- Choose `CopyOnWriteArrayList` only where reads vastly outnumber writes; otherwise prefer a lock-based or concurrent structure sized to the actual access pattern.
- Release semaphore permits and unlock locks in `finally`, without exception.
- Replace `synchronized` blocks that guard blocking operations with `ReentrantLock` on virtual-thread-heavy paths, to avoid pinning.

## Summary

- Virtual threads are cheap, JVM-managed threads that unmount from their carrier during blocking operations, making thousands-to-millions of concurrent blocking tasks practical.
- They help blocking I/O workloads specifically; they do nothing for CPU-bound work, and downstream resource limits still need explicit bounding.
- `ConcurrentHashMap`, `CopyOnWriteArrayList`, and `BlockingQueue` each trade off differently between read/write frequency and locking strategy.
- `Semaphore` bounds concurrent access to a limited resource; `CountDownLatch` is a one-time wait-for-N-events gate; `CyclicBarrier` is a reusable rendezvous point for phased work.
- Blocking inside a `synchronized` block pins a virtual thread to its carrier, defeating the benefit; `ReentrantLock` avoids this.

## Practice

1. **Warm-up:** Explain why running 100,000 tasks that each call `Thread.sleep(100)` is impractical with platform threads but routine with virtual threads.
2. **Warm-up:** A team migrates a service to virtual threads and is surprised that a downstream database still times out under load. Explain why virtual threads alone would not fix this.
3. **Core:** Build a producer-consumer pipeline with a bounded `ArrayBlockingQueue`, and observe (by timing) that the producer blocks once the queue is full.
4. **Core:** Write a small connection-pool simulator using a `Semaphore` of size 3, submit 10 virtual-thread tasks that each acquire, "work," and release, and confirm no more than 3 ever run concurrently.
5. **Challenge:** Write code that blocks inside a `synchronized` block on a virtual thread, and use timing or thread dumps to show the pinning effect; then replace `synchronized` with `ReentrantLock` and show the difference.

## Check your understanding

1. What specifically happens when a virtual thread executes a blocking I/O call, and why does that free its carrier thread?
2. Why does using virtual threads not remove the need for a semaphore or connection pool in front of a fixed-capacity downstream service?
3. When would `CopyOnWriteArrayList` be a poor choice compared to `ConcurrentHashMap`-backed data or a plain synchronized list?
4. What is the key difference in reusability between `CountDownLatch` and `CyclicBarrier`?
5. Why must a `Semaphore.release()` call live in a `finally` block?
6. What causes a virtual thread to become pinned to its carrier, and what is the practical fix?
