# Stream sources, single-use lifecycle, laziness, and terminal operations

## A stream describes a traversal
```java
var values = java.util.List.of(1, 2, 3, 4);
long count = values.stream()
    .filter(n -> n % 2 == 0)
    .count();
System.out.println(count); // 2
```
The collection owns elements; the stream describes their computation. filter is intermediate and lazy. count is terminal and drives traversal. A stream cannot be reused after a terminal operation; obtain another stream from the source.

Operations may fuse so each element moves through several stages before the next is processed. Do not assume a stage runs once for every source element: short-circuit operations and optimizations can change traversal. Side effects used for essential behavior are therefore risky.

## Practice
Use anyMatch to find an even value and trace where it can stop. Contrast it with count, which needs the full relevant input. Attempt to reuse a consumed stream and explain the exception. Compare a loop with the pipeline and state which communicates the requirement more directly.
