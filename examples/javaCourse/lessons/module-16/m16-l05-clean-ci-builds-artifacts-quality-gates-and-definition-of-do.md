# Clean CI builds, artifacts, quality gates, and definition of done

## CI reproduces the development contract
A clean checkout must resolve controlled dependencies, compile, run checks, and produce an artifact with a traceable revision. CI should invoke the same wrapper commands used locally.
```text
./mvnw --batch-mode verify
```
For Gradle use the corresponding wrapper build command. A pipeline can separate fast unit tests from slower integration tests while keeping failures visible. Store reports and artifacts so reviewers can inspect what ran.

## Definition of done
A code change may also require migration, documentation, compatibility testing, dependency review, and an operational rollback plan. Select checks by risk. A flaky test is a defect in the delivery system; repeatedly rerunning until green hides uncertainty.

## Practice
Configure a pipeline on a training repository, intentionally fail a unit test, and confirm no release artifact is promoted. Include Java-version reporting and artifact revision metadata. Explain the difference between building once and promoting the same artifact versus rebuilding independently for production. Keep secrets in the CI secret facility and ensure logs do not print them.
