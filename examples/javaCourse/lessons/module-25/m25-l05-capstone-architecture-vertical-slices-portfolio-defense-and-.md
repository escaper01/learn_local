# Capstone architecture, vertical slices, portfolio defense, and continued growth

## Deliver a task service in vertical slices
Begin with create/list/complete commands over an in-memory domain. Next add durable storage and restart behavior, then an HTTP adapter and explicit JSON DTOs. Add dependency-managed tests, migrations, authentication/authorization, failure handling, bounded concurrency, observability, and deployment documentation only as each slice earns them.

## Acceptance evidence
The final repository must include:
- protected task invariants and a documented transition table;
- unit tests, real-database integration tests, HTTP contract tests, and failure injection;
- reproducible build commands, schema migrations, and old-version fixtures;
- secret-safe logs, health endpoints, shutdown behavior, resource limits, and an operations runbook;
- architecture decisions covering ownership, transactions, idempotency, security, and performance.

The LearnLocal checkpoint tests only a bounded executable slice. It cannot certify the complete portfolio or professional readiness. Reading pages or printing a readiness phrase does not establish mastery.

## Defense
Demonstrate a feature from requirement to persisted result. Diagnose a seeded failure using evidence, modify a rule without breaking unrelated behavior, and explain one tradeoff you would change at larger scale. A reviewer should be able to clone the project, run documented commands, and reproduce your evidence. Continued experience and review develop expertise beyond this course.
