# Containers, runtime images, configuration, health, and graceful shutdown

"It works on my machine" stops being funny the first time a release fails at 2 a.m. because production has a different JDK, a missing environment variable, or a memory limit your laptop never had. Containers solve the packaging half of that problem: you build one immutable image containing your application and its runtime, and that exact image moves from test to production. The other half is behavior: the platform that runs your container (Docker, Kubernetes, a cloud service) will start it, probe it, route traffic to it, and eventually kill it. A professional Java service cooperates with every one of those steps.

What you will learn:

- What a container image contains, and what it must never contain.
- How to write a multi-stage Dockerfile for a Java 21 service that runs as a non-root user.
- How `jdeps` and `jlink` build a smaller custom Java runtime, and when that is worth it.
- How the JVM sizes its heap inside a memory-limited container, and why the heap is not the whole budget.
- How to load, validate, and protect configuration and secrets from the environment.
- The difference between liveness, readiness, and startup probes.
- How a graceful shutdown works, step by step, and what `shutdown`, `awaitTermination`, and `shutdownNow` really do.

## Images and containers in one picture

An *image* is a read-only, layered filesystem snapshot plus metadata (which command to run, which user, which ports). A *container* is a running process started from that image, isolated with its own filesystem view, network, and resource limits. The analogy that holds up well: the image is a sealed, labelled lunchbox prepared in the kitchen; a container is one lunch being eaten. You can serve a hundred identical lunches from the same recipe, and none of them changes the recipe.

That gives the key rules:

- Build once, promote the same image through every environment. Rebuilding for production means production runs something you never tested.
- The image holds code and runtime, not configuration that differs per environment, and never secrets.
- Containers are disposable. Anything that must survive a restart (uploads, the database) lives in a volume or an external service, not in the container's writable layer.

## A multi-stage Dockerfile for a Java service

A multi-stage build compiles in one image that has the full JDK and build tool, then copies only the result into a small runtime image. The build tools, source code, and caches never reach production.

This Dockerfile cannot be built in this course environment; it is a reviewed reference for a Maven project that produces `target/task-service.jar` plus its dependencies in `target/lib` (for example with the `maven-dependency-plugin`).

```dockerfile
# Stage 1: compile and test with the full JDK
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -ntp dependency:go-offline
COPY src src
RUN ./mvnw -B -ntp package

# Stage 2: build a minimal Java runtime containing only the modules we use
FROM eclipse-temurin:21-jdk-jammy AS runtime-builder
COPY --from=build /workspace/target/task-service.jar /tmp/app.jar
COPY --from=build /workspace/target/lib /tmp/lib
RUN jdeps --ignore-missing-deps --multi-release 21 --print-module-deps \
        --class-path '/tmp/lib/*' /tmp/app.jar > /tmp/modules.txt \
 && jlink --add-modules "$(cat /tmp/modules.txt)" \
        --strip-debug --no-man-pages --no-header-files --compress=zip-6 \
        --output /opt/java

# Stage 3: the production image
FROM ubuntu:jammy
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home app
COPY --from=runtime-builder /opt/java /opt/java
COPY --from=build /workspace/target/task-service.jar /app/app.jar
COPY --from=build /workspace/target/lib /app/lib
ENV PATH="/opt/java/bin:${PATH}" \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-cp", "/app/app.jar:/app/lib/*", "com.example.tasks.Main"]
```

Walk through the important decisions:

- The dependency download layer comes before `COPY src`, so editing source code does not invalidate the cached dependency layer. Order layers from least to most frequently changed.
- `jdeps --print-module-deps` lists the JDK modules your code and libraries use (for example `java.base,java.logging,java.sql`). `jlink` then assembles a runtime with only those modules. A typical service runtime shrinks from roughly 200 MB for a full JDK to well under 100 MB.
- The final stage copies files owned by root and runs as UID 10001, so the application process cannot modify its own code even if an attacker gets code execution.
- `ENTRYPOINT` uses the JSON *exec form*. The `java` process becomes PID 1 and receives signals directly. The launcher expands the `lib/*` classpath wildcard itself, so no shell is needed.
- `-XX:+ExitOnOutOfMemoryError` makes the JVM exit on the first `OutOfMemoryError` so the platform restarts a clean process instead of leaving a half-broken one serving errors.

