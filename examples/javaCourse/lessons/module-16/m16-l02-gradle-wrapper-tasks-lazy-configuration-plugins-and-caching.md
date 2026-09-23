# Gradle wrapper, tasks, lazy configuration, plugins, and caching

## Gradle models tasks and their inputs
A Java project can use this build.gradle.kts fragment:
```kotlin
plugins { java }
java {
    toolchain { languageVersion.set(JavaLanguageVersion.of(21)) }
}
repositories { mavenCentral() }
tasks.test { useJUnitPlatform() }
```
The test framework dependency and versions must also be declared. The wrapper pins Gradle itself; the Java toolchain selects the compiler/runtime used for tasks. Commit wrapper files and use a compatible reviewed version rather than relying on a machine-global install.

## Configuration versus execution
Gradle first configures a task graph, then executes selected work. Lazy task registration avoids unnecessary configuration. Inputs and outputs enable up-to-date checks and caching; undeclared environment-dependent inputs can produce stale results.

## Practice
Run tasks, test, and build using the wrapper. Change one source file and observe what rebuilds. Compare a clean build with an incremental build. Avoid network calls and side effects during configuration. Explain why a successful IDE run does not prove the command-line build contains the same dependencies or test configuration.
