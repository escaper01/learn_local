# Operators, precedence, equality, and short-circuiting

Operators are the verbs of expressions: they add, compare, combine conditions, and test equality. Most of them look like school mathematics, which is exactly why they are dangerous. `17 / 5` is not 3.4 in Java, `-7 % 2` is not 1, `"Sum: " + 2 + 3` does not print 5, and `==` on two strings with identical text can be `false`. Professional developers know these rules precisely, because a single misread operator can turn an access check or a billing rule into a bug.

This lesson walks through every operator family you will use daily, the order in which Java evaluates them, the difference between comparing values and comparing object identity, and short-circuit evaluation, the feature that makes null-safe checks possible.

What you will learn:

- Arithmetic operators, integer division, and the remainder operator `%` with its practical uses
- Increment and decrement operators, and the difference between prefix and postfix forms
- Operator precedence and associativity, and how `+` switches between addition and string concatenation
- Relational operators and the boolean operators `&&`, `||`, `!`, and `^`
- Short-circuit evaluation and how it enables safe null checks
- Why `==` compares identity for objects and when to use `equals`
- Bitwise operators and shifts for flags and binary data

## Arithmetic operators

Java has five binary arithmetic operators: `+`, `-`, `*`, `/`, and `%`, plus unary `-` and `+`. Remember from Lesson 3 that operands are promoted first, so two `int` operands produce an `int` result, and integer division discards the fraction.

The remainder operator `%` (often called modulo) returns what is left over after integer division. It is far more useful than it first appears:

```java
public class Arithmetic {
    public static void main(String[] args) {
        int a = 17, b = 5;
        System.out.println(a + " + " + b + " = " + (a + b));
        System.out.println(a + " - " + b + " = " + (a - b));
        System.out.println(a + " * " + b + " = " + (a * b));
        System.out.println(a + " / " + b + " = " + (a / b));
        System.out.println(a + " % " + b + " = " + (a % b));
        System.out.println("unary minus: " + (-a));

        int totalSeconds = 3725;
        int hours = totalSeconds / 3600;
        int minutes = totalSeconds % 3600 / 60;
        int seconds = totalSeconds % 60;
        System.out.println(totalSeconds + "s = " + hours + "h " + minutes + "m " + seconds + "s");

        int number = 4096;
        System.out.println("last digit of " + number + " = " + number % 10);
        for (int n : new int[] {7, 8, -7}) {
            System.out.println(n + " is " + (n % 2 != 0 ? "odd" : "even") + ", n % 2 = " + (n % 2));
        }

        String[] seats = {"A", "B", "C"};
        for (int turn = 0; turn < 5; turn++) {
            System.out.print(seats[turn % seats.length] + " ");
        }
        System.out.println();
        System.out.println("-7 % 3 = " + (-7 % 3) + ", Math.floorMod(-7, 3) = " + Math.floorMod(-7, 3));
    }
}
```

Output:

```text
17 + 5 = 22
17 - 5 = 12
17 * 5 = 85
17 / 5 = 3
17 % 5 = 2
unary minus: -17
3725s = 1h 2m 5s
last digit of 4096 = 6
7 is odd, n % 2 = 1
8 is even, n % 2 = 0
-7 is odd, n % 2 = -1
A B C A B 
-7 % 3 = -1, Math.floorMod(-7, 3) = 2
```

(The `condition ? valueIfTrue : valueIfFalse` expression used for "odd"/"even" is the ternary operator, covered fully in Chapter 3.)

Common uses of `%`:

| Goal | Expression | Example |
|---|---|---|
| Split units (seconds into minutes and seconds) | `total / 60` and `total % 60` | 125 seconds is 2 minutes 5 seconds |
| Last digit of a number | `n % 10` | `4096 % 10` is 6 |
| Even or odd | `n % 2 == 0` or `n % 2 != 0` | works for negatives too |
| Divisibility | `n % k == 0` | leap-year and "every third item" rules |
| Wrap around a range | `index % length` | round-robin over seats A, B, C |