> **Warning:** `jlink` cannot see modules loaded only through reflection or `ServiceLoader` at runtime, such as extra crypto providers, JDBC drivers discovered dynamically, or locale data. Add such modules explicitly (for example `jdk.crypto.ec` or `jdk.localedata`) and run your full test suite against the custom runtime. If your framework produces a single "fat" jar, `jdeps` may struggle to analyze it; a prebuilt JRE base image such as `eclipse-temurin:21-jre-jammy` is a perfectly professional alternative.

> **Tip:** For releases, pin base images by digest (`FROM ubuntu:jammy@sha256:...`) rather than a floating tag, record the digest, and rebuild on a schedule to pick up security patches deliberately.

### Running it with explicit limits

```bash
docker build -t task-service:1.4.0 .
docker run --rm --name tasks \
  --memory=512m --cpus=1 \
  --read-only --tmpfs /tmp:rw,size=64m \
  -p 127.0.0.1:8080:8080 \
  --env-file ./tasks.env \
  task-service:1.4.0
```

`--read-only` makes the container filesystem immutable, and `--tmpfs /tmp` gives the JVM and libraries a small, bounded scratch area. Declaring writable paths explicitly is a good security habit and quickly reveals code that writes to surprising places. The port is bound to loopback here for local testing only.

## The JVM inside a memory limit

Since JDK 10, the JVM is container-aware: it reads the cgroup limits and sizes itself from the container's memory and CPU quota instead of the host's. By default the maximum heap is 25 percent of available memory, which is conservative for a container that runs only one JVM. `-XX:MaxRAMPercentage` changes that fraction.

This program prints what the JVM believes about its environment:

```java
public class ContainerInfo {
    public static void main(String[] args) {
        Runtime rt = Runtime.getRuntime();
        long mib = 1024 * 1024;
        System.out.println("Java version:         " + Runtime.version().feature());
        System.out.println("Available processors: " + rt.availableProcessors());
        System.out.println("Max heap (MiB):       " + rt.maxMemory() / mib);
        System.out.println("Running as user:      " + System.getProperty("user.name"));
    }
}
```

Run it with a 512 MB, 2-CPU limit and default flags:

```bash
docker run --rm --memory=512m --cpus=2 -v "$PWD:/src:ro" eclipse-temurin:21-jdk-jammy java /src/ContainerInfo.java
```

```text
Java version:         21
Available processors: 2
Max heap (MiB):       123
Running as user:      root
```

Now with `-XX:MaxRAMPercentage=75` and a numeric non-root user (`--user 10001`):

```text
Java version:         21
Available processors: 2
Max heap (MiB):       371
Running as user:      ?
```

Two lessons hide in that output. First, the heap grew from 123 MiB to 371 MiB. Second, the user name is `?` because UID 10001 has no entry in the image's `/etc/passwd`; the process still runs correctly, but create a named user (as the Dockerfile above does) so tools and logs are readable.

Why not set the heap to 100 percent? Because the heap is only part of the process. The container limit must also cover metaspace (class metadata), thread stacks (about 1 MB each for platform threads by default), the JIT code cache, garbage-collector structures, direct buffers used by network libraries, and native memory from the JVM itself. If the total crosses the limit, the kernel's OOM killer ends the process with `SIGKILL`, no Java exception, no stack trace, exit code 137. A heap of 60 to 75 percent of the limit is a reasonable starting point; measure with Native Memory Tracking (`-XX:NativeMemoryTracking=summary` and `jcmd <pid> VM.native_memory summary`) before going higher.

