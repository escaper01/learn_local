# Pattern matching with instanceof and switch

## Bind after a type check
```java
Object value = "Java";
if (value instanceof String text && text.length() > 2) {
    System.out.println(text.toUpperCase(java.util.Locale.ROOT));
}
```
The pattern variable is available only where the compiler knows the match succeeded. instanceof returns false for null. It does not need a separate cast after the check.

## Java 21 pattern switch
Using Result from the previous lesson:
```java
static String describe(Result result) {
    return switch (result) {
        case Success(String text) -> text;
        case Failure(String reason) -> "Failed: " + reason;
    };
}
```
Record patterns decompose components. Java 21 supports record patterns and pattern switch without preview flags. A guard uses when after a pattern. More specific cases must precede cases that dominate them. A null selector still needs an explicit null policy; exhaustiveness across subtypes alone does not accept null.

## Practice
Add Pending and update the switch until compilation succeeds. Add case null with a deliberate error or message, then compare that policy with rejecting null before the switch. Avoid default if you want the compiler to reveal future closed-family additions.