The sign of `%` follows the **left** operand, so `-7 % 2` is `-1` and `-7 % 3` is `-1`. That breaks the tempting test `n % 2 == 1` for odd numbers (it fails for -7) and breaks wrap-around with negative indexes. When you need a result that is always between 0 and the divisor, use `Math.floorMod(-7, 3)`, which returns 2.

## Increment and decrement

`++` adds one to a variable and `--` subtracts one. Each has two forms that differ only in the *value of the expression*:

- **Prefix** `++i`: increment first, then the expression evaluates to the new value.
- **Postfix** `i++`: the expression evaluates to the old value, then the variable is incremented.

```java
public class Increments {
    public static void main(String[] args) {
        int i = 5;
        int prefix = ++i;
        System.out.println("prefix:  ++i gives " + prefix + ", i is now " + i);

        int j = 5;
        int postfix = j++;
        System.out.println("postfix: j++ gives " + postfix + ", j is now " + j);

        int k = 10;
        k--;
        --k;
        System.out.println("k after two decrements: " + k);

        int count = 3;
        count = count++;
        System.out.println("count = count++ leaves count at " + count);

        int x = 2;
        int result = x++ * 10 + ++x;
        System.out.println("x++ * 10 + ++x = " + result + " (x ends at " + x + ")");
    }
}
```

Output:

```text
prefix:  ++i gives 6, i is now 6
postfix: j++ gives 5, j is now 6
k after two decrements: 8
count = count++ leaves count at 3
x++ * 10 + ++x = 24 (x ends at 4)
```

When the increment stands alone as a statement (`k--;` or `--k;`), both forms do exactly the same thing. The difference only matters when the expression's value is used.

Two lines deserve a trace:

- `count = count++;` evaluates `count++`, which produces the old value 3 and sets `count` to 4. Then the assignment stores the produced value 3 back into `count`, overwriting the 4. The net effect is nothing. This is a classic interview trick and a real bug when someone meant `count++;`.
- `x++ * 10 + ++x` evaluates left to right: `x++` yields 2 (x becomes 3), times 10 gives 20; `++x` makes x 4 and yields 4; the sum is 24.

> **Warning:** Code like `x++ * 10 + ++x` is legal and fully defined in Java, but it is hard to read. Never modify a variable more than once in a single expression, and never read a variable in the same expression where you increment it. Put increments in their own statements.

## Precedence and associativity

When an expression contains several operators, **precedence** decides which binds first, and **associativity** decides the order among operators of equal precedence. Java evaluates operands left to right, but precedence decides how they are grouped.

| Precedence (high to low) | Operators | Associativity |
|---|---|---|
| Postfix | `x++` `x--` | left to right |
| Unary | `++x` `--x` `+x` `-x` `!` `~` `(type)` | right to left |
| Multiplicative | `*` `/` `%` | left to right |
| Additive | `+` `-` | left to right |
| Shift | `<<` `>>` `>>>` | left to right |
| Relational | `<` `>` `<=` `>=` `instanceof` | left to right |
| Equality | `==` `!=` | left to right |
| Bitwise AND | `&` | left to right |
| Bitwise XOR | `^` | left to right |
| Bitwise OR | `\|` | left to right |
| Conditional AND | `&&` | left to right |
| Conditional OR | `\|\|` | left to right |
| Ternary | `? :` | right to left |
| Assignment | `=` `+=` `-=` `*=` `/=` `%=` and others | right to left |

You do not need to memorize every row. Remember the practical order: **unary, then multiplicative, then additive, then comparisons, then equality, then `&&`, then `||`, then assignment**, and use parentheses whenever a reader might hesitate.

```java
public class Precedence {
    public static void main(String[] args) {
        System.out.println("2 + 3 * 4       = " + (2 + 3 * 4));
        System.out.println("(2 + 3) * 4     = " + ((2 + 3) * 4));
        System.out.println("10 - 4 - 3      = " + (10 - 4 - 3));
        System.out.println("2 * 3 % 4       = " + (2 * 3 % 4));
        System.out.println("100 / 10 / 5    = " + (100 / 10 / 5));
        System.out.println("-2 * -3         = " + (-2 * -3));
        System.out.println(1 + 2 + "3");
        System.out.println("1" + 2 + 3);
        System.out.println("Sum: " + 2 + 3);
        System.out.println("Sum: " + (2 + 3));
        boolean mixed = 2 + 3 * 4 == 14 && false || true;
        boolean grouped = ((2 + (3 * 4)) == 14 && false) || true;
        System.out.println("mixed = " + mixed + ", grouped = " + grouped);
    }
}
```

