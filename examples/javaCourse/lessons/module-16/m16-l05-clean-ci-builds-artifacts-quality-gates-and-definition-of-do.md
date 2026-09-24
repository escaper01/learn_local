# Clean CI builds, artifacts, quality gates, and definition of done

A build that only ever runs on one developer's laptop proves almost nothing: it may depend on a cached dependency nobody else has, an environment variable someone set once and forgot about, or a file left over from a previous run. Continuous Integration (CI) exists to answer a stricter question — does this change build and pass its checks from a clean checkout, on a machine that has never seen this project before — and this lesson is about designing that gate honestly instead of decorating a pipeline that does not actually verify anything.

What you will learn:

- Why a CI build must run the same commands a developer runs locally, not a parallel set of "CI-only" steps
- What "clean checkout" means and why it catches bugs a warm local environment hides
- How to define and promote a build artifact, instead of rebuilding separately per environment
- What a quality gate is, and how to choose gates that catch real problems instead of generating noise
- What "definition of done" means for a change, beyond "it compiles"

## CI should run what developers already run

The most reliable CI pipeline is the one with the fewest CI-specific concepts: it checks out the repository and runs the same `./mvnw verify` or `./gradlew build` a developer runs locally, with the same wrapper-pinned tool version. This has a direct practical benefit — a developer can reproduce a CI failure exactly, locally, by running the same command, instead of guessing at what a bespoke CI script did differently.

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
      - run: ./mvnw verify
