# synchronized, volatile, locks, conditions, and atomics

The previous lesson showed that shared mutable data goes wrong in two ways: updates get lost (atomicity) and writes may never be seen (visibility). This lesson gives you the tools that fix both. Every Java developer uses them, directly or indirectly: `synchronized` protects the internals of countless library classes, `volatile` flags stop background workers, `AtomicLong` counts requests in metrics libraries, and `ReentrantLock` with `Condition` sits inside `ArrayBlockingQueue`. Choosing the wrong tool gives you code that looks thread-safe and is not; choosing the right one lets you state exactly *why* your code is correct.

What you will learn:

- What a monitor is and how `synchronized` methods and blocks provide mutual exclusion *and* visibility
- How to identify the invariant a lock protects and why every access path must use the same lock
- What `volatile` guarantees and, just as importantly, what it does not
- How atomic classes (`AtomicInteger`, `AtomicLong`, `AtomicReference`, `LongAdder`) and compare-and-set work
- When `ReentrantLock` beats `synchronized`: `tryLock`, timeouts, interruptible acquisition, fairness
- How to wait for a condition correctly with `Condition.await` or `Object.wait`, always in a loop
- What a deadlock is, how it forms, and how consistent lock ordering prevents it
- How to choose between these tools for a given problem

## Start from the invariant

Before choosing a tool, name what must stay true. An **invariant** is a rule about your data that must hold whenever another thread could observe it. Examples:

- "`count` equals the number of `increment` calls that have completed."
- "The sum of all account balances is constant during transfers."
- "`size` equals the number of non-null slots in `items`."

A lock is not attached to a variable; it is attached to an invariant. Every piece of code that reads or writes the variables involved in that invariant must hold the *same* lock. If one path forgets, the whole protection is gone. Write the rule down in a comment such as `// guarded by this` or `// guarded by lock`.

## synchronized: monitors in action

Every Java object has an intrinsic lock called a **monitor**. A `synchronized` block acquires the monitor of the object in parentheses, runs the body, and releases the monitor when the body exits, even if it exits by throwing. Only one thread can hold a given monitor at a time; others trying to enter are `BLOCKED` until it is released.

```java
// Fragment: the three forms of synchronized
class Inventory {
    private final Object lock = new Object();
    private int onHand;                     // guarded by lock

    synchronized void a() { }               // locks "this"
    static synchronized void b() { }        // locks Inventory.class

    void reserve(int n) {
        synchronized (lock) {               // locks a private object
            if (onHand < n) throw new IllegalStateException("not enough stock");
            onHand -= n;                    // check and act happen atomically
        }
    }
}
```

`synchronized` gives two guarantees at once:

1. **Mutual exclusion**: while one thread is inside, no other thread holding the same monitor can interleave. That turns check-then-act and read-modify-write sequences into atomic units.
2. **Visibility**: releasing a monitor happens-before every later acquisition of the same monitor. Whatever a thread wrote before leaving the block is visible to the next thread entering it.

Monitors are **reentrant**: a thread that already holds a monitor can enter another block synchronized on the same object without deadlocking itself. This is why a synchronized method can call another synchronized method on the same object.

Locking on a private final object instead of `this` is a good habit: outside code cannot accidentally (or maliciously) synchronize on your lock and interfere with you.

### Reads need the lock too

A common half-fix is to synchronize the writer but not the reader. Without the lock, the reader has no happens-before edge with the writer and may see a stale value forever; for `long` and `double` fields it can even see a "torn" value made of half of each write. Synchronize both, or use one of the tools below.

## volatile: visibility without atomicity

Marking a field `volatile` tells the JVM that it is shared between threads:

- Every read sees the most recent write by any thread (a volatile write happens-before every later read of the same field).
- Writes before a volatile write cannot be reordered after it, so a volatile flag can safely *publish* data written before it.
- Reads and writes of volatile `long` and `double` are atomic (no tearing).

