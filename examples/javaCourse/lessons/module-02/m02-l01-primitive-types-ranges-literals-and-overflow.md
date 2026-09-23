# Primitive types, ranges, literals, and overflow

Every program you will ever write manipulates values: a price, a count of users, a temperature, a letter typed on a keyboard, a yes/no flag. Before Java can store or calculate with a value, it needs to know what *kind* of value it is. That kind is the value's **type**. The type decides how many bits of memory the value occupies, which values are possible, and which operations make sense.

Getting types right is not academic. A payroll system that stores cents in an `int` works for years and then silently produces negative salaries when a total crosses about 21 million dollars. A game that counts milliseconds in an `int` breaks after about 24 days of uptime. Both bugs come from the same idea you will master in this lesson: every numeric type has a fixed range, and Java does not warn you when a calculation leaves it.

What you will learn:

- The difference between primitive types and reference types
- All eight primitive types, their sizes, and their ranges
- How to write literals: decimal, hexadecimal, binary, octal, `long`, `float`, `double`, `char`, `boolean`, `String`, and text blocks
- How numbers are stored in binary, including negative numbers (two's complement)
- What integer overflow is, why it wraps around silently, and how to detect or prevent it
- How integer division, remainder, and division by zero behave
- How to choose the right type for a real requirement

## Values, variables, and types

A **variable** is a named storage location. Its **type** is fixed when you declare it and never changes:

```java
int age = 34;          // fragment: an int variable holding 34
String name = "Amina"; // fragment: a String variable referring to a text object
```

Java divides all types into two families.

**Primitive types** hold the value itself. The variable `age` literally contains the bits for 34. There are exactly eight primitive types, they are built into the language, and their names are all lowercase keywords: `byte`, `short`, `int`, `long`, `float`, `double`, `char`, `boolean`.

**Reference types** hold a *reference* (think of it as an address) to an object stored elsewhere in memory. `String`, arrays, `Scanner`, and every class you write are reference types. Their names conventionally start with an uppercase letter.

An analogy: a primitive variable is a box containing a number. A reference variable is a box containing a note that says where the real object lives. You will explore the memory side of this in Chapter 4; for now remember three practical differences:

| Question | Primitive (`int`) | Reference (`String`) |
|---|---|---|
| What does the variable contain? | The value itself | A reference to an object, or `null` |
| Can it be `null`? | No | Yes |
| Does it have methods? | No (`age.length()` does not compile) | Yes (`name.length()`) |
| How is `==` evaluated? | Compares values | Compares whether two references point to the same object |
| Default value as a field | `0`, `0.0`, `false`, or `'\u0000'` | `null` |

## The eight primitive types

Java defines the size of every numeric primitive precisely, on every operating system and CPU. An `int` is 32 bits on Windows, Linux, macOS, and a phone. This is one reason Java programs are portable.

The wrapper classes (`Byte`, `Integer`, `Long`, and so on) expose the limits as constants. This complete program prints them:

```java
public class PrimitiveTour {
    public static void main(String[] args) {
        System.out.println("type    bits  minimum                 maximum");
        System.out.printf("byte    %4d  %-22d  %d%n", Byte.SIZE, Byte.MIN_VALUE, Byte.MAX_VALUE);
        System.out.printf("short   %4d  %-22d  %d%n", Short.SIZE, Short.MIN_VALUE, Short.MAX_VALUE);
        System.out.printf("int     %4d  %-22d  %d%n", Integer.SIZE, Integer.MIN_VALUE, Integer.MAX_VALUE);
        System.out.printf("long    %4d  %-22d  %d%n", Long.SIZE, Long.MIN_VALUE, Long.MAX_VALUE);
        System.out.printf("char    %4d  %-22d  %d%n", Character.SIZE, (int) Character.MIN_VALUE, (int) Character.MAX_VALUE);
        System.out.printf("float   %4d  %-22s  %s%n", Float.SIZE, Float.MIN_VALUE, Float.MAX_VALUE);
        System.out.printf("double  %4d  %-22s  %s%n", Double.SIZE, Double.MIN_VALUE, Double.MAX_VALUE);
        System.out.println("boolean    -  false                   true");
    }
}
```

Output:

```text
type    bits  minimum                 maximum
byte       8  -128                    127
short     16  -32768                  32767
int       32  -2147483648             2147483647
long      64  -9223372036854775808    9223372036854775807
char      16  0                       65535
float     32  1.4E-45                 3.4028235E38
double    64  4.9E-324                1.7976931348623157E308
boolean    -  false                   true
```

Read the table carefully, because several details surprise beginners:

- **Integer types are signed.** `byte`, `short`, `int`, and `long` can hold negative numbers, and each has one more negative value than positive values (`-128` to `127` for `byte`). You will see why in the binary section.
- **`char` is an unsigned 16-bit number.** It stores a UTF-16 code unit, which is why its range is `0` to `65535`. The character `'A'` is stored as the number 65.
- **`Float.MIN_VALUE` and `Double.MIN_VALUE` are not the most negative values.** They are the smallest *positive* values the type can represent. The most negative `double` is `-Double.MAX_VALUE`. This naming trap has caused real bugs.
- **`float` and `double` are approximations.** They store binary fractions, so a decimal value such as `0.1` is stored as the nearest representable binary value. Lesson 3 covers the consequences and when to use `BigDecimal` instead.
- **`boolean` has no specified size.** The language only says it holds `true` or `false`; the JVM decides how to store it.

Here is the full reference, including the wrapper class you will use in collections later:

| Type | Size | Range | Default field value | Example literal | Wrapper |
|---|---|---|---|---|---|
| `byte` | 8 bits | -128 to 127 | `0` | `(byte) 100` | `Byte` |
| `short` | 16 bits | -32,768 to 32,767 | `0` | `(short) 30000` | `Short` |
| `int` | 32 bits | about -2.1 billion to 2.1 billion | `0` | `42` | `Integer` |
| `long` | 64 bits | about -9.2 quintillion to 9.2 quintillion | `0L` | `42L` | `Long` |
| `float` | 32 bits | about 7 significant decimal digits | `0.0f` | `3.14f` | `Float` |
| `double` | 64 bits | about 15 to 16 significant decimal digits | `0.0` | `3.14` | `Double` |
| `char` | 16 bits | `'\u0000'` to `'￿'` (0 to 65535) | `'\u0000'` | `'J'` | `Character` |
| `boolean` | unspecified | `true` or `false` | `false` | `true` | `Boolean` |

> **Tip:** In everyday code, reach for `int` for whole numbers, `long` when values can exceed about two billion (timestamps in milliseconds, file sizes, database IDs), `double` for measurements and scientific values, and `boolean` for flags. `byte` and `short` are mainly for binary formats and large arrays where memory matters.

## Literals: writing values directly in code

A **literal** is a value written directly in source code, such as `42`, `'J'`, or `"hello"`. Every literal has a type determined by how you write it.

### Integer literals

An integer literal without a suffix has type `int`. You can write it in four bases:

| Form | Prefix | Example | Decimal value |
|---|---|---|---|
| Decimal | none | `255` | 255 |
| Hexadecimal | `0x` or `0X` | `0xFF` | 255 |
| Binary | `0b` or `0B` | `0b1111_1111` | 255 |
| Octal | leading `0` | `0377` | 255 |

Underscores may appear between digits to improve readability: `1_000_000` is exactly the same value as `1000000`. They cannot start or end a number or sit next to the prefix or a decimal point.

To write a `long` literal, add the suffix `L`. Always use uppercase `L`, because lowercase `l` looks almost identical to the digit `1`.

### Floating-point literals

A literal with a decimal point or an exponent is a `double` by default: `3.14`, `2.0`, `6.022e23` (meaning 6.022 times 10 to the 23rd power). Add `f` or `F` to make it a `float`: `3.14f`. You can add `d` or `D` to make the `double` explicit, but it is rarely needed.

### Character, boolean, and string literals

- A `char` literal uses **single quotes** and holds exactly one character: `'A'`, `'7'`, `' '`.
- Special characters use escape sequences: `'\n'` (newline), `'\t'` (tab), `'\''` (single quote), `'\"'` (double quote), `'\\'` (backslash), and `'A'` (a Unicode escape, here `A`).
- `true` and `false` are the only `boolean` literals. They are not numbers: `boolean ok = 1;` does not compile.
- A `String` literal uses **double quotes**: `"Java"`. Strings are reference types, not primitives, but Java gives them literal syntax because they are so common.
- `null` is the literal for "no object" and can be assigned to any reference type.
- A **text block** (Java 15 and later) is a multi-line string delimited by three double quotes. Incidental indentation shared by all lines is removed automatically.

This complete program exercises all of these forms:

```java
public class Literals {
    public static void main(String[] args) {
        int decimal = 255;
        int hex = 0xFF;
        int binary = 0b1111_1111;
        int octal = 0377;
        System.out.println("255 four ways: " + decimal + " " + hex + " " + binary + " " + octal);

        long worldPopulation = 8_100_000_000L;
        double avogadro = 6.022e23;
        float ratio = 0.75f;
        System.out.println("long: " + worldPopulation + ", double: " + avogadro + ", float: " + ratio);

        char letter = 'A';
        char unicode = 'A';
        char next = (char) (letter + 1);
        System.out.println("chars: " + letter + " " + unicode + " " + next + " code=" + (int) letter);
        System.out.println("escapes: tab[\t] quote[\"] backslash[\\]");

        String textBlock = """
                {
                  "course": "Java",
                  "chapter": 2
                }""";
        System.out.println(textBlock);
    }
}
```

Output (the gap inside `tab[ ]` is a real tab character):

```text
255 four ways: 255 255 255 255
long: 8100000000, double: 6.022E23, float: 0.75
chars: A A B code=65
escapes: tab[	] quote["] backslash[\]
{
  "course": "Java",
  "chapter": 2
}
```

Notice three things. First, all four integer spellings produce the same value; the base only affects how you *write* it, not how it is stored. Second, `letter + 1` is arithmetic: `'A'` is the number 65, so the result is 66, which we cast back to `char` to print `B`. Third, Java prints large doubles in scientific notation (`6.022E23`) automatically.

## How numbers are stored: binary and two's complement

Computers store every value as bits, each either 0 or 1. Understanding this explains the strange ranges in the table above and the overflow behavior later in this lesson.

### Counting in base 2

In decimal (base 10), each position is worth ten times the one to its right: 1, 10, 100, 1000. In binary (base 2), each position is worth two times the one to its right: 1, 2, 4, 8, 16, 32, 64, 128.

To read the byte `00001101`, add the place values where a 1 appears:

| Place value | 128 | 64 | 32 | 16 | 8 | 4 | 2 | 1 |
|---|---|---|---|---|---|---|---|---|
| Bit | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 1 |
| Contribution | 0 | 0 | 0 | 0 | 8 | 4 | 0 | 1 |

`8 + 4 + 1 = 13`. To convert 13 *to* binary, repeatedly divide by 2 and record the remainders from bottom to top: 13 / 2 = 6 remainder **1**, 6 / 2 = 3 remainder **0**, 3 / 2 = 1 remainder **1**, 1 / 2 = 0 remainder **1**. Reading upward gives `1101`.

### Binary addition

Binary addition works like decimal addition with carrying, except that `1 + 1 = 10` (zero, carry one):

```text
    00000101   (5)
  + 00000011   (3)
  ----------
    00001000   (8)
```

Working right to left: 1 + 1 = 0 carry 1; 0 + 1 + carry = 0 carry 1; 1 + 0 + carry = 0 carry 1; then the carry lands in the 8s place.

### Negative numbers: two's complement

A signed type must also represent negative values. Java, like almost every modern platform, uses **two's complement**. The rule for negating a number is: **invert every bit, then add 1**.

```text
 5  = 00000101
invert 11111010
 +1  = 11111011   this is -5
```

The leftmost bit acts as the sign: 0 for zero and positive numbers, 1 for negative numbers. In a byte, the leftmost bit is worth **-128** instead of +128. So `11111011` is `-128 + 64 + 32 + 16 + 8 + 2 + 1 = -5`.

This design has a lovely property: the ordinary addition circuit works for negative numbers too, because `5 + (-5)` in binary produces `00000000` with the final carry discarded. It also explains the asymmetric range. With 8 bits there are 256 patterns. Zero takes one pattern, leaving 255 to split between positives and negatives; the negative side gets 128 (`-128` to `-1`) and the positive side gets 127 (`1` to `127`).

This program lets you see the bits for yourself:

```java
public class BinaryView {
    static String bits(int value) {
        String raw = String.format("%32s", Integer.toBinaryString(value)).replace(' ', '0');
        return raw.substring(24);
    }

    public static void main(String[] args) {
        for (int value : new int[] {0, 1, 2, 5, 13, 127}) {
            System.out.printf("%4d -> %s%n", value, bits(value));
        }
        System.out.println("5 + 3 in binary: " + bits(5) + " + " + bits(3) + " = " + bits(5 + 3));

        byte small = 5;
        byte negative = (byte) -small;
        System.out.println(" 5 as byte: " + String.format("%8s", Integer.toBinaryString(small & 0xFF)).replace(' ', '0'));
        System.out.println("-5 as byte: " + Integer.toBinaryString(negative & 0xFF));
        System.out.println("invert 5 then add 1: " + Integer.toBinaryString(((~small) + 1) & 0xFF));
        System.out.println("Integer.MAX_VALUE = " + Integer.toBinaryString(Integer.MAX_VALUE));
        System.out.println("Integer.MIN_VALUE = " + Integer.toBinaryString(Integer.MIN_VALUE));
        System.out.println("parse \"1101\" base 2 = " + Integer.parseInt("1101", 2));
    }
}
```

Output:

```text
   0 -> 00000000
   1 -> 00000001
   2 -> 00000010
   5 -> 00000101
  13 -> 00001101
 127 -> 01111111
5 + 3 in binary: 00000101 + 00000011 = 00001000
 5 as byte: 00000101
-5 as byte: 11111011
invert 5 then add 1: 11111011
Integer.MAX_VALUE = 1111111111111111111111111111111
Integer.MIN_VALUE = 10000000000000000000000000000000
parse "1101" base 2 = 13
```

`Integer.toBinaryString` omits leading zeros, which is why `MAX_VALUE` shows 31 ones: it is `0` followed by 31 ones. `MIN_VALUE` is a `1` followed by 31 zeros. The expression `value & 0xFF` keeps only the lowest 8 bits so a `byte` can be displayed as 8 bits; the `~` operator inverts bits. Chapter 2, Lesson 4 covers bitwise operators in detail.

## Integer overflow: the silent wraparound

Now the most important practical consequence. What happens when a calculation produces a value outside the type's range?

For integer types, **Java wraps around silently**. There is no exception, no warning, and no automatic upgrade to a bigger type. Look at the bits: `Integer.MAX_VALUE` is `0111...1`. Adding 1 carries all the way into the sign bit, producing `1000...0`, which is exactly `Integer.MIN_VALUE`. The number line behaves like a clock face: go past the top and you reappear at the bottom.

```java
public class OverflowDemo {
    public static void main(String[] args) {
        int max = Integer.MAX_VALUE;
        System.out.println("max       = " + max);
        System.out.println("max + 1   = " + (max + 1));
        System.out.println("min - 1   = " + (Integer.MIN_VALUE - 1));

        int secondsInt = 100 * 365 * 24 * 60 * 60;
        long stillWrong = 100 * 365 * 24 * 60 * 60;
        long correct = 100L * 365 * 24 * 60 * 60;
        System.out.println("int seconds in 100 years       = " + secondsInt);
        System.out.println("long assigned from int product = " + stillWrong);
        System.out.println("long product                   = " + correct);

        try {
            int total = Math.addExact(max, 1);
            System.out.println("never printed " + total);
        } catch (ArithmeticException error) {
            System.out.println("Math.addExact refused: " + error.getMessage());
        }

        System.out.println("-7 / 2 = " + (-7 / 2) + ", -7 % 2 = " + (-7 % 2));
        System.out.println("1.0 / 0 = " + (1.0 / 0) + ", 0.0 / 0 = " + (0.0 / 0));
        try {
            System.out.println(1 / 0);
        } catch (ArithmeticException error) {
            System.out.println("1 / 0 threw ArithmeticException: " + error.getMessage());
        }
    }
}
```

Output:

```text
max       = 2147483647
max + 1   = -2147483648
min - 1   = 2147483647
int seconds in 100 years       = -1141367296
long assigned from int product = -1141367296
long product                   = 3153600000
Math.addExact refused: integer overflow
-7 / 2 = -3, -7 % 2 = -1
1.0 / 0 = Infinity, 0.0 / 0 = NaN
1 / 0 threw ArithmeticException: / by zero
```

## What happens under the hood

The "seconds in 100 years" lines deserve a slow trace, because this exact mistake appears in production code.

1. `100 * 365 * 24 * 60 * 60` contains only `int` literals, so Java evaluates it with `int` arithmetic, left to right.
2. `100 * 365 = 36500`, then `* 24 = 876000`, then `* 60 = 52560000`, all within range.
3. `52560000 * 60 = 3153600000`, which is larger than `2147483647`. The result wraps to `3153600000 - 4294967296 = -1141367296`.
4. For `stillWrong`, only *after* the `int` expression is finished does Java widen the already-wrong value to `long`. Declaring the destination as `long` does not change how the right-hand side is computed.
5. For `correct`, the first operand `100L` is a `long`. Java then performs every subsequent multiplication in `long` arithmetic, which has room for the answer.

The rule to remember: **the types of the operands, not the type of the destination, decide how an expression is computed.** You will meet this rule again in Lesson 3 with division.

### Division, remainder, and division by zero

- Integer division **truncates toward zero**: `7 / 2` is `3` and `-7 / 2` is `-3` (not `-4`).
- The remainder operator `%` takes the sign of the left operand: `-7 % 2` is `-1`. So `n % 2 == 1` is not a reliable odd-number test for negative `n`; use `n % 2 != 0`.
- Integer division by zero throws `ArithmeticException: / by zero`.
- Floating-point division by zero does **not** throw. It produces `Infinity`, `-Infinity`, or `NaN` ("not a number") for `0.0 / 0`.

### Tools that refuse to overflow

When silent wrapping would corrupt a result, use the exact-arithmetic methods in `Math`. They throw `ArithmeticException` instead of wrapping:

| Method | Throws on overflow of |
|---|---|
| `Math.addExact(a, b)` | `a + b` |
| `Math.subtractExact(a, b)` | `a - b` |
| `Math.multiplyExact(a, b)` | `a * b` |
| `Math.incrementExact(a)` | `a + 1` |
| `Math.negateExact(a)` | `-a` (only `MIN_VALUE` overflows) |
| `Math.toIntExact(longValue)` | narrowing a `long` to `int` |

For values that can exceed even `long`, the `java.math.BigInteger` class grows as needed. It is slower and more verbose, so use it only when the domain genuinely requires unbounded integers (cryptography, combinatorics).

## Choosing a type for a real requirement

Types express decisions about the problem, so decide from requirements, not habit:

| Requirement | Good choice | Why |
|---|---|---|
| A person's age | `int` | Small whole number; `int` is the default and fast |
| Number of items in a cart | `int` | Whole, never fractional |
| Database row identifier | `long` | Tables can exceed two billion rows over time |
| Milliseconds since 1970 | `long` | `System.currentTimeMillis()` returns `long`; `int` overflows after about 24 days |
| Temperature reading | `double` | Fractional measurement where tiny rounding is acceptable |
| Money | `long` cents or `BigDecimal` | `double` cannot represent many decimal amounts exactly (Lesson 3) |
| A yes/no flag | `boolean` | Only two states |
| A single keyboard character | `char` | But prefer `String` for real text (Chapter 4) |

## Common mistakes

**1. An integer literal that does not fit in `int`.** Writing a large number without `L` is a compile error, even when the variable is a `long`:

```java
public class TooLarge {
    public static void main(String[] args) {
        long population = 8100000000;
        System.out.println(population);
    }
}
```

```text
TooLarge.java:3: error: integer number too large
        long population = 8100000000;
                          ^
```

Fix: `long population = 8_100_000_000L;`

**2. Assigning a `double` literal to a `float`.** Floating literals are `double` by default, and narrowing could lose precision, so the compiler refuses:

```java
public class FloatLiteral {
    public static void main(String[] args) {
        float ratio = 0.75;
        System.out.println(ratio);
    }
}
```

```text
FloatLiteral.java:3: error: incompatible types: possible lossy conversion from double to float
        float ratio = 0.75;
                      ^
```

Fix: `float ratio = 0.75f;` (or simply use `double`).

**3. Accidental octal.** A leading zero makes an integer literal octal:

```java
public class OctalTrap {
    public static void main(String[] args) {
        int roomNumber = 010;
        System.out.println("Room " + roomNumber);
    }
}
```

```text
Room 8
```

Fix: never pad integer literals with leading zeros. If you need zero-padded *output*, format it: `String.format("%03d", 10)` produces `010`.

**4. Overflow in an intermediate result.** As traced above, `long total = a * b;` with two `int` operands overflows before the assignment. Fix: make one operand a `long` first, `long total = (long) a * b;`, or use `Math.multiplyExact`.

**5. Confusing `char` and `String`.** `'Java'` does not compile ("unclosed character literal"), because single quotes hold exactly one character. And `'A' + 'B'` is the number 131, not the text "AB", because `char` values add as numbers.

**6. Treating `Double.MIN_VALUE` as the smallest double.** It is the smallest *positive* double (`4.9E-324`). When searching for a maximum among doubles, start from `-Double.MAX_VALUE` or `Double.NEGATIVE_INFINITY`, not `Double.MIN_VALUE`.

## Best practices

- Default to `int`, `long`, `double`, and `boolean`. Use `byte`, `short`, and `float` only for a concrete reason such as a binary protocol or a very large array.
- Write large literals with underscores (`1_000_000`) and always use uppercase `L` for `long` literals.
- Before multiplying or summing, estimate the largest possible result. If it can exceed about two billion, compute in `long` from the first operand.
- Use `Math.addExact` and friends when a wrong result is worse than a crash, such as balances, quotas, and counters that feed billing.
- Never use `double` for money. Use `long` cents or `BigDecimal`.
- Name constants for limits instead of repeating magic numbers: `static final int MAX_AGE = 130;`.

## Summary

- Java has eight primitive types that hold values directly, and reference types that hold references to objects.
- Numeric sizes are fixed by the language: `byte` 8, `short` 16, `int` 32, `long` 64, `float` 32, `double` 64 bits; `char` is an unsigned 16-bit code unit.
- Literals have types: plain integers are `int`, `L` makes a `long`, plain decimals are `double`, `f` makes a `float`. Integers can be written in decimal, hex (`0x`), binary (`0b`), or octal (leading `0`).
- Integers are stored in binary using two's complement, which is why each signed range has one extra negative value.
- Integer arithmetic silently wraps on overflow: `Integer.MAX_VALUE + 1` is `Integer.MIN_VALUE`. The operand types, not the destination type, decide how an expression is computed.
- Integer division truncates toward zero and throws on division by zero; floating-point division by zero yields `Infinity` or `NaN`.
- `Math.addExact`, `Math.multiplyExact`, and related methods throw instead of wrapping.

## Practice

Warm-up:

1. Write a program that prints the value `1_000_000` in decimal, hexadecimal (`Integer.toHexString`), and binary (`Integer.toBinaryString`).
2. Convert 42 and 200 to binary by hand, then check your answers with `Integer.toBinaryString`.
3. Print `(char) 97`, `(int) 'z'`, and `'a' + 1`, and explain each result.

Core:

1. Calculate the number of milliseconds in 30 days, once with all-`int` arithmetic and once starting from a `long` literal. Explain the difference in the output.
2. Write a method `static int percent(int part, int whole)` that returns the percentage rounded down. Find inputs for which `part * 100` overflows, then fix the method so it works for every valid `int` input.
3. By hand, write `-1`, `-2`, and `-128` as 8-bit two's complement numbers. Verify them with `(b & 0xFF)` and `Integer.toBinaryString`.

Challenge:

1. A counter is stored in an `int` and incremented once per millisecond. Compute how many days pass before it overflows, then rewrite the counter so the problem cannot occur for at least 100 years.
2. Write a program that sums the numbers from 1 to `n` using an `int` accumulator. Find the smallest `n` for which the sum overflows, first by reasoning with the formula `n * (n + 1) / 2`, then by detecting it with `Math.addExact`.

## Check your understanding

1. A `short` holding `32767` is incremented with `s++`. What value does it hold afterwards, and which part of the bit pattern explains it?
2. Why does `long total = 1_000_000 * 1_000_000;` store the wrong answer even though `total` is a `long`?
3. What are the decimal values of the literals `0x1F`, `0b101`, and `017`?
4. Why can a `byte` hold `-128` but not `+128`?
5. What is the difference between `Double.MIN_VALUE` and `-Double.MAX_VALUE`?
6. Which of `1 / 0` and `1.0 / 0` throws an exception, and what does the other one produce?
