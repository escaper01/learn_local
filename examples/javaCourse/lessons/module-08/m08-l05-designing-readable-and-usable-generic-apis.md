# Designing readable and usable generic APIs

## Design for callers
A reusable API should accept the least restrictive useful input and return the most precise honest result. Returning List<? extends Task> often burdens callers with an unknown type; returning List<Task> may be clearer when the implementation really produces tasks.

```java
static <T, R> java.util.List<R> transform(
        java.util.List<T> input,
        java.util.function.Function<? super T, ? extends R> operation) {
    var output = new java.util.ArrayList<R>();
    for (T value : input) output.add(operation.apply(value));
    return java.util.List.copyOf(output);
}
```
Function is a standard behavior interface, taught fully later. Here its type relationship says it consumes T and produces R. The method returns an unmodifiable snapshot and rejects null results through List.copyOf; document that policy.

## Practice
Call transform for names-to-lengths and integers-to-text. Explain which types are inferred. Decide whether accepting Iterable<T> would suffice instead of List<T>. Remove generic parameters that do not connect meaningful inputs or outputs. For every API, document ownership and mutability separately from its generic signature; type safety does not imply immutability.