But `volatile` does **not** make compound actions atomic. `count++` on a volatile field is still read, add, write, and still loses updates. Use `volatile` for:

- status flags written by one thread and read by others (`running`, `shutdownRequested`)
- publishing a reference to an immutable object (`volatile Config current`)

The following program repairs the broken stop flag from the previous lesson.

```java
public class VolatileStopFlag {

    private static volatile boolean running = true; // remove volatile and this may hang

    public static void main(String[] args) throws InterruptedException {
        Thread worker = new Thread(() -> {
            long spins = 0;
            while (running) {
                spins++;
            }
            System.out.println("worker saw the stop request");
        }, "spinner");
        worker.start();

        Thread.sleep(200);
        running = false; // volatile write: happens-before the worker's next volatile read
        worker.join();
        System.out.println("main: worker finished, state " + worker.getState());
    }
}
```

```text
worker saw the stop request
main: worker finished, state TERMINATED
```

The `sleep(200)` here only lets the worker spin for a while before we stop it; it is not what makes the program correct. The `volatile` write and read are.

## Atomic variables and compare-and-set

The `java.util.concurrent.atomic` package offers lock-free classes for single-variable updates:

| Class | Typical use | Key methods |
|---|---|---|
| `AtomicInteger`, `AtomicLong` | Counters, sequence numbers | `incrementAndGet`, `addAndGet`, `updateAndGet`, `compareAndSet` |
| `AtomicBoolean` | Run-once flags | `compareAndSet(false, true)` |
| `AtomicReference<V>` | Swapping an immutable snapshot | `get`, `set`, `updateAndGet`, `compareAndSet` |
| `LongAdder` | Very hot counters written by many threads | `increment`, `add`, `sum` |

They are built on **compare-and-set (CAS)**, a single CPU instruction that says: "if the value is still `expected`, replace it with `newValue`; tell me whether you succeeded". An update is a loop: read, compute, try to swap, retry if another thread won the race.

```java
// Fragment: what updateAndGet does, written out by hand
AtomicInteger stock = new AtomicInteger(10);

int reserve(int n) {
    while (true) {
        int current = stock.get();
        if (current < n) throw new IllegalStateException("not enough stock");
        int next = current - n;
        if (stock.compareAndSet(current, next)) {
            return next;          // nobody changed it between get and set
        }
        // another thread won; loop and try again with the fresh value
    }
}
```

`LongAdder` spreads increments across several internal cells so that many threads rarely collide, and adds them up when you call `sum()`. It is faster than `AtomicLong` under heavy write contention but `sum()` is not an atomic snapshot while writers are active. Use it for statistics, not for ID generation.

Now compare all the counters side by side:

```java
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.LongAdder;

public class CounterShootout {

    static final int THREADS = 4;
    static final int PER_THREAD = 250_000;

    public static void main(String[] args) throws InterruptedException {
        UnsafeCounter unsafe = new UnsafeCounter();
        VolatileCounter vol = new VolatileCounter();
        SyncCounter sync = new SyncCounter();
        AtomicInteger atomic = new AtomicInteger();
        LongAdder adder = new LongAdder();

        runConcurrently(unsafe::increment);
        runConcurrently(vol::increment);
        runConcurrently(sync::increment);
        runConcurrently(atomic::incrementAndGet);
        runConcurrently(adder::increment);

        System.out.println("expected       " + THREADS * PER_THREAD);
        System.out.println("plain int      " + unsafe.value());
        System.out.println("volatile int   " + vol.value());
        System.out.println("synchronized   " + sync.value());
        System.out.println("AtomicInteger  " + atomic.get());
        System.out.println("LongAdder      " + adder.sum());
    }

    static void runConcurrently(Runnable increment) throws InterruptedException {
        Thread[] threads = new Thread[THREADS];
        for (int t = 0; t < THREADS; t++) {
            threads[t] = new Thread(() -> {
                for (int i = 0; i < PER_THREAD; i++) increment.run();
            });
            threads[t].start();
        }
        for (Thread thread : threads) thread.join();
    }
}

class UnsafeCounter {
    private int value;
    void increment() { value++; }
    int value() { return value; }
}

class VolatileCounter {
    private volatile int value;
    void increment() { value++; } // visible, but still read-modify-write
    int value() { return value; }
}

class SyncCounter {
    private int value;
    synchronized void increment() { value++; }
    synchronized int value() { return value; }
}
```

