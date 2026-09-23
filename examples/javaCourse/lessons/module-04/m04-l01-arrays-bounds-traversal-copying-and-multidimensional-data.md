# Arrays, bounds, traversal, copying, and multidimensional data

## Arrays own fixed indexed storage
Creating new int[3] allocates three zero-valued elements. A String[3] instead begins with three null references. Valid indices are 0 through length-1; length is a field and cannot be changed. The `args` parameter of `public static void main(String[] args)` is one such array: the JVM launcher fills it with each word typed after the class name, in order, so `args.length` is 0 when none were supplied. Always check `args.length` before reading `args[0]`, the same as any other array access.
```java
int[] a = {10, 20, 30};
int[] alias = a;
int[] copy = java.util.Arrays.copyOf(a, a.length);
alias[0] = 99;
System.out.println(a[0]);    // 99
System.out.println(copy[0]); // 10
```
Assigning an array reference does not copy elements. copyOf creates a new outer array. If its elements are references to mutable objects, those element references still point to shared objects; copying is shallow.

## Traversal and multidimensional arrays
Use indices when position matters and enhanced for for values. A two-dimensional int[][] is an array of row references, so rows can have different lengths or be null. Always use each row's length. Arrays.toString formats one dimension; deepToString handles nested arrays.

Arrays.sort mutates the supplied array. Copy first when the caller owns the original ordering. System.arraycopy supports efficient range copying and validates bounds; it does not convert arbitrary incompatible element types.

## Practice
Implement a reversed copy with source index length-1-i and destination index i. Test empty, singleton, duplicates, and negative values. After the call, inspect the original array to prove it was not mutated. Traverse a ragged matrix with row lengths 0, 2, and 1 and explain why a single shared column limit is wrong.
