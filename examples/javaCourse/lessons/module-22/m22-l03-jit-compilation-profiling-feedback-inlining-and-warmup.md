# JIT compilation, profiling feedback, inlining, and warmup

The JVM does not run your bytecode the same way from the first call to the millionth. It starts by interpreting it directly, watches which methods run often enough to matter, and progressively compiles those "hot" methods into optimized native machine code — using information only available at runtime, which is exactly what makes this a genuinely different, and in some ways more powerful, process than the ahead-of-time compilation languages like C or Rust perform once, before the program ever runs. This lesson explains that process well enough to understand why a naive microbenchmark of a single, cold method call can be deeply misleading.

What you will learn:

- Interpretation versus compilation, and why the JVM starts with the slower option
- Tiered compilation: C1 (fast to compile, less optimized) and C2 (slow to compile, heavily optimized)
- How profiling feedback — data collected *while running* — drives compilation decisions no ahead-of-time compiler could make
- Inlining: replacing a method call with its body, and why it is the optimization that enables many others
- Speculative optimization and deoptimization: betting on what usually happens, and correcting the bet when it fails
- Why warmup time exists, and why a naive microbenchmark measuring a single early call is misleading

## Interpretation versus compilation

When a JVM first loads a class, its methods' bytecode is executed by the **interpreter** — a loop that reads each bytecode instruction and performs the corresponding operation, one instruction at a time, with no native machine code generated for that method at all yet. This is flexible and starts instantly (no compilation delay before the first call can run), but it is slow compared to native code: every single execution re-interprets the same bytecode instructions from scratch.

The **JIT (Just-In-Time) compiler** monitors method invocation counts (and loop back-edge counts, for long-running loops) and, once a method crosses a threshold, compiles it into native machine code — code the CPU can execute directly, without the interpreter's per-instruction overhead. This compiled version then replaces the interpreted one for all future calls to that method.

## Tiered compilation: C1 and C2

Modern JVMs (HotSpot, the reference implementation) use **tiered compilation**, employing two different compilers with different trade-offs between compilation speed and the quality of the resulting code:

| Tier | Compiler | Compiles quickly? | Optimization level |
|---|---|---|---|
| Interpreted | — | N/A (no compilation) | None |
| C1 (client compiler) | Fast, lightly optimizing | Yes | Modest — good enough to beat the interpreter quickly |
| C2 (server compiler) | Slow, heavily optimizing | No — takes longer to compile | Aggressive — inlining, speculative optimizations, and more |

A method typically progresses through these tiers: interpreted first, then C1-compiled once it is called often enough to be worth a quick compilation, and finally C2-compiled if it remains hot enough over a longer period to justify C2's more expensive, more thorough optimization pass. This staged approach avoids paying C2's high compilation cost for methods that turn out to be called only a handful of times (which C1, or even the interpreter, already handled adequately), while still eventually giving genuinely hot methods the most aggressive optimization available.

## Profiling feedback: information no ahead-of-time compiler has

The single most important idea in this lesson, and what makes the JIT compiler capable of things an ahead-of-time compiler fundamentally cannot do: **while a method runs interpreted or under C1**, the JVM collects **profiling data** — which branches of an `if` are actually taken, which concrete implementation an interface call actually resolves to at each call site, typical array lengths, and more. When C2 later compiles that method, it uses this *real, observed* runtime behavior to make optimization decisions an ahead-of-time compiler, working only from the source code with no execution history at all, could never make with the same confidence.

```java
public class ProfileGuidedExample {

    interface Shape { double area(); }
    record Circle(double radius) implements Shape {
        public double area() { return Math.PI * radius * radius; }
    }
    record Square(double side) implements Shape {
        public double area() { return side * side; }
    }

    static double totalArea(List<Shape> shapes) {
        double total = 0;
        for (Shape shape : shapes) {
            total += shape.area(); // a "polymorphic" call site — which implementation actually runs varies
        }
        return total;
    }
}
```

If, in practice, `totalArea` is called overwhelmingly with a `List` containing only `Circle` instances, the profiler observes this and C2 can perform **type-specialized inlining**: compiling `shape.area()` as if it were a direct, non-virtual call to `Circle.area()`, with a cheap runtime check confirming the assumption still holds, rather than paying the cost of a genuine virtual dispatch on every single call. This kind of speculative, profile-driven optimization is exactly the mechanism the next section covers in more depth, and it is simply unavailable to a compiler that never observed the program actually running with real data.

## Inlining: the optimization that enables other optimizations

**Inlining** replaces a method call with a copy of that method's own body directly at the call site, eliminating the call's own overhead (setting up a new stack frame, jumping to a different location) and — just as importantly — exposing the inlined code to *further* optimization in the context of its caller, optimizations that would not have been visible looking at either method in isolation:

```java
static int square(int x) { return x * x; }

static int sumOfSquares(int a, int b) {
    return square(a) + square(b);
}

// After inlining, C2 effectively optimizes something closer to:
static int sumOfSquares_inlined(int a, int b) {
    return (a * a) + (b * b); // no method-call overhead at all, and further optimizable as one expression
}
```