## Configuration and secrets

The twelve-factor rule of thumb: configuration that varies between environments (database URL, ports, feature flags, credentials) comes from the environment, not from the image. Treat configuration as untrusted input: parse it into a typed object once at startup, validate every value, report *all* problems together, and refuse to start if anything is wrong. Failing fast at startup is far kinder than failing on the first customer request.

```java
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class ConfigDemo {
    public static void main(String[] args) {
        Map<String, String> goodEnv = Map.of(
            "TASKS_DB_URL", "jdbc:postgresql://db:5432/tasks",
            "TASKS_DB_PASSWORD", "s3cr3t-value",
            "TASKS_HTTP_PORT", "8080");
        System.out.println(AppConfig.load(goodEnv));

        Map<String, String> badEnv = Map.of(
            "TASKS_HTTP_PORT", "80800",
            "TASKS_SHUTDOWN_GRACE", "ten seconds");
        try {
            AppConfig.load(badEnv);
        } catch (IllegalStateException e) {
            System.out.println("Startup aborted:\n" + e.getMessage());
        }
    }
}

record AppConfig(String dbUrl, Secret dbPassword, int httpPort, Duration shutdownGrace) {

    static AppConfig load(Map<String, String> env) {
        List<String> problems = new ArrayList<>();
        String url = required(env, "TASKS_DB_URL", problems);
        String password = required(env, "TASKS_DB_PASSWORD", problems);
        int port = intInRange(env.getOrDefault("TASKS_HTTP_PORT", "8080"), "TASKS_HTTP_PORT", 1, 65535, problems);
        int grace = intInRange(env.getOrDefault("TASKS_SHUTDOWN_GRACE", "20"), "TASKS_SHUTDOWN_GRACE", 1, 120, problems);
        if (!problems.isEmpty()) {
            throw new IllegalStateException(String.join("\n", problems));  // fail fast, list everything
        }
        return new AppConfig(url, new Secret(password), port, Duration.ofSeconds(grace));
    }

    private static String required(Map<String, String> env, String name, List<String> problems) {
        String value = env.get(name);
        if (value == null || value.isBlank()) {
            problems.add("  " + name + " is required");
        }
        return value;
    }

    private static int intInRange(String raw, String name, int min, int max, List<String> problems) {
        try {
            int value = Integer.parseInt(raw.trim());
            if (value < min || value > max) {
                problems.add("  " + name + " must be between " + min + " and " + max + " but was " + value);
            }
            return value;
        } catch (NumberFormatException e) {
            problems.add("  " + name + " must be an integer but was '" + raw + "'");
            return -1;
        }
    }
}

record Secret(String value) {
    @Override
    public String toString() {
        return "******";   // never print the real value in logs
    }
}
```

```text
AppConfig[dbUrl=jdbc:postgresql://db:5432/tasks, dbPassword=******, httpPort=8080, shutdownGrace=PT20S]
Startup aborted:
  TASKS_DB_URL is required
  TASKS_DB_PASSWORD is required
  TASKS_HTTP_PORT must be between 1 and 65535 but was 80800
  TASKS_SHUTDOWN_GRACE must be an integer but was 'ten seconds'
```

In the real application, `main` would call `AppConfig.load(System.getenv())`. The `Secret` wrapper means that logging the whole configuration object, which people do constantly while debugging, cannot leak the password. For real secrets, prefer files mounted by the platform (Kubernetes secrets, Docker secrets) or a secrets manager over plain environment variables, because environment variables are visible to anyone who can inspect the container and are often copied into crash reports.

> **Warning:** Never bake secrets into an image with `ENV`, `ARG`, or `COPY .env`. Image layers are permanent and anyone who can pull the image can read them, even if a later layer deletes the file.

## Health: liveness, readiness, and startup

The platform asks your service questions through health probes. Each probe answers a *different* question, and mixing them up causes outages.

