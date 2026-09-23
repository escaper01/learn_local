# Numeric promotion, casting, BigDecimal, and precision

Some of the most expensive bugs in software history were arithmetic bugs: a rocket guidance system that converted a 64-bit floating-point value into a 16-bit integer that could not hold it, invoices that were off by a cent across millions of rows, averages that came out as whole numbers because two integers were divided. None of these programs crashed at compile time. They compiled, ran, and quietly produced wrong numbers.

This lesson explains exactly how Java converts between numeric types, why `double result = 7 / 2;` gives `3.0`, why `0.1 + 0.2` is not `0.3`, and how to calculate with money correctly using `BigDecimal`.

What you will learn:

- The widening conversions Java performs automatically and the narrowing conversions that require a cast
- The binary numeric promotion rules that decide the type of every arithmetic expression
- What casting does to fractions, out-of-range values, `NaN`, and `char`
- Rounding with `Math.round`, `Math.floor`, and `Math.ceil`
- How floating-point numbers are stored and why they cannot represent most decimal fractions exactly
- How to compare floating-point values safely, and the special values `Infinity`, `NaN`, and `-0.0`
- How to use `BigDecimal` for exact decimal arithmetic, scale, and explicit rounding modes

## Conversions: widening and narrowing

A **conversion** changes a value from one type to another. Java distinguishes two directions.

**Widening conversions** go from a smaller or less precise type to a larger one. Java performs them automatically because the value always fits:

```text
byte -> short -> int -> long -> float -> double
                  ^
                char
```

So you can write `long total = someInt;` or `double ratio = someLong;` without any special syntax. "Always fits" refers to the *range*, not necessarily the exact digits: a very large `long` converted to `float` or `double` can lose low-order digits, as you will see shortly.

**Narrowing conversions** go the other way, from a larger type to a smaller one. The value might not fit, so Java refuses to do them silently. You must write an explicit **cast**, `(targetType) value`, to say "I know information may be lost":

```java
double price = 9.99;          // fragment
int wholeDollars = (int) price; // 9, the fraction is discarded
```

Forgetting the cast is a compile error, which is Java protecting you:

```java
public class LossyByte {
    public static void main(String[] args) {
        byte count = 10;
        count = count + 1;
        int whole = 3.7;
    }
}
```

```text
LossyByte.java:4: error: incompatible types: possible lossy conversion from int to byte
        count = count + 1;
                      ^
LossyByte.java:5: error: incompatible types: possible lossy conversion from double to int
        int whole = 3.7;
                    ^
2 errors
```

Line 4 surprises almost everyone: `count` is a `byte` and `1` fits in a byte, so why is `count + 1` an `int`? The answer is numeric promotion.

## Binary numeric promotion

Before Java performs arithmetic on two operands (`+`, `-`, `*`, `/`, `%`, comparisons), it converts both operands to a common type using these rules, checked in order:

1. If either operand is `double`, the other is converted to `double`.
2. Otherwise, if either operand is `float`, the other is converted to `float`.
3. Otherwise, if either operand is `long`, the other is converted to `long`.
4. Otherwise, both operands are converted to `int`.

Rule 4 means that `byte`, `short`, and `char` values **always** become `int` before arithmetic, even when both operands are bytes. That is why `count + 1` has type `int` and cannot be assigned back to a `byte` without a cast.

| Expression | Operand types | Promoted to | Result type |
|---|---|---|---|
| `7 / 2` | int, int | int | `int` (value 3) |
| `7 / 2.0` | int, double | double | `double` (value 3.5) |
| `7L * 2` | long, int | long | `long` |
| `byteA + byteB` | byte, byte | int | `int` |
| `'A' + 2` | char, int | int | `int` (value 67) |
| `1.5f * 2` | float, int | float | `float` |

The most important consequence is the one the chapter quiz focuses on: **the type of the result is decided by the operands, before the value ever reaches the variable on the left**. The destination type plays no part in the calculation.