A representative run. The first two numbers differ every time (and might occasionally be correct by luck); the last three are always exactly the expected value:

```text
expected       1000000
plain int      796847
volatile int   400045
synchronized   1000000
AtomicInteger  1000000
LongAdder      1000000
```

### Atomics do not protect multi-variable invariants

Each atomic is atomic *on its own*. A transfer between two `AtomicInteger` balances is two separate atomic steps; another thread can observe the moment in between, when money has left one account and not yet arrived in the other. When an invariant spans several variables, either guard them all with one lock, or put them in one immutable object and swap it with a single `AtomicReference.compareAndSet`.

## ReentrantLock: an explicit, more flexible lock

`java.util.concurrent.locks.ReentrantLock` does what `synchronized` does (mutual exclusion, visibility, reentrancy) and adds:

- `tryLock()`: acquire only if free right now, return `false` otherwise.
- `tryLock(timeout, unit)`: wait at most that long.
- `lockInterruptibly()`: waiting can be cancelled by interruption (a thread blocked entering `synchronized` cannot be interrupted).
- `new ReentrantLock(true)`: a *fair* lock that grants access roughly in arrival order, at a throughput cost.
- Multiple `Condition` objects per lock.

The price is that nothing unlocks it for you. The idiom is fixed and you should type it the same way every time:

```java
// Fragment: the only acceptable shape for an explicit lock
lock.lock();          // acquire BEFORE try, so a failed acquire never reaches unlock
try {
    // access guarded state
} finally {
    lock.unlock();    // always released, even on exceptions
}
```

`ReentrantReadWriteLock` is a related tool: many readers may hold the read lock together, while a writer needs exclusive access. It helps only when reads are long and far outnumber writes; otherwise its overhead makes it slower than a plain lock.

| Need | `synchronized` | `ReentrantLock` |
|---|---|---|
| Simple mutual exclusion | Best choice, concise | Works, more ceremony |
| Automatic release on exceptions | Yes | Only with `try/finally` |
| Give up after a timeout | No | `tryLock(timeout, unit)` |
| Cancel a waiting thread | No | `lockInterruptibly()` |
| Fairness option | No | Yes |
| Several wait conditions | One wait set per monitor | Many `Condition` objects |

## Waiting for a condition: Condition and wait/notify

Sometimes a thread must wait until the shared state reaches some condition, such as "the buffer is not empty". Spinning in a loop wastes CPU, and sleeping and re-checking is both slow and racy. Instead, a thread can **await** a `Condition` while holding its lock. `await` atomically releases the lock and suspends the thread; when another thread signals, the waiter reacquires the lock before `await` returns.

Two rules are non-negotiable:

1. **Check the predicate in a `while` loop, never an `if`.** A thread can wake up spuriously (without any signal), or another thread may have consumed the item between the signal and the moment this thread reacquires the lock.
2. **Change the state and signal while holding the lock.**