| Probe | Question | On failure the platform... | Should check |
|---|---|---|---|
| Liveness | Is this process stuck beyond repair? | Kills and restarts the container | Only the process itself (event loop alive, no deadlock) |
| Readiness | Should traffic be routed here right now? | Stops sending new requests, keeps the process | Critical dependencies reachable, not shutting down, warmed up |
| Startup | Has the app finished starting? | Keeps waiting; liveness is paused until it passes | Initialization complete |

The crucial insight: if the database goes down, restarting every instance of your service does not fix the database. It only adds cold starts and a thundering herd of reconnects. A dependency outage is a *readiness* concern, never a *liveness* one. Likewise, an instance that is shutting down is perfectly alive but must no longer be ready, so that load balancers stop sending it new work.

Keep probes cheap. A readiness endpoint called every few seconds by several load balancers must not run expensive queries; check a connection with a short timeout, or report the cached result of a background check. Expose health and management endpoints only on an internal port or behind access control, because detailed health output reveals your architecture.

This Kubernetes manifest fragment is illustrative and cannot run here:

```yaml
spec:
  terminationGracePeriodSeconds: 30
  containers:
    - name: task-service
      image: registry.example.com/task-service:1.4.0
      ports:
        - containerPort: 8080
      resources:
        requests: { cpu: "500m", memory: "512Mi" }
        limits: { memory: "512Mi" }
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        readOnlyRootFilesystem: true
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
      startupProbe:
        httpGet: { path: /health/started, port: 8080 }
        periodSeconds: 2
        failureThreshold: 30
      livenessProbe:
        httpGet: { path: /health/live, port: 8080 }
        periodSeconds: 10
        failureThreshold: 3
      readinessProbe:
        httpGet: { path: /health/ready, port: 8080 }
        periodSeconds: 5
        failureThreshold: 2
      lifecycle:
        preStop:
          exec: { command: ["sleep", "5"] }
      volumeMounts:
        - { name: tmp, mountPath: /tmp }
  volumes:
    - name: tmp
      emptyDir: { sizeLimit: 64Mi }
```

The `preStop` sleep gives load balancers a few seconds to notice the pod is leaving before the application starts refusing connections. It requires a `sleep` binary in the image.

## Graceful shutdown

Deployments, scale-downs, and node maintenance all end your process on purpose. The platform sends `SIGTERM`, waits a grace period (30 seconds by default in Kubernetes, 10 seconds for `docker stop`), and then sends `SIGKILL`, which cannot be caught. Everything your service does to finish cleanly must happen inside that window.

### What happens under the hood

1. The platform marks the instance as terminating and begins removing it from load balancers. This happens asynchronously, so requests can still arrive for a few seconds.
2. `SIGTERM` reaches PID 1. The JVM starts its shutdown sequence and runs registered shutdown hooks on separate threads.
3. Your hook flips readiness to NOT_READY so no new work is routed here, and stops accepting new requests or messages.
4. It drains in-flight work with a deadline shorter than the grace period.
5. Work still running at the deadline is cancelled through interruption; cooperative code rolls back and exits.
6. Resources are closed in reverse order of creation: executors, then message consumers, then connection pools.
7. The JVM exits. With `SIGTERM` the exit code seen by Docker is 143 (128 + 15). If the grace period expires first, `SIGKILL` ends everything with 137.

### shutdown, awaitTermination, and shutdownNow

An `ExecutorService` has two shutdown methods with very different strength:

- `shutdown()` stops accepting new tasks but lets running and already-queued tasks finish. It returns immediately; it does not wait.
- `awaitTermination(timeout, unit)` blocks until all tasks finished (returns `true`) or the timeout passed (returns `false`).
- `shutdownNow()` removes queued tasks that never started and returns them as a list, then calls `interrupt()` on every worker thread that is running a task.

