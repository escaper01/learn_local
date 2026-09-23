# Type erasure, bridge methods, and heap pollution

## What survives compilation
Generics are largely implemented through erasure. A List<String> and List<Integer> share a runtime class. The compiler inserts casts and may generate bridge methods to preserve overriding after erasure.
```java
var strings = new java.util.ArrayList<String>();
var integers = new java.util.ArrayList<Integer>();
System.out.println(strings.getClass() == integers.getClass()); // true
```
You cannot use new T(), T.class, or instanceof List<String>. You can test instanceof List<?> and inspect its contents under an explicit contract. Generic arrays are restricted because arrays check element types at runtime while type arguments are erased.

## Heap pollution
An unchecked raw assignment can put a value into a parameterized container that its declared type forbids. The eventual ClassCastException often occurs when reading, far from the write that broke the guarantee. Generic varargs can expose similar problems through arrays.

## Practice
Create a raw-list misuse in an isolated scratch example, compile with warnings, and locate both the unsafe write and later failure. Remove the raw type instead of suppressing all warnings. Explain that @SafeVarargs is a promise backed by implementation review, not an operation that makes unsafe code safe.