```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class BoundedBufferDemo {

    public static void main(String[] args) throws InterruptedException {
        BoundedBuffer<Integer> buffer = new BoundedBuffer<>(2);

        Thread producer = new Thread(() -> {
            try {
                for (int i = 1; i <= 5; i++) {
                    buffer.put(i);
                    System.out.println("produced " + i);
                }
                buffer.put(-1); // poison pill: tells the consumer to stop
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "producer");

        Thread consumer = new Thread(() -> {
            try {
                int sum = 0;
                while (true) {
                    int item = buffer.take();
                    if (item < 0) break;
                    sum += item;
                    System.out.println("  consumed " + item);
                    Thread.sleep(20); // slow consumer, so the producer must wait
                }
                System.out.println("consumer total = " + sum);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "consumer");

        producer.start();
        consumer.start();
        producer.join();
        consumer.join();
    }
}

final class BoundedBuffer<T> {
    private final Deque<T> items = new ArrayDeque<>();
    private final int capacity;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();
    private final Condition notEmpty = lock.newCondition();

    BoundedBuffer(int capacity) {
        this.capacity = capacity;
    }

    void put(T item) throws InterruptedException {
        lock.lock();
        try {
            while (items.size() == capacity) { // loop, never "if"
                notFull.await();                // releases the lock while waiting
            }
            items.addLast(item);
            notEmpty.signal();
        } finally {
            lock.unlock();
        }
    }

    T take() throws InterruptedException {
        lock.lock();
        try {
            while (items.isEmpty()) {
                notEmpty.await();
            }
            T item = items.removeFirst();
            notFull.signal();
            return item;
        } finally {
            lock.unlock();
        }
    }
}
```

A representative run. The exact interleaving of `produced` and `consumed` lines varies, but the producer never gets more than two items ahead and the total is always 15:

```text
produced 1
produced 2
  consumed 1
produced 3
  consumed 2
produced 4
  consumed 3
produced 5
  consumed 4
  consumed 5
consumer total = 15
```

The older built-in equivalent is `Object.wait()`, `notify()`, and `notifyAll()`, used inside `synchronized` on the same object. It follows the same loop rule. Prefer `notifyAll` over `notify` unless you can prove every waiter waits for the same condition. In new code, prefer a ready-made `BlockingQueue` (lesson 5) over writing either version yourself; this example exists so you understand what those classes do internally.

## Deadlock and lock ordering

A **deadlock** happens when threads wait for each other in a cycle and none can proceed. Four conditions must all hold: locks are exclusive, a thread holds one lock while waiting for another, locks cannot be taken away, and there is a circular wait. Remove any one and deadlock is impossible. The most practical one to remove is the *circular wait*.

Consider a bank transfer that locks the source account and then the destination. Picture two transfers running at the same moment in opposite directions:

1. Thread 1 transfers from A to B: it locks A.
2. Thread 2 transfers from B to A: it locks B.
3. Thread 1 now asks for B, which Thread 2 holds, so it waits.
4. Thread 2 now asks for A, which Thread 1 holds, so it waits.
5. Neither will ever release what it holds. Neither lock implementation detects this: a `ReentrantLock` called with plain `lock()` waits forever, just like `synchronized`, and there is no queueing order that resolves a cycle.

The fix: define a **global order** for locks (for example, by account id) and make *every* code path acquire them in that order, regardless of transfer direction. If every thread takes the lower id first, a cycle cannot form. `tryLock` with a timeout is a secondary safety net that turns a hang into a detectable failure you can retry or report.

