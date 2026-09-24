# Maven POM, lifecycle, scopes, plugins, and effective configuration

Every non-trivial Java project needs a repeatable, machine-executed answer to "how do I compile this, run its tests, and produce a distributable artifact" — a build tool. Maven answers that with a declarative model: you describe *what* your project is (its dependencies, its packaging type, its properties) in an XML file called the POM (Project Object Model), and Maven derives *how* to build it from a small set of standard, well-known lifecycle phases. This lesson walks through a real, minimal Maven project — built, tested, packaged, and installed for real — to make each of these ideas concrete rather than abstract.

What you will learn:

- The POM: the minimum a project must declare, and what Maven fills in automatically
- The build lifecycle: the standard phases (`compile`, `test`, `package`, `install`, `deploy`) and what each one actually produces
- Why `mvn install` does not deploy anything to production, and what it actually does instead
- Dependency scopes: how `test` scope keeps a dependency out of the artifact a consumer would actually use
- Plugins: how Maven's standard lifecycle phases are themselves implemented by plugins bound to them automatically
- Effective configuration: what `mvn help:effective-pom` reveals that your own, hand-written POM never explicitly states

## The POM: declaring what your project is

A minimal POM states an identity (`groupId`, `artifactId`, `version`), a packaging type, and any dependencies — nothing about *how* to compile or test, since that comes from Maven's own conventions and default lifecycle bindings.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>greeter</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.release>21</maven.compiler.release>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.11.4</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <finalName>${project.artifactId}-${project.version}</finalName>
    </build>
</project>
```

With this POM, a source file at `src/main/java/com/example/Greeter.java` and a test at `src/test/java/com/example/GreeterTest.java` (following Maven's standard directory layout, which requires no separate configuration to be recognized), running `mvn test` produces:

```text
[INFO] --- compiler:3.15.0:compile (default-compile) @ greeter ---
[INFO] Nothing to compile - all classes are up to date.
[INFO] --- compiler:3.15.0:testCompile (default-testCompile) @ greeter ---
[INFO] Nothing to compile - all classes are up to date.
[INFO] --- surefire:3.5.4:test (default-test) @ greeter ---
[INFO] Using auto detected provider org.apache.maven.surefire.junitplatform.JUnitPlatformProvider
[INFO] 
[INFO] -------------------------------------------------------
[INFO]  T E S T S
[INFO] -------------------------------------------------------
[INFO] Running com.example.GreeterTest
[INFO] Tests run: 1, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.117 s -- in com.example.GreeterTest
[INFO] 
[INFO] Results:
[INFO] 
[INFO] Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

