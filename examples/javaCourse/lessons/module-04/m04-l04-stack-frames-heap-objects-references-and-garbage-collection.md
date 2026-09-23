# Stack frames, heap objects, references, and garbage collection

## Frames and objects
Each thread has a call stack. Each invocation has its own parameters and local values. A reference is a value identifying an object; copying that reference connects another variable to the same object.
```java
static void change(int[] values) {
    values[0] = 7;
    values = new int[] {99};
}
// Caller:
int[] original = {1};
change(original);
System.out.println(original[0]); // 7
```
The first assignment mutates the caller-visible object. The second changes only the parameter's local reference. Draw original and values pointing to the first array, then redirect only values.

## Lifetime and reachability
Objects are eligible for reclamation when no GC root can reach them. Roots include live stack references and class-associated static references. Leaving a scope can remove one route to an object, but a collection may still retain it. A memory leak in Java commonly means an object remains reachable even though the application no longer needs it.

The stack/heap picture explains behavior, not a promise about every physical allocation. JVM optimization can eliminate objects when doing so preserves observable semantics. Do not depend on implementation memory addresses.

## Practice
Trace a method that returns a newly allocated array: the frame disappears, yet the returned array remains reachable. Build a list that retains arrays and explain why setting one temporary variable to null does not free them. Contrast StackOverflowError from unbounded recursion with heap exhaustion from retained data.
