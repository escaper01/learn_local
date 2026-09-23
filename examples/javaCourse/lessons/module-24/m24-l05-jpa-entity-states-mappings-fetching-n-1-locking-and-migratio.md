# JPA entity states, mappings, fetching, N+1, locking, and migrations

## ORM still executes SQL
An entity can be transient, managed, detached, or removed. A persistence context tracks managed state and identity; changes may flush later than the setter call.
```java
@jakarta.persistence.Entity
class TaskEntity {
    @jakarta.persistence.Id @jakarta.persistence.GeneratedValue
    private Long id;
    @jakarta.persistence.Version
    private long version;
    @jakarta.persistence.Column(nullable = false, length = 200)
    private String title;
    protected TaskEntity() {}
}
```
This Jakarta Persistence fragment needs a provider, database, and complete application configuration. Versioning can detect conflicting writes. Entity equality and generated IDs require care; records and DTOs often serve different roles.

## Fetch deliberately
Lazy relations can produce N+1 queries or fail outside the persistence context. Eager relations can overfetch. Choose fetch joins, projections, or entity graphs per use case and measure generated SQL. Cascading operations differ from foreign-key cascades.

## Practice
Create one owner with many tasks and record query counts for a report. Fix an N+1 case without globally marking every relationship eager. Test optimistic conflict and schema migration on the real database engine. Version changes with migrations instead of relying on automatic schema mutation in production.