```java
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

public class DeadlockAndOrdering {

    public static void main(String[] args) throws InterruptedException {
        Account a = new Account(1, 100);
        Account b = new Account(2, 100);

        // Part 1: opposite lock order. Each thread grabs its first lock, then both
        // try the second one. tryLock with a timeout lets us detect the cycle
        // instead of hanging forever.
        CountDownLatch bothHoldFirstLock = new CountDownLatch(2);
        Thread t1 = new Thread(() -> naiveTransfer(a, b, 10, bothHoldFirstLock), "t1");
        Thread t2 = new Thread(() -> naiveTransfer(b, a, 20, bothHoldFirstLock), "t2");
        t1.start();
        t2.start();
        t1.join();
        t2.join();

        // Part 2: consistent global order (lowest id first). No cycle is possible.
        Thread t3 = new Thread(() -> orderedTransfer(a, b, 10), "t3");
        Thread t4 = new Thread(() -> orderedTransfer(b, a, 20), "t4");
        t3.start();
        t4.start();
        t3.join();
        t4.join();
        System.out.println("balances: a=" + a.balance + " b=" + b.balance
                + " total=" + (a.balance + b.balance));
    }

    static void naiveTransfer(Account from, Account to, int amount, CountDownLatch gate) {
        from.lock.lock();
        try {
            gate.countDown();
            gate.await(); // guarantee both threads hold their first lock (demo only)
            if (to.lock.tryLock(200, TimeUnit.MILLISECONDS)) {
                try {
                    from.balance -= amount;
                    to.balance += amount;
                } finally {
                    to.lock.unlock();
                }
            } else {
                System.out.println(Thread.currentThread().getName()
                        + ": gave up, would have deadlocked waiting for account " + to.id);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            from.lock.unlock();
        }
    }

    static void orderedTransfer(Account from, Account to, int amount) {
        Account first = from.id < to.id ? from : to;
        Account second = from.id < to.id ? to : from;
        first.lock.lock();
        try {
            second.lock.lock();
            try {
                from.balance -= amount;
                to.balance += amount;
                System.out.println(Thread.currentThread().getName() + ": moved " + amount
                        + " from " + from.id + " to " + to.id);
            } finally {
                second.lock.unlock();
            }
        } finally {
            first.lock.unlock();
        }
    }
}

final class Account {
    final int id;
    int balance; // guarded by lock
    final ReentrantLock lock = new ReentrantLock();

    Account(int id, int balance) {
        this.id = id;
        this.balance = balance;
    }
}
```

A representative run. In part 1 both threads always give up (the latch forces the cycle), but which message prints first varies; in part 2 the two transfer lines can appear in either order:

```text
t2: gave up, would have deadlocked waiting for account 1
t1: gave up, would have deadlocked waiting for account 2
t3: moved 10 from 1 to 2
t4: moved 20 from 2 to 1
balances: a=110 b=90 total=200
```

If you suspect a deadlock in a running JVM, take a thread dump (`jstack <pid>` or `jcmd <pid> Thread.print`). The JVM reports "Found one Java-level deadlock" for monitor and `ReentrantLock` cycles and lists which thread holds what.

## Under the hood: what a lock does step by step

When a thread executes `synchronized (lock) { balance -= amount; }`:

1. It tries to acquire the monitor of `lock`. If free, it becomes the owner; if not, the thread is parked as `BLOCKED`.
2. Acquiring the monitor has *acquire* semantics: the thread must not use stale cached values of shared variables; it sees everything the previous owner wrote before releasing.
3. The body executes. No other thread can own this monitor meanwhile.
4. On exit (normal or exceptional), the thread releases the monitor with *release* semantics: its writes become visible to the next owner.
5. One blocked thread is allowed to compete for the monitor again.

Uncontended locking is cheap on modern JVMs (tens of nanoseconds). Contention is what costs: threads park, wake, and migrate between cores. That is why you keep critical sections short.

## Choosing the right tool

| Situation | Tool |
|---|---|
| One flag or reference written by one thread, read by others | `volatile` |
| One counter or number updated by many threads | `AtomicInteger` / `AtomicLong`, or `LongAdder` for hot statistics |
| Replace an immutable snapshot atomically | `AtomicReference` with `updateAndGet` or `compareAndSet` |
| Invariant spanning several fields | One lock (`synchronized` or `ReentrantLock`) around every access |
| Need timeouts, interruptible waits, or `tryLock` | `ReentrantLock` |
| Wait until state changes | `Condition.await` in a loop, or better a `BlockingQueue` |
| Two or more locks at once | Consistent global lock order, plus `tryLock` timeout as a safety net |

## Common mistakes

### volatile counter

```java
// Wrong
private volatile int hits;
void hit() { hits++; }   // still loses updates
```

Fix: `AtomicInteger hits` with `incrementAndGet()`, or synchronize the method.

### Synchronizing on different objects

```java
// Wrong: each call locks a different object, so there is no exclusion
void add(Item item) {
    synchronized (new Object()) { items.add(item); }
}
```

