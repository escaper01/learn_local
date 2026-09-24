# CPU, allocation, lock, I/O profiling, JFR, and thread dumps

"The service is slow" is a symptom, not a diagnosis, and this lesson's central discipline is matching the *symptom* to the *right kind of evidence* — a CPU-bound hot loop, an allocation-heavy code path stressing the garbage collector, lock contention serializing threads that should run in parallel, and a stuck or deadlocked thread all look identical from the outside ("requests are slow") but require entirely different diagnostic tools to actually see. This lesson covers Java Flight Recorder (JFR), the built-in profiling and event-recording facility, and thread dumps, the tool for diagnosing exactly what every thread is doing (or waiting for) at one instant.

What you will learn:

- Why "it's slow" needs to be narrowed to a specific resource before you can fix anything
- CPU profiling: where the program's execution time is actually spent
- Allocation profiling: which code paths create the most garbage, stressing the collector
- Lock profiling: which synchronization points threads spend time waiting on
- Java Flight Recorder (JFR): a low-overhead, always-available recording facility built into the JVM
- Thread dumps: a snapshot of every thread's state and call stack at one instant
- Matching the right evidence to the right symptom, rather than guessing

## Narrow the symptom before reaching for a tool

"Slow" can mean the CPU is pegged doing real work, the CPU is idle while threads wait on locks or I/O, the garbage collector is running so often it starves the application of CPU time (directly connecting to the previous two lessons), or a handful of specific threads are simply stuck. Each of these has a completely different fix, and none of the available profiling tools answer more than the specific question they are built for — running a CPU profiler against a lock-contention problem shows threads "executing" the wait itself, which can look confusingly like real work without the right lens to interpret it. The discipline this whole lesson builds toward: identify which *kind* of resource is actually constrained — CPU, allocation/GC pressure, lock contention, or I/O — before reaching for any specific tool, and let that answer choose the tool, not the other way around.

## CPU profiling: where execution time is actually spent

A CPU profiler samples (or, less commonly, instruments) running threads to determine which methods are actually consuming CPU time, typically presented as a **flame graph** — a visualization where each rectangle's width represents the proportion of sampled time spent in that method, stacked to show the call hierarchy:

```text
Flame graph reading (width = proportion of CPU time):
[========================== main ==========================]
[==== parseRequest ====][============ processOrder ============]
                         [== validate ==][===== calculatePricing =====]
                                          [=== applyDiscountRules ===]
```

A wide rectangle deep in the call stack (`applyDiscountRules`, here) taking up a large fraction of total width is the direct visual signal of where CPU time is actually going — not where a developer's intuition might guess, which is exactly why profiling evidence, not guesswork, should drive an optimization effort. A CPU profiler answers "which code is actually running on the CPU," and nothing else; it does not, by itself, distinguish genuinely necessary computation from wasted work, or reveal whether a method is slow because of its own logic versus because it is waiting on something else entirely (which would show as the *thread* being off-CPU, not sampled by a CPU profiler at all).

## Allocation profiling: which code creates the most garbage

An **allocation profiler** tracks which code paths allocate the most objects (by count or by total bytes), directly connecting to the previous two lessons: a code path allocating heavily stresses the young generation, triggering minor collections more frequently, which — even though each individual collection might be fast — can add up to meaningful CPU time spent collecting rather than running application logic, and can also increase promotion into the old generation if allocation bursts outpace collection.

```text
Allocation profile (illustrative):
  45% - StringBuilder.<init> called from formatLogMessage()
  30% - ArrayList.<init> called from parseRequestHeaders()
  15% - byte[] allocated from readRequestBody()
  10% - everything else
```

A method dominating an allocation profile is not automatically a bug — allocation is often genuinely necessary — but it is a specific, evidence-based place to look for unnecessary object creation: a `StringBuilder` created fresh inside a hot loop when one could be reused, a defensive copy made more often than the actual mutation risk requires, or a collection sized without an initial capacity hint, forcing repeated internal resizing (each of which allocates and discards an intermediate backing array). Allocation profiling answers "where does garbage come from," which is a genuinely different question from CPU profiling's "where does execution time go" — a method can dominate an allocation profile while barely registering on a CPU profile, if its own logic is cheap but it allocates constantly.

## Lock profiling: where threads wait on synchronization

**Lock profiling** identifies which locks (`synchronized` blocks, `ReentrantLock`s) threads spend the most time waiting to acquire — directly relevant to the concurrency chapter's invariant-protection tools, since a lock that protects too much code, or is acquired far more often than the invariant actually requires, serializes threads that could otherwise run in parallel, silently defeating the benefit of a multi-threaded design.

```text
Lock profile (illustrative):
  Lock: OrderProcessor.inventoryLock
  Total wait time across all threads: 4.2s
  Top waiting call sites:
    OrderProcessor.reserveStock (3.1s)
    OrderProcessor.releaseStock (1.1s)
```