```java
public class Promotion {
    public static void main(String[] args) {
        double a = 7 / 2;
        double b = 7 / 2.0;
        double c = (double) 7 / 2;
        double d = (double) (7 / 2);
        System.out.println("7 / 2            -> " + a);
        System.out.println("7 / 2.0          -> " + b);
        System.out.println("(double) 7 / 2   -> " + c);
        System.out.println("(double) (7 / 2) -> " + d);

        byte x = 10;
        byte y = 20;
        int sum = x + y;
        x += 5;
        System.out.println("byte + byte is an int: " + sum + ", compound x += 5 -> " + x);

        char letter = 'A';
        System.out.println("'A' + 2 = " + (letter + 2) + ", (char) ('A' + 2) = " + (char) (letter + 2));

        long big = 123_456_789_012_345_678L;
        float asFloat = big;
        double asDouble = big;
        System.out.println("long   " + big);
        System.out.println("float  " + asFloat);
        System.out.println("double " + asDouble + " -> back to long " + (long) asDouble);
    }
}
```

Output:

```text
7 / 2            -> 3.0
7 / 2.0          -> 3.5
(double) 7 / 2   -> 3.5
(double) (7 / 2) -> 3.0
byte + byte is an int: 30, compound x += 5 -> 15
'A' + 2 = 67, (char) ('A' + 2) = C
long   123456789012345678
float  1.2345679E17
double 1.2345678901234568E17 -> back to long 123456789012345680
```

## What happens under the hood

Trace the four division lines step by step. The key is operator precedence plus the order of conversions.

| Expression | Step 1 | Step 2 | Stored |
|---|---|---|---|
| `double a = 7 / 2;` | `int / int` gives `int` 3 (truncated) | widen 3 to `double` for assignment | `3.0` |
| `double b = 7 / 2.0;` | promote 7 to `7.0`, `double` division gives 3.5 | already `double` | `3.5` |
| `double c = (double) 7 / 2;` | the cast binds tighter than `/`, so 7 becomes `7.0` | `7.0 / 2` promotes 2, gives 3.5 | `3.5` |
| `double d = (double) (7 / 2);` | parentheses force `7 / 2` first, `int` result 3 | cast 3 to `3.0` | `3.0` |

The `d` line is a classic mistake: the cast is correct in spirit but applied *after* the damage is done. To get a fractional result, at least one operand must be floating point **before** the division runs.

Two more details from the output:

- **Compound assignment includes a hidden cast.** `x += 5` compiles for a `byte` because Java defines it as `x = (byte) (x + 5)`. This is convenient but also means `x += 200` silently wraps.
- **Widening can lose digits.** `float` keeps about 7 significant decimal digits and `double` about 15 to 16, while a `long` can have 19. The widened `double` printed `...568E17`, and converting back gave `...680` instead of `...678`. The range fits; the precision does not.

## Casting in detail

Casting between numeric types follows precise rules. This program shows the ones you will meet most:

```java
public class Casting {
    public static void main(String[] args) {
        System.out.println("(int) 3.9          = " + (int) 3.9);
        System.out.println("(int) -3.9         = " + (int) -3.9);
        System.out.println("Math.round(3.5)    = " + Math.round(3.5));
        System.out.println("Math.round(-3.5)   = " + Math.round(-3.5));
        System.out.println("Math.floor(-3.9)   = " + Math.floor(-3.9));
        System.out.println("Math.ceil(3.1)     = " + Math.ceil(3.1));
        System.out.println("(byte) 130         = " + (byte) 130);
        System.out.println("(short) 70000      = " + (short) 70000);
        System.out.println("(int) 1e20         = " + (int) 1e20);
        System.out.println("(int) Double.NaN   = " + (int) Double.NaN);
        System.out.println("(char) 74          = " + (char) 74);
        System.out.println("(int) 3_000_000_000L = " + (int) 3_000_000_000L);
    }
}
```

Output:

```text
(int) 3.9          = 3
(int) -3.9         = -3
Math.round(3.5)    = 4
Math.round(-3.5)   = -3
Math.floor(-3.9)   = -4.0
Math.ceil(3.1)     = 4.0
(byte) 130         = -126
(short) 70000      = 4464
(int) 1e20         = 2147483647
(int) Double.NaN   = 0
(char) 74          = J
(int) 3_000_000_000L = -1294967296
```

The rules behind each line:

| Cast | Rule | Example |
|---|---|---|
| floating point to integer | truncate toward zero (drop the fraction) | `(int) -3.9` is `-3` |
| floating point too large for the integer type | clamp to the type's max or min | `(int) 1e20` is `Integer.MAX_VALUE` |
| `NaN` to integer | becomes `0` | `(int) Double.NaN` is `0` |
| integer to smaller integer | keep only the low-order bits | `(byte) 130` is `-126` |
| integer to `char` | keep the low 16 bits as a code unit | `(char) 74` is `J` |

Integer-to-integer narrowing is the dangerous one, because it does **not** clamp. `130` in binary is `10000010`; as a `byte`, the leftmost bit is the sign bit worth -128, so the result is `-128 + 2 = -126`. Likewise `(short) 70000` is `70000 - 65536 = 4464`. If you need a narrowing that fails loudly instead, use `Math.toIntExact(longValue)`, which throws `ArithmeticException` when the value does not fit.

### Rounding is a decision, not a side effect

Casting truncates. When you want rounding, say so explicitly:

| Method | Behavior | 3.5 | -3.5 | 3.2 | -3.2 |
|---|---|---|---|---|---|
| `(long) x` | truncate toward zero | 3 | -3 | 3 | -3 |
| `Math.round(x)` | nearest, halves round up (toward positive infinity) | 4 | -3 | 3 | -3 |
| `Math.floor(x)` | round down, returns `double` | 3.0 | -4.0 | 3.0 | -4.0 |
| `Math.ceil(x)` | round up, returns `double` | 4.0 | -3.0 | 4.0 | -3.0 |

`Math.round(double)` returns a `long`; `Math.round(float)` returns an `int`. `floor` and `ceil` return `double`, so cast the result if you need an integer.

## How floating-point numbers work

`float` and `double` follow the IEEE 754 standard. A `double` stores a sign bit, an 11-bit exponent, and a 52-bit fraction, much like scientific notation in base 2: `1.xxxx * 2^exponent`. That design gives an enormous range (up to about `1.8E308`) and roughly 15 to 16 significant decimal digits.

The catch is that it is **base 2**. Just as 1/3 cannot be written exactly in decimal (0.3333...), most decimal fractions cannot be written exactly in binary. The decimal 0.1 becomes an infinitely repeating binary fraction, so Java stores the nearest representable value, which is slightly more than 0.1. Each operation rounds its result to the nearest representable value, and those tiny errors can accumulate or become visible:

```java
public class FloatingPoint {
    public static void main(String[] args) {
        System.out.println("0.1 + 0.2        = " + (0.1 + 0.2));
        System.out.println("0.1 + 0.2 == 0.3 ? " + (0.1 + 0.2 == 0.3));
        System.out.println("1.0 - 0.9        = " + (1.0 - 0.9));

        double total = 0.0;
        for (int i = 0; i < 10; i++) {
            total += 0.1;
        }
        System.out.println("ten times 0.1    = " + total);

        double epsilon = 1e-9;
        System.out.println("close enough?      " + (Math.abs((0.1 + 0.2) - 0.3) < epsilon));

        float f = 1.1f;
        double fromFloat = f;
        System.out.println("float 1.1 widened  " + fromFloat);
        System.out.println("float  1/3        = " + (1.0f / 3));
        System.out.println("double 1/3        = " + (1.0 / 3));

        double nan = 0.0 / 0.0;
        System.out.println("NaN == NaN ?       " + (nan == nan) + ", Double.isNaN: " + Double.isNaN(nan));
        System.out.println("sqrt(-1)          = " + Math.sqrt(-1));
        System.out.println("-0.0 == 0.0 ?      " + (-0.0 == 0.0) + ", 1 / -0.0 = " + (1 / -0.0));
    }
}
```