That last point is the one most developers get wrong. Java has no safe way to forcibly kill a thread from outside. The old `Thread.stop()` was deprecated because it could leave objects half-updated, and since JDK 20 it throws `UnsupportedOperationException`. Interruption is a *request*: it sets a flag and wakes up threads blocked in methods that declare `InterruptedException`, such as `Thread.sleep`, `BlockingQueue.take`, and `Future.get`. Code that is busy computing, or blocked in I/O that ignores interruption, keeps running until it checks the flag itself. Nothing is rolled back automatically either; a transaction is only rolled back if the code reacting to the interruption does it.

The program below proves it with one cooperative task, one stubborn task, and one task that never got a thread:

```java
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;

public class ExecutorShutdownDemo {
    static final List<String> events = new CopyOnWriteArrayList<>();

    public static void main(String[] args) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        pool.submit(ExecutorShutdownDemo::cooperativeTask);
        pool.submit(ExecutorShutdownDemo::stubbornTask);
        pool.submit(() -> events.add("queued: I ran"));   // waits for a free thread
        Thread.sleep(100);

        pool.shutdown();                                   // stop accepting, let running work finish
        try {
            pool.submit(() -> events.add("late: I ran"));
        } catch (RejectedExecutionException e) {
            System.out.println("after shutdown(): new task rejected");
        }

        boolean finished = pool.awaitTermination(300, TimeUnit.MILLISECONDS);
        System.out.println("awaitTermination(300 ms) returned " + finished);

        List<Runnable> neverStarted = pool.shutdownNow();  // interrupt running workers, drain the queue
        System.out.println("shutdownNow() returned " + neverStarted.size() + " never-started task(s)");

        finished = pool.awaitTermination(5, TimeUnit.SECONDS);
        System.out.println("awaitTermination(5 s) returned " + finished);
        events.forEach(e -> System.out.println("event -> " + e));
    }

    static void cooperativeTask() {
        try {
            while (true) {
                Thread.sleep(50);                          // blocking call that responds to interruption
            }
        } catch (InterruptedException e) {
            events.add("cooperative: saw interruption, released its resources and stopped");
            Thread.currentThread().interrupt();            // restore the flag for the owner of the thread
        }
    }

    static void stubbornTask() {
        long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(1500);
        while (System.nanoTime() < end) {                  // CPU work that never checks the interrupt flag
            Math.sqrt(end);
        }
        events.add("stubborn: ignored interruption and ran to the end (interrupted flag = "
            + Thread.currentThread().isInterrupted() + ")");
    }
}
```

```text
after shutdown(): new task rejected
awaitTermination(300 ms) returned false
shutdownNow() returned 1 never-started task(s)
awaitTermination(5 s) returned true
event -> cooperative: saw interruption, released its resources and stopped
event -> stubborn: ignored interruption and ran to the end (interrupted flag = true)
```

The stubborn task *was* interrupted (its flag is `true`), yet it ran its full 1.5 seconds. If it had looped forever, `awaitTermination` would have timed out and the platform's `SIGKILL` would have been the only way out. Long loops should check `Thread.currentThread().isInterrupted()`; database calls should have query timeouts; network calls should have connect and read timeouts. Those are what make a shutdown deadline real.

### A complete graceful shutdown

This service registers a shutdown hook, exposes liveness and readiness, and follows the step-by-step sequence above:

