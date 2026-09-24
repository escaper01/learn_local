# Chapter 16 assessment and deliberate practice

This chapter turned "the code compiles on my machine" into a set of concrete, learnable disciplines: reading a Maven build as a declared model with a fixed lifecycle, reading a Gradle build as a task graph with lazy configuration and caching, treating the dependency graph as an artifact to inspect and audit rather than trust blindly, understanding what a commit and a merge actually are so conflicts and reviews stop being frightening, and designing a CI pipeline that verifies the same thing a developer can reproduce locally. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Maven POM, lifecycle, scopes, plugins, and effective configuration

A POM declares coordinates, dependencies, and plugins; the standard directory layout is a convention every tool assumes. The `default` lifecycle runs `validate` through `deploy` in order, so `verify` — not `package` — is the right gate, and `install` only places an artifact in the local repository, never in production. Scopes (`compile`, `provided`, `runtime`, `test`) declare where a dependency is genuinely needed, and a wrong scope produces a failure only visible outside the build. `help:effective-pom` and `dependency:tree` show what Maven actually uses, which is often more than what you typed, and nearest-wins dependency mediation is deterministic without being guaranteed correct.

### Lesson 2: Gradle wrapper, tasks, lazy configuration, plugins, and caching

The Gradle Wrapper pins the exact Gradle version a project builds with, the same role the Maven Wrapper plays for Maven. Every build runs a configuration phase (which evaluates every build script, always) before an execution phase (which runs only the tasks actually requested). `tasks.register` configures lazily; `tasks.create` configures eagerly, even for tasks that never run. `implementation`, `api`, `compileOnly`, and `runtimeOnly` control dependency visibility, and UP-TO-DATE/FROM-CACHE only skip work correctly when a task's declared inputs and outputs are accurate.

### Lesson 3: Dependency graphs, version control, licenses, and supply-chain risk

Adding one dependency adds its entire transitive graph, and every artifact in that graph runs with your application's privileges, whether or not anyone reviewed it. Semantic versioning is a convention that hints at upgrade risk, not a guarantee — even a patch bump deserves running the test suite. Every dependency carries a license with real obligations, and supply-chain risks (compromised packages, typosquatting, unmaintained code, malicious build plugins) are not caught by application-level code review, because the code was never written by your team. Automated vulnerability scanning belongs in CI, not only in occasional manual checks.

### Lesson 4: Git commits, branches, merges, conflicts, and code review

A commit is an immutable snapshot with parent pointers; history is a graph, and a branch is just a movable pointer, which is why creating one is cheap. A fast-forward moves a pointer with no new commit; a merge commit has two parents and preserves both lines of history. A textually clean merge is not proof of correctness — two non-overlapping changes can combine into a semantic bug that only the test suite reveals. Rebasing is only safe on commits nobody else has built on; a good commit message explains the reasoning a diff cannot show, and a good review checks design and test quality, not just whether CI is green.

### Lesson 5: Clean CI builds, artifacts, quality gates, and definition of done

A trustworthy CI pipeline runs the exact command a developer runs locally, so failures are reproducible outside CI. Clean checkouts catch bugs hidden by stale local state, and building an artifact once and promoting the identical bytes through every environment turns "did the code change" into a provable question instead of a guess. Quality gates should be chosen for signal, not quantity — a noisy gate gets bypassed and stops protecting anything — and a passing pipeline is not, by itself, a definition of done: meaningful tests, readable history, and addressed review feedback are also required.

## Cheat sheet

### Maven versus Gradle vocabulary

| Concept | Maven | Gradle |
|---|---|---|
| Pinned tool version | Maven Wrapper (`mvnw`) | Gradle Wrapper (`gradlew`) |
| Unit of work | Goal, bound to a fixed lifecycle phase | Task, with explicit or plugin-wired dependencies |
| "Build and verify everything" | `verify` | `build` |
| Compile-only visibility | `provided` scope | `compileOnly` configuration |
| Runtime-only visibility | `runtime` scope | `runtimeOnly` configuration |
| Test-only visibility | `test` scope | `testImplementation` configuration |
| Inspect the resolved graph | `mvn dependency:tree` | `./gradlew dependencies` |

### Dependency scope quick reference (Maven)

| Scope | Compile | Test | Runtime |
|---|---|---|---|
| `compile` (default) | yes | yes | yes |
| `provided` | yes | yes | no |
| `runtime` | no | yes | yes |
| `test` | no | yes | no |

### Git model

| Term | What it actually is |
|---|---|
| Commit | An immutable snapshot plus metadata and parent pointer(s) |
| Branch | A movable pointer to a commit — nothing is copied when you create one |
| Fast-forward | A pointer moves forward; no new commit is created |
| Merge commit | A new commit with two parents, combining both histories |
| Rebase | Replays commits onto a new base, producing new hashes — safe only before pushing/sharing |

### CI and artifacts

