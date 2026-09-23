# filter, map, flatMap, distinct, sorted, and peek

## Transform shape deliberately
filter retains or drops an element. map emits one result per element. flatMap emits zero or more results and flattens their streams.
```java
var lines = java.util.List.of("java sql", "java");
var words = lines.stream()
    .flatMap(line -> java.util.Arrays.stream(line.split(" ")))
    .filter(word -> !word.isEmpty())
    .distinct()
    .sorted()
    .toList();
System.out.println(words); // [java, sql]
```
Using map instead would produce a stream of arrays or streams rather than a flat sequence of words. distinct uses equality and hashing; sorted uses ordering. Both may need state and memory proportional to input.

peek is intended for observation and is not a reliable place for required persistence or business mutation. Stream.toList returns an unmodifiable list; do not assume it is an ArrayList.

## Practice
Flatten departments into employees, filter active employees, and map to names. Write down each stage's type. Test no departments, an empty department, and repeated names. Decide whether distinct names should collapse different people or whether identity must remain visible.
