# DataSource, connections, PreparedStatement, ResultSet, and pooling

JDBC (Java Database Connectivity) is the standard API Java code uses to talk to a relational database, and this lesson is where the SQL from the previous three lessons meets real Java code — with a security concern (SQL injection) that makes `PreparedStatement` non-negotiable, a resource-lifecycle concern (connections are expensive and finite) that makes pooling essential, and a correctness concern (a `ResultSet` is not a `List`) that trips up code written by someone who has not read the API carefully.

What you will learn:

- What a `DataSource` is, and why it replaces manually constructing connections
- Why a connection pool exists, and what happens when connections are not returned to it
- `PreparedStatement` versus building SQL by string concatenation — and why one is a security boundary
- Exactly what a bound parameter can and cannot represent, and why table/column names cannot be parameters
- How to read a `ResultSet` correctly, including its cursor model and column access by index versus name
- Resource cleanup with try-with-resources for connections, statements, and result sets together

## DataSource: the standard way to obtain a connection

`java.sql.DataSource` is the interface application code depends on to get a `Connection` — in a real application, backed by a **connection pool** implementation (HikariCP is the most widely used in modern Java), not by directly calling `DriverManager.getConnection(...)` for every request:

```java
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

public class DataSourceUsage {

    void handleRequest(DataSource dataSource) throws SQLException {
        try (Connection connection = dataSource.getConnection()) {
            // use the connection
        } // connection.close() here returns it to the pool — it does NOT close the underlying TCP socket
    }
}
```

The crucial detail: with a pooled `DataSource`, calling `connection.close()` does **not** terminate the underlying database connection — it returns the `Connection` object to the pool for reuse by the next request. This is precisely why try-with-resources (or an equivalent guaranteed `finally`) is essential here, in the same spirit as the sockets from Chapter 18: a connection never returned to the pool is a connection the pool believes is still in use, permanently reducing the pool's effective capacity for every future request, until the pool itself is exhausted and new requests start failing or blocking.

## Why connection pooling exists at all

Establishing a real database connection involves a TCP handshake (Chapter 18, Lesson 1), often a TLS handshake, and the database's own authentication and session setup — measured in tens of milliseconds at best, far too slow to redo for every single query in a busy application. A **connection pool** keeps a bounded number of already-established connections open and hands them out and takes them back as requests need them, exactly the bounded-resource discipline the concurrency chapter applied to thread pools:

```java
// Illustrative pool configuration (HikariCP)
HikariConfig config = new HikariConfig();
config.setJdbcUrl("jdbc:postgresql://db.internal:5432/orders");
config.setUsername("app_user");
config.setPassword(loadSecretFromVault());
config.setMaximumPoolSize(20);       // bounded, exactly like an executor's thread pool
config.setConnectionTimeout(5_000);  // how long a caller waits for a connection before failing
HikariDataSource dataSource = new HikariDataSource(config);
```

A pool sized too small under real load queues requests waiting for a connection exactly as an undersized thread pool queues tasks; a pool sized too large can exceed what the database server itself can handle concurrently, since the database has its own connection limit independent of anything the application decides. Sizing a pool correctly is an empirical exercise (informed by the database's own limits and the application's actual concurrency), not a default left untouched — and every connection genuinely leaked by forgotten cleanup shrinks that carefully chosen number in production, silently, until requests start timing out waiting for a connection that will never come back.

## PreparedStatement versus string concatenation: a security boundary, not a style preference

Building SQL by concatenating a variable directly into the query text is the classic **SQL injection** vulnerability, and it belongs in the same category as this course's other "never interpolate untrusted input into an executable string" rules for shell commands:

```java
// NEVER DO THIS: string concatenation lets input become SQL syntax, not just a value.
String email = userSuppliedEmail; // imagine this is: "' OR '1'='1"
Statement statement = connection.createStatement();
ResultSet results = statement.executeQuery(
    "SELECT * FROM customer WHERE email = '" + email + "'");
// The actual query executed: SELECT * FROM customer WHERE email = '' OR '1'='1'
// This returns EVERY row in the table, not zero, because '1'='1' is always true.
```

A `PreparedStatement` sends the SQL text and the parameter values **separately** to the database: the SQL is parsed and its structure fixed *before* any parameter value is supplied, so a malicious value can never be interpreted as SQL syntax — it is always bound as a literal value for that specific position, whatever characters it contains:

```java
String sql = "SELECT * FROM customer WHERE email = ?";
try (PreparedStatement statement = connection.prepareStatement(sql)) {
    statement.setString(1, userSuppliedEmail); // bound as a literal value, never parsed as SQL
    try (ResultSet results = statement.executeQuery()) {
        // process results
    }
}
```