Output:

```text
2 + 3 * 4       = 14
(2 + 3) * 4     = 20
10 - 4 - 3      = 3
2 * 3 % 4       = 2
100 / 10 / 5    = 2
-2 * -3         = 6
33
123
Sum: 23
Sum: 5
mixed = true, grouped = true
```

## What happens under the hood

The `+` operator does two different jobs. If **either** operand is a `String`, it performs string concatenation, converting the other operand to text. Otherwise it performs numeric addition. Because `+` is left-associative, the decision is made one step at a time:

| Expression | Step 1 | Step 2 | Result |
|---|---|---|---|
| `1 + 2 + "3"` | `1 + 2` is numeric, gives `3` | `3 + "3"` is concatenation | `"33"` |
| `"1" + 2 + 3` | `"1" + 2` is concatenation, gives `"12"` | `"12" + 3` is concatenation | `"123"` |
| `"Sum: " + 2 + 3` | `"Sum: 2"` | `"Sum: 23"` | `"Sum: 23"` |
| `"Sum: " + (2 + 3)` | parentheses first: `5` | `"Sum: 5"` | `"Sum: 5"` |

That is why every print statement in this lesson wraps arithmetic in parentheses before concatenating it.

The long boolean expression is grouped by precedence exactly like `grouped`: `3 * 4` first, then `2 + 12`, then `14 == 14` (true), then `true && false` (false), then `false || true` (true). The two variables are equal, but only one of them is readable.

## Relational and boolean operators

**Relational operators** compare two values and produce a `boolean`: `<`, `<=`, `>`, `>=`, `==`, `!=`. They work on all numeric types and on `char` (which compares code units, so `'a' < 'b'` is true).

**Boolean operators** combine `boolean` values:

| Operator | Name | True when | Evaluates right side? |
|---|---|---|---|
| `a && b` | conditional AND | both are true | only if `a` is true |
| `a \|\| b` | conditional OR | at least one is true | only if `a` is false |
| `!a` | NOT | `a` is false | not applicable |
| `a ^ b` | exclusive OR | exactly one is true | always |
| `a & b` | logical AND | both are true | always |
| `a \| b` | logical OR | at least one is true | always |

Boolean operators accept only `boolean` operands. Unlike C, Java does not treat numbers as true or false:

```java
public class BadOperands {
    public static void main(String[] args) {
        boolean both = 1 && 0;
    }
}
```

```text
BadOperands.java:3: error: bad operand types for binary operator '&&'
        boolean both = 1 && 0;
                         ^
  first type:  int
  second type: int
1 error
```

## Short-circuit evaluation

`&&` and `||` are **short-circuit** operators. Java evaluates the left operand first, and if that alone decides the answer, it **skips the right operand entirely**:

- `false && anything` must be false, so `anything` is never evaluated.
- `true || anything` must be true, so `anything` is never evaluated.

The non-short-circuit versions `&` and `|` always evaluate both sides. This program makes evaluation visible by printing whenever the right side runs:

```java
public class BooleanLogic {
    static int calls = 0;

    static boolean check(String label, boolean value) {
        calls++;
        System.out.println("  evaluated " + label);
        return value;
    }

    public static void main(String[] args) {
        System.out.println("a     b     a&&b  a||b  a^b   !a");
        boolean[] values = {false, true};
        for (boolean a : values) {
            for (boolean b : values) {
                System.out.printf("%-5s %-5s %-5s %-5s %-5s %-5s%n", a, b, a && b, a || b, a ^ b, !a);
            }
        }

        System.out.println("false && check(...):");
        boolean r1 = false && check("right side of &&", true);
        System.out.println("true || check(...):");
        boolean r2 = true || check("right side of ||", false);
        System.out.println("false & check(...):");
        boolean r3 = false & check("right side of &", true);
        System.out.println("results " + r1 + " " + r2 + " " + r3 + ", right sides evaluated: " + calls);

        String name = null;
        boolean usable = name != null && !name.isBlank();
        System.out.println("safe check with &&: " + usable);
        try {
            boolean broken = name != null & !name.isBlank();
            System.out.println(broken);
        } catch (NullPointerException error) {
            System.out.println("with & instead: NullPointerException");
        }

        boolean adult = true, member = false, invited = true;
        System.out.println("adult && (member || invited) = " + (adult && (member || invited)));
        System.out.println("!(member || invited) == (!member && !invited): " + (!(member || invited) == (!member && !invited)));
    }
}
```

