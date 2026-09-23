# Collectors, grouping, partitioning, mapping, and merge policies

## Collectors describe result construction
```java
record Sale(String region, int cents) {}
var sales = java.util.List.of(new Sale("EU", 100), new Sale("EU", 200));
var totals = sales.stream().collect(
    java.util.stream.Collectors.groupingBy(
        Sale::region, java.util.stream.Collectors.summingInt(Sale::cents)));
System.out.println(totals.get("EU")); // 300
```
groupingBy chooses keys; its downstream collector reduces each group. partitioningBy always represents boolean partitions. mapping transforms elements before another collector receives them.

toMap requires a merge function when duplicate keys are possible. Choosing “keep first” versus “keep last” versus “sum” is a domain policy, not merely a fix for an exception. Supply a map factory when iteration order matters; defaults should not become accidental API promises.

## Practice
Create counts by status, names by team, and totals by currency. Do not add amounts from different currencies into one meaningless sum. Test empty input and duplicate identifiers. Explain the result type at every collector nesting level and state whether callers may mutate the returned structures.
