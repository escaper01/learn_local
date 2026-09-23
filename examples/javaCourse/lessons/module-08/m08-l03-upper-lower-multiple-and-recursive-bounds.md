# Upper, lower, multiple, and recursive bounds

## Bounds provide required operations
```java
static <T extends Comparable<? super T>> T larger(T a, T b) {
    return a.compareTo(b) >= 0 ? a : b;
}
```
Without the bound, the compiler cannot assume T has compareTo. The super wildcard permits comparison inherited from a suitable supertype. A bound should reflect operations the algorithm needs, not every interface available on today's implementation.

Multiple upper bounds use &: T extends Number & Comparable<T>. A class bound must appear before interface bounds. Wildcard lower bounds use ? super T; type parameter declarations do not use an analogous super clause.

## Readability
Self-referential bounds can encode useful relationships, but overly complex signatures can make an API hard to call. Sometimes accepting an explicit Comparator<? super T> communicates ordering better and supports multiple policies.

## Practice
Implement max over a nonempty list first with a Comparable bound, then with a comparator parameter. Test custom value types and specify null policy. Explain why Number alone does not provide compareTo. Review compiler diagnostics by naming the exact required operation that each missing bound would enable.
