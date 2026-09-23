# Unmodifiable views, immutable snapshots, and defensive copies

## View versus snapshot
```java
var source = new java.util.ArrayList<>(java.util.List.of("A"));
var view = java.util.Collections.unmodifiableList(source);
var snapshot = java.util.List.copyOf(source);
source.add("B");
System.out.println(view);     // [A, B]
System.out.println(snapshot); // [A]
```
The view blocks mutation through its API but reflects changes made through source. The snapshot captures the element references at copy time. Both remain shallow: a mutable element can change internally.

List.of and List.copyOf reject null elements. An unmodifiable list is not necessarily deeply immutable. Arrays.asList returns a fixed-size list backed by an array: set may work while add/remove do not.

## Practice
Design a repository's allTasks return contract. Should callers see a current live view or a stable snapshot? Should they mutate tasks themselves? Test changes to the original collection, returned collection, and one element separately. Explain why returning a mutable internal list lets a caller bypass repository validation even when the field itself is private.
