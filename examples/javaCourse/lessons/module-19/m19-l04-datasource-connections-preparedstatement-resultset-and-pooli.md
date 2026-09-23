# DataSource, connections, PreparedStatement, ResultSet, and pooling

## Separate SQL text from values
```java
String sql = "SELECT title FROM task WHERE id = ?";
try (var connection = dataSource.getConnection();
     var statement = connection.prepareStatement(sql)) {
    statement.setLong(1, id);
    try (var rows = statement.executeQuery()) {
        if (rows.next()) System.out.println(rows.getString("title"));
    }
}
```
This fragment requires an initialized DataSource and a JDBC driver for an external database. Parameters are one-based. Binding values handles types and prevents the value from becoming SQL syntax. Placeholders cannot replace table names or sort directions; whitelist such structural choices.

## Resource and result contracts
Closing a pooled connection generally returns it to the pool. Never keep it in a global field across unrelated requests. ResultSet starts before the first row. Primitive getters may require wasNull to distinguish SQL NULL from a default primitive value; use appropriate nullable retrieval.

## Practice
Implement findById and a bounded list query. Test malicious-looking text as a bound value. Verify no resources leak on mapping failure. Document query timeout and pool limits. An in-memory repository fake does not validate driver behavior or SQL syntax.
