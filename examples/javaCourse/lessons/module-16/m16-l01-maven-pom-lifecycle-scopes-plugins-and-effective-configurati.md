# Maven POM, lifecycle, scopes, plugins, and effective configuration

Every Java project eventually needs an answer to three questions that have nothing to do with the language itself: what exactly does this project depend on, in what order do compiling, testing, and packaging happen, and can a stranger reproduce the same artifact on a different machine? Maven answers all three with one declarative file, the Project Object Model (`pom.xml`), and a fixed lifecycle that every Maven project shares.

This lesson treats Maven as a model to read, not a set of commands to memorize. Once you can read a POM and predict what `mvn verify` will do, the commands become mechanical.

What you will learn:

- What coordinates identify an artifact, and how the standard directory layout maps to them
- The build lifecycle, its phases, and why later phases imply earlier ones
- Dependency scopes and what each one promises about compile time versus runtime
- How plugins bind goals to phases, and the difference between `<plugins>` and `<pluginManagement>`
- How to read the *effective* POM and the dependency tree, not just the file you wrote
- How transitive dependency conflicts are resolved, and how to pin a version deliberately
- How to read and reason about a real build failure

## Coordinates and layout

A Maven artifact is identified by three required coordinates, plus packaging:

```xml
<groupId>com.example.billing</groupId>
<artifactId>invoice-service</artifactId>
<version>1.4.0</version>
<packaging>jar</packaging>
```

`groupId` is a reverse-domain namespace, `artifactId` is the project's name within that namespace, and `version` identifies a specific build. Together they form a **GAV** coordinate, and Maven uses exactly this triple to locate a JAR in a repository: `~/.m2/repository/com/example/billing/invoice-service/1.4.0/invoice-service-1.4.0.jar`.

The **standard directory layout** is a convention, not a requirement, but deviating from it means overriding paths in the POM for no benefit:

```text
pom.xml
src/main/java/          production source
src/main/resources/     files copied onto the classpath (config, templates)
src/test/java/          test source
src/test/resources/     files copied onto the test classpath
target/                 all generated output; safe to delete
```

Because the layout is conventional, tools built around Maven (IDEs, CI systems, static analyzers) can find your source without any configuration at all. That predictability is the point: a Maven project you have never seen still has files exactly where you expect them.

## The build lifecycle

Maven defines three built-in **lifecycles** (`clean`, `default`, `site`). The one you use daily is `default`, an ordered sequence of **phases**:

```text
validate → compile → test → package → verify → install → deploy
```

Running a phase runs every earlier phase in the same lifecycle first. `mvn package` compiles and tests before it packages; `mvn test` compiles main and test sources before running any test. This is why `mvn test` is the right command to check "do the tests pass" and `mvn verify` is the right command to check "is this a shippable artifact", while `mvn install` additionally copies that artifact into your local repository (`~/.m2/repository`) so *other local projects* can depend on it — it does not upload anywhere, and it does not touch a running system.

| Phase | Question it answers |
|---|---|
| `validate` | Is the project structure and POM correct? |
| `compile` | Does `src/main/java` compile? |
| `test` | Do the unit tests in `src/test/java` pass, against compiled main code? |
| `package` | Can the compiled classes and resources be assembled into a JAR? |
| `verify` | Do integration tests and quality checks pass against the packaged artifact? |
| `install` | Is the artifact available to other projects on this machine? |
| `deploy` | Is the artifact published to a shared remote repository? |

A team that runs `mvn package -DskipTests` to "save time" has produced a JAR with no evidence that it works. That JAR is not the same *level of evidence* as one produced by `mvn verify`: both are bytes, but only one has been checked. CI pipelines should run at least `verify`, never a phase that skips testing, and packaging failures should be read as "the project cannot currently produce a shippable artifact", not as an obstacle to route around.

## Dependency scopes

A `<dependency>` without a scope defaults to `compile`, which is the most visible: available while compiling your code, while testing it, and at runtime. Other scopes narrow that visibility deliberately:

