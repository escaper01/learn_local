# INSERT, UPDATE, DELETE, affected rows, and schema evolution

## Every modification needs a target
```sql
UPDATE task SET status = 'DONE'
WHERE id = 42 AND status = 'OPEN';
```
The condition includes the expected prior state. An affected-row count of zero may mean absence or a conflicting state; define how the application distinguishes them. Forgetting WHERE can update every row. Verify destructive statements in a disposable test database.

INSERT supplies rows subject to constraints. DELETE removes rows and may trigger foreign-key restrictions or cascades. Upsert syntax and behavior vary by database; do not assume one dialect's statement is portable.

## Evolve schemas safely
Version migrations and test against a previous populated schema. Adding a non-null column to existing data requires a backfill/default strategy. For rolling deployments, add compatible structures first, migrate data, switch readers/writers, and remove old structures only after old code is gone.

## Practice
Create and complete a task while checking row counts. Attempt a forbidden delete under a foreign key. Write a migration adding priority and test old rows receive a meaningful value. Include recovery and backup assumptions; automatically dropping data is not a safe rollback plan.
