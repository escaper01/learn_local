# Maven POM, lifecycle, scopes, plugins, and effective configuration

## Maven builds from a declared model
A pom.xml identifies groupId, artifactId, and version, dependencies, plugins, and properties. The conventional layout separates src/main/java, src/main/resources, src/test/java, and src/test/resources.
```xml
<properties>
  <maven.compiler.release>21</maven.compiler.release>
  <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
</properties>
```
This is a POM fragment, not a complete build file. Declare plugin and dependency versions explicitly or inherit a reviewed managed set. Use the committed Maven Wrapper with a release supporting Java 21.

## Lifecycle and scope
Running verify executes earlier phases such as compile, test, and package. install also places the artifact in the local repository; it does not deploy to production. test-scoped dependencies belong to tests, provided dependencies are expected from the runtime environment, and runtime dependencies need not be on the compile classpath.

## Practice
Create a small external Maven project, run `./mvnw verify` or `.\mvnw.cmd verify`, inspect target, and inspect help:effective-pom and dependency:tree. Break one test and ensure verify fails. Explain why skipping tests while packaging produces a different level of evidence.