Output:

```text
0.1 + 0.2        = 0.30000000000000004
0.1 + 0.2 == 0.3 ? false
1.0 - 0.9        = 0.09999999999999998
ten times 0.1    = 0.9999999999999999
close enough?      true
float 1.1 widened  1.100000023841858
float  1/3        = 0.33333334
double 1/3        = 0.3333333333333333
NaN == NaN ?       false, Double.isNaN: true
sqrt(-1)          = NaN
-0.0 == 0.0 ?      true, 1 / -0.0 = -Infinity
```

What this means in practice:

- **Never compare floating-point results with `==`.** Compare the absolute difference with a tolerance (often called epsilon) that makes sense for your domain: `Math.abs(a - b) < 1e-9` for general calculations, a much larger tolerance for sensor readings.
- **Choose `double` over `float`.** `float` has only about 7 significant digits; widening `1.1f` to `double` reveals its error immediately. Use `float` only when memory or a specific API demands it.
- **Know the special values.** Operations that have no real-number answer produce `NaN`, and `NaN` is not equal to anything, including itself, so always test with `Double.isNaN(x)`. Overflow and division by zero produce `Infinity` or `-Infinity`. Java also has a negative zero, which compares equal to zero but flips the sign of a division.
- **Do not use `double` for money.** Customers notice a missing cent even when your tolerance does not.

## BigDecimal: exact decimal arithmetic

`java.math.BigDecimal` represents a decimal number as an arbitrary-precision integer plus a **scale** (the number of digits after the decimal point). `19.99` is stored as the integer 1999 with scale 2, so decimal values are exact. The trade-offs are that it is slower, it uses methods instead of operators, and you must decide how to round.

```java
import java.math.BigDecimal;
import java.math.RoundingMode;

public class Money {
    public static void main(String[] args) {
        System.out.println("new BigDecimal(0.1)   = " + new BigDecimal(0.1));
        System.out.println("new BigDecimal(\"0.1\") = " + new BigDecimal("0.1"));
        System.out.println("BigDecimal.valueOf(0.1) = " + BigDecimal.valueOf(0.1));

        BigDecimal price = new BigDecimal("19.99");
        BigDecimal quantity = new BigDecimal("3");
        BigDecimal subtotal = price.multiply(quantity);
        BigDecimal tax = subtotal.multiply(new BigDecimal("0.0825")).setScale(2, RoundingMode.HALF_UP);
        System.out.println("subtotal " + subtotal + ", tax " + tax + ", total " + subtotal.add(tax));

        BigDecimal hundred = new BigDecimal("100.00");
        BigDecimal third = hundred.divide(new BigDecimal("3"), 2, RoundingMode.HALF_EVEN);
        BigDecimal remainder = hundred.subtract(third.multiply(new BigDecimal("3")));
        System.out.println("100.00 / 3 = " + third + " each, leftover " + remainder);

        try {
            hundred.divide(new BigDecimal("3"));
        } catch (ArithmeticException error) {
            System.out.println("divide without scale: " + error.getMessage());
        }

        BigDecimal one = new BigDecimal("1.0");
        BigDecimal oneHundredths = new BigDecimal("1.00");
        System.out.println("equals:    " + one.equals(oneHundredths));
        System.out.println("compareTo: " + one.compareTo(oneHundredths));

        for (String amount : new String[] {"2.345", "2.355", "-2.345"}) {
            BigDecimal value = new BigDecimal(amount);
            System.out.println(amount + " HALF_UP " + value.setScale(2, RoundingMode.HALF_UP)
                    + "  HALF_EVEN " + value.setScale(2, RoundingMode.HALF_EVEN)
                    + "  DOWN " + value.setScale(2, RoundingMode.DOWN));
        }
    }
}
```