| Principle | Why it matters |
|---|---|
| Run the same command locally and in CI | A failure can be reproduced outside CI with a debugger |
| Clean checkout, every run | Catches bugs hidden by stale local state |
| Build once, promote the same artifact | Makes "same bytes tested and shipped" provable, not assumed |
| Few, high-signal blocking gates | A noisy gate gets bypassed and stops protecting anything |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Would this change pass `mvn package -DskipTests` or a bare `mvn compile` while still failing `verify`?
- Is a dependency declared `compile` when it is only ever needed at test time or only at runtime?
- Does a custom Gradle task read a file or value it does not declare as an input, risking an incorrect UP-TO-DATE?
- Was a transitive dependency ever actually inspected (via `dependency:tree`), or only the ones declared directly?
- Does a commit message describe the diff instead of explaining why the change was needed?
- Would this CI step do something a developer cannot reproduce by running the same command locally?

## The judgment question

The judgment question describes a release artifact that differs from the one that was tested, and asks what process improves traceability — the correct answer is **build once and promote those verified bytes**, not rebuilding with uncontrolled versions and not merely disabling CI caches. This is Lesson 5's central point: if staging and production each trigger their own build, then even with identical source code, a different dependency resolution, a different compiler patch version, or simply a different point in time can produce different bytes, and "it passed staging" no longer proves anything about what actually reaches production. Rebuilding with uncontrolled versions makes this worse, not better, since it removes even the source-code guarantee. Disabling CI caches addresses build speed and staleness, not the traceability question being asked, and does nothing to guarantee the artifact that shipped is the one that was verified.

## Approaching the implementation lab

The lab asks for `artifact`: trim both inputs and return `name-version.jar`.

1. Write the precondition and boundary table first: an ordinary name and version, values with leading/trailing whitespace that trimming must remove, and an empty trimmed component (which this formatting helper must still accept, per the instructions — a real build descriptor would validate separately).
2. Apply `.trim()` to both `value1` and `value2` independently before combining them, exactly as the hidden test with padded arguments (`" core "`, `" 21 "` expecting `"core-21.jar"`) requires.
3. Build the result with straightforward concatenation: the trimmed first value, a hyphen, the trimmed second value, and the literal `.jar` suffix — matching the boundary case where an empty trimmed name still produces a valid (if unusual) `-1.jar`.
4. Keep the method deterministic and side-effect-free, exactly as every function lab in this course requires: no printing, purely a function of its two inputs.

## Approaching the debug lab

The debug lab's starter code treats a nonzero exit code as passing verification (`exitCode>=0 ? "PASS" : "FAIL"`), which is exactly backwards: only an exit code of zero signifies that a build or verification step actually succeeded, and this chapter's Maven and CI lessons both depend on that convention (a nonzero exit code is what stops a CI pipeline).

1. Predict, before running anything, what the current code prints for `exitCode = 1`, and confirm that prediction by running it.
2. Recall Lesson 1's and Lesson 5's shared point: a nonzero result signals failure, not success, whether it is a Maven build's exit code or this snippet's `exitCode` variable.
3. Correct the condition so that only `exitCode == 0` counts as passing (for example, `exitCode == 0 ? "PASS" : "FAIL"`), preserving the surrounding structure rather than hard-coding the print.
4. Confirm your fix now prints `FAIL` for the given `exitCode = 1`, and be ready to explain why treating "nonzero" as success would let a real build failure slip through a CI gate silently.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Create a small external Maven project, run `./mvnw verify`, inspect `target/`, then run `mvn help:effective-pom` and `mvn dependency:tree` and identify one inherited plugin version and one transitive dependency you did not expect.
2. Convert a task from `tasks.create` to `tasks.register` in a Gradle build, move any side-effecting code into `doLast`, and confirm with printed output that configuration-phase side effects no longer run for unrelated task invocations.
3. Run a dependency vulnerability scan (OWASP Dependency-Check or equivalent) against a project with at least one deliberately outdated dependency, and read the report's severity and "fixed in" fields.
4. Deliberately create a textual Git merge conflict, resolve it by reading both sides' intent rather than picking one side, and write a commit message explaining the resolution you chose.
5. Write a minimal CI workflow file that checks out a repository, installs a pinned JDK, and runs the same `verify`/`build` command you would run locally — then break a test on purpose and confirm the pipeline fails with the same message you would see locally.

## Self-assessment

You are ready for Chapter 17 when you can do all of the following without notes:

- Explain why `mvn install` does not deploy to production, and why `verify` — not `package` — is the right gate for "the build passed."
- Choose the correct Maven scope or Gradle configuration for a dependency given where it is actually needed (compile, test, or runtime only).
- Explain the difference between `tasks.register` and `tasks.create`, and why side-effecting code belongs in `doLast`/`doFirst`.
- Explain why a transitive dependency you never explicitly reviewed can still be the source of a production security incident.
- Explain the difference between a fast-forward merge and a merge commit, and why a textually clean merge is not proof of behavioral correctness.
- Explain why a CI pipeline should run the same command a developer runs locally, and why building an artifact once and promoting it is more trustworthy than rebuilding per environment.
- Explain why a passing pipeline alone is not a sufficient definition of done for a change.