Even with the same malicious input `"' OR '1'='1"`, the `PreparedStatement` version searches for a customer whose email is *literally* that entire string — which almost certainly matches nothing — instead of altering the query's logic at all. This is not a matter of "cleaner code" or performance (though prepared statements are often also faster for repeated execution, since the database can cache the parsed query plan): it is the only correct way to include untrusted data in a SQL statement, full stop.

## What a bound parameter can and cannot represent

A `PreparedStatement`'s `?` placeholder can only ever bind a **value** — a string, a number, a date — never a piece of SQL **structure**: a table name, a column name, the `ASC`/`DESC` direction of an `ORDER BY`, or the operator in a comparison. Code that needs to vary those structural elements based on user input must build that part of the SQL text through controlled, validated construction — never by binding it as a parameter, and never by concatenating raw user input into it either:

```java
// WRONG: cannot bind a table/column name as a parameter; this simply doesn't compile
// into valid, parameterizable SQL in the way you might expect.
// statement.setString(1, tableName); // does not work for "FROM ?"

// WRONG: concatenating a user-supplied column name directly re-introduces injection.
String sql = "SELECT * FROM orders ORDER BY " + userSuppliedColumnName;

// CORRECT: validate the structural choice against a fixed allow-list before building the SQL text.
static final java.util.Set<String> ALLOWED_SORT_COLUMNS = java.util.Set.of("placed_at", "total_cents", "id");

String buildOrderedQuery(String requestedColumn) {
    String column = ALLOWED_SORT_COLUMNS.contains(requestedColumn) ? requestedColumn : "id";
    return "SELECT * FROM orders ORDER BY " + column; // safe: column is drawn from a fixed, known-safe set
}
```

The allow-list check happens entirely in Java, against a small, fixed set of values the developer controls — the user's input never reaches the SQL text unless it exactly matches one of the pre-approved options, which is what makes this safe despite still using string concatenation to build the final query.

## Reading a ResultSet: a cursor, not a list

`ResultSet` is a **cursor** over the query's results, not a materialized collection — you must call `next()` to advance to each row (including the first one; a freshly returned `ResultSet` starts positioned *before* the first row), and access column values only while positioned on a valid row:

```java
String sql = "SELECT id, display_name, email FROM customer WHERE id = ?";
try (PreparedStatement statement = connection.prepareStatement(sql)) {
    statement.setLong(1, customerId);
    try (ResultSet results = statement.executeQuery()) {
        if (results.next()) { // must call next() even for a single expected row
            long id = results.getLong("id");
            String name = results.getString("display_name");
            String email = results.getString("email");
            System.out.printf("customer %d: %s <%s>%n", id, name, email);
        } else {
            System.out.println("no customer found with id " + customerId);
        }
    }
}
```

Column access **by name** (`getString("display_name")`) is generally preferable to access **by index** (`getString(2)`): index-based access silently breaks if the `SELECT` clause's column order ever changes, while name-based access is unaffected by that reordering — the small performance difference between the two is rarely significant enough to prefer index access for its own sake. `wasNull()` (or checking a boxed return type against `null`, depending on the getter) is necessary to distinguish a genuine SQL `NULL` from a primitive's zero-equivalent default when calling a primitive-returning getter like `getInt`, which returns `0` for both an actual `0` value and a `NULL` column.

## Resource cleanup: connection, statement, and result set together

All three JDBC resources — `Connection`, `PreparedStatement`, `ResultSet` — implement `AutoCloseable`, and nesting them in try-with-resources closes each one, in reverse order of acquisition, on every exit path, exactly the pattern this course has applied to sockets, executors, and temporary files throughout:

```java
static java.util.Optional<String> findCustomerEmail(DataSource dataSource, long customerId) throws SQLException {
    String sql = "SELECT email FROM customer WHERE id = ?";
    try (Connection connection = dataSource.getConnection();
         PreparedStatement statement = connection.prepareStatement(sql)) {
        statement.setLong(1, customerId);
        try (ResultSet results = statement.executeQuery()) {
            return results.next() ? java.util.Optional.of(results.getString("email")) : java.util.Optional.empty();
        }
    } // statement.close(), then connection.close() (returning it to the pool), both guaranteed here
}
```

A `ResultSet` left open when its parent `Statement` is closed is automatically closed by the driver in most implementations, but relying on that instead of explicit nested try-with-resources is fragile across drivers and easy to get wrong when a method has multiple exit paths — nesting all three explicitly, as above, removes any ambiguity.

## What happens under the hood: from getConnection to a returned row