Output:

```text
a     b     a&&b  a||b  a^b   !a
false false false false false true
false true  false true  true  true
true  false false true  true  false
true  true  true  true  false false
false && check(...):
true || check(...):
false & check(...):
  evaluated right side of &
results false true false, right sides evaluated: 1
safe check with &&: false
with & instead: NullPointerException
adult && (member || invited) = true
!(member || invited) == (!member && !invited): true
```

The right side of `&&` and `||` never printed; only `&` evaluated its right side. That behavior is the foundation of the most common safety idiom in Java:

```java
if (name != null && !name.isBlank()) { // fragment
    greet(name);
}
```

When `name` is `null`, the left operand is `false`, so `&&` returns `false` **without evaluating** `name.isBlank()`. No method is ever called on `null`, so no `NullPointerException` can occur. Replace `&&` with `&` and both sides run, which is exactly what crashed in the program above. The protection comes from evaluation order: `&&` does not catch exceptions, and `isBlank()` does not accept a null receiver. The guard must come **first**; `!name.isBlank() && name != null` crashes on null because the unsafe call is evaluated before the check.

Short-circuiting is also useful for performance: put cheap checks before expensive ones, such as `cache.contains(key) || database.exists(key)`.

The last line demonstrates **De Morgan's laws**, which let you rewrite negated conditions: `!(a || b)` equals `!a && !b`, and `!(a && b)` equals `!a || !b`. They are handy when simplifying conditions like "not (member or invited)".

## Equality: values versus identity

For primitives, `==` compares **values**: `1000 == 1000` is true, `'a' == 97` is true.

For references, `==` compares **identity**: whether both references point to the **same object** in memory. Two different objects with identical contents are not `==`. To compare contents, use the `equals` method, which classes such as `String` override to compare characters.

```java
import java.util.Objects;

public class Equality {
    public static void main(String[] args) {
        int x = 1000, y = 1000;
        System.out.println("int 1000 == 1000: " + (x == y));

        String literal = "java";
        String sameLiteral = "java";
        String built = new String("java");
        String fromParts = "ja" + args.length;
        fromParts = fromParts.replace("0", "va");
        System.out.println("literal == sameLiteral:    " + (literal == sameLiteral));
        System.out.println("literal == built:          " + (literal == built));
        System.out.println("literal.equals(built):     " + literal.equals(built));
        System.out.println("literal == fromParts:      " + (literal == fromParts));
        System.out.println("literal.equals(fromParts): " + literal.equals(fromParts));
        System.out.println("\"JAVA\".equalsIgnoreCase(literal): " + "JAVA".equalsIgnoreCase(literal));

        String missing = null;
        System.out.println("Objects.equals(missing, literal): " + Objects.equals(missing, literal));
        System.out.println("\"java\".equals(missing): " + "java".equals(missing));

        System.out.println("5 != 3: " + (5 != 3) + ", 5 >= 5: " + (5 >= 5) + ", 'a' < 'b': " + ('a' < 'b'));
    }
}
```

Output:

```text
int 1000 == 1000: true
literal == sameLiteral:    true
literal == built:          false
literal.equals(built):     true
literal == fromParts:      false
literal.equals(fromParts): true
"JAVA".equalsIgnoreCase(literal): true
Objects.equals(missing, literal): false
"java".equals(missing): false
5 != 3: true, 5 >= 5: true, 'a' < 'b': true
```