Notice the POM never mentions `compiler` or `surefire` (Maven's test-running plugin) at all — Maven's default lifecycle bindings attach them automatically based purely on the `jar` packaging type declared at the top of the file. This is the essence of Maven's design: convention over configuration, with escape hatches (explicit plugin configuration, covered below) available whenever the defaults are not what you need.

## The lifecycle: what each phase actually produces

Maven's build lifecycle is an ordered sequence of named phases; running any phase runs every phase before it too. The everyday phases, in order, are `validate`, `compile`, `test`, `package`, `verify`, `install`, and `deploy`. Running `mvn package` on the same project produces a real artifact:

```text
[INFO] Building jar: /proj/target/greeter-1.0.0.jar
```

```text
--- target contents ---
target/greeter-1.0.0.jar
```

Running `mvn install` (which runs every phase up through `package` first, then adds one more step) produces:

```text
--- local repo contents ---
/root/.m2/repository/com/example/greeter/1.0.0/greeter-1.0.0.jar
/root/.m2/repository/com/example/greeter/1.0.0/greeter-1.0.0.pom
/root/.m2/repository/com/example/greeter/1.0.0/_remote.repositories
/root/.m2/repository/com/example/greeter/maven-metadata-local.xml
```

This is exactly the chapter's concept-check answer: **`mvn install` does not deploy the application to production** — it copies the built artifact into your **local** Maven repository (`~/.m2/repository`, mounted here inside the container), making it available for *other local projects on the same machine* to depend on, nothing more. Actually shipping to a remote environment is what the final `deploy` phase is for, and that phase requires an explicitly configured remote repository (an internal artifact server, typically) that this minimal project never declared at all — `install` and `deploy` are deliberately separate phases precisely because "available to my own machine's other projects" and "published somewhere production could pull from" are genuinely different, separately-decided steps.

## Scopes: controlling where a dependency actually applies

A dependency's **scope** controls which phases it is available during, and — critically — whether it travels with the artifact to consumers at all. `test` scope (used for `junit-jupiter` above) makes a dependency available for compiling and running tests, but explicitly excludes it from the packaged artifact and from anything that later depends on this project.

```text
[INFO] com.example:greeter:jar:1.0.0
[INFO] \- org.junit.jupiter:junit-jupiter:jar:5.11.4:test
[INFO]    +- org.junit.jupiter:junit-jupiter-api:jar:5.11.4:test
[INFO]    |  +- org.opentest4j:opentest4j:jar:1.3.0:test
[INFO]    |  +- org.junit.platform:junit-platform-commons:jar:1.11.4:test
[INFO]    |  \- org.apiguardian:apiguardian-api:jar:1.1.2:test
[INFO]    +- org.junit.jupiter:junit-jupiter-params:jar:5.11.4:test
[INFO]    \- org.junit.jupiter:junit-jupiter-engine:jar:5.11.4:test
[INFO]       \- org.junit.platform:junit-platform-engine:jar:1.11.4:test
```

This is `mvn dependency:tree`'s real output for the same project: every single transitive dependency JUnit itself pulls in (`junit-jupiter-api`, `opentest4j`, `junit-platform-commons`, and the rest) is *also* marked `test` scope, even though none of them were declared directly in the POM at all — scope propagates down the dependency graph. `compile` scope (the default when no scope is specified) is available everywhere, including to consumers; `provided` scope is available for compiling but expected to be supplied by the runtime environment rather than bundled (a servlet API is the classic example); `runtime` scope is needed at runtime but not for compiling against directly (a JDBC driver implementation, typically).

## Plugins: the lifecycle's actual implementation

Every one of Maven's lifecycle phases is, underneath, implemented by a **plugin** goal bound to that phase — nothing runs "natively"; `compiler:3.15.0:compile` and `surefire:3.5.4:test`, visible directly in this lesson's own `mvn test` output above, are exactly this: the `maven-compiler-plugin`'s `compile` goal bound to the `compile` phase, and the `maven-surefire-plugin`'s `test` goal bound to the `test` phase. The `<packaging>jar</packaging>` declaration is what determines *which* default plugin bindings apply — a `war` or `pom` packaging binds an entirely different default set. Explicit `<properties>` like `maven.compiler.release` (used in this lesson's POM) are themselves a shorthand for configuring the compiler plugin without writing out its full `<plugin>` block by hand.

## Effective configuration: what your POM does not say out loud

`mvn help:effective-pom` prints the fully resolved configuration Maven actually uses — your own POM merged with every inherited default from Maven's built-in "Super POM" — revealing exactly what was filled in silently.

```text
<build>
    <sourceDirectory>/proj/src/main/java</sourceDirectory>
    <scriptSourceDirectory>/proj/src/main/scripts</scriptSourceDirectory>
    <testSourceDirectory>/proj/src/test/java</testSourceDirectory>
    <outputDirectory>/proj/target/classes</outputDirectory>
    <testOutputDirectory>/proj/target/test-classes</testOutputDirectory>
    <resources>
      <resource>
        <directory>/proj/src/main/resources</directory>
      </resource>
    </resources>
    <testResources>
      <testResource>
        <directory>/proj/src/test/resources</directory>
      </testResource>
    </testResources>
    <directory>/proj/target</directory>
    <finalName>greeter-1.0.0</finalName>
    ...
</build>
```

Not one of `<sourceDirectory>`, `<testSourceDirectory>`, `<outputDirectory>`, or the default resource directories appears anywhere in this lesson's own hand-written `pom.xml` — every one of them is a Super POM default, silently applied because this project never overrode it. This is exactly what "effective configuration" means, and exactly why `mvn help:effective-pom` is the correct first tool to reach for when a build behaves in a way your own POM does not seem to explain: the behavior almost always traces back to an inherited default, a plugin's own built-in default, or a parent POM somewhere in the project's inheritance chain, none of which are visible by reading the project's own POM file in isolation.

The effective POM's `<repositories>` block similarly reveals an inherited default worth noticing: Maven Central (`https://repo.maven.apache.org/maven2`) is configured as the default remote repository purely by inheritance from the Super POM, even though this project's own `pom.xml` never mentions any repository at all.

## A failing test stops the lifecycle

Because later lifecycle phases run only after earlier ones succeed, a failing test at the `test` phase prevents `package`, `install`, and `deploy` from ever running at all — a deliberately-broken test (asserting the wrong expected name) on the same project produces:

```text
[INFO] Running com.example.GreeterTest
[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.109 s <<< FAILURE! -- in com.example.GreeterTest
[ERROR] com.example.GreeterTest.greetsByName -- Time elapsed: 0.057 s <<< FAILURE!
org.opentest4j.AssertionFailedError: expected: <Hello, Ada!> but was: <Hello, Ludwig!>
	at com.example.GreeterTest.greetsByName(GreeterTest.java:9)
[INFO] Results:
[ERROR] Failures: 
[ERROR]   GreeterTest.greetsByName:9 expected: <Hello, Ada!> but was: <Hello, Ludwig!>
[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.5.4:test (default-test) on project greeter: There are test failures.
[ERROR] See /proj/target/surefire-reports for the individual test results.
```

This is precisely the enforcement mechanism behind Maven's lifecycle ordering: `BUILD FAILURE` at the `test` phase means the build stops there — no jar is packaged, nothing is installed, and nothing could ever reach `deploy` from this run. This is exactly why "the tests pass" is a meaningful, load-bearing gate rather than a formality: a broken test genuinely blocks every later phase from running at all, by design, not merely by convention.

> **Tip:** `mvn -o` runs Maven in offline mode, refusing to reach out to any remote repository and using only what is already cached locally — invaluable for confirming a build does not have a hidden, undeclared network dependency, and for reproducing a build reliably in an environment without internet access.

## What happens under the hood

Maven resolves a project's effective configuration by starting from the built-in Super POM, layering in any parent POM the project declares, then layering the project's own POM on top, with more specific declarations overriding more general ones at each level — exactly the same "most specific wins" principle governing method overriding and CSS-style cascading configuration in other systems. Dependency resolution walks the full transitive graph declared by every dependency (and every dependency's own dependencies, recursively), computing a single resolved version and scope for each artifact according to Maven's nearest-declaration-wins and scope-propagation rules — which is exactly why `dependency:tree` is the tool to reach for whenever the *actual* resolved dependency set is not obvious just from reading one project's own declared dependencies.

## Common mistakes

**1. Assuming `mvn install` publishes anything beyond the local machine.** It only populates the local `~/.m2/repository`; `deploy` (to an explicitly configured remote repository) is the separate step that actually publishes.

**2. Declaring a dependency with `compile` scope (the default) when `test` or `provided` scope is what was actually intended**, unintentionally bundling a test-only or environment-supplied dependency into the shipped artifact.

**3. Assuming Maven's default plugin versions and bindings are fixed and unchangeable.** They are ordinary configurable plugins; explicit `<plugin>` blocks in `<build>` can override versions or add configuration.

**4. Reading only a project's own `pom.xml` to understand its actual build behavior**, rather than checking `mvn help:effective-pom` when inherited defaults or a parent POM might explain an otherwise-confusing result.

**5. Not noticing that a transitively pulled-in dependency inherited the scope of the dependency that pulled it in**, leading to surprise about what scope a deep transitive dependency actually has.

**6. Assuming a later lifecycle phase might still run after an earlier one fails.** A `BUILD FAILURE` at `test` genuinely halts the build; `package`, `install`, and `deploy` never run for that invocation.

## Best practices

- State a dependency's scope explicitly and deliberately (`test`, `provided`, `runtime`, or the `compile` default) rather than always accepting whatever scope happens to be convenient.
- Use `mvn dependency:tree` to inspect the actual resolved dependency graph and scopes, rather than assuming from the POM's direct dependencies alone.
- Reach for `mvn help:effective-pom` before assuming a build's behavior is inexplicable; it is very often an inherited default.
- Treat `install` and `deploy` as genuinely separate, deliberate steps — never assume one implies the other.
- Rely on Maven's standard directory layout (`src/main/java`, `src/test/java`) rather than overriding source directories without a specific reason to.
- Treat a `BUILD FAILURE` at any phase as a hard stop, not a warning to work around; fix the actual failure rather than skipping the phase that caught it.
- Use `mvn -o` (offline mode) periodically to confirm a build has no hidden, undeclared dependency on reaching a remote repository at build time.

## Summary

- A minimal POM declares identity, packaging, and dependencies; Maven's own conventions and default lifecycle bindings supply everything else needed to actually build the project.
- The lifecycle's everyday phases (`compile`, `test`, `package`, `install`, `deploy`) run in order, each producing a specific, inspectable result — a compiled class, a test report, a packaged jar, a locally-installed artifact.
- `mvn install` copies the built artifact into the local repository only; it never publishes anything to a remote environment, which is what the separate `deploy` phase (with its own configured remote repository) is specifically for.
- A dependency's scope (`compile`, `test`, `provided`, `runtime`) controls when it is available and whether it travels with the artifact to consumers, and scope propagates down the transitive dependency graph.
- Every lifecycle phase is implemented by a plugin goal bound to it; `mvn help:effective-pom` reveals the fully resolved configuration, including every inherited default your own POM never states explicitly.
- Because phases run in order and each depends on the previous ones succeeding, a test failure at the `test` phase genuinely halts the build, preventing `package`, `install`, and `deploy` from ever running for that invocation.

## Practice

Warm-up:

1. Create a minimal Maven project with a single class and a single JUnit test, and run `mvn test`, reading the phase-by-phase output produced.
2. Run `mvn help:effective-pom` on that same project and locate the `<repositories>` block, identifying which remote repository your build resolves dependencies from by default.
3. Run `mvn package` on the same project and locate the produced jar file under `target/`.
4. Deliberately break the test's assertion, run `mvn test`, and read the resulting `BUILD FAILURE` output to identify exactly which assertion failed and on which line.
5. Run `mvn install` and locate the resulting files under your local `~/.m2/repository`, confirming nothing was published anywhere remote.

Core:

1. Add a second dependency with `provided` scope to a project, and use `mvn dependency:tree` to confirm its scope, contrasting it with a `test`-scoped dependency in the same project.
2. Deliberately delete the local `~/.m2/repository` cache for one dependency and re-run `mvn test`, observing Maven re-download it from the remote repository identified in the effective POM.
3. Run `mvn help:effective-pom` on a project and identify at least three configuration values present in the effective POM that do not appear anywhere in your own hand-written `pom.xml`, including which remote repository is configured purely by inheritance.
4. Deliberately misconfigure a dependency's scope (using `compile` where `test` was intended) and use `dependency:tree` to demonstrate the consequence for what a consumer of this artifact would receive.
5. Confirm that `mvn package` alone, without `install`, produces a jar under `target/` but leaves the local `~/.m2/repository` untouched for that artifact's version.

Challenge:

1. Configure the `maven-compiler-plugin` explicitly (rather than via the `maven.compiler.release` property shorthand) to pin a specific compiler plugin version, and confirm via `mvn help:effective-pom` that your explicit configuration overrides the inherited default.
2. Run the same project in offline mode with `mvn -o test` after first populating the local repository normally, and confirm it succeeds without any network access; then clear the local cache and confirm offline mode now fails, demonstrating exactly what "offline" depends on.
3. Research (and briefly document, in a comment) the difference between a project's parent POM and a "bill of materials" (BOM) import, and explain a scenario where a BOM would be the more appropriate choice for managing dependency versions across multiple modules.
4. Deliberately break a test in a small project, run `mvn install`, and confirm the build stops at `test` with `BUILD FAILURE`, never reaching `package` or producing a jar at all.

## Check your understanding

1. What is the minimum a POM must declare, and what does Maven supply automatically based on that declaration?
2. What specific artifact does `mvn package` produce, and where does it appear?
3. Does `mvn install` deploy an application to production? What does it actually do, and what separate step is required to actually publish somewhere remote?
4. What does a dependency's `test` scope control, and why did every transitive dependency of a `test`-scoped dependency also show up as `test` scope in this lesson's `dependency:tree` output?
5. What is the relationship between a lifecycle phase and a plugin goal, using `compiler:compile` bound to the `compile` phase as a concrete example?
6. What does `mvn help:effective-pom` reveal that reading a project's own `pom.xml` alone would not?
7. Why does a failing test at the `test` phase prevent `mvn install` from ever producing a locally-installed artifact for that run?
8. What does `mvn -o` (offline mode) do, and why is it a useful way to confirm a build has no hidden, undeclared dependency on network access?
9. Which remote repository does this lesson's project resolve dependencies from, and where does that configuration actually come from given that the project's own `pom.xml` never mentions it?