```java
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;

public class GracefulShutdownService {
    public static void main(String[] args) throws InterruptedException {
        var service = new TaskWorkerService();
        Runtime.getRuntime().addShutdownHook(new Thread(service::stop, "shutdown-hook"));
        service.start();
        service.accept("request-A", 300);
        service.accept("request-B", 600);
        System.out.println("probe: " + service.probes());

        if (args.length > 0 && args[0].equals("--wait")) {
            Thread.sleep(Long.MAX_VALUE);                  // wait for SIGTERM from docker stop
        }
        Thread.sleep(100);
        System.out.println("main: exiting, JVM runs shutdown hooks");
        System.exit(0);                                    // same hook path as SIGTERM
    }
}

enum Lifecycle { STARTING, READY, DRAINING, STOPPED }

final class TaskWorkerService {
    private final ExecutorService workers = Executors.newFixedThreadPool(4);
    private volatile Lifecycle state = Lifecycle.STARTING;

    void start() {
        System.out.println("service: connecting to database... ok");
        state = Lifecycle.READY;
        System.out.println("service: state=" + state);
    }

    void accept(String requestId, long millis) {
        if (state != Lifecycle.READY) {
            System.out.println("service: refused " + requestId + " (state=" + state + ")");
            return;
        }
        try {
            workers.submit(() -> {
                try {
                    Thread.sleep(millis);
                    System.out.println("worker: " + requestId + " committed");
                } catch (InterruptedException e) {
                    System.out.println("worker: " + requestId + " cancelled, transaction rolled back");
                    Thread.currentThread().interrupt();
                }
            });
        } catch (RejectedExecutionException e) {
            System.out.println("service: refused " + requestId + " (executor closed)");
        }
    }

    String probes() {
        boolean live = state != Lifecycle.STOPPED;
        boolean ready = state == Lifecycle.READY;
        return "liveness=" + (live ? "UP" : "DOWN") + " readiness=" + (ready ? "READY" : "NOT_READY");
    }

    void stop() {
        state = Lifecycle.DRAINING;                        // 1. readiness fails first
        System.out.println("hook: state=" + state + ", probe: " + probes());
        accept("request-C", 100);                          // 2. new work is refused
        workers.shutdown();                                // 3. drain in-flight work with a deadline
        try {
            if (!workers.awaitTermination(2, TimeUnit.SECONDS)) {
                System.out.println("hook: deadline passed, interrupting remaining work");
                workers.shutdownNow();
                workers.awaitTermination(1, TimeUnit.SECONDS);
            }
        } catch (InterruptedException e) {
            workers.shutdownNow();
            Thread.currentThread().interrupt();
        }
        System.out.println("hook: closing connection pool");  // 4. close resources last
        state = Lifecycle.STOPPED;
        System.out.println("hook: state=" + state);
    }
}
```

```text
service: connecting to database... ok
service: state=READY
probe: liveness=UP readiness=READY
main: exiting, JVM runs shutdown hooks
hook: state=DRAINING, probe: liveness=UP readiness=NOT_READY
service: refused request-C (state=DRAINING)
worker: request-A committed
worker: request-B committed
hook: closing connection pool
hook: state=STOPPED
```

Readiness became NOT_READY while liveness stayed UP: the process is healthy, it simply must not receive new work. Both in-flight requests committed before the pool closed. Running the same program detached with `--wait` and ending it with `docker stop` produced the same hook sequence triggered by a real `SIGTERM`, and Docker reported exit code 143. In that run the two short requests had already committed before the signal arrived, which is a reminder that shutdown tests must deliberately create in-flight work at the moment of termination.

> **Note:** Shutdown hooks do not run on `SIGKILL`, on `kill -9`, or when the kernel OOM killer strikes. Durable correctness must therefore come from transactions and idempotent retries, not from the hook. The hook only makes the common case clean.

## Common mistakes

**Shell-form entrypoint.** Wrong: `ENTRYPOINT java -jar /app/app.jar`. Docker wraps this in `/bin/sh -c`, the shell becomes PID 1, and it does not forward `SIGTERM` to Java. The JVM never runs its hooks and is killed after the grace period. Fix: the JSON exec form, `ENTRYPOINT ["java", "-jar", "/app/app.jar"]`.

**Heap equal to the container limit.** Wrong: `-Xmx512m` in a 512 MB container. Non-heap memory pushes the process over the limit and the kernel kills it with exit code 137 and no Java stack trace. Fix: leave headroom, for example `-XX:MaxRAMPercentage=75`, and measure native memory.

