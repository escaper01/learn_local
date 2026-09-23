# JIT compilation, profiling feedback, inlining, and warmup

## The executing code changes over time
The JVM can interpret code, compile hot paths, inline calls, and use observed type profiles to optimize. If assumptions stop holding, it can deoptimize. Startup performance and steady-state performance are therefore different measurements.

```java
long start = System.nanoTime();
long result = calculate(input);
long elapsed = System.nanoTime() - start;
System.out.println(result + ":" + elapsed);
```
This measures one call but does not establish a reliable microbenchmark. Dead-code elimination, constant folding, warmup, GC, competing processes, and timer overhead can dominate.

## Benchmark discipline
Use a benchmark harness such as JMH in a separate dependency-managed project. Consume results, vary realistic inputs, use warmup and independent forks, and report distributions and environment. Do not put artificial loops inside benchmarks unless the workload genuinely has them.

## Practice
Compare a constant computation with one using varying inputs. Explain why the optimizer may remove one. Separate cold-start from warmed measurements. Require a workload and effect size before replacing clear application code with a clever micro-optimization.
