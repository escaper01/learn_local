# Tables, keys, constraints, relationships, and normalization

## Relational structure encodes rules
```sql
CREATE TABLE task (
  id BIGINT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL,
  CHECK (status IN ('OPEN', 'DONE'))
);
```
The SQL dialect may require adjustments in an external database lab. A primary key identifies each row; a foreign key references another table; UNIQUE prevents duplicates; NOT NULL and CHECK constrain values. Application validation improves feedback, while database constraints protect all writers.

## Normalization
Storing a customer's address repeatedly on current orders creates update anomalies if all copies must change together. Separate facts according to their dependencies. Historical order-address snapshots may intentionally remain separate because they represent what was true at purchase time. Normalization is about meaning, not splitting every field into another table.

## Practice
Model tasks, users, assignments, and tags, including a many-to-many link table. Choose deletion behavior for referenced users. Insert duplicate keys and invalid statuses to observe constraints. Explain why a Java check followed by insert cannot alone prevent concurrent duplicate creation.