**Database check in the liveness probe.** Wrong: `/health/live` pings the database. A short database outage makes the platform restart every instance in a loop. Fix: check dependencies only in readiness.

**Swallowing interruption.** Wrong: `catch (InterruptedException e) { }` inside a worker loop. `shutdownNow` has no effect and shutdown waits for `SIGKILL`. Fix: stop the work, clean up, and restore the flag with `Thread.currentThread().interrupt()`.

**Calling `System.exit` from a shutdown hook.** Once shutdown has begun, `System.exit` blocks forever, so a hook that calls it hangs the JVM until `SIGKILL`. Fix: let the hook return normally.

**Running as root.** Wrong: no `USER` instruction. A remote code execution bug now owns the whole container filesystem. Fix: a dedicated non-root UID, root-owned read-only application files, and dropped capabilities.

## Best practices

- One process per container, started with the exec form so it receives signals.
- Multi-stage builds, layers ordered by change frequency, base images pinned by digest for releases.
- Non-root user, read-only root filesystem, explicit writable paths, explicit CPU and memory limits.
- Heap at a percentage of the limit with headroom; `-XX:+ExitOnOutOfMemoryError` so failures restart cleanly.
- Typed, validated configuration loaded once at startup; secrets wrapped so they cannot be logged.
- Liveness checks the process, readiness checks dependencies and lifecycle state, startup covers slow initialization.
- Shutdown order: readiness off, stop intake, drain with a deadline, interrupt the rest, close resources.
- Every blocking call has a timeout, so the drain deadline can actually be met.

## Summary

- An image is an immutable package of code and runtime; configuration and secrets come from outside at run time.
- Multi-stage builds plus `jdeps` and `jlink` produce small runtimes, but reflection-loaded modules must be added explicitly.
- The JVM respects container limits; the heap must leave room for metaspace, threads, code cache, and native memory.
- Liveness asks "restart me?", readiness asks "send me traffic?". Dependency failures and shutdown affect readiness only.
- `shutdown` stops intake, `awaitTermination` waits with a deadline, `shutdownNow` removes queued tasks and *requests* interruption. Running code stops only if it cooperates.
- Hooks run on `SIGTERM` and `System.exit`, never on `SIGKILL`; durability comes from transactions, not hooks.

## Practice

**Warm-up:** Run `ContainerInfo` with three different `--memory` limits and two `MaxRAMPercentage` values. Tabulate the reported heap and explain each number.

**Warm-up:** Add a `TASKS_LOG_LEVEL` setting to `ConfigDemo` that accepts only `DEBUG`, `INFO`, `WARN`, or `ERROR`, defaulting to `INFO`, and report invalid values alongside other problems.

**Core:** Modify `GracefulShutdownService` so one request takes 5 seconds while the drain deadline is 2 seconds. Predict the output first, then run it and check that the long request logs a rollback.

**Core:** Change the stubborn task in `ExecutorShutdownDemo` so it checks the interrupt flag every iteration, and show that `shutdownNow` now stops it within milliseconds.

**Challenge:** Write a Dockerfile for one of your own earlier programs that uses a jlink runtime and a non-root user. Document its writable paths, resource limits, and the exact command to test termination during in-flight work.

## Check your understanding

1. Why should a database outage make an instance not ready rather than not alive?
2. What happens to a Java service's shutdown hooks when its Dockerfile uses a shell-form `ENTRYPOINT`, and why?
3. What exactly does `shutdownNow` do to a task that is in the middle of a long CPU loop that never checks the interrupt flag?
4. A container with a 1 GB limit and `-Xmx1g` keeps disappearing with exit code 137 and no stack trace. Explain what is happening.
5. Why must configuration validation report every problem at once and stop startup, rather than failing later?
6. Which runtime modules might `jdeps` fail to detect, and how would you find out before production does?
