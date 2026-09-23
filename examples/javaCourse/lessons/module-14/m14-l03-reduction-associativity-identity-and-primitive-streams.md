# Reduction, associativity, identity, and primitive streams

## Reduction needs algebraic rules
```java
int total = java.util.stream.IntStream.of(2, 4, 6)
    .reduce(0, Integer::sum);
System.out.println(total); // 12
```
Zero is the identity: adding it changes nothing. Addition is associative under the chosen arithmetic semantics, permitting regrouping. Subtraction is not associative, so reduce(0, (a,b)->a-b) does not define a safe parallel sum-like reduction.

Primitive streams avoid boxing and provide sum, average, min, max, and summaryStatistics. Empty min/max results are optional because no element exists. An average of an empty stream is not automatically zero.

## Mutable accumulation
Use collect with a fresh container supplier when accumulating into a mutable structure. Mutating a shared StringBuilder used as reduce's identity can combine shared state incorrectly in parallel execution.

## Practice
Implement sum, product, and maximum and choose each identity or absence representation. Trace different parenthesizations of subtraction. Compare sequential and parallel results without assuming equality proves safety for all inputs. State overflow and floating-point rounding policies; mathematical associativity does not eliminate representation effects.
