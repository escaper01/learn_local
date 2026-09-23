# CPU, allocation, lock, I/O profiling, JFR, and thread dumps

## Choose evidence for the symptom
CPU profiling shows where execution spends processor time. Allocation profiling identifies churn. Heap analysis finds retained objects. Thread dumps reveal waiting and locking. I/O latency may dominate even when CPU is nearly idle.

```text
jcmd <pid> Thread.print
jcmd <pid> JFR.start name=academy duration=60s filename=academy.jfr
```
These external commands require a suitable JDK and access to the target process. Profiling files can contain sensitive operational details; store them appropriately. Inspect the process list rather than guessing a PID.

## Experiment
Define a reproducible request mix, data volume, concurrency, and objective. Capture a baseline, change one dominant cause, then repeat. A faster mean can hide worse high-percentile latency. A flame-graph width represents sampled work, not necessarily one long invocation.

## Practice
Seed a slow loop, excess allocation, and lock contention as separate experiments. Select a diagnostic for each before changing code. Document what evidence would disprove your hypothesis. Do not profile an unrepresentative idle program and conclude the service has no performance issue.