Inlining is why a small, frequently called helper method (a getter, a simple arithmetic function) very often costs nothing at all once C2 has compiled the hot code path containing it — the concern, common among developers unfamiliar with JIT compilation, that "extracting this into a small method will slow things down due to call overhead" is usually unfounded for genuinely hot code, precisely because the JIT compiler eliminates that overhead via inlining once the method is called often enough to matter. Inlining has practical limits (a method's bytecode size, call-site depth, and the JVM's own inlining budget all bound how aggressively it happens), but understanding that it exists at all changes how you should think about "does breaking this into smaller methods cost performance" for hot code.

## Speculative optimization and deoptimization

C2 sometimes compiles code based on an assumption that is very likely true, given everything observed so far, but not *guaranteed* true forever — this is **speculative optimization**. The earlier `totalArea` example, assuming every `Shape` is actually a `Circle`, is exactly this kind of speculation. The JVM guards every such assumption with a cheap runtime check; if the assumption is ever violated (a `Square` genuinely does appear in the list), the JVM performs **deoptimization**: it discards the speculatively compiled native code for that method, falls back to the interpreter for that specific call, and — if the method remains hot — eventually recompiles it again, this time accounting for the new, broader reality the profiling data now reflects.

```text
Compiled assuming: every Shape passed to totalArea is a Circle (based on profiling so far)
Runtime check: "is this shape actually a Circle?" — cheap, added by the compiler itself
If the check fails (a Square appears): deoptimize — discard the compiled code,
fall back to the interpreter, recompile later with updated, broader profiling data.
```

This is not a failure or a bug — it is the JIT compiler deliberately betting on the common case for a real performance win, with a safety net that costs a one-time deoptimization (falling back to slower execution briefly) if that bet turns out wrong, rather than either refusing to ever specialize (leaving performance on the table for the overwhelmingly common case) or specializing unsafely (producing incorrect results the moment an unexpected type appears). A workload whose actual behavior shifts significantly over time (heavy use of one implementation early, a different one later) can trigger repeated deoptimization/recompilation cycles, which is itself a diagnosable performance symptom, distinct from ordinary warmup.

## Warmup: why the first calls are always slower

Putting the whole picture together explains **warmup**: a JVM process, immediately after starting, runs every method interpreted, with no profiling data yet collected and no compiled code yet produced. Performance improves progressively as methods cross their invocation thresholds, get C1-compiled, accumulate more profiling data, and eventually get C2-compiled with speculative, profile-guided optimizations applied. This is why a long-running server process reaches its "steady state" performance only after a genuine warmup period under real (or realistic) load, and why the very first requests to a freshly started service are measurably, sometimes dramatically, slower than requests served an hour later — nothing is "broken"; the JIT compiler simply has not yet had the chance to do its work.

## Why a naive microbenchmark is misleading

This chapter's concept-check question names the practical consequence directly: a **naive microbenchmark** — calling a method once, timing it with `System.nanoTime()`, and reporting that single measurement — can be deeply misleading, for several compounding reasons this lesson has now built up the vocabulary to name precisely:

```java
// NAIVE AND MISLEADING: measures a single cold call, before any JIT compilation has occurred at all.
long start = System.nanoTime();
int result = expensiveComputation(42);
long elapsed = System.nanoTime() - start;
System.out.println("took " + elapsed + " ns"); // measures the INTERPRETER, not the eventual compiled code
```

- **Warmup**: the measured call almost certainly ran interpreted, or under a lightly optimized C1 compilation at best — nothing like the C2-compiled, speculatively optimized code the method would eventually run as under sustained real load.
- **Dead-code elimination**: if `result` is never used for anything observable (never printed, never returned, never affecting a later computation), an aggressive JIT compiler can determine the entire computation has no effect on the program's observable behavior and eliminate it entirely — timing "nothing happening" and reporting it as the method's cost.
- **Constant folding**: if the input (`42`, here) is a compile-time constant and the method is pure, the compiler may compute the result once, at compile time, rather than executing the method's logic at all during the timed run.

A properly constructed microbenchmark (using a dedicated tool like JMH — Java Microbenchmark Harness — rather than hand-rolled timing) deliberately runs many warmup iterations before measuring, uses the result in a way the compiler cannot optimize away (a "black hole" sink), and reports statistics across many measured iterations rather than a single call — specifically to avoid every one of the pitfalls this lesson just explained.

## What happens under the hood: from a cold method to a speculatively optimized one

1. A method is first executed via the interpreter, with the JVM incrementing an invocation counter (and, for loops, a back-edge counter) each time it runs, and simultaneously recording profiling data about branches taken and concrete types observed at each call site.
2. Once the invocation counter crosses a threshold, the method is queued for C1 compilation, which produces a quickly generated, lightly optimized native version — this replaces the interpreted execution for future calls, immediately.
3. If the method remains hot over a longer observation window, it is queued for C2 compilation, which uses the profiling data accumulated so far to make aggressive, speculative optimization decisions (type-specialized inlining, branch prediction based on observed frequency, and more).
4. Each speculative optimization is guarded by a cheap runtime check; if the assumption underlying it is ever violated, the JVM deoptimizes that specific compiled method, discarding the native code and falling back to interpretation for it, while continuing to collect updated profiling data.
5. If the method remains hot after deoptimization, it is eventually recompiled, now incorporating the broader, updated profiling picture — this cycle (interpret, profile, compile, speculate, deoptimize if wrong, recompile) continues for the life of the process, adapting to the program's actual observed behavior rather than a single, fixed, ahead-of-time analysis.