Output:

```text
new BigDecimal(0.1)   = 0.1000000000000000055511151231257827021181583404541015625
new BigDecimal("0.1") = 0.1
BigDecimal.valueOf(0.1) = 0.1
subtotal 59.97, tax 4.95, total 64.92
100.00 / 3 = 33.33 each, leftover 0.01
divide without scale: Non-terminating decimal expansion; no exact representable decimal result.
equals:    false
compareTo: 0
2.345 HALF_UP 2.35  HALF_EVEN 2.34  DOWN 2.34
2.355 HALF_UP 2.36  HALF_EVEN 2.36  DOWN 2.35
-2.345 HALF_UP -2.35  HALF_EVEN -2.34  DOWN -2.34
```

Each line teaches a rule you must follow:

1. **Construct from a `String`, not a `double`.** `new BigDecimal(0.1)` faithfully preserves the `double`'s binary error, all 55 digits of it. `new BigDecimal("0.1")` is exact. `BigDecimal.valueOf(0.1)` is acceptable because it goes through the `double`'s shortest decimal string, but a string literal is clearest.
2. **Round explicitly at the step your business rule specifies.** The tax is rounded to cents with `setScale(2, RoundingMode.HALF_UP)`. Whether you round each line item or only the invoice total is a business decision, and the two approaches can differ by a cent.
3. **Division needs a scale and a rounding mode** when the result does not terminate. Without them, `divide` throws rather than guess.
4. **Rounding can leave a remainder.** Splitting 100.00 three ways gives 33.33 each and 0.01 left over. A real system must decide who receives the extra cent; it must not simply vanish.
5. **`equals` compares scale; `compareTo` compares value.** `1.0` and `1.00` are numerically equal (`compareTo` returns `0`) but not `equals`, because their scales differ. Use `compareTo` to compare amounts. This also matters when `BigDecimal` values are used as keys in hash-based collections (Chapter 9).

### Rounding modes

| Mode | Rule | Typical use |
|---|---|---|
| `HALF_UP` | round to nearest, ties away from zero | everyday "school" rounding, many tax rules |
| `HALF_EVEN` | round to nearest, ties to the even digit | banking; avoids a systematic upward bias across many values |
| `DOWN` | truncate toward zero | never exceeding a limit |
| `UP` | away from zero | charging for any started unit |
| `FLOOR` / `CEILING` | toward negative / positive infinity | sign-sensitive rules |
| `UNNECESSARY` | throw if rounding would be needed | asserting a value is already exact |

An alternative to `BigDecimal` for simple currency work is to store amounts as a `long` number of the smallest unit (cents). Integer arithmetic is exact, fast, and familiar; you convert to a decimal string only for display. It works well until you need fractional cents, several currencies with different decimal places, or percentage calculations with rounding rules, where `BigDecimal` is clearer.

## Common mistakes

**1. Dividing integers and expecting a fraction.**

```java
int correct = 7, total = 9;           // fragment
double score = correct / total;       // 0.0, integer division happened first
double fixed = (double) correct / total; // 0.7777777777777778
```

**2. Casting after the division.** `(double) (correct / total)` is still `0.0`. Cast an operand, not the result.

**3. Overflowing before widening.** `long average = (a + b) / 2;` with two large `int` values overflows in `a + b`. Widen first: `((long) a + b) / 2`, or divide each as `double`.

**4. Comparing doubles with `==`.** `0.1 + 0.2 == 0.3` is `false`. Use a tolerance, or `BigDecimal` with `compareTo` for exact decimal rules.

**5. Constructing `BigDecimal` from a `double`.** `new BigDecimal(0.1)` is not 0.1. Use `new BigDecimal("0.1")`.

**6. Using `equals` on `BigDecimal` amounts.** `new BigDecimal("2.50").equals(new BigDecimal("2.5"))` is `false`. Use `compareTo(...) == 0`.