This kind of evidence is exactly what distinguishes "the CPU is busy doing real work" from "the CPU is mostly idle because threads are queued up waiting for a lock" — two symptoms that both present as "slow" from a user's perspective, but demand entirely different fixes: reducing the amount of work protected by the lock, choosing a finer-grained locking strategy, or (per the concurrency chapter) replacing a single shared lock with a concurrent collection or atomic class suited to the actual access pattern.

## Java Flight Recorder: low-overhead, always-available recording

**Java Flight Recorder (JFR)** is a profiling and event-recording facility built directly into the JVM, designed specifically to be low-overhead enough to run continuously in production — a meaningful difference from many external profiling tools, which can perturb the very performance characteristics they are trying to measure (the observer effect) if their overhead is high enough.

```text
java -XX:StartFlightRecording=duration=60s,filename=recording.jfr -jar app.jar
```

```text
jfr print --events jdk.ExecutionSample recording.jfr   # CPU sampling events
jfr print --events jdk.ObjectAllocationSample recording.jfr  # allocation events
jfr print --events jdk.JavaMonitorEnter recording.jfr   # lock contention events
```

JFR records a wide range of event types in one pass — CPU samples, allocation samples, garbage collection pauses (directly readable alongside the GC log evidence from Lesson 2), lock contention, thread starts and stops, and I/O operations — into a single `.jfr` file, viewable with the `jfr` command-line tool or a graphical viewer (JDK Mission Control). Because it can be enabled with negligible overhead even on a production system under real load, JFR is often the right first tool to reach for when a production performance problem needs investigating: a single recording captures CPU, allocation, and lock evidence together, letting the actual data — not a guess about which single-purpose tool to run first — reveal which resource is actually constrained.

## Thread dumps: a snapshot of every thread at one instant

A **thread dump** captures every thread's current state and full call stack at the moment it is taken — the tool of choice specifically for a hung, deadlocked, or unresponsive application, complementing the sampling-based tools above with a single, complete instant rather than data aggregated over a time window:

```text
jstack <pid> > threads.txt
```

```text
"pool-2-thread-3" #15 prio=5 os_prio=0 tid=0x... nid=0x... waiting on condition [0x...]
   java.lang.Thread.State: WAITING (parking)
        at jdk.internal.misc.Unsafe.park(java.base@21/Native Method)
        at java.util.concurrent.locks.LockSupport.park(java.base@21/LockSupport.java:341)
        at java.util.concurrent.locks.AbstractQueuedSynchronizer.acquire(java.base@21/AbstractQueuedSynchronizer.java:...)
        at java.util.concurrent.locks.ReentrantLock$Sync.lock(java.base@21/ReentrantLock.java:...)
        at com.example.OrderProcessor.reserveStock(OrderProcessor.java:88)

"pool-2-thread-4" #16 prio=5 os_prio=0 tid=0x... nid=0x... runnable [0x...]
   java.lang.Thread.State: RUNNABLE
        at com.example.OrderProcessor.calculatePricing(OrderProcessor.java:142)
```

