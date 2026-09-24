# Reachability, generations, collectors, pauses, throughput, and latency

Java has no manual `free()`, and this lesson explains precisely what replaces it: **reachability**, not reference counting, is what determines whether an object can be reclaimed — a distinction that directly answers a question every developer eventually asks about a cycle of objects referencing each other. It then covers why modern collectors divide the heap into generations, and the fundamental throughput-versus-latency trade-off that explains why "the best garbage collector" is not a single, universal answer.

What you will learn:

- Why Java uses reachability from GC roots, not reference counting, and what that means for cyclic references
- What counts as a GC root, and how tracing works from there
- The generational hypothesis: why most objects die young, and how young/old generations exploit that
- The three collectors this course covers at a conceptual level: Serial, G1, and ZGC/Shenandoah
- The throughput-versus-latency trade-off, and why there is no universally "best" collector
- How to read basic GC log output to see pause times and collection frequency

## Reachability, not reference counting

A naive garbage collection strategy might count how many references point to each object, reclaiming it the moment that count hits zero — but Java deliberately does not work this way, precisely because reference counting cannot handle a **cycle**: two or more objects referencing each other, with no reference to either one from anywhere else, would keep each other's count above zero forever under pure reference counting, even though nothing in the rest of the program can ever reach them again.

```java
public class CycleDemo {
    Object partner;

    public static void main(String[] args) {
        CycleDemo a = new CycleDemo();
        CycleDemo b = new CycleDemo();
        a.partner = b;
        b.partner = a; // a and b now reference each other

        a = null;
        b = null;
        // Neither local variable references the pair anymore.
        // Under naive reference counting, each object's count would still be 1 (from the other),
        // and neither would ever be reclaimed. Java's collectors do NOT work this way.
    }
}
```

Java's collectors instead determine reachability by **tracing** outward from a fixed set of **GC roots** — local variables currently on any thread's stack, static fields, and a handful of other JVM-internal anchors (active JNI references, and similar) — following every reference transitively. An object is **reachable** if some path of references leads to it from a GC root; anything not reachable, cycle or not, is eligible for collection. In the example above, once both `a` and `b` are set to `null`, no GC root reaches either object anymore — the fact that they still reference *each other* is irrelevant, because reachability is checked from the roots, not by counting incoming references. This directly answers this chapter's concept-check question: a self-contained cycle with no path from any root is collectible, and every mainstream Java collector reclaims it without any special handling.

## The generational hypothesis

Decades of empirical observation across real Java programs established the **generational hypothesis**: most objects die young — a short-lived object created for a single method call, a temporary string, an iterator — and objects that survive one collection are disproportionately likely to survive many more (a long-lived cache, a singleton service, a connection pool). Modern collectors exploit this directly by dividing the heap into generations and collecting them with different strategies:

```text
Young generation (Eden + two Survivor spaces):
  - Most allocations happen here first.
  - Collected frequently ("minor GC"), and cheaply, because most objects here
    are already dead by the time collection runs.
  - Objects that survive several young collections are PROMOTED to the old generation.

Old generation:
  - Holds long-lived objects that have survived enough young collections.
  - Collected less frequently ("major/full GC"), because most old-generation
    objects are still alive whenever this does run — scanning them is more
    expensive per byte, so it happens far less often.
```

A young generation collection is fast specifically because it only needs to identify the (typically small) fraction of young objects that are *still alive* and copy them elsewhere (to a survivor space, or promote them to old), rather than doing any work at all for the (typically large) fraction that already died — this asymmetry, entirely a consequence of the generational hypothesis actually holding true for most real workloads, is why generational collection outperforms scanning the entire heap uniformly on every collection.

## Serial, G1, and ZGC/Shenandoah: three points on a trade-off