| Scope | Compile classpath | Test classpath | Runtime classpath | Typical use |
|---|---|---|---|---|
| `compile` (default) | yes | yes | yes | Libraries your code calls directly |
| `provided` | yes | yes | no | Servlet API, Lombok — supplied by the container or already applied at compile time |
| `runtime` | no | yes | yes | JDBC drivers loaded by class name, not imported |
| `test` | no | yes | no | JUnit, AssertJ, Mockito |
| `system` | yes | yes | no | A local JAR not in any repository (avoid; not portable) |
| `import` | n/a | n/a | n/a | Only inside `<dependencyManagement>`, to pull in a BOM |

The scope is a promise about *where the code is needed*, and misdeclaring it produces exactly the wrong kind of failure: a `provided` dependency that should have been `compile` builds fine on your machine (where the real thing happens to be on the classpath already) and throws `NoClassDefFoundError` in production, where it is missing.

```xml
<dependencies>
  <dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <version>42.7.3</version>
    <scope>runtime</scope>
  </dependency>
  <dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter</artifactId>
    <version>5.10.2</version>
    <scope>test</scope>
  </dependency>
</dependencies>
```

The JDBC driver is `runtime` because application code talks to `java.sql.Connection`, never to the driver class directly; the driver registers itself when the JAR is on the classpath. Declaring it `compile` would not be wrong for behavior, only for honesty about why it is there.

## Plugins: goals bound to phases

A **plugin** is a set of **goals** (individual units of work, like `compiler:compile` or `surefire:test`). The Maven lifecycle itself does nothing without plugins bound to its phases; the `compile` phase is empty until a plugin binds a goal to it. Most bindings are implicit, supplied by the packaging type, but explicit configuration is common:

```xml
<build>
  <pluginManagement>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.13.0</version>
      </plugin>
    </plugins>
  </pluginManagement>
  <plugins>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-compiler-plugin</artifactId>
      <configuration>
        <release>21</release>
      </configuration>
    </plugin>
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-surefire-plugin</artifactId>
      <version>3.2.5</version>
    </plugin>
  </plugins>
</build>
```

`<pluginManagement>` declares a version (and optional default configuration) without activating the plugin; `<plugins>` outside it is what actually runs during the build. In a multi-module project, a parent POM's `pluginManagement` lets every child pin the same plugin version by declaring the plugin with no `<version>` of its own — one place to bump, every module follows. Confusing the two is a common source of "it built differently on my machine": a plugin declared only in `pluginManagement` never runs at all.

## Reading the effective configuration

The POM you wrote is rarely the whole story: parent POMs, `pluginManagement`, and Maven's own super-POM all contribute defaults you never typed. Two commands make the *actual* configuration visible instead of assumed:

```text
mvn help:effective-pom
```

prints the fully resolved POM — every inherited property, every plugin version, every default — as one file. When a build behaves differently than the POM in your editor suggests, this is the first thing to read, because it shows what Maven is actually using, not what you wrote.

```text
mvn dependency:tree
```

```text
[INFO] com.example.billing:invoice-service:jar:1.4.0
[INFO] +- org.springframework:spring-context:jar:6.1.6:compile
[INFO] |  \- org.springframework:spring-core:jar:6.1.6:compile
[INFO] +- com.fasterxml.jackson.core:jackson-databind:jar:2.17.0:compile
[INFO] |  +- com.fasterxml.jackson.core:jackson-core:jar:2.17.0:compile
[INFO] |  \- com.fasterxml.jackson.core:jackson-annotations:jar:2.17.0:compile
[INFO] \- org.junit.jupiter:junit-jupiter:jar:5.10.2:test
```

Every indirect dependency (a *transitive* dependency, pulled in because something you declared depends on it) appears here with the scope it will actually run at, which can differ from what you would expect from the top-level declaration alone.

## Version conflicts and dependency mediation

Two different direct dependencies can require different versions of the same transitive library. Maven resolves this with **nearest-wins**: the version declared at the shallowest depth in the tree wins, and if two candidates are equally shallow, the first one listed wins. This is a deterministic rule, but it is not a *correct* one — it says nothing about whether the chosen version is compatible with every consumer of it.

```text
[INFO] +- com.example:reporting-lib:jar:2.0.0:compile
[INFO] |  \- com.fasterxml.jackson.core:jackson-databind:jar:2.15.0:compile
[INFO] \- com.fasterxml.jackson.core:jackson-databind:jar:2.17.0:compile
```

