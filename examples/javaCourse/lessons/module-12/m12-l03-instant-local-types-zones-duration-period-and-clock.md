# Instant, local types, zones, duration, period, and Clock

## Choose the temporal meaning
Instant is a point on the global timeline. LocalDate is a calendar date without time; LocalTime is a wall-clock time; LocalDateTime combines them without a zone. A LocalDateTime alone does not identify a unique instant during daylight-saving transitions. ZonedDateTime applies named zone rules.

```java
java.time.Clock clock = java.time.Clock.fixed(
    java.time.Instant.parse("2024-01-01T00:00:00Z"),
    java.time.ZoneOffset.UTC);
System.out.println(java.time.LocalDate.now(clock)); // 2024-01-01
```
Inject Clock into business logic to make “today” reproducible. Do not mix a test's fixed clock with hidden calls to Instant.now elsewhere.

Duration represents seconds/nanoseconds elapsed; Period represents date-based years/months/days. Adding a calendar day across a clock transition can differ from adding 24 elapsed hours.

## Practice
Model a birthday as LocalDate and an audit event as Instant. Convert an instant into two zones. Test a deadline before, equal to, and after a fixed time. Define whether expiry is inclusive and whether a “one-day” policy means a calendar day or exactly 24 hours.
