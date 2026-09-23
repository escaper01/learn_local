# Services, repositories, transaction proxy boundaries, and testing slices

## A service represents a use case
A service coordinates domain operations and persistence. A repository offers needed storage operations. The transaction should cover the invariant and be kept short.
```java
@org.springframework.transaction.annotation.Transactional
public void complete(long id) {
    Task task = repository.find(id).orElseThrow();
    task.complete();
    repository.save(task);
}
```
This member fragment belongs to a configured Spring bean. In default proxy mode, an internal this.complete(...) call bypasses transaction interception. Defaults commonly roll back on unchecked exceptions and Error, not every checked exception; configure and test the intended policy for the pinned version.

## Test layers
Plain unit tests exercise decisions without starting Spring. Web slices test request mapping and validation; persistence slices test mapping; full-context tests verify essential wiring. A mock repository cannot establish transactional behavior, and an in-memory database can differ from the production engine.

## Practice
Inject failure after one update and verify rollback against the chosen database. Call the method through a bean and through self-invocation and explain the distinction. Document transaction propagation and avoid a slow external HTTP call while holding database locks.