Reading a thread dump for a hang or deadlock specifically means looking for threads in `BLOCKED` state (waiting to acquire a monitor another thread holds — directly connecting to the concurrency chapter's deadlock material), and cross-referencing which lock each blocked thread is waiting for against which thread currently holds it; the JVM itself detects and reports an actual deadlock cycle explicitly in the dump's output when one exists, exactly the diagnostic evidence the concurrency chapter's deadlock lesson referenced. Taking **several** thread dumps a few seconds apart, rather than just one, is often more useful than a single snapshot: a thread whose stack trace is identical across several consecutive dumps is very likely genuinely stuck at that exact point, while a thread whose stack trace changes between dumps is merely running normally and happened to be sampled at different points in its own progress.

## Matching evidence to symptom

This chapter's fourth concept-check question makes the point directly: **retained-object investigation** (why is memory not being reclaimed) specifically needs **heap analysis and reference paths** (a heap dump, examined for the chain of references from a GC root to the retained object — exactly the reachability model from Lesson 2, used diagnostically) — not a compiler warning, and not HTTP status codes, neither of which carries any information about what references an object in memory. This is the general principle the whole lesson has been building toward:

| Symptom | Right evidence |
|---|---|
| High CPU, unclear where time goes | CPU profiling (JFR execution samples, a flame graph) |
| Memory grows under stable load | Heap dump analysis, reference paths to GC roots |
| CPU idle, requests still slow | Lock profiling, thread dumps (look for `WAITING`/`BLOCKED`) |
| A specific request hangs or the application seems frozen | Thread dumps, taken more than once, a few seconds apart |
| Frequent GC pauses, unclear cause | GC logs (Lesson 2) plus allocation profiling |

## What happens under the hood: from a running JVM to a JFR recording

1. JFR, once started, hooks into various JVM subsystems (the safepoint mechanism for stack sampling, the allocation path, the monitor/lock machinery, the garbage collector) to record events as they occur, writing them into an internal, low-overhead buffer.
2. CPU sampling works by periodically pausing threads (a lightweight, statistical sample, not continuous instrumentation) and recording each sampled thread's current stack trace, building up a statistical picture of where execution time is spent over the recording's duration.
3. Allocation sampling similarly records a statistical sample of allocation call sites and sizes, rather than tracking every single allocation, which is what keeps its overhead low enough for production use.
4. A thread dump, by contrast, is not sampled at all — `jstack` (or an equivalent mechanism) brings every thread to a safepoint simultaneously and records each one's complete current state and stack trace in that single instant, which is why it is a genuine snapshot rather than an aggregate.
5. A heap dump similarly captures the entire object graph at one instant, which a heap analysis tool then processes to compute reachability paths from GC roots to any specific object of interest, directly applying Lesson 2's reachability model as an actual diagnostic technique rather than an abstract concept.

## Common mistakes

**Mistake 1: reaching for a specific profiling tool before narrowing which resource is actually constrained.** Running a CPU profiler against a lock-contention problem, for instance, shows misleading or unhelpful data because the actual bottleneck (waiting, not computing) is not what a CPU profiler measures. Fix: identify CPU-bound, allocation-heavy, lock-contended, or I/O-bound as the likely category first, and choose the matching tool.

**Mistake 2: taking only a single thread dump to diagnose a hang.** A single snapshot cannot distinguish a genuinely stuck thread from one merely sampled mid-progress. Fix: take several thread dumps a few seconds apart and compare stack traces across them.

**Mistake 3: diagnosing a memory-growth symptom without a heap dump's reference-path analysis.** Guessing which code "probably" holds the retained objects, without examining actual reference paths from GC roots, is exactly the folklore-tuning approach this chapter's description warns against. Fix: take a heap dump and examine the actual retention paths to the objects that should have been collected.

**Mistake 4: avoiding profiling in production due to overhead concerns, when JFR specifically is designed to be low-overhead enough for exactly that use.** This leaves production performance problems undiagnosed because the only evidence available is a synthetic, possibly unrepresentative local reproduction. Fix: use JFR for production-safe, low-overhead recording rather than assuming all profiling is too expensive to run live.

## Best practices

- Narrow "it's slow" to a specific resource category (CPU, allocation/GC, lock contention, I/O) before choosing a diagnostic tool.
- Use JFR as a default first step for production performance investigation, given its low overhead and broad event coverage in a single recording.
- Take multiple thread dumps a few seconds apart when diagnosing a hang, and compare stack traces across them rather than trusting a single snapshot.
- Use heap dump reference-path analysis, not guesswork, to diagnose why an object is not being garbage collected.
- Let the evidence choose the fix — a lock-contention finding calls for a different remedy than a CPU-bound finding, even though both symptoms can look identical to an end user.

## Summary

- "It's slow" must be narrowed to a specific resource (CPU, allocation/GC pressure, lock contention, I/O) before any profiling tool can give a useful answer.
- CPU profiling (flame graphs) shows where execution time is spent; allocation profiling shows where garbage is created; lock profiling shows where threads wait on synchronization — each answers a genuinely different question.
- Java Flight Recorder (JFR) is a low-overhead, always-available JVM facility that can record CPU, allocation, GC, and lock evidence together, safe enough to run in production.
- A thread dump is a complete snapshot of every thread's state and stack at one instant, best used (taken more than once) to diagnose hangs and deadlocks.
- Retained-object investigation specifically requires heap dump analysis and reference-path tracing from GC roots, not a compiler warning or an unrelated signal like HTTP status codes.

## Practice

1. **Warm-up:** For each of the following symptoms, name the right kind of evidence to gather first: (a) CPU pegged at 100% with unclear cause, (b) memory growing steadily under stable load, (c) requests slow but CPU mostly idle.
2. **Warm-up:** Explain why running a CPU profiler against a lock-contention problem produces misleading or unhelpful results.
3. **Core:** Start a JFR recording against a small program with a deliberately CPU-heavy loop and a deliberately allocation-heavy loop, and use `jfr print` to identify which code path dominates each category of evidence.
4. **Core:** Reproduce a lock-contention scenario (two threads competing heavily for one lock protecting more work than necessary), take a thread dump while it runs, and identify the `BLOCKED` thread and the lock it is waiting for.
5. **Challenge:** Take two thread dumps a few seconds apart from a hung or deliberately stuck program, compare the stack traces, and identify which thread's identical stack trace across both dumps confirms it is genuinely stuck rather than merely sampled mid-progress.

## Check your understanding

1. Why can a CPU profiler give misleading results when the actual bottleneck is threads waiting on a contended lock rather than genuine computation?
2. What specific question does an allocation profiler answer that a CPU profiler does not?
3. Why is Java Flight Recorder specifically well-suited to running in production, compared to some other profiling approaches?
4. Why is taking a single thread dump often insufficient to confirm a thread is genuinely stuck rather than merely sampled mid-progress?
5. Why does diagnosing "why isn't this object being garbage collected" specifically require heap dump reference-path analysis rather than a CPU or allocation profile?
6. What is the practical risk of reaching for a specific profiling tool before narrowing down which resource is actually constrained?
