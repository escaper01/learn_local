# Memory leaks, ThreadLocal, listeners, queues, and bounded caches

A "memory leak" in Java is not a defect in the garbage collector — it is a program that keeps a reference to an object it no longer actually needs, making that object permanently reachable, and therefore permanently un-collectible, regardless of how good the collector is. This closing lesson names the specific, recurring patterns that cause this in real Java programs — pooled threads retaining stale `ThreadLocal` state, forgotten listener registrations, unbounded queues, and unbounded caches — and, for each, the concrete fix, applying every diagnostic tool from the previous lesson to a real, repairable problem rather than folklore tuning.

What you will learn:

- Why a Java "memory leak" is always a reachability problem, never a collector failure
- ThreadLocal leaks: why a pooled worker thread can retain or expose stale state across requests
- Listener leaks: a forgotten registration keeping an entire object graph reachable
- Unbounded queue growth: when a producer outpaces a consumer with no back-pressure
- Unbounded caches: why "just cache it" without an eviction policy is a leak waiting to happen
- How to actually repair each pattern, and verify the repair with the previous lesson's tools

## A Java memory leak is always a reachability problem

Given Lesson 2's reachability model, a "leak" in Java has one precise meaning: some code, somewhere, still holds a live reference to an object that the *logical* lifetime of the program no longer needs — the object remains reachable from a GC root through some chain of references, so the collector correctly, faithfully keeps it alive, exactly as it is designed to. There is no garbage-collector bug to blame; the fix is always finding and removing (or scoping down) the unwanted reference, verified with the heap dump reference-path analysis from the previous lesson.

## ThreadLocal leaks: pooled threads outlive the state meant for one request

`ThreadLocal` gives each thread its own independent copy of a value — useful for exactly the correlation-ID pattern from the observability chapter. The leak risk is specific and directly tied to **thread pooling**: a pooled worker thread is *reused* across many requests, but a `ThreadLocal` value set during one request does not automatically clear itself when that request finishes — it persists on that specific thread until something explicitly removes it, or until the thread itself terminates (which, for a pooled thread, may be never, for the life of the application).

```java
public class RequestContext {
    private static final ThreadLocal<String> CURRENT_USER = new ThreadLocal<>();

    public static void set(String user) { CURRENT_USER.set(user); }
    public static String get() { return CURRENT_USER.get(); }
    public static void clear() { CURRENT_USER.remove(); } // essential — see below
}
```

```java
// WRONG: no cleanup. On a pooled thread, the NEXT request handled by this same
// thread will see the PREVIOUS request's user if it never set its own value —
// a specific, dangerous case of leaking one user's identity into another user's request.
void handleRequest(String user) {
    RequestContext.set(user);
    processRequest();
    // missing: RequestContext.clear()
}

// CORRECT: always clear in a finally block, regardless of how processRequest() exits.
void handleRequestSafely(String user) {
    RequestContext.set(user);
    try {
        processRequest();
    } finally {
        RequestContext.clear();
    }
}
```

This directly answers this chapter's concept-check question: the reason to remove a `ThreadLocal` value after a request is that **a reused worker thread can retain or expose stale request state** — not because it guarantees thread termination (it does not; the thread keeps running, pooled, waiting for its next task) and not because it resets any unrelated static field (it does not touch anything beyond the one `ThreadLocal` variable itself). Beyond the security risk of leaking one request's identity into another's processing, an un-cleared `ThreadLocal` holding a reference to a large object (a big request payload, a database connection) keeps that specific object reachable — pinned to that one pooled thread — for as long as the thread lives, which for a long-running pool can be the entire life of the application, a genuine, specific memory leak with a precise, well-known fix.

## Listener leaks: a forgotten registration keeps everything reachable

Chapter 20's Observer pattern showed a subject holding a list of listeners; the leak risk is the mirror image of `ThreadLocal`'s: registering a listener with a long-lived subject, and then never removing that registration once the listener's owner is done with it, keeps the listener object — and everything reachable from it — permanently reachable through the subject's own listener list, even though nothing else in the program still needs it:

```java
public class EventBus {
    private final List<Listener> listeners = new ArrayList<>(); // long-lived, application-wide

    public void addListener(Listener listener) { listeners.add(listener); }
    public void removeListener(Listener listener) { listeners.remove(listener); }
}
```

```java
// LEAK: this dialog is meant to be short-lived (closed when the user is done with it),
// but registering it with the long-lived EventBus and never removing it keeps the
// ENTIRE dialog object graph reachable forever, through EventBus.listeners.
public class NotificationDialog {
    public NotificationDialog(EventBus bus) {
        bus.addListener(this::onEvent); // no corresponding removeListener anywhere
    }
    void onEvent(Event event) { /* update dialog UI */ }
}

// FIXED: the dialog removes its own registration when it is genuinely done.
public class FixedNotificationDialog {
    private final EventBus bus;
    private final Listener myListener = this::onEvent;

    public FixedNotificationDialog(EventBus bus) {
        this.bus = bus;
        bus.addListener(myListener);
    }

    public void close() {
        bus.removeListener(myListener); // breaks the reachability chain deliberately
    }

    void onEvent(Event event) { /* ... */ }
}
```

