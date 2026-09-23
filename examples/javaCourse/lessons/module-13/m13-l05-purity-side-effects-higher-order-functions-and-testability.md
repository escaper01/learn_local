# Purity, side effects, higher-order functions, and testability

## Separate calculation from effects
A pure function returns the same result for the same inputs and changes no externally visible state. This makes repeated execution and testing straightforward.
```java
static long fee(long cents, int percent) {
    if (cents < 0 || percent < 0 || percent > 100)
        throw new IllegalArgumentException();
    return Math.multiplyExact(cents, percent) / 100;
}
```
The function explicitly states truncation through integer division and signals overflow. Reading the current time, consulting a global configuration, logging, or mutating an input introduces external dependencies.

## Functional core, imperative boundary
An application still needs I/O. Read and validate inputs at the boundary, pass values into deterministic rules, then persist or display the result. Pass Clock, policy values, or collaborators explicitly when the decision depends on them.

## Practice
Refactor a discount function that reads a static mutable rate and writes directly to a file. Make rate an argument and move writing to the caller. Test repeated calls, failure preservation, and unchanged inputs. Explain why caching a pure function can be safe while caching an operation that generates IDs can break behavior.