Different collectors make different choices about how to trade collection **pause time** (how long the application's threads are stopped, or "stop-the-world," during collection) against **throughput** (what fraction of total CPU time goes to running the application versus running the collector):

| Collector | Pause characteristic | Best suited for |
|---|---|---|
| **Serial** | Single-threaded collection; stop-the-world pauses scale with heap size | Small heaps, single-core environments, or applications where pause time genuinely does not matter |
| **G1** (Garbage-First, the default in modern JDKs) | Divides the heap into regions, collects the most garbage-dense regions first; pauses are typically bounded to a target (`-XX:MaxGCPauseMillis`) but not hard-guaranteed | General-purpose applications wanting a reasonable balance of throughput and pause time |
| **ZGC** / **Shenandoah** | Concurrent, low-latency collectors designed to keep pauses in the single-digit milliseconds even on very large heaps, doing most of their work concurrently with running application threads | Latency-sensitive applications (interactive services, anything with strict response-time requirements) willing to trade some throughput for consistently low pauses |

```text
-XX:+UseSerialGC
-XX:+UseG1GC             # default on modern JDKs
-XX:+UseZGC
-XX:+UseShenandoahGC
```

There is no universally "best" collector, and this is a direct, load-bearing consequence of the throughput-versus-latency trade-off, not an oversight in collector design: a batch job that runs overnight with no user waiting on individual response times benefits from a throughput-optimized collector willing to accept occasional longer pauses in exchange for less total CPU spent on collection overall, while an interactive service where a 500ms pause is a visible, user-facing latency spike needs a collector that keeps pauses consistently low, even if that costs somewhat more total CPU. Choosing a collector is choosing a point on this trade-off deliberately, informed by the application's actual latency requirements — not picking whichever one is rumored to be "fastest" in the abstract.

## Reading GC log output

Enabling GC logging turns the previously invisible behavior of a collector into concrete, readable evidence — exactly the "investigate with representative evidence" discipline this chapter's description names as its central theme:

```text
-Xlog:gc*:file=gc.log:time,uptime,level,tags
```

```text
[2.145s][info][gc,start] GC(12) Pause Young (Normal) (G1 Evacuation Pause)
[2.145s][info][gc,heap ] GC(12) Eden regions: 40->0(42)
[2.145s][info][gc,heap ] GC(12) Survivor regions: 2->3(6)
[2.145s][info][gc,heap ] GC(12) Old regions: 8->11
[2.151s][info][gc      ] GC(12) Pause Young (Normal) (G1 Evacuation Pause) 168M->96M(256M) 6.234ms
```

The critical line's last portion, `168M->96M(256M) 6.234ms`, says everything a first-pass diagnosis needs: **168M** of heap in use before this collection, **96M** still in use immediately after (so 72M was reclaimed as garbage), out of a total heap of **256M**, and the collection itself paused the application for **6.234 milliseconds**. Reading a sequence of these lines over time reveals patterns a single snapshot cannot: collections happening with increasing frequency (a sign of rising allocation rate, or shrinking effective heap headroom), post-collection usage trending upward over many collections (a specific signal worth investigating as a possible memory leak, covered in Lesson 5), or pause times growing longer (worth investigating against the chosen collector's known behavior under the current heap size and object graph shape).

## What happens under the hood: from an unreachable object to reclaimed memory

1. A collection cycle begins (triggered by an allocation that cannot be satisfied by available heap space in the relevant generation, or on a schedule for certain concurrent collectors).
2. The collector identifies the current set of GC roots — every thread's stack (local variables), every static field, and other JVM-internal anchors — as its starting points.
3. It traces outward from each root, following every reference transitively, marking every object reached as **live**; this trace naturally includes objects reachable only through a chain of several references, and naturally excludes a cycle with no path from any root, regardless of how many objects reference each other within that cycle.
4. Every object not marked live during this trace is, by definition, unreachable, and its memory is reclaimed — for a generational young-generation collection, live objects are typically copied to a survivor space (or promoted to the old generation if they have survived enough prior collections), and the region they occupied is then treated as entirely free.
5. For a stop-the-world phase (present, to varying degrees, in every collector, though modern low-latency collectors minimize its duration), application threads are paused for the portion of this work that cannot safely run concurrently with continued mutation of the object graph, and resumed once that phase completes.

