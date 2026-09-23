# Sealed classes and controlled extension

## A controlled family of alternatives
A sealed hierarchy says which direct subtypes are allowed.
```java
sealed interface Result permits Success, Failure {}
record Success(String value) implements Result {}
record Failure(String reason) implements Result {}
```
Records are implicitly final, satisfying the requirement that a permitted subtype decide whether extension stops or continues. An ordinary permitted subtype must be final, sealed, or non-sealed. In a named module permitted types belong to that module; in an unnamed module they belong to the same package.

## Model alternatives with their own data
A Result has either a successful value or a failure reason. A class containing successFlag, value, and error allows contradictory combinations; separate variants make those combinations harder to construct. Sealing supports exhaustive decisions, while an open interface supports implementations you do not know about.

## Practice
Model a payment result as Accepted(receiptId), Declined(reason), and Pending(reference). State validation rules for each component. Decide whether plugins should be able to add variants; if so, sealing may be the wrong extension contract. Add a fourth variant and observe which exhaustive consumers require updates.