**7. Assuming integer narrowing clamps.** `(byte) 200` is `-56`, not `127`. Validate the range first, or use `Math.toIntExact` for `long` to `int`.

**8. Checking for `NaN` with `==`.** `x == Double.NaN` is always `false`. Use `Double.isNaN(x)`.

## Best practices

- Decide the calculation type *before* writing the expression: make the first operand the widest type you need (`100L * ...`, `(double) sum / count`).
- Prefer `double` to `float`, and keep `double` for measurements and science where small relative errors are acceptable.
- For money, use `long` minor units or `BigDecimal` built from strings, and write down the rounding rule and when it applies.
- Always pass a scale and a `RoundingMode` to `BigDecimal.divide`.
- Compare `BigDecimal` values with `compareTo`, and doubles with an explicit tolerance.
- Treat every narrowing cast as a claim that the value fits. If you cannot prove it, validate or use an exact method.

## Summary

- Widening conversions (`int` to `long`, `long` to `double`, and so on) happen automatically; narrowing conversions need an explicit cast.
- Binary numeric promotion converts both operands to `double`, `float`, `long`, or at least `int` before arithmetic. `byte`, `short`, and `char` always become `int`.
- The operand types decide how an expression is computed; the assignment target only receives the finished value. That is why `double r = 7 / 2;` stores `3.0`.
- Casting a floating-point value to an integer truncates toward zero (clamping out-of-range values and turning `NaN` into 0); integer narrowing keeps only the low bits.
- Floating-point values are binary approximations: compare with a tolerance, test `NaN` with `Double.isNaN`, and avoid them for money.
- `BigDecimal` gives exact decimal arithmetic when constructed from strings, with explicit scale and rounding, and must be compared with `compareTo`.

## Practice

Warm-up:

1. Predict, then verify, the values of `5 / 2`, `5 / 2.0`, `5 % 2`, `(double) 5 / 2`, and `(double) (5 / 2)`.
2. Print `(int) 9.99`, `Math.round(9.5)`, `Math.round(-9.5)`, `Math.floor(-9.5)`, and `Math.ceil(-9.5)`, and explain each result.
3. Print `(byte) 200`, `(byte) 256`, and `(char) 97`, and explain them using binary.

Core:

1. Write `static double average(int[] values)` that returns the mean as a `double`. Make sure it works for `{Integer.MAX_VALUE, Integer.MAX_VALUE}` and returns a fractional result for `{1, 2}`.
2. Write a program that adds 0.01 to a `double` one hundred times and to a `BigDecimal` one hundred times. Print both totals and explain the difference.
3. Compute the price of 7 items at 2.35 each with 8.25 percent tax using `BigDecimal`, rounding tax to cents with `HALF_UP`. Then compute it again rounding per item instead of per order and compare the totals.

Challenge:

1. Split 1000.00 among 7 people so that the amounts add up to exactly 1000.00, differ by at most one cent, and are computed with `BigDecimal`. Print each share and the checked total.
2. Write a method that decides whether two doubles are "equal" using a *relative* tolerance (`Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b))`). Find a pair of values where an absolute tolerance of `1e-9` gives the wrong answer but the relative tolerance works.

## Check your understanding

1. In `double r = sum / count;` with two `int` variables, at what moment does the fraction get lost, and what minimal change keeps it?
2. Why does `byte b = 1; b = b + 1;` fail to compile while `b += 1;` compiles?
3. What is `(int) -7.8`, and how does it differ from `Math.round(-7.8)` and `Math.floor(-7.8)`?
4. Why is `new BigDecimal("0.1")` preferable to `new BigDecimal(0.1)`?
5. Two `BigDecimal` values print as `5.0` and `5.00`. What do `equals` and `compareTo` return, and which should an invoice total check use?
6. A widened `long` loses its last digits when converted to `double`, even though the range fits. Why?