This is exactly the class-loader-leak mechanism from Chapter 21, at a smaller scale: `EventBus.listeners` is a GC root-reachable structure (reachable via a static field, or an application-lifetime singleton), and anything it references, transitively, stays reachable for as long as the registration remains — regardless of whether the rest of the program considers that listener's owner "closed" or "done." A weak reference (`WeakReference`, or a listener collection built specifically to hold weak references) is sometimes used as a defensive fallback for exactly this pattern, letting the collector reclaim a listener whose owner has otherwise become unreachable even if an explicit removal was forgotten — but an explicit, correct removal is always the more precise, more immediately effective fix, and should not be skipped in favor of relying on weak references as the primary mechanism.

## Unbounded queue growth: a producer outpacing a consumer

The concurrency chapter's `BlockingQueue` lesson showed a *bounded* queue's back-pressure preventing unbounded memory growth; the leak pattern here is exactly the inverse — an **unbounded** queue (or an unbounded collection used as one) accepting work faster than it can be processed, growing without limit:

```java
// LEAK RISK: an unbounded queue accepts work indefinitely faster than it can be drained.
BlockingQueue<Task> taskQueue = new LinkedBlockingQueue<>(); // no capacity bound at all

// If producers submit tasks faster than consumers can process them, sustained
// over time, this queue's size — and the memory backing every queued Task — grows
// without limit, exactly the OutOfMemoryError-in-slow-motion pattern this chapter
// has been building toward.
```

```java
// FIXED: a bounded queue provides genuine back-pressure, exactly as the concurrency
// chapter demonstrated — a producer that races ahead of consumers now blocks (or
// is explicitly rejected) instead of growing memory without limit.
BlockingQueue<Task> boundedQueue = new ArrayBlockingQueue<>(1000);
```

This connects directly back to Lesson 4's GC-log evidence: a queue growing without bound shows up as steadily rising heap occupancy across many GC cycles (post-collection usage trending upward, rather than returning to a stable baseline after each collection) — exactly the pattern that lesson flagged as worth investigating as a possible leak, now given a concrete, common, and directly fixable cause.

## Unbounded caches: "just cache it" without an eviction policy

A **cache** with no eviction policy at all is not a cache — it is a memory leak with a friendly name. Storing every distinct key ever seen, forever, in a plain `HashMap` used as a cache, guarantees unbounded growth for any application whose key space is not genuinely finite and small:

```java
// LEAK: a plain HashMap used as a cache never evicts anything, ever.
static final Map<String, ExpensiveResult> cache = new HashMap<>();

static ExpensiveResult compute(String key) {
    return cache.computeIfAbsent(key, RealComputation::expensiveCompute); // grows forever
}
```

A **bounded** cache with a defined eviction policy fixes this by design, exactly as this chapter's implementation lab requires: an access-ordered `LinkedHashMap` overriding `removeEldestEntry` implements a **least-recently-used (LRU)** eviction policy directly, evicting the least recently accessed entry once the map exceeds a chosen capacity:

```java
import java.util.LinkedHashMap;
import java.util.Map;

public class BoundedLruCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;

    public BoundedLruCache(int capacity) {
        super(16, 0.75f, true); // the `true` here means ACCESS order, not insertion order — essential for LRU
        this.capacity = capacity;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > capacity; // called automatically after every put(); true means "evict eldest now"
    }
}
```

The constructor's third argument, `true`, is what makes this genuinely LRU rather than merely insertion-ordered: with access order enabled, every `get()` on an existing key moves that entry to the "most recently used" end internally, so `removeEldestEntry` — called automatically by the map's own `put` implementation — always evicts whichever entry has gone the *longest* without being accessed, not merely the oldest-inserted one. `removeEldestEntry`'s boundary condition matters precisely: it must return `true` once size *exceeds* the intended capacity (so a capacity of two evicts once a third entry is added), not merely once size reaches some looser threshold — getting this boundary wrong (evicting only once size exceeds capacity by more than the intended margin) is exactly the bug this chapter's debug lab is built to test.

## What happens under the hood: from a forgotten reference to a diagnosed leak

1. Application code creates an object and, deliberately or not, stores a reference to it somewhere with a longer lifetime than the object logically needs — a `ThreadLocal` on a pooled thread, a listener list on a long-lived subject, an unbounded queue, or an unbounded cache map.
2. As the application runs under sustained load, more and more such objects accumulate reachable references through this long-lived structure, each one correctly, faithfully kept alive by the garbage collector, exactly as reachability requires.
3. Heap occupancy after each garbage collection (visible in GC logs, per Lesson 2) trends upward over time, rather than returning to a stable baseline — the specific, diagnosable signature of a leak, as opposed to ordinary, bounded memory usage that fluctuates but does not grow without limit.
4. A heap dump, examined with reference-path analysis (per Lesson 4), reveals the actual chain of references keeping the leaking objects reachable — tracing back from a retained object through whatever holds it, ultimately to a GC root such as a static field.
5. Fixing the leak means breaking that specific reachability chain: clearing a `ThreadLocal` in a `finally` block, removing a listener registration when its owner is done, bounding a queue's capacity, or applying an eviction policy to a cache — after which the previously-retained objects become unreachable and are correctly collected on the next garbage collection cycle, verifiable by re-examining heap occupancy trends.

