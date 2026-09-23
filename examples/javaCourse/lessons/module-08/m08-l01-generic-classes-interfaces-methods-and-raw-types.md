# Generic classes, interfaces, methods, and raw types

## Preserve a type relationship
```java
final class Box<T> {
    private final T value;
    Box(T value) { this.value = value; }
    T get() { return value; }
}
Box<String> name = new Box<>("Ada");
String text = name.get();
```
T connects construction and retrieval. An Object-based box would force callers to cast and could fail at runtime. A generic method declares parameters before its return type: static <T> T first(List<T> values). It should define what an empty list does.

Primitive types cannot be type arguments; use Integer, Double, and other wrappers. Boxing creates or reuses wrapper objects; unboxing null throws NullPointerException. Type inference reduces repetition without weakening the checked relationship.

## Raw types
Box without an argument is a raw type for legacy interoperability. It discards guarantees and can spread unchecked warnings. Use Box<?> when the value's type is unknown and you only need Object-level operations.

## Practice
Build Pair<L,R> and a generic first method that rejects empty input explicitly. Compile with -Xlint:unchecked, deliberately mix types through a raw reference, and explain why the failure moves away from the original mistake.
