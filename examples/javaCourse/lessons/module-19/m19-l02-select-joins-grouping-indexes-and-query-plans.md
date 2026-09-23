# SELECT, joins, grouping, indexes, and query plans

## Query logical stages
```sql
SELECT u.id, COUNT(t.id) AS open_count
FROM app_user u
LEFT JOIN task t ON t.owner_id = u.id AND t.status = 'OPEN'
GROUP BY u.id
ORDER BY u.id;
```
The LEFT JOIN keeps users without open tasks. Moving the status condition into WHERE can eliminate unmatched rows and change the result. COUNT(t.id) counts non-null matched IDs; COUNT(*) would also count the retained unmatched row.

WHERE filters rows before grouping; HAVING filters groups. ORDER BY is required for contractual result order. Pagination needs a stable ordering and a strategy for concurrent changes; offsets can become expensive at scale.

## Indexes and plans
An index accelerates supported access paths while adding storage and write work. Column order and selectivity matter for composite indexes. Read EXPLAIN output against representative data rather than assuming an index is used.

## Practice
Seed users with zero, one, and several tasks. Compare inner and left joins. Add an index for owner/status queries and inspect the plan before and after. Explain why selecting every column can increase I/O and coupling.
