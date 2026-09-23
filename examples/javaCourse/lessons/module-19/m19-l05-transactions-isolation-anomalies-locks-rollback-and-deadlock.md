# Transactions, isolation anomalies, locks, rollback, and deadlocks

## One invariant, one transaction
A transfer must debit and credit atomically. JDBC connections commonly begin in auto-commit mode; disable it for multi-step work.
```java
try (var connection = dataSource.getConnection()) {
    connection.setAutoCommit(false);
    try {
        debit(connection);
        credit(connection);
        connection.commit();
    } catch (java.sql.SQLException failure) {
        try { connection.rollback(); }
        catch (java.sql.SQLException rollback) { failure.addSuppressed(rollback); }
        throw failure;
    }
}
```
This is a SQL-failure sketch. A complete implementation must also define rollback for application exceptions and restore connection state according to pool policy.

## Isolation and locks
Isolation levels affect dirty reads, nonrepeatable reads, and phantoms according to the database's actual implementation. Optimistic version checks detect competing updates; pessimistic locks block other operations. Deadlocks can still occur; consistent access order and bounded retry of the whole safe transaction can help.

## Practice
Inject failure between debit and credit and prove neither persists. Run competing updates from two connections. Keep network calls outside the transaction when possible. Explain why retrying only the final statement can violate the original transaction's assumptions.