1. `dataSource.getConnection()` asks the pool for an already-established, idle connection; if the pool has one available, it is handed out immediately (no new TCP/TLS handshake); if the pool is at capacity, the caller waits up to the configured connection timeout.
2. `connection.prepareStatement(sql)` sends the SQL text (with `?` placeholders) to the database, which parses and plans it *before* any parameter value is known — this is the structural step that makes binding a value afterward incapable of altering the SQL's meaning.
3. `statement.setX(index, value)` calls bind each placeholder to a specific value, stored by the driver until execution.
4. `executeQuery()` sends the prepared statement (by reference, on most drivers, not by re-sending the full SQL text) along with the bound values to the database, which executes the already-planned query and begins streaming results back.
5. `resultSet.next()` advances the cursor and, depending on the driver's fetch size configuration, may fetch another batch of rows from the database if the current in-memory batch is exhausted — a `ResultSet` over a very large query result does not necessarily hold every row in memory at once.
6. Closing the `ResultSet`, then the `Statement`, releases server-side resources associated with that specific query; closing the `Connection` (with a pooled `DataSource`) returns it to the pool rather than tearing down the underlying network connection.

## Common mistakes

**Mistake 1: building SQL with string concatenation of untrusted input.** This is SQL injection, allowing an attacker to alter the query's logic entirely. Fix: always use `PreparedStatement` with bound parameters for any value coming from outside the application's own fixed, trusted code.

**Mistake 2: attempting to bind a table or column name as a `PreparedStatement` parameter.** Structural SQL elements cannot be parameters. Fix: validate the structural choice against a fixed allow-list in Java, then build that part of the SQL text from the validated value.

**Mistake 3: not closing a `Connection` obtained from a pooled `DataSource`.** This permanently shrinks the pool's effective capacity until it is exhausted. Fix: always use try-with-resources for every `Connection`, `Statement`, and `ResultSet`.

**Mistake 4: forgetting to call `next()` before reading from a freshly obtained `ResultSet`.** The cursor starts before the first row; reading a column without advancing first throws an exception. Fix: always call `next()` (in an `if` for a single expected row, or a `while` loop for multiple).

**Mistake 5: reading a primitive getter (`getInt`) without checking for `NULL`.** A `NULL` column value and a genuine `0` both return `0` from `getInt`, making them indistinguishable without an explicit `wasNull()` check. Fix: use boxed getters or check `wasNull()` when a column is nullable.

## Best practices

- Always obtain connections from a pooled `DataSource`, never construct them directly per request.
- Always use `PreparedStatement` with bound parameters for any value originating outside fixed, trusted application code — no exceptions for "this input is probably safe."
- Validate structural SQL choices (table/column names, sort direction) against a fixed allow-list; never bind or concatenate them from unvalidated input.
- Nest `Connection`, `Statement`, and `ResultSet` in try-with-resources together, so all three are closed on every exit path.
- Prefer column access by name over by index in a `ResultSet` for resilience to `SELECT` clause reordering.
- Size the connection pool based on measured concurrency and the database's own connection limits, not an arbitrary default.

## Summary

- A pooled `DataSource` is the standard way to obtain connections; closing a pooled connection returns it to the pool rather than tearing it down.
- Connection pooling avoids the cost of a full connection handshake per request, and an unreturned connection permanently shrinks the pool's usable capacity.
- `PreparedStatement` separates SQL structure from parameter values, making SQL injection structurally impossible for bound values — string concatenation of untrusted input is never acceptable.
- A bound parameter can only represent a value, never a table name, column name, or other SQL structure; those need validated, allow-listed construction instead.
- `ResultSet` is a cursor, not a collection: `next()` must be called to advance to (and including) the first row, and `NULL` must be checked explicitly when using primitive getters.
- `Connection`, `Statement`, and `ResultSet` should all be closed with nested try-with-resources on every exit path.

## Practice

1. **Warm-up:** Explain, precisely, why binding a value with `PreparedStatement.setString` cannot be exploited the way string concatenation can, even for an adversarial input value.
2. **Warm-up:** A method returns a pooled `Connection` without closing it on an exception path. Describe the eventual symptom this causes in production under sustained load.
3. **Core:** Write a method that looks up a customer by ID using `PreparedStatement`, correctly handles zero-row and one-row results, and closes all JDBC resources with nested try-with-resources.
4. **Core:** Design an allow-list-based sorting parameter for a `SELECT ... ORDER BY` clause driven by user input, and demonstrate that an attempted column name outside the allow-list falls back to a safe default rather than reaching the SQL text.
5. **Challenge:** Write a small connection-pool exhaustion demonstration: configure a small pool (2 connections), deliberately leak connections in a loop by not closing them, and observe subsequent requests failing or blocking once the pool is exhausted; then fix the leak with try-with-resources and confirm the problem disappears.

## Check your understanding

1. Why does closing a `Connection` obtained from a pooled `DataSource` not close the underlying database connection?
2. Why is `PreparedStatement` a genuine security boundary against SQL injection, rather than just a coding-style preference?
3. Why can a table or column name never be supplied as a `PreparedStatement` bound parameter, and what technique should be used instead when it must vary based on user input?
4. Why must `ResultSet.next()` be called even when you expect exactly one row?
5. What ambiguity does `getInt` have for a nullable column, and how is it resolved?
6. What eventually happens to an application whose code regularly fails to close pooled connections under sustained load?
