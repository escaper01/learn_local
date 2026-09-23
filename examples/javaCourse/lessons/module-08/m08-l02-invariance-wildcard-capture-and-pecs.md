# Invariance, wildcard capture, and PECS

## Invariance prevents unsafe writes
List<Integer> cannot be assigned to List<Number>. Otherwise someone could add a Double and violate the integer-list contract.

```java
static <T> void transfer(
        java.util.List<? extends T> source,
        java.util.List<? super T> destination) {
    destination.addAll(source);
}
```
The source produces T-compatible values; the destination accepts T. This is PECS: producer extends, consumer super. From List<? extends Number> you may read Number, but cannot safely add an arbitrary Integer because the unknown element type might be Double. From List<? super Integer> you may add Integer but can only safely read Object.

A wildcard is one unknown type, not permission to store every possible type. Capture helpers can give that unknown type a local name when an algorithm needs a relationship, such as swapping two elements.

## Practice
Transfer integers to a List<Number> and List<Object>. Try the reverse transfer and explain the compiler error. Mark each parameter of a copy/filter API as producer, consumer, or both before choosing wildcards. A read-only API promise still needs ownership discipline: extends does not freeze the underlying collection.
