# Enums as type-safe objects with state and behavior

## Constants with a type
An enum declares a fixed collection of named instances. Unlike integer codes, its type prevents accidentally passing a month where a status is expected.
```java
enum Status {
    NEW, ACTIVE, DONE;
    boolean terminal() { return this == DONE; }
}
Status status = Status.NEW;
System.out.println(status.terminal()); // false
```
Enums may have private fields, constructors, methods, and interface implementations. Each constant is an instance, so comparing two enum references with == is appropriate. values() returns all constants in declaration order. valueOf("NEW") resolves an exact name and throws for an unknown name; it is not a forgiving user-input parser.

## Persistence and evolution
Do not store ordinal() as a durable status identifier. Inserting or reordering constants changes ordinals. Store a stable explicit code and write a lookup with defined unknown-value behavior. EnumSet and EnumMap provide specialized containers for enum elements and keys.

## Practice
Add a transition method allowing NEW -> ACTIVE -> DONE and rejecting DONE -> ACTIVE. Distinguish “unknown code” from “known but forbidden transition.” Test every pair of states and document whether repeating DONE -> DONE is idempotent.
