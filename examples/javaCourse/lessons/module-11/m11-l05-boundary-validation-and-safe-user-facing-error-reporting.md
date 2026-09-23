# Boundary validation and safe user-facing error reporting

## Validate at the right level
Syntactic validation checks representation: “is this a decimal integer?” Semantic validation checks meaning: “is this quantity positive and below the stock limit?” Authorization asks whether this caller may perform the operation. Passing one does not imply passing the others.

```java
static int quantity(String text) {
    int result;
    try { result = Integer.parseInt(text); }
    catch (NumberFormatException cause) {
        throw new IllegalArgumentException("quantity must be an integer", cause);
    }
    if (result < 1 || result > 1000)
        throw new IllegalArgumentException("quantity must be 1..1000");
    return result;
}
```
The example makes range and spelling distinct. For forms, collecting several field errors helps users fix them together. Inside a domain operation, failing immediately before mutation may be simpler.

## Practice
Design an error response containing a stable code and safe field messages. Keep internal exception details in protected diagnostics. Test blank, negative, extreme, and malformed quantities. Include an authorization test using a valid quantity: valid data must still be denied to an unauthorized actor.
