# Choosing among class, record, enum, and sealed hierarchy

## Choose semantics before syntax
An entity has identity over time: task 42 remains task 42 after its title changes. A value is defined by its components: two points with equal coordinates represent the same point. A fixed singleton choice is an enum. A closed family with different data shapes is a sealed hierarchy.

```java
record Position(int row, int column) {}
enum Priority { LOW, NORMAL, HIGH }
final class Task {
    private final long id;
    private String title;
    Task(long id, String title) { this.id = id; this.title = title; }
}
```
This sketch omits validation deliberately: add it before treating Task as a finished domain type. Automatically generated record equality would make all components identity-defining, which may be wrong for a mutable entity. Conversely, an ordinary class with identity equality may be wrong for a value used as a map key.

## Practice
Classify invoice, currency code, postal address, command result, and application service. Justify each choice by equality, mutation, extension, and lifecycle needs. For a postal address, decide whether text normalization is part of value construction and whether historical addresses may change. There can be multiple valid designs; expose the tradeoff.
