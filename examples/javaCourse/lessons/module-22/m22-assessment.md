# Chapter 22 assessment and deliberate practice

This chapter replaced folklore JVM tuning with a precise, evidence-based model: the specific memory regions that together make up a process's real footprint, the reachability-from-roots model that actually governs garbage collection, the JIT compiler's profile-guided speculation and why it makes naive benchmarking misleading, the specific tool for each kind of performance symptom, and the concrete, recurring leak patterns (ThreadLocal, listeners, unbounded queues, unbounded caches) with their precise fixes. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Stacks, heap, metaspace, code cache, native memory, and allocation

A JVM process's total memory is the sum of the heap (bounded by `-Xmx`), every thread's own stack (bounded by `-Xss` each), metaspace (class metadata, native memory, the replacement for the old fixed-size PermGen), the code cache (JIT-compiled native code), and native/off-heap allocations (direct buffers, native library memory) — never heap usage alone. Sizing `-Xmx` to a container's entire memory limit leaves no headroom for these other regions, a specific and diagnosable cause of a container being killed for memory the heap accounting never saw.

### Lesson 2: Reachability, generations, collectors, pauses, throughput, and latency

Java determines collectibility by tracing reachability from GC roots, not by counting references — a self-contained cycle with no path from any root is fully collectible. The generational hypothesis (most objects die young) justifies collecting young and old generations with different strategies and frequency. Serial, G1, and ZGC/Shenandoah represent different points on the throughput-versus-latency trade-off; there is no universally best collector, only one suited to a given application's actual requirements, evidenced by GC log output (heap occupancy before/after and pause duration).

### Lesson 3: JIT compilation, profiling feedback, inlining, and warmup

The JVM interprets bytecode first, then progressively JIT-compiles hot methods via tiered compilation (fast, lightly-optimizing C1; slow, aggressively-optimizing C2), using profiling data collected while the program actually runs — information no ahead-of-time compiler could ever have. Inlining eliminates call overhead and enables further optimization, which is why small hot methods typically cost nothing once compiled. Speculative optimization bets on the common case with a cheap guard, falling back via deoptimization if violated. A naive single-call microbenchmark is misleading due to warmup, dead-code elimination, and constant folding.

### Lesson 4: CPU, allocation, lock, I/O profiling, JFR, and thread dumps

"It's slow" must be narrowed to a specific resource (CPU, allocation/GC pressure, lock contention, I/O) before any profiling tool gives a useful answer — each tool answers a genuinely different question, and using the wrong one for a given symptom produces misleading results. Java Flight Recorder is a low-overhead, always-available facility safe to run in production, capturing CPU, allocation, GC, and lock evidence together. A thread dump is a complete snapshot of every thread's state and stack at one instant, best used (taken more than once) to diagnose hangs and deadlocks. Retained-object investigation specifically requires heap dump reference-path analysis.

### Lesson 5: Memory leaks, ThreadLocal, listeners, queues, and bounded caches

A Java memory leak is always a reachability problem, never a collector failure: some code retains a reference longer than the program logically needs it. An un-cleared `ThreadLocal` on a pooled thread can expose stale state to a later, unrelated request, and keeps referenced objects reachable for the thread's entire lifetime. A forgotten listener registration keeps its entire object graph reachable through a long-lived subject. An unbounded queue or unbounded cache grows without limit under sustained load; a bounded queue and an LRU-evicting cache (an access-ordered `LinkedHashMap` with a correctly-bounded `removeEldestEntry`) fix each respectively.

## Cheat sheet

### Memory regions and their failure modes

| Region | Bounded by | Failure |
|---|---|---|
| Heap | `-Xmx` | `OutOfMemoryError: Java heap space` |
| Thread stack (each) | `-Xss` | `StackOverflowError` (that thread only) |
| Metaspace | `-XX:MaxMetaspaceSize` (optional) | `OutOfMemoryError: Metaspace` |
| Code cache | `-XX:ReservedCodeCacheSize` | JIT compilation silently stops, no exception |
| Native/off-heap | OS memory | `OutOfMemoryError: Direct buffer memory`, or OS/OOM-killer termination |

### Symptom to evidence

| Symptom | Evidence |
|---|---|
| High CPU, unclear where | CPU profiling (JFR execution samples, flame graph) |
| Memory grows under stable load | Heap dump, reference paths to GC roots |
| CPU idle, requests slow | Lock profiling, thread dumps (`WAITING`/`BLOCKED`) |
| Application hangs or frozen | Multiple thread dumps, a few seconds apart |
| Frequent GC pauses | GC logs plus allocation profiling |

### Common leak patterns and fixes

| Pattern | Fix |
|---|---|
| `ThreadLocal` never cleared on a pooled thread | Clear in `finally` around the work that set it |
| Listener registered, never removed | Explicit removal on the owner's lifecycle end |
| Unbounded queue | Bounded queue with genuine back-pressure |
| Unbounded cache (plain `HashMap`) | Bounded cache with an explicit eviction policy (e.g., LRU via access-ordered `LinkedHashMap`) |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Is `-Xmx` (or an equivalent) sized to consume an entire container's memory limit, leaving no headroom for other regions?
- Is a cyclic reference structure assumed to be uncollectible, rather than correctly reasoning from GC-root reachability?
- Is a single cold method call timed and treated as representative of steady-state performance?
- Is a CPU profiler used to investigate a symptom that is actually lock contention or I/O wait?
- Is a `ThreadLocal` set without a corresponding `finally`-based clear?
- Does a cache implementation lack any eviction policy, or get its eviction boundary condition wrong (evicting at the wrong size threshold)?