## Common mistakes

**Mistake 1: timing a single cold method call and treating it as representative of steady-state performance.** This measures interpreted or lightly-compiled execution, nothing like the eventual JIT-optimized code path under sustained load. Fix: use a proper warmup period (or a dedicated benchmarking tool like JMH) before measuring anything meant to represent real performance.

**Mistake 2: writing a microbenchmark whose result is never used.** Dead-code elimination can remove the entire computation being timed, silently measuring nothing. Fix: consume the result in a way the compiler cannot optimize away, or use a benchmarking harness that handles this correctly.

**Mistake 3: avoiding small, well-named helper methods out of a belief that method-call overhead will hurt performance.** For genuinely hot code, the JIT compiler's inlining typically eliminates this overhead entirely; the readability cost of avoiding small methods is paid for a performance concern that usually does not apply. Fix: write clear, well-decomposed code first, and only inline manually (an anti-pattern in most cases) if profiling evidence from the next lesson shows a genuine, specific problem.

**Mistake 4: misdiagnosing repeated deoptimization/recompilation cycles as ordinary warmup.** A workload whose actual behavior shifts meaningfully over time can trigger this repeatedly, well past any reasonable warmup window, and it has a different underlying cause than simple cold-start warmup. Fix: recognize sustained, recurring compilation activity (visible in JIT-specific logging) as its own diagnosable symptom, distinct from a one-time warmup period.

## Best practices

- Never trust a single timed method call as representative of real, steady-state performance; account for warmup explicitly.
- Use a dedicated benchmarking tool (JMH) for any measurement meant to inform a real performance decision, rather than hand-rolled `System.nanoTime()` timing.
- Write clear, well-decomposed code with small methods by default; trust the JIT compiler's inlining for genuinely hot code rather than manually inlining for a performance concern that usually does not apply.
- Understand deoptimization as a normal, deliberate safety mechanism for speculative optimization, not a bug — but recognize sustained, recurring deoptimization as its own diagnosable symptom worth investigating.
- Give a production service a genuine warmup period (real or synthetic load) before trusting its performance to represent steady state, especially before load-testing conclusions or capacity planning decisions.

## Summary

- The JVM starts by interpreting bytecode and progressively JIT-compiles methods that run often enough to justify the cost, using tiered compilation (C1 for speed, C2 for aggressive optimization).
- Profiling data collected while a method actually runs — branches taken, concrete types observed — lets C2 make optimization decisions no ahead-of-time compiler could make, since that compiler never observed the program executing with real data.
- Inlining replaces a method call with its body, eliminating call overhead and exposing the inlined code to further optimization; this is why small, frequently called helper methods typically cost nothing once hot code is JIT-compiled.
- Speculative optimization bets on the common case observed so far, guarded by a cheap runtime check; deoptimization falls back to the interpreter if that bet is ever violated, then recompiles with updated data.
- A naive microbenchmark measuring a single cold call is misleading due to warmup, dead-code elimination, and constant folding; proper benchmarking (JMH) accounts for all three deliberately.

## Practice

1. **Warm-up:** Explain why the very first request to a freshly started server is typically slower than the same request served an hour later, in terms of the compilation stages this lesson covers.
2. **Warm-up:** A microbenchmark computes a result from a compile-time-constant input and never uses the result. Name the two specific JIT behaviors that could make this benchmark report a misleadingly low (or zero) time.
3. **Core:** Write a naive, hand-rolled microbenchmark timing a single call to a pure function, then rewrite it using a proper warmup loop and a result sink, and compare the two reported timings.
4. **Core:** Construct a polymorphic call site (an interface method called through a list of mixed concrete types) and reason through, in prose, what profiling data the JIT compiler would collect and how it might speculatively optimize the call if one implementation dominates.
5. **Challenge:** Using JMH (or a careful manual approximation), measure a method's performance across a genuine warmup period followed by many measured iterations, and compare the steady-state result against a single naive cold-call timing of the same method.

## Check your understanding

1. Why does the JVM start by interpreting bytecode rather than compiling every method immediately at startup?
2. What is the practical difference in purpose between the C1 and C2 compilers in tiered compilation?
3. What specific kind of information does profiling feedback give the JIT compiler that an ahead-of-time compiler could never have?
4. Why does inlining a method call sometimes enable further optimizations that would not have been visible otherwise?
5. What does deoptimization do, and why is it a deliberate, necessary safety mechanism rather than a bug?
6. Name two specific ways a naive, single-call microbenchmark can report a misleading result, and how a tool like JMH avoids each one.
