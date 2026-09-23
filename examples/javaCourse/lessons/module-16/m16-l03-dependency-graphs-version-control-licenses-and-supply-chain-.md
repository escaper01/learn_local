# Dependency graphs, version control, licenses, and supply-chain risk

## A dependency adds obligations
Library coordinates identify an artifact and version. Transitive dependencies arrive through other dependencies and can introduce conflicts, licenses, vulnerabilities, or unexpected code. A declared version alone does not reveal the complete resolved graph.

```text
./mvnw dependency:tree
./gradlew dependencies
./gradlew dependencyInsight --dependency example-library
```
Choose the command for your build tool. Version alignment and dependency management centralize compatible sets, while lockfiles or locking features constrain resolution according to the tool's model.

## Review questions
What problem does the library solve? Is it maintained? Which transitive libraries does it add? Does its license fit distribution? Can its features be configured narrowly? What is the upgrade and removal plan? Do not use a forced major upgrade merely to silence a scanner without checking compatibility.

## Practice
Document the resolved graph of a small JUnit project. Introduce two paths to different versions of one library and inspect the selected version. Remove an unused dependency and verify the build. Record checksums/provenance and an SBOM approach for a release. Dependency scanning identifies known issues; it does not prove absence of vulnerabilities.