Why is `literal == sameLiteral` true? Java stores identical string literals once in a shared *string pool*, so both variables refer to the same object. But strings built at run time, whether with `new String(...)` or by calculations such as `replace`, are separate objects. You cannot know in general which strings happen to be shared, so the rule is simple: **compare string contents with `equals`, never with `==`**. Chapter 4 explains the string pool and `intern()` in detail.

Useful equality tools:

| Need | Use | Null-safe? |
|---|---|---|
| Compare primitive values | `a == b` | not applicable |
| Compare string contents | `a.equals(b)` | no, throws if `a` is null |
| Compare ignoring letter case | `a.equalsIgnoreCase(b)` | no, throws if `a` is null |
| Compare when either may be null | `Objects.equals(a, b)` | yes |
| Compare with a known constant | `"java".equals(input)` | yes, the literal is never null |
| Check whether two references are the same object | `a == b` | yes |

## Bitwise operators and shifts

The bitwise operators work on the individual bits of integer values. You met binary representation in Lesson 1; these operators manipulate it directly.

| Operator | Meaning | Bit rule |
|---|---|---|
| `a & b` | AND | 1 where both bits are 1 |
| `a \| b` | OR | 1 where either bit is 1 |
| `a ^ b` | XOR | 1 where the bits differ |
| `~a` | NOT | flips every bit |
| `a << n` | left shift | shifts bits left, filling with 0 (multiplies by 2 to the n, until overflow) |
| `a >> n` | signed right shift | shifts right, copying the sign bit (divides by 2 to the n, rounding down) |
| `a >>> n` | unsigned right shift | shifts right, filling with 0 |

A classic real-world use is **flags**: packing several yes/no options into one integer.

```java
public class Bitwise {
    static final int READ = 0b100;
    static final int WRITE = 0b010;
    static final int EXECUTE = 0b001;

    static String bits(int value) {
        return String.format("%8s", Integer.toBinaryString(value & 0xFF)).replace(' ', '0');
    }

    public static void main(String[] args) {
        int a = 0b1100, b = 0b1010;
        System.out.println("a       = " + bits(a));
        System.out.println("b       = " + bits(b));
        System.out.println("a & b   = " + bits(a & b));
        System.out.println("a | b   = " + bits(a | b));
        System.out.println("a ^ b   = " + bits(a ^ b));
        System.out.println("~a      = " + bits(~a));
        System.out.println("a << 2  = " + bits(a << 2) + " (" + (a << 2) + ")");
        System.out.println("a >> 2  = " + bits(a >> 2) + " (" + (a >> 2) + ")");
        System.out.println("-16 >> 2   = " + (-16 >> 2));
        System.out.println("-16 >>> 28 = " + (-16 >>> 28));

        int permissions = READ | WRITE;
        System.out.println("can write?   " + ((permissions & WRITE) != 0));
        System.out.println("can execute? " + ((permissions & EXECUTE) != 0));
        permissions |= EXECUTE;
        permissions &= ~WRITE;
        System.out.println("after grant/revoke: " + bits(permissions));
        System.out.println("13 is odd? " + ((13 & 1) == 1));
    }
}
```

Output:

```text
a       = 00001100
b       = 00001010
a & b   = 00001000
a | b   = 00001110
a ^ b   = 00000110
~a      = 11110011
a << 2  = 00110000 (48)
a >> 2  = 00000011 (3)
-16 >> 2   = -4
-16 >>> 28 = 15
can write?   true
can execute? false
after grant/revoke: 00000101
13 is odd? true
```

The flag idioms are worth memorizing: `flags | FLAG` sets a flag, `flags & ~FLAG` clears it, and `(flags & FLAG) != 0` tests it. `>>` keeps negative numbers negative (`-16 >> 2` is `-4`), while `>>>` treats the bits as unsigned, which is useful for hashing and binary protocols. In ordinary business code prefer readable types such as `EnumSet` (Chapter 9) over hand-packed flags.

> **Note:** `&`, `|`, and `^` are bitwise when applied to integers and logical (non-short-circuit) when applied to booleans. Seeing `&` between two conditions in business code is usually a bug; `&&` was intended.

## Common mistakes

