# Records, canonical constructors, and shallow immutability

## Records express value components
A record declares its state as components and supplies accessors, equality, hashing, and a textual representation.
```java
record TaskName(String value) {
    TaskName {
        if (value == null || value.isBlank())
            throw new IllegalArgumentException("name required");
        value = value.trim();
    }
}
System.out.println(new TaskName(" Build ").equals(new TaskName("Build"))); // true
```
The compact constructor validates and may normalize parameters before their implicit assignment. Accessors are value(), not getValue(). Records are final and can implement interfaces but cannot extend another ordinary class.

## Shallow immutability
A record containing List<String> has a final reference, but the referenced list may change. Use List.copyOf in construction when a snapshot is intended. Mutable elements still require their own ownership policy. Arrays retain identity-based equals unless you implement a different contract, so they are often unsuitable transparent value components.

## Practice
Create a Team record with a copied member list. Mutate the original input list and verify the record remains unchanged. Explain why a record is suitable for coordinates but may be awkward for a mutable account entity with lifecycle and identity independent of its current balance.