## The judgment question

The judgment question describes memory growing under stable load and asks what evidence should guide the repair — the correct answer is **retained-object paths and boundedness of owning structures**, not simply increasing heap size and not repeatedly calling `System.gc()`. This is Lesson 5's central point, tied directly to Lesson 4's diagnostic discipline: memory growth under otherwise stable load is the signature of a reachability leak — some structure (a cache, a queue, a listener list) is retaining references it should not, and the actual fix requires finding and breaking that specific reachability chain via heap dump analysis, then bounding whatever structure was unbounded. Increasing heap size only delays the same `OutOfMemoryError` further into the future, treating a symptom rather than the cause, and wastes memory on a problem that will still eventually exhaust any given size. Calling `System.gc()` repeatedly does nothing for a genuine leak at all — the objects in question are still reachable, so a collection cycle, however aggressive, correctly leaves them alone; `System.gc()` cannot and does not collect anything actually still reachable.

## Approaching the implementation lab

The lab asks for `cacheHits(keys, capacity)`: simulate an initially empty LRU cache, counting one hit per access to an already-present key while refreshing its recency, evicting the least recently used key on a miss once over capacity.

1. Write the precondition and boundary table first: an empty `keys` array (zero hits), a nonpositive `capacity` (stores nothing, zero hits regardless of repeated keys), a capacity of exactly one with repeated accesses, and a sequence long enough to force at least one eviction.
2. Use an access-ordered `LinkedHashMap` (constructed with `true` as its third constructor argument) exactly as Lesson 5 demonstrates, overriding `removeEldestEntry` to return `true` once `size() > capacity` — this single override, correctly bounded, implements the entire eviction policy.
3. For each key in `keys`, check whether it is already present (a hit, counted, and its recency refreshed by the access-ordered map's own `get` semantics) before inserting it (a miss, which the map's `put` then handles, triggering eviction via `removeEldestEntry` if now over capacity).
4. Handle nonpositive `capacity` as storing nothing at all — every access is a miss, and nothing should ever be retained, matching the hidden test `(["a", "a"], 0)` expecting `0` hits.
5. Trace the JSON's more involved case by hand before trusting your implementation: `(["a", "b", "a", "c", "a", "b"], 2)` should produce `2` hits — work through which keys are evicted at each step to confirm your understanding of the LRU order before running any code.

## Approaching the debug lab

The debug lab's starter code evicts only once the map exceeds **three** entries (`size() > 3`) while the intended capacity is **two**, letting a third entry linger past the intended bound — precisely the "eviction boundary condition wrong" mistake this chapter's fifth lesson names explicitly.

1. Run the program and confirm it currently prints `3` instead of the required `2`, since all three inserted entries remain present under the too-loose `size() > 3` condition.
2. Recall Lesson 5's exact point: `removeEldestEntry` must return `true` once size **exceeds** the intended capacity, so a capacity of two requires the condition `size() > 2`, not `size() > 3`.
3. Correct the predicate to `size() > 2`, preserving the demonstrated `LinkedHashMap` eviction mechanism and the surrounding loop exactly as given.
4. Confirm your fix now prints `2` exactly, and be ready to explain why the original `size() > 3` condition let one extra entry linger past the cache's intended two-entry bound, which — in a real application — would mean an "LRU cache" silently using more memory than its configured capacity ever intended.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Configure `-Xmx`, `-Xss`, and `-XX:MaxMetaspaceSize` explicitly for a small application, and observe (via `Runtime` memory methods or a monitoring tool) heap usage separately from the process's total resident memory.
2. Enable GC logging on a heap-allocating workload, and read the resulting log to identify collection frequency, pause duration, and whether post-collection heap occupancy trends upward or stays stable over time.
3. Write a naive, hand-rolled microbenchmark of a pure function, then rewrite it with a proper warmup period and a result sink, and compare the two reported timings.
4. Start a JFR recording against a program with a deliberate CPU-heavy path, a deliberate allocation-heavy path, and a deliberate lock-contention scenario, and use `jfr print` to distinguish each in the recorded evidence.
5. Reproduce one of Lesson 5's leak patterns (an un-cleared `ThreadLocal` on a pooled thread, or a forgotten listener registration) end to end: observe the symptom, take a heap dump, trace the actual reference path keeping the object reachable, apply the fix, and confirm the fix with a follow-up heap dump or occupancy trend.

## Self-assessment

You are ready for Chapter 23 when you can do all of the following without notes:

- Name the JVM memory regions beyond the heap, and explain why sizing `-Xmx` to a container's full limit is a specific, diagnosable mistake.
- Explain why a self-contained cycle of objects is still collectible in Java, using the reachability-from-roots model.
- Explain the throughput-versus-latency trade-off between garbage collectors, and why there is no universally "best" one.
- Explain why a naive, single-call microbenchmark can be misleading, naming at least two specific JIT behaviors responsible.
- Match a given performance symptom (high CPU, memory growth, idle CPU with slow requests, a hang) to the right diagnostic evidence.
- Explain why an un-cleared `ThreadLocal` on a pooled thread is a specific, diagnosable leak pattern, and how to fix it.
- Implement (or explain precisely) a bounded LRU cache using an access-ordered `LinkedHashMap`, including the correct `removeEldestEntry` boundary condition.
