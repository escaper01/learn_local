# Gradle wrapper, tasks, lazy configuration, plugins, and caching

Maven's lifecycle is a fixed sequence you configure; Gradle's model is a graph of **tasks** you (or a plugin) define, with dependencies between them that Gradle resolves into an execution order. That flexibility is also why Gradle rewards understanding its execution model before writing build logic freehand: a build script that looks like ordinary sequential code is not read that way at all.

What you will learn:

- Why the Gradle Wrapper, not a locally installed Gradle, is what a project should ship with
- The two phases every Gradle build goes through, and why the distinction matters
- How to declare a task and its dependencies, and how tasks differ from Maven goals
- Why lazy configuration (`register` versus `create`, providers) exists and what it avoids
- How the Gradle plugin ecosystem applies conventions instead of you wiring everything by hand
- How the build cache and incremental builds decide what work to skip

## The Wrapper: pinning the tool, not just the dependencies

The **Gradle Wrapper** (`gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.properties`) is a small script plus a properties file that downloads and runs a specific, pinned Gradle version on first use. It is committed to the repository, which means every contributor and every CI runner executes the exact same Gradle version without installing anything globally:

```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-bin.zip
```

Running `./gradlew build` (or `.\gradlew.bat build` on Windows) is the correct entry point for a Gradle project; running a bare `gradle build` depends on whatever version happens to be on that machine's `PATH`, which is exactly the kind of unpinned dependency that produces "works on my machine." Committing the wrapper is a supply-chain decision as much as a convenience one: the wrapper JAR itself should be the one Gradle generated (via `gradle wrapper --gradle-version <version>`), not hand-edited.

## Two phases: configuration, then execution

Every Gradle invocation runs in two distinct phases, and confusing them is the single most common source of surprising Gradle behavior:

1. **Configuration phase**: Gradle evaluates every `build.gradle` (or `build.gradle.kts`) file that is part of the build, top to bottom, to build up the task graph. Code written directly inside a task's configuration block (not inside an action) runs here, for *every* task, whether or not that task will actually execute.
2. **Execution phase**: Gradle looks at which tasks were requested, resolves their dependencies, and runs only the tasks actually needed, each exactly once, respecting the dependency graph.

```groovy
tasks.register("greet") {
    println("configuring greet")      // runs during configuration, always
    doLast {
        println("running greet")      // runs during execution, only if selected
    }
}
```

Running `./gradlew greet` prints `configuring greet` then `running greet`. Running `./gradlew tasks` (which does not execute `greet` at all) still prints `configuring greet`, because configuration always evaluates every task's registration block. Code that should only run when a task actually executes belongs inside `doFirst { }` / `doLast { }`, not directly in the task body.

## Tasks and their dependencies

A **task** is a named unit of work with declared inputs, outputs, and dependencies on other tasks. Unlike a Maven goal bound to a fixed phase, any task can depend on any other:

```groovy
tasks.register("generateReport") {
    dependsOn("compileJava", "test")
    doLast {
        println("report generated from verified build")
    }
}
```

`./gradlew generateReport` first runs `compileJava` and `test` (and anything *they* depend on), then `generateReport` itself, because Gradle computes a full dependency graph before executing anything, not merely a linear list. The standard Java plugin already wires `build` to depend on `check` (which depends on `test`) and `assemble`, which is why `./gradlew build` compiles, tests, and packages, much like Maven's `verify`.

## Lazy configuration: `register` versus `create`

Older Gradle scripts used `tasks.create("name") { ... }`, which configures the task **eagerly**, during the configuration phase, even if that task never runs. `tasks.register("name") { ... }` configures it **lazily**: the block only runs if the task is actually needed for the requested execution. On a large multi-module build, eagerly configuring every task in every module — most of which are never requested — can dominate the time a build spends before doing any real work.

```groovy
// Eager: this block always runs during configuration.
tasks.create("packageDocs") {
    println("computing doc inputs")  // runs on every invocation, even ./gradlew help
}

// Lazy: this block only runs if packageDocsLazy is actually requested.
tasks.register("packageDocsLazy") {
    println("computing doc inputs")  // runs only when needed
}
```

This is also why Gradle APIs favor `Provider<T>` and `Property<T>` over plain values: a `Provider` represents "a value that will be computed later, only if needed," letting Gradle wire configuration together without forcing every value to be computed during the configuration phase regardless of whether it is used.