Here, the direct declaration (depth 1) wins over the transitive one (depth 2) regardless of listing order, so `2.17.0` is used. When mediation picks a version you did not intend, pin it explicitly rather than hoping the graph resolves the way you want:

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
      <version>2.17.0</version>
    </dependency>
  </dependencies>
</dependencyManagement>
```

`dependencyManagement` fixes the version for every module that declares the dependency without a version of its own, which is exactly how a **BOM** (Bill of Materials, imported with `<scope>import</scope>` and `<type>pom</type>`) lets a whole family of libraries agree on compatible versions from one import.

## Reading a real build failure

A failing build is not an obstacle between you and a green checkmark; it is the most precise diagnostic Maven gives you, if you read it in order. Consider a project where a test asserts the wrong expected value:

```java
// src/test/java/GreeterTest.java
import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;

class GreeterTest {
    @Test
    void greetsByName() {
        assertEquals("Hello, Ada!", new Greeter().greet("Ada"));
    }
}
```

```java
// src/main/java/Greeter.java
public class Greeter {
    public String greet(String name) {
        return "Hi, " + name + "!";
    }
}
```

Running `./mvnw test` produces:

```text
[INFO] -------------------------------------------------------
[INFO]  T E S T S
[INFO] -------------------------------------------------------
[INFO] Running GreeterTest
[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.045 s <<< FAILURE! - in GreeterTest
[ERROR] greetsByName  Time elapsed: 0.012 s  <<< FAILURE!
org.opentest4j.AssertionFailedError:
Expected :Hello, Ada!
Actual   :Hi, Ada!
	at GreeterTest.greetsByName(GreeterTest.java:8)

[INFO] Results:
[ERROR] Failures:
[ERROR]   GreeterTest.greetsByName:8 expected: <Hello, Ada!> but was: <Hi, Ada!>
[INFO] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE
[INFO] ------------------------------------------------------------------------
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.2.5:test (default-test) on project greeter-demo: There are test failures.
[ERROR]
[ERROR] Please refer to target/surefire-reports for the individual test results.
[ERROR] -> [Help 1]
```

Read this from the top down, not the bottom up. The **Expected/Actual** pair tells you exactly which assertion failed and what the two values were; the stack trace's first line (`GreeterTest.java:8`) tells you exactly which line to open; and only the last few lines name the phase (`test`) and the plugin goal that reported failure. The `BUILD FAILURE` banner and nonzero exit code are what stop a CI pipeline — a script or workflow that only checks for that banner, without reading the failure above it, throws away the one thing that made the failure fast to fix. Once the assertion is corrected to match the intended behavior (or the production code is fixed, whichever the requirement actually calls for), `./mvnw test` reports `BUILD SUCCESS` with the same structure, just with `Tests run: 1, Failures: 0, Errors: 0` in the summary.

## What happens under the hood: from `mvn verify` to an artifact

1. Maven reads `pom.xml`, resolves parent POMs, and merges `pluginManagement` and inherited settings into the effective POM.
2. It resolves every dependency's GAV against the local repository (`~/.m2`), downloading from configured remote repositories only for artifacts not already cached.
3. It builds the dependency graph, applies nearest-wins mediation, and constructs the classpath per scope.
4. It walks the `default` lifecycle from `validate` through the requested phase, running each goal bound to each phase in declared order.
5. `compile` invokes `javac` against `src/main/java` with the resolved compile-scope classpath; `test-compile` does the same for `src/test/java` against compile+test scope.
6. `test` invokes Surefire, which discovers test classes, runs them in a forked JVM, and writes reports to `target/surefire-reports`.
7. `package` assembles `target/classes` and resources into the packaging type's artifact (a JAR, by default).
8. Any goal that reports failure stops the lifecycle immediately and Maven exits with a nonzero code, which is what a CI system checks to gate a merge.

## Common mistakes

**Mistake 1: skipping tests to "fix" a broken build.**

```text
mvn package -DskipTests
```

This produces an artifact with unknown correctness, not a working one. Fix: treat a test failure as work to do, not an obstacle to bypass; `-DskipTests` has legitimate narrow uses (like packaging a known-good commit for a downstream tool) but should never be how CI decides to ship.

**Mistake 2: declaring every dependency as `compile`.**

A JDBC driver or a servlet container API declared `compile` still builds correctly, so the mistake is invisible until someone tries to understand why the dependency is there, or until a `provided` dependency that should have been `runtime` ships an unwanted transitive class into the final JAR. Fix: choose scope from where the code is actually needed, not from what makes the build pass.

**Mistake 3: trusting the top-level POM instead of the effective one.**

Debugging a plugin version mismatch by re-reading `pom.xml` misses inherited defaults entirely. Fix: run `mvn help:effective-pom` before assuming what configuration is active.

**Mistake 4: pinning nothing and hoping mediation is right.** Nearest-wins is deterministic, not correct; a refactor that changes dependency depth can silently change which transitive version wins. Fix: pin cross-cutting library versions in `dependencyManagement`, and re-run `dependency:tree` after adding a dependency to check what actually changed.

## Best practices

- Keep the standard directory layout; only override paths with a documented reason.
- Use `verify`, never a phase that skips tests, as the definition of "the build passed."
- Choose scope by where code is genuinely needed: `test`-only tools stay off the runtime classpath.
- Put shared plugin and dependency versions in `pluginManagement` / `dependencyManagement` once, at the parent.
- Run `dependency:tree` after adding or upgrading a dependency, not only when something breaks.
- Read a build failure top-to-bottom: the assertion or compiler message first, the failing phase/goal last.
- Commit the Maven Wrapper (`mvnw`, `mvnw.cmd`, `.mvn/wrapper/`) so every contributor and CI runner uses the same Maven version.

## Summary

- Coordinates (`groupId:artifactId:version`) identify an artifact; the standard layout is a convention every tool assumes.
- The `default` lifecycle is ordered; running a later phase implies every earlier one, which is why `verify` — not `package` — is the right gate.
- Scopes (`compile`, `provided`, `runtime`, `test`, `system`, `import`) declare *where* a dependency is needed, and a wrong scope produces a failure only visible outside the build.
- Plugins bind goals to phases; `pluginManagement` declares defaults, `<plugins>` activates them.
- `help:effective-pom` and `dependency:tree` show what Maven is actually using, which is often more than what you typed.
- Nearest-wins mediation is deterministic but not necessarily correct; pin cross-cutting versions explicitly when it matters.
- A build failure's assertion/compiler message and file:line are the useful part; the `BUILD FAILURE` banner is only the signal that stops the pipeline.

## Practice

1. **Warm-up:** For a dependency that is only needed to compile against an annotation used at build time but never referenced at runtime, which scope fits, and why?
2. **Warm-up:** Explain, without running anything, why `mvn install` on one project can make a second local project build successfully where it previously failed with "could not resolve dependency."
3. **Core:** Create a small external Maven project (or use one you already have) with the standard layout, run `./mvnw verify`, and inspect `target/`. Then run `mvn help:effective-pom` and find one plugin version you did not write yourself.
4. **Core:** Run `mvn dependency:tree` on a project with at least three dependencies, find one transitive dependency, and explain from the tree output why it appears and what scope it carries.
5. **Core:** Deliberately break one assertion in a test, run `./mvnw test`, and write down the exact file:line the stack trace points to before opening the file.
6. **Challenge:** Introduce two dependencies that transitively pull in different versions of the same library, run `dependency:tree`, and pin the version explicitly with `dependencyManagement`. Confirm with `dependency:tree` again that your pinned version is now used everywhere.

## Check your understanding

1. Why does `mvn package -DskipTests` produce an artifact with a lower level of evidence than `mvn verify`, even though both may produce an identical JAR?
2. A dependency is available at compile time on your machine but throws `NoClassDefFoundError` in production. Which scope was most likely misapplied, and why does it build fine locally?
3. What is the difference between declaring a plugin in `<pluginManagement>` only versus declaring it in `<plugins>`?
4. Why is nearest-wins dependency mediation deterministic without being guaranteed correct?
5. When a build failure report shows both an `AssertionFailedError` and a `BUILD FAILURE` banner, which one should you read first, and why?
6. What problem does a BOM (imported with `<scope>import</scope>`) solve that individually versioning each dependency does not?