## Common mistakes

**Mistake 1: never clearing a `ThreadLocal` value on a pooled thread.** The next task the pooled thread handles can see the previous task's stale value, and any object referenced by that value stays reachable for as long as the thread lives. Fix: always clear a `ThreadLocal` in a `finally` block around the work that set it.

**Mistake 2: registering a listener with a long-lived subject and never removing it.** This keeps the listener's entire object graph reachable indefinitely, exactly like a class loader leak at a smaller scale. Fix: explicitly remove a listener registration when its owner's lifecycle ends.

**Mistake 3: using an unbounded queue or unbounded collection to buffer work between a producer and a consumer.** A sustained rate mismatch grows it without limit. Fix: use a bounded queue with genuine back-pressure, as the concurrency chapter demonstrated.

**Mistake 4: implementing a "cache" as a plain `HashMap` with no eviction policy at all.** This guarantees unbounded growth for any non-trivially-small key space. Fix: use a bounded structure with a defined eviction policy, such as an access-ordered `LinkedHashMap` implementing LRU.

**Mistake 5: getting a bounded cache's eviction boundary condition wrong.** `removeEldestEntry` returning `true` only once size exceeds capacity by more than intended lets extra entries linger past the configured limit. Fix: return `true` exactly once `size() > capacity`, matching the intended bound precisely.

## Best practices

- Always clear `ThreadLocal` values in a `finally` block scoped to the work that set them, especially on pooled threads.
- Explicitly remove listener registrations when their owner's lifecycle ends; consider weak references only as a defensive fallback, never as the primary mechanism.
- Bound every queue used to buffer work between a producer and a consumer, providing genuine back-pressure instead of unbounded growth.
- Never use an unbounded map as a cache; always apply an explicit, verified eviction policy sized to the application's actual memory budget.
- Verify a suspected leak's fix with the previous lesson's tools: heap occupancy trending stable (not upward) after the fix, and a heap dump showing the previously-retained objects are now unreachable.

## Summary

- A Java memory leak is always a reachability problem: some code retains a reference to an object longer than the program logically needs it, and the collector faithfully, correctly keeps it alive.
- A `ThreadLocal` value not cleared on a pooled thread can expose stale state to a later, unrelated request and keeps referenced objects reachable for the pooled thread's entire lifetime.
- A forgotten listener registration with a long-lived subject keeps the listener's entire object graph reachable indefinitely.
- An unbounded queue or unbounded cache grows without limit under sustained load with no eviction or back-pressure mechanism; a bounded queue or an LRU-evicting cache fixes each, respectively.
- Every one of these patterns is diagnosable with the previous lesson's tools (GC logs for the growth trend, heap dumps for the specific reference paths) and fixable with a precise, well-understood remedy — never with folklore tuning or simply increasing heap size.

## Practice

1. **Warm-up:** Explain precisely why failing to clear a `ThreadLocal` value on a pooled thread can expose one request's data to a completely unrelated later request.
2. **Warm-up:** A listener registered with a long-lived event bus is never removed. Trace the reachability chain, step by step, that keeps its entire object graph alive.
3. **Core:** Implement a bounded LRU cache using an access-ordered `LinkedHashMap`, write tests confirming both correct hit/miss behavior and correct eviction of the least recently used entry once capacity is exceeded.
4. **Core:** Reproduce a `ThreadLocal` leak on a small thread pool (submit several tasks that set but never clear a `ThreadLocal`, then observe a later task seeing a stale value), then fix it with a `finally`-based clear and confirm the fix.
5. **Challenge:** Using a heap dump and reference-path analysis (per the previous lesson), diagnose a deliberately introduced leak (an unbounded cache, or an un-removed listener) in a small sample program, and confirm your fix by observing heap occupancy stabilize afterward.

## Check your understanding

1. Why is a Java memory leak always described as a reachability problem rather than a garbage-collector defect?
2. Why must a `ThreadLocal` value be cleared after a request, specifically on a pooled thread, and what goes wrong if it is not?
3. What reachability chain keeps a forgotten listener's entire object graph alive, and what breaks that chain?
4. What is the difference in outcome between an unbounded queue and a bounded queue under a sustained producer/consumer rate mismatch?
5. What specifically makes an access-ordered `LinkedHashMap` with `removeEldestEntry` implement genuine LRU eviction, rather than just evicting the oldest-inserted entry?
6. What is the correct boundary condition for `removeEldestEntry` to enforce a cache capacity of exactly `N`, and what goes wrong if that boundary is off by more than intended?