## Common mistakes

**Mistake 1: assuming a cycle of objects referencing each other can never be garbage collected.** Java's collectors trace reachability from roots, not reference counts, so a cycle with no path from any root is collected exactly like any other unreachable object. Fix: understand reachability-from-roots as the actual model, and stop worrying about cycles as a special case requiring manual breaking.

**Mistake 2: choosing a collector based on reputation rather than the application's actual latency requirements.** "G1 is the default so it must be best" or "ZGC is the newest so it must be fastest" both skip the actual trade-off analysis. Fix: choose based on whether the application is genuinely latency-sensitive (favoring ZGC/Shenandoah) or throughput-oriented with tolerant pause requirements (favoring G1 or Serial for small heaps).

**Mistake 3: never enabling GC logging, and diagnosing memory or pause problems purely from symptoms (slow requests, high CPU) without the collector's own evidence.** This is exactly the "folklore tuning" this chapter's description warns against. Fix: enable GC logging and read actual pause times, heap occupancy trends, and collection frequency before changing any tuning flag.

## Best practices

- Understand reachability-from-roots as the actual model determining what gets collected; do not treat cyclic references as requiring any special handling.
- Choose a collector deliberately based on the application's actual throughput-versus-latency needs, not by reputation or default assumption.
- Enable GC logging on any application where memory or pause behavior matters, and read it as the primary evidence before tuning anything.
- Watch post-collection heap occupancy trends over many collections, not just individual pause times, as an early signal worth investigating for a possible leak.
- Treat "the best garbage collector" as a question with no universal answer — only an answer specific to a given application's actual latency and throughput requirements.

## Summary

- Java determines what can be collected by tracing reachability from GC roots, not by counting references — a cycle with no path from any root is fully collectible.
- The generational hypothesis (most objects die young; survivors tend to keep surviving) is why heaps are divided into young and old generations, collected with different frequency and strategy.
- Serial, G1, and ZGC/Shenandoah represent different points on the throughput-versus-latency trade-off; there is no universally "best" collector, only one best suited to a given application's actual requirements.
- GC log output reports heap occupancy before and after each collection and its pause duration, and is the primary evidence for diagnosing memory and pause behavior, rather than guessing from indirect symptoms.

## Practice

1. **Warm-up:** Explain, using the reachability-from-roots model, why two objects referencing each other but reachable from nothing else are still eligible for garbage collection.
2. **Warm-up:** For a latency-sensitive interactive service versus an overnight batch job, explain which collector characteristic (pause time or throughput) matters more for each, and why.
3. **Core:** Enable GC logging on a small program that allocates heavily in a loop, and read the resulting log to identify the collection frequency and typical pause time.
4. **Core:** Write a program that deliberately creates and discards a cyclic reference structure repeatedly in a loop, and confirm (via heap usage monitoring) that memory does not grow unbounded despite the cycles.
5. **Challenge:** Run the same workload under two different collectors (for example G1 and a low-latency collector), compare the GC log output for pause time distribution and overall throughput, and explain the trade-off the numbers reveal.

## Check your understanding

1. Why does a self-contained cycle of objects referencing only each other not prevent garbage collection in Java?
2. What is a GC root, and what role does the set of GC roots play in determining reachability?
3. What is the generational hypothesis, and how does it justify collecting young and old generations differently?
4. Why is there no universally "best" garbage collector, in terms of the trade-off this lesson names?
5. In a GC log line like `168M->96M(256M) 6.234ms`, what does each of the four numbers represent?
6. Why should GC log evidence, rather than indirect symptoms alone, guide a decision to change garbage collection tuning?
