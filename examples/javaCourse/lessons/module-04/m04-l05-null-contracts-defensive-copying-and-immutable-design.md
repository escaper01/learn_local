# Null contracts, defensive copying, and immutable design

## Absence needs a contract
null is the absence of an object reference. Calling a method or accessing a field through it throws NullPointerException. Decide whether each API rejects null, represents absence explicitly, or substitutes a meaningful default. Silently converting every missing value to empty text can erase important distinctions.

## Defensive ownership
```java
final class Scores {
    private final int[] values;
    Scores(int[] input) {
        values = java.util.Arrays.copyOf(input, input.length);
    }
    int[] values() {
        return java.util.Arrays.copyOf(values, values.length);
    }
}
```
Copying in the constructor prevents the caller from changing stored state through input. Copying on return prevents mutation through an accessor. final alone only blocks assigning another array to values. An array of mutable objects needs a deeper ownership decision than copying the outer array.

## Immutable design
An immutable class validates completely during construction, does not expose mutators, and does not leak mutable internals. Avoid publishing this while construction is incomplete. Immutability simplifies reasoning about concurrent readers, hash-map keys, cached values, and historical snapshots. It does not mean every object in an application should be immutable; some aggregates legitimately own controlled mutable state.

## Practice
Construct Scores from an array, modify that array, retrieve values(), and modify the returned array. The original Scores must remain unchanged in both cases. Add a null-input policy and test its documented exception. Explain why replacing int[] with a list of mutable Player objects requires another ownership policy.