```

The job installs a JDK and runs exactly the command described in this chapter's Maven lesson as the correct gate — `verify`, not `package`, and never with `-DskipTests`. A pipeline that instead calls `mvn compile` and separately re-implements test execution and packaging as bespoke CI steps has created a second, parallel definition of "the build" that can drift from what `verify` actually does, and that a developer cannot reproduce by typing one familiar command.

## Clean checkout: why environment isolation matters

A **clean checkout** means the build starts from exactly the files in version control — nothing left over from a previous build, nothing assumed to already be installed beyond what the pipeline itself provisions. CI runners typically start from a fresh container or virtual machine for this reason. This catches a specific, common category of bug: code that only works because of a stray file, a manually created directory, or a dependency that happens to already be cached locally, none of which exist in version control and none of which a new team member's machine would have.

```text
# Works locally because target/generated-sources/ still has old output
# from a previous run of an annotation processor. Fails in CI because
# a clean checkout has no target/ directory at all until the build creates it.
```

`.gitignore`-covered build output (`target/`, `build/`) should never be depended on by the build itself; if removing it and rebuilding from scratch changes the outcome, something in the build is implicitly stateful in a way that will eventually fail for someone. Committing generated files defeats the same check from the other direction — a generated file that goes stale relative to its source is now indistinguishable, at a glance, from a hand-written one, and CI regenerating it fresh every time is what would have caught the staleness.

## Build once, promote the same artifact

A subtle but important CI principle: **build the artifact once, then promote the identical bytes through each environment**, rather than rebuilding separately for staging and production. Rebuilding per environment reintroduces exactly the nondeterminism this chapter has spent three lessons removing — a slightly different dependency resolution, a different compiler patch version, a different timestamp embedded in the JAR — any of which means the artifact tested in staging is not, byte for byte, the artifact that reaches production.

```text
CI pipeline:
1. checkout → build → test → package  → produces app-1.4.0.jar
2. upload app-1.4.0.jar as a build artifact (content-addressed, e.g. by its checksum)
3. deploy to staging: download and run the SAME app-1.4.0.jar
4. after staging verification passes: deploy to production: download and run the SAME app-1.4.0.jar
```

If staging verification passes and production later fails, the difference must be in *configuration or environment*, not in *the code that ran* — because it is provably the same bytes. That is a much smaller, more tractable debugging problem than "did something about the rebuild change." Container images embody this well: build one image, tag it with an immutable digest, and run that exact digest in every environment, rather than rebuilding `FROM base:latest` fresh at each deployment stage.

## Quality gates: choosing what actually blocks a merge

A **quality gate** is an automated check that must pass before a change can merge or deploy. Common gates, roughly in order of how directly they measure correctness:

| Gate | What it actually verifies | Risk if made too strict |
|---|---|---|
| Unit and integration tests (`verify`/`build`) | The behavior the tests assert | None if the tests are meaningful; false confidence if they are not |
| Static analysis / linting | Style and some classes of bugs (unused variables, obvious null issues) | High false-positive rate erodes trust and gets suppressed wholesale |
| Dependency vulnerability scan | Known CVEs in the resolved dependency graph | Blocking on every low-severity finding trains people to bypass the gate |
| Code coverage threshold | Whether *some* test executed each line | As covered in the testing chapter, tells you nothing about assertion quality; a hard percentage gate rewards padding, not correctness |
| Mutation testing | Whether tests actually fail when behavior changes | Slower to run; usually a periodic or optional gate, not on every push |

The gates worth making *blocking* are the ones with a low false-positive rate and a clear, actionable failure message: a failing test names the exact assertion; a dependency scan names the exact CVE and the fixed version. A gate that is noisy or unclear gets bypassed, disabled, or ignored, which is worse than not having it, because the team stops trusting a red pipeline to mean something is actually wrong. Choosing gates is a judgment call about signal-to-noise, not "add every available check."

## Reproducing a CI failure locally

Because a well-designed pipeline runs the same command a developer runs, reproducing a CI failure should not require reading CI logs as the primary debugging tool:

```text
git fetch origin
git checkout <the exact commit CI ran>
./mvnw verify
```

If this reproduces the failure, you are debugging locally with a debugger and full IDE support, which is faster than iterating through pushes and rereading CI output. If it does *not* reproduce locally, that gap itself is informative: it usually means the pipeline's environment differs from yours in a specific, discoverable way — a different JDK vendor or patch version, a locale or timezone difference, a test relying on parallel execution timing that a differently-provisioned runner exposes. Pin exactly what needs pinning (JDK distribution and version, locale in test configuration) rather than accepting "CI is just flaky."

## Definition of done: more than "it compiles"

A change is not finished when it builds. A useful, concrete definition of done for a professional change:

- The build passes the full quality gate set from a clean checkout, not just `compile`.
- New behavior has tests that would fail without the change (not just tests that execute the new code).
- The commit history is readable: focused commits with messages explaining reasoning.
- Code review feedback has been addressed or discussed, not silently dismissed.
- Documentation or comments are updated where the change makes existing ones inaccurate.
- The artifact that will actually ship is the one that was tested — no manual step recreates it differently.

Treat "it works on my machine" as the beginning of a change, not the end of one. The entire point of this chapter — reproducible builds, explicit scopes, a reviewed dependency graph, disciplined commits — is to make "it works" mean the same thing on every machine that runs it, including the one your users are on.

## What happens under the hood: from a push to a merge decision

1. A push or pull request triggers the CI system, which provisions a clean environment (fresh container or VM) with no state from any previous run.
2. The pipeline checks out the exact commit, installs the pinned JDK/tool versions the wrapper or configuration specifies, and runs the same build command a developer would run.
3. Each configured quality gate runs, in whatever order the pipeline defines; a failing gate typically stops the pipeline and reports which check failed and why.
4. On success, the pipeline uploads the built artifact (content-addressed, often by checksum or image digest) as a reusable, immutable output rather than something later stages rebuild.
5. Branch protection rules (configured on the repository, not in the pipeline script) check whether the required gates passed for the current commit before allowing a merge.
6. Subsequent deployment stages download and run that same uploaded artifact rather than re-invoking the build.

## Common mistakes

**Mistake 1: a CI script that diverges from the local build command.** Developers cannot reproduce a CI-only failure by running anything familiar. Fix: make the pipeline invoke the same wrapper command a developer runs.

**Mistake 2: rebuilding separately per deployment environment.** This reintroduces nondeterminism into exactly the step meant to eliminate it. Fix: build once, promote the same artifact by content-addressed reference.

**Mistake 3: treating every available check as a blocking gate.** A noisy linter or an unpinned flaky test trains people to ignore red pipelines entirely. Fix: make blocking gates the ones with low false-positive rates and clear failure messages; keep noisier checks informational until they are trustworthy.

**Mistake 4: chasing a coverage percentage as the definition of done.** As in the testing chapter, high coverage with weak assertions passes this gate while shipping real bugs. Fix: require tests that fail without the change, not merely tests that execute it.

**Mistake 5: accepting "CI is flaky" without investigating.** A test that intermittently fails in CI but never locally usually points to a real difference (timing, locale, parallelism) worth finding, not noise to suppress with a retry loop. Fix: reproduce with the same environment specifics CI uses before assuming it is unfixable.

## Best practices

- Run the exact same command locally and in CI; treat any divergence as a bug in the pipeline.
- Start every CI run from a clean checkout, and never let the build depend on leftover local state.
- Build the artifact once; promote the identical, content-addressed bytes through every environment.
- Keep blocking quality gates few and high-signal; route noisier checks to a non-blocking report until they earn trust.
- Define "done" to include tests that would fail without the change, addressed review feedback, and updated documentation — not just a passing compile.
- When CI fails and you cannot reproduce it locally, treat the gap itself as the bug to find, not evidence that CI is unreliable.

## Summary

- A trustworthy CI pipeline runs the same command developers run locally, so failures are reproducible outside CI.
- Clean checkouts catch bugs hidden by stale local state; build output should never be committed or silently relied upon.
- Building an artifact once and promoting the same bytes through every environment turns "did the code change" into a provable question.
- Quality gates should be chosen for signal, not quantity; a noisy or unclear gate gets bypassed and stops protecting anything.
- Coverage thresholds and green pipelines are not, by themselves, definitions of done — meaningful tests, readable history, and addressed review feedback are.
- A CI failure that will not reproduce locally usually indicates a real environment difference worth finding, not an unreliable pipeline.

## Practice

1. **Warm-up:** Explain, in your own words, why a CI pipeline that runs different commands from what developers run locally makes failures harder to debug.
2. **Warm-up:** A team rebuilds the JAR separately for staging and production. Describe a concrete way this could let a bug reach production despite passing every staging check.
3. **Core:** Write a minimal CI workflow file for a Maven or Gradle project that checks out the repository, installs a pinned JDK, and runs the same verify/build command described in this chapter's earlier lessons.
4. **Core:** List five checks you could add as CI quality gates for a real project, then decide which should be blocking versus informational, and justify each choice by expected false-positive rate.
5. **Challenge:** Reproduce a CI-reported failure locally by checking out the exact failing commit and running the identical command; if it does not reproduce, identify one concrete environment difference (JDK vendor/version, locale, timezone) that could explain the gap.

## Check your understanding

1. Why does a CI pipeline that runs the same command a developer runs locally make failures easier to fix than a pipeline with bespoke CI-only steps?
2. What specific class of bug does a clean checkout catch that a long-lived local development environment can hide?
3. Why does rebuilding an artifact separately per deployment environment undermine the guarantee that staging verification gives you about production?
4. What makes a quality gate worth making blocking, versus worth keeping informational only?
5. Why is "the build passed" alone not a sufficient definition of done for a change?
6. If a test fails in CI but passes every time locally, what should you investigate before concluding the test is simply flaky?