**1. Using `==` to compare strings.** `if (command == "quit")` may work in a quick test with literals and fail with user input. Use `"quit".equals(command)`.

**2. Putting the null check second.** `!name.isBlank() && name != null` throws for `null`. The guard must be the left operand.

**3. Using `&` or `|` between conditions.** Both sides always run, which defeats null guards and can call expensive methods unnecessarily.

**4. Forgetting parentheses around arithmetic in concatenation.** `"Total: " + price + tax` concatenates instead of adding. Write `"Total: " + (price + tax)`.

**5. Testing odd numbers with `n % 2 == 1`.** It returns false for negative odd numbers. Use `n % 2 != 0`.

**6. `x = x++`.** It leaves `x` unchanged. Write `x++;` on its own.

**7. Writing `if (flag == true)` or `if (flag = true)`.** The first is redundant; the second assigns and is always true. Write `if (flag)` and `if (!flag)`.

## Best practices

- Add parentheses whenever precedence is not obvious to a reader, especially when mixing `&&` with `||` or arithmetic with string concatenation.
- Put null checks and cheap conditions first in `&&` chains.
- Keep increments and decrements in their own statements.
- Use `equals` (or `Objects.equals`) for object contents and reserve `==` for primitives and deliberate identity checks.
- Use `Math.floorMod` when a remainder must be non-negative, such as circular indexes.
- Extract complex conditions into well-named boolean variables: `boolean canCheckout = cartHasItems && paymentValid && !accountLocked;`.

## Summary

- Integer `/` truncates and `%` returns the remainder, whose sign follows the left operand; `Math.floorMod` gives a non-negative result.
- Prefix `++x` yields the new value; postfix `x++` yields the old value. Standalone, they are identical.
- Precedence: unary, multiplicative, additive, relational, equality, `&&`, `||`, assignment. `+` becomes concatenation as soon as one operand is a `String`, evaluated left to right.
- `&&` and `||` short-circuit: the right operand is skipped when the left decides the result. That is what makes `x != null && x.isEmpty()` safe.
- `==` compares primitive values but object identity; compare string contents with `equals`.
- Bitwise operators manipulate individual bits and are ideal for flags and binary formats.

## Practice

Warm-up:

1. Predict, then verify: `20 / 6`, `20 % 6`, `-20 % 6`, `Math.floorMod(-20, 6)`, `6 % 20`.
2. Predict the output of `System.out.println(5 + 5 + "5" + 5 + 5);` and explain each step.
3. Given `int n = 10;`, predict `n++ + ++n` and the final value of `n`.

Core:

1. Convert a number of minutes (for example 1000) into days, hours, and minutes using only `/` and `%`.
2. Write `static boolean isLeapYear(int year)` using `%`, `&&`, and `||`: a year is a leap year if divisible by 4, except years divisible by 100, unless also divisible by 400. Test 1900, 2000, 2023, and 2024.
3. Write a method that returns true only if a `String` parameter is non-null, not blank, and at most 20 characters long. Arrange the conditions so it can never throw, and test it with `null`, `""`, `"   "`, and a long string.

Challenge:

1. Store the days of the week a shop is open as bit flags in one `int` (Monday = bit 0). Write methods to open a day, close a day, test a day, and count open days with `Integer.bitCount`.
2. Rewrite `!(age < 18 || !hasTicket)` using De Morgan's laws so that it contains no `!` in front of parentheses, then verify with all four combinations that both versions agree.

## Check your understanding

1. In `input != null && input.startsWith("#")`, what exactly prevents a `NullPointerException` when `input` is `null`? What happens if you swap the two operands?
2. Why does `"Sum: " + 2 + 3` print `Sum: 23`, and what is the smallest change that prints `Sum: 5`?
3. Two `String` variables both contain `"hello"`, yet `a == b` is `false`. What does `==` compare for objects, and what should you use instead?
4. What are the values of `-9 % 4` and `Math.floorMod(-9, 4)`?
5. After `int i = 7; int j = i++ + i;`, what are `i` and `j`?
6. Which expression tests whether the `EXECUTE` bit is set in `flags`, and which one clears it?