Also wrong: one method synchronized on `this` and another on a private lock for the same field. Fix: one designated lock object per invariant, used everywhere.

### unlock outside finally

```java
// Wrong
lock.lock();
update();        // if this throws, the lock is never released
lock.unlock();
```

Every later caller blocks forever. Fix: `lock.lock(); try { update(); } finally { lock.unlock(); }`.

### if instead of while around await

```java
// Wrong
if (items.isEmpty()) notEmpty.await();
return items.removeFirst();   // may throw: another consumer took the item first
```

Fix: `while (items.isEmpty()) notEmpty.await();`.

### Inconsistent lock order

Locking `from` then `to` means two opposite transfers can deadlock. Fix: order locks by a stable key (id), never by argument position.

### Holding a lock during slow work

```java
// Wrong
synchronized (cache) {
    cache.put(key, httpClient.send(request, handler)); // every thread waits for the network
}
```

Fix: do the slow call outside the lock, then lock only to update shared state (and handle the case where another thread stored a value first).

## Best practices

- Name the invariant and the lock that guards it in a comment next to the fields.
- Prefer immutability and confinement; reach for locks only for genuinely shared mutable state.
- Keep critical sections short; never perform I/O, sleep, or call unknown callbacks while holding a lock.
- Lock on a private final object, not on `this`, a `String` literal, or a boxed `Integer`.
- Use the highest-level tool that fits: a concurrent collection or queue beats a hand-written lock protocol.
- Always pair `lock()` with `unlock()` in `finally`, and always wait in a loop.
- Acquire multiple locks in one documented global order.
- Treat `ReentrantLock` fairness as a measured decision; it reduces throughput.

## Summary

- `synchronized` provides mutual exclusion and visibility; every read and write of guarded state must use the same monitor.
- `volatile` provides visibility and ordering for single reads and writes, but not atomic read-modify-write.
- Atomic classes use compare-and-set for lock-free single-variable updates; they do not protect invariants across variables.
- `ReentrantLock` adds `tryLock`, timeouts, interruptible acquisition, fairness, and multiple conditions, at the cost of manual `unlock` in `finally`.
- Wait for state changes with `await` or `wait` inside a `while` loop, and signal while holding the lock.
- Deadlock needs a circular wait; acquiring locks in one consistent global order removes it. Lock implementations do not detect or break cycles for you.

## Practice

### Warm-up

1. Convert `UnsafeCounter` into a thread-safe class twice: once with `synchronized`, once with `AtomicInteger`. For each, write one sentence stating which happens-before rule makes reads see the latest value.
2. Replace the `volatile` stop flag with an `AtomicBoolean` and confirm it still stops.

### Core

1. Build a `BankAccount` pair with a `transfer(from, to, amount)` that rejects overdrafts. Guard it with ordered `ReentrantLock` acquisition, run 1,000 random transfers across four threads, and assert that the total balance never changes.
2. Rewrite `BoundedBuffer` using `synchronized`, `wait`, and `notifyAll`. Explain why `notify` alone could cause a hang with several producers and consumers.
3. Implement a `reserve(n)` method on an `AtomicInteger` stock using a compare-and-set loop that never lets stock go negative.

### Challenge

1. Store a two-field invariant (for example `min <= max`) in an immutable record held by an `AtomicReference`, and write `setMin` and `setMax` with `updateAndGet` so the invariant can never be observed broken.
2. Add a `tryTransfer` that gives up after 50 ms using `tryLock`, and design a retry policy that avoids two threads retrying in lockstep.

## Check your understanding

1. Why must the getter of a counter be synchronized when the incrementing method is synchronized?
2. What does `volatile` guarantee for `count++`, and what does it fail to guarantee?
3. When would you choose `LongAdder` over `AtomicLong`, and when would that be the wrong choice?
4. Name three capabilities of `ReentrantLock` that `synchronized` lacks.
5. Why must a waiting thread re-check its condition in a loop after waking?
6. Describe the circular wait behind a two-account deadlock and the rule that makes it impossible.