```groovy
val reportTitle: Property<String> = project.objects.property(String::class.java)
reportTitle.set(providers.gradleProperty("reportTitle").orElse("Untitled"))

tasks.register("printTitle") {
    doLast { println(reportTitle.get()) }  // resolved only when this task runs
}
```

## Plugins: applying conventions instead of wiring everything

A Gradle **plugin** applies a coherent set of tasks, conventions, and extensions in one line:

```groovy
plugins {
    id("java")
    id("application")
}

application {
    mainClass.set("com.example.App")
}
```

Applying `java` alone gives you `compileJava`, `test`, `jar`, and the standard `src/main/java` / `src/test/java` layout — the same convention Maven assumes, adopted here by a plugin rather than baked into the tool. `application` adds `run` and packaging tasks that know how to launch the declared main class. Community and first-party plugins (Spring Boot's, Shadow's fat-JAR packaging, JaCoCo's coverage plugin) work the same way: they register tasks and wire them into the existing graph (typically hooking into `build` or `check`), so applying a plugin is a decision about which conventions a project accepts, not just which library to add.

## Dependencies and configurations

Gradle's equivalent of Maven scopes are **configurations**, and the common ones map closely:

| Gradle configuration | Roughly equivalent Maven scope | Visible where |
|---|---|---|
| `implementation` | `compile`, but not exposed to consumers | This module's compile + runtime classpath only |
| `api` (Java Library plugin) | `compile`, exposed to consumers | This module's classpath, and every consumer's compile classpath |
| `compileOnly` | `provided` | Compile classpath only |
| `runtimeOnly` | `runtime` | Runtime classpath only |
| `testImplementation` | `test` | Test compile + runtime classpath only |

```groovy
dependencies {
    implementation("com.fasterxml.jackson.core:jackson-databind:2.17.0")
    compileOnly("org.projectlombok:lombok:1.18.32")
    runtimeOnly("org.postgresql:postgresql:42.7.3")
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
```

`implementation` versus `api` matters specifically in multi-module builds: an `api` dependency leaks onto the compile classpath of every module that depends on this one, so a library module should default to `implementation` and only use `api` when consumers genuinely need that type at compile time (for example, a method that returns it).

## Incremental builds and the build cache

Gradle tracks each task's declared **inputs** (source files, configuration values) and **outputs** (generated files). Before running a task, it compares the current inputs against the last recorded state:

- If nothing changed since the last run, the task is marked **UP-TO-DATE** and skipped entirely.
- If a remote or local **build cache** is enabled and another build (even on a different machine) already produced identical outputs for identical inputs, the task's outputs are copied from the cache instead of rerun — this is **FROM-CACHE**.
- Otherwise the task actually executes.

```text
> Task :compileJava UP-TO-DATE
> Task :processResources
> Task :classes
> Task :compileTestJava FROM-CACHE
> Task :test
> Task :check
> Task :build

BUILD SUCCESSFUL in 1s
6 actionable tasks: 2 executed, 1 from cache, 3 up-to-date
```

This only works correctly if a task's inputs and outputs are declared accurately; a custom task that reads a file it never declares as an input will be marked UP-TO-DATE even after that file changes, silently serving stale output. Declaring inputs/outputs is not an optimization detail — it is what makes the cache trustworthy at all.

```groovy
abstract class GenerateVersionFile extends DefaultTask {
    @Input
    abstract Property<String> getVersionName()

    @OutputFile
    abstract RegularFileProperty getOutputFile()

    @TaskAction
    void generate() {
        outputFile.get().asFile.text = "version=${versionName.get()}\n"
    }
}
```

## What happens under the hood: from `./gradlew build` to skipped tasks

1. The wrapper script checks `gradle-wrapper.properties`, downloads the pinned Gradle distribution if it is not already cached locally, and launches it.
2. Gradle evaluates every `build.gradle(.kts)` in the build (configuration phase), applying plugins and registering tasks and their declared dependencies, without yet running any task action.
3. Gradle determines which tasks were requested (`build`) and walks the dependency graph backward to find every task that must run first (`compileJava`, `test`, `jar`, and anything they depend on).
4. For each task in that graph, in dependency order, Gradle compares declared inputs against the last recorded state (and, if a cache is configured, checks whether a matching cache entry exists).
5. Tasks with unchanged inputs are marked UP-TO-DATE; tasks with a cache hit are marked FROM-CACHE; everything else actually executes, and its actions (`doFirst`/`doLast`, or built-in plugin behavior) run.
6. Gradle records the new input/output state for each executed task so the next build can compare against it.
7. If any task action throws or reports failure, Gradle stops the affected part of the graph and reports `BUILD FAILED` with a nonzero exit code.

## Common mistakes

**Mistake 1: putting side-effecting code directly in a task body instead of `doLast`.**

```groovy
tasks.register("deploy") {
    println("deploying now")   // runs during configuration, even for `./gradlew tasks`
}
```

Fix: wrap actual work in `doLast { }` (or `doFirst { }`), so it only runs when the task executes.

**Mistake 2: using `implementation` where `api` is actually required, or vice versa.** Under-using `api` breaks consumers with a compile error pointing at a type they never explicitly depended on; over-using `api` leaks internal dependencies onto every consumer's classpath and makes future upgrades harder. Fix: default to `implementation`; promote to `api` only for types genuinely part of the module's public surface.

**Mistake 3: declaring a custom task's inputs incompletely.** A task that reads a config file not declared with `@InputFile` will show UP-TO-DATE after that file changes, serving stale output silently. Fix: declare every file and value the task's action actually reads.

**Mistake 4: running a bare `gradle` command instead of the wrapper.** This depends on whatever Gradle happens to be installed globally, defeating the point of pinning a version. Fix: always invoke `./gradlew` (or `gradlew.bat`), and treat any script or CI step that calls `gradle` directly as a bug.

## Best practices

- Commit the wrapper (`gradlew`, `gradlew.bat`, `gradle/wrapper/`) and only ever invoke the build through it.
- Prefer `tasks.register` over `tasks.create`, and keep configuration-phase code side-effect free.
- Put real work inside `doFirst`/`doLast`; keep the task body reserved for declaring inputs, outputs, and dependencies.
- Default new module dependencies to `implementation`; use `api` only when a type crosses into a consumer's own public surface.
- Declare every input and output a custom task touches, so incremental builds and the cache stay trustworthy.
- Enable the build cache for CI and local builds alike once tasks declare their inputs/outputs correctly.

## Summary

- The Wrapper pins the exact Gradle version a project builds with, the same role the Maven Wrapper plays for Maven.
- Configuration phase evaluates every build script and registers tasks; execution phase runs only the tasks actually requested, in dependency order.
- Tasks declare dependencies explicitly (`dependsOn`) or implicitly through plugin conventions (`build` depending on `check` and `assemble`).
- `register` configures lazily; `create` configures eagerly, even for tasks that never run.
- `implementation`, `api`, `compileOnly`, and `runtimeOnly` control where a dependency is visible, closely mirroring Maven's scopes with one addition: `api` deliberately leaks to consumers.
- UP-TO-DATE and FROM-CACHE skip work only when a task's declared inputs and outputs accurately describe what it reads and produces.

## Practice

1. **Warm-up:** Explain why a `println` directly inside `tasks.register("x") { ... }` prints even when you run `./gradlew tasks` without ever selecting task `x`.
2. **Warm-up:** A library module exposes a method that returns a type from dependency `D`. Should `D` be declared `implementation` or `api`, and what breaks for consumers if you choose wrong?
3. **Core:** Add a custom task with `dependsOn` on two existing tasks, and predict — before running it — the full order Gradle will execute tasks in when you request it.
4. **Core:** Convert a task from `tasks.create` to `tasks.register`, move any side-effecting code into `doLast`, and confirm with `println` timing that configuration code no longer runs for unrelated task invocations.
5. **Challenge:** Write a custom task with a declared `@InputFile` and `@OutputFile`. Run it twice with no changes and observe UP-TO-DATE; then remove the `@InputFile` annotation, change the input file's contents, and observe that the task is incorrectly marked UP-TO-DATE anyway.

## Check your understanding

1. Why does code written directly inside a task's registration block run during `./gradlew tasks`, which never executes that task?
2. What concrete build-time cost does `tasks.register` avoid compared to `tasks.create`, and in what kind of project does that cost matter most?
3. A module's public method returns a type from one of its dependencies. Which Gradle configuration should that dependency use, and what compile error would consumers see if it were `implementation` instead?
4. What two conditions does Gradle check before deciding whether a task can be marked UP-TO-DATE or FROM-CACHE?
5. Why can an incorrectly declared custom task silently serve stale output instead of failing loudly?
6. What specific problem does committing the Gradle Wrapper solve that a `README` instruction to "install Gradle" does not?
