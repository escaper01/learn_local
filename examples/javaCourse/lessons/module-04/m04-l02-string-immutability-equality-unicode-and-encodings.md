# String immutability, equality, Unicode, and encodings

## Content and identity
A String contains immutable text. equals compares content; == compares whether references identify the same object. Interning can make == appear to work for some literals and fail for equivalent text read from a file: the compiler places String literals in a shared string pool, so two identical literals in the same program are automatically the same interned object, while `new String(...)` and text built at runtime deliberately create a separate object outside that pool. `String.intern()` looks up (or adds) a String's contents in that pool and returns the pooled reference, which is how code can restore == identity for equal content after the fact, though equals remains the correct general-purpose comparison.
```java
String first = new String("Java");
String second = new String("Java");
System.out.println(first == second);      // false
System.out.println(first.equals(second)); // true
String upper = first.toUpperCase(java.util.Locale.ROOT);
System.out.println(first); // Java
```
The transformation returns a result; first remains unchanged. Use an explicit locale for identifiers and protocol text.

## Unicode layers
String.length counts UTF-16 code units. Some Unicode code points require two char values:
```java
String text = "A\uD83D\uDCA1";
System.out.println(text.length()); // 3
System.out.println(text.codePointCount(0, text.length())); // 2
```
Code points still do not always equal user-perceived characters: combining marks and emoji sequences can span several code points. charAt retrieves a code unit, not necessarily a complete character.

Encoding translates characters to bytes. Use StandardCharsets.UTF_8 at file or network boundaries and the same encoding when decoding. Do not assume substring indices are safe user-visible character boundaries.

## Practice
Compare literal, constructed, and input-derived Strings with equals and ==. Reverse an ASCII word, then test a supplementary character and explain the limitation of reversing individual char values. Define whether a username is case-sensitive before choosing a normalization operation.
