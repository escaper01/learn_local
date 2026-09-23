# Conditions, switch expressions, and exhaustive decisions

Almost every business rule you will ever implement is a decision: ship for free or charge a fee, accept a login or reject it, retry a request or give up. In production code, decisions are where the most expensive bugs hide. A rule that says "orders of 50.00 or more ship free" can be implemented with `>` instead of `>=`, and the program compiles, runs, and passes most tests while silently charging the one customer whose order is exactly 50.00. This lesson teaches you to write decisions deliberately: compare values correctly, divide the input into cases with no gaps and no overlaps, choose the right construct (`if`, the ternary operator, or `switch`), and test the boundaries where rules change.

What you will learn:

- How the relational operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) and logical operators (`&&`, `||`, `!`) produce `boolean` values
- Why comparing `double` values and `String` objects needs extra care
- How `if`, `else if`, and `else` partition an input domain into cases
- When the ternary operator `?:` is the clearest choice, and when it is not
- The difference between classic switch statements (with fall-through) and modern switch expressions (with arrows and `yield`)
- What exhaustiveness means and why the compiler can enforce it for enums
- How Java 21's `case null` handles a missing selector
- How to design a decision table and choose boundary test values

## Comparing values: relational operators

A relational operator compares two values and produces a `boolean`: either `true` or `false`. That boolean is the raw material of every decision.

| Operator | Meaning | Example | Result when a = 7, b = 10 |
|---|---|---|---|
| `==` | equal to | `a == b` | `false` |
| `!=` | not equal to | `a != b` | `true` |
| `<` | less than | `a < b` | `true` |
| `<=` | less than or equal to | `a <= 7` | `true` |
| `>` | greater than | `a > b` | `false` |
| `>=` | greater than or equal to | `b >= 10` | `true` |

The difference between `<` and `<=` is one value: the value exactly at the edge. Think of a height sign at an amusement park that says "you must be at least 120 cm". A child who is exactly 120 cm may ride. If the attendant reads the sign as "taller than 120 cm", that child is wrongly turned away. The words "at least", "or more", "up to and including", and "no more than" all describe *inclusive* boundaries (`>=` and `<=`). Words such as "over", "above", "under", and "fewer than" describe *exclusive* boundaries (`>` and `<`).

### Combining conditions with logical operators

- `&&` (AND) is `true` only when both sides are `true`.
- `||` (OR) is `true` when at least one side is `true`.
- `!` (NOT) flips `true` to `false` and back.

Both `&&` and `||` *short-circuit*: Java evaluates the left side first and skips the right side if the answer is already known. `false && anything` is `false`, and `true || anything` is `true`. This is not just an optimization; you can rely on it to guard a risky check, such as reading `values[0]` only after confirming the array is not empty.

A range check needs two comparisons joined with `&&`. Mathematics lets you write `9 <= hour < 17`, but Java does not; you must write `hour >= 9 && hour < 17`.

### Program: comparison basics

```java
public class ComparisonBasics {
    public static void main(String[] args) {
        int a = 7;
        int b = 10;
        System.out.println("a == b  -> " + (a == b));
        System.out.println("a != b  -> " + (a != b));
        System.out.println("a <  b  -> " + (a < b));
        System.out.println("a <= 7  -> " + (a <= 7));
        System.out.println("a >  b  -> " + (a > b));
        System.out.println("b >= 10 -> " + (b >= 10));

        System.out.println("'a' < 'b' -> " + ('a' < 'b'));

        double sum = 0.1 + 0.2;
        System.out.println("0.1 + 0.2 == 0.3 -> " + (sum == 0.3));
        System.out.println("close enough     -> " + (Math.abs(sum - 0.3) < 1e-9));
        System.out.println("NaN == NaN       -> " + (Double.NaN == Double.NaN));

        int hour = 14;
        boolean businessHours = hour >= 9 && hour < 17;
        boolean weekendFlag = false;
        System.out.println("open now         -> " + (businessHours && !weekendFlag));

        int[] empty = {};
        boolean firstIsLarge = empty.length > 0 && empty[0] > 5;
        System.out.println("safe short-circuit -> " + firstIsLarge);

        String literal = "java";
        String built = new StringBuilder("ja").append("va").toString();
        System.out.println("literal == built      -> " + (literal == built));
        System.out.println("literal.equals(built) -> " + literal.equals(built));
        System.out.println("Integer.compare(3, 9) -> " + Integer.compare(3, 9));
    }
}
```

```text
a == b  -> false
a != b  -> true
a <  b  -> true
a <= 7  -> true
a >  b  -> false
b >= 10 -> true
'a' < 'b' -> true
0.1 + 0.2 == 0.3 -> false
close enough     -> true
NaN == NaN       -> false
open now         -> true
safe short-circuit -> false
literal == built      -> false
literal.equals(built) -> true
Integer.compare(3, 9) -> -1
```

Four lessons are packed into that output:

1. Characters compare by their numeric code, so `'a' < 'b'` is `true`.
2. `0.1 + 0.2` is not exactly `0.3` in binary floating point. Compare doubles with a tolerance, or use integers (such as cents) or `BigDecimal` for money.
3. `NaN` ("not a number") is not equal to anything, including itself. Use `Double.isNaN(x)` to test for it.
4. For objects such as `String`, `==` asks "are these the same object?" while `equals` asks "do these contain the same text?". Use `equals` for text. Chapter 4 explains the memory model behind this.

> **Note:** Parentheses around `(a == b)` in the print statements are required. Without them, `"a == b  -> " + a == b` would first concatenate the string and the number, then try to compare a `String` with an `int`, which does not compile.

## if, else if, and else: partitioning the input

An `if` statement runs a block only when its condition is `true`. Adding `else if` and `else` builds a chain in which exactly one block runs: Java tests conditions from top to bottom and stops at the first one that is `true`.

A well-designed chain *partitions* the input domain: every possible input lands in exactly one branch, with no gaps and no overlaps. Before writing code, list the cases on paper:

| Order total (cents) | Result |
|---|---|
| less than 0 | invalid |
| 0 up to 4999 | standard shipping |
| 5000 or more | free shipping |

Notice that 5000 appears in exactly one row. Now check each boundary: is -1 covered? Is 0? Is 4999? Is 5000? A table like this is called a *decision table*. It is the cheapest place to find a bug, because you have not written any code yet.

### Order of conditions matters

Because the chain stops at the first `true` condition, put the most specific or the invalid cases first. Handling invalid input at the top (a *guard*) means later conditions can assume valid data. If you checked `total >= 5000` before `total < 0`, it would still work here, but in general, rearranging branches can change which case wins when conditions overlap.

### Program: boundary testing an inclusive threshold

The only difference between the two rules below is `>=` versus `>`. Watch where the outputs disagree.

```java
public class ShippingBoundaries {
    static final int FREE_SHIPPING_MINIMUM_CENTS = 5_000;

    static String correctRule(int orderCents) {
        if (orderCents < 0) {
            return "invalid";
        } else if (orderCents >= FREE_SHIPPING_MINIMUM_CENTS) {
            return "free";
        } else {
            return "standard";
        }
    }

    static String buggyRule(int orderCents) {
        if (orderCents < 0) {
            return "invalid";
        } else if (orderCents > FREE_SHIPPING_MINIMUM_CENTS) {
            return "free";
        } else {
            return "standard";
        }
    }

    public static void main(String[] args) {
        int[] probes = {-1, 0, 4_999, 5_000, 5_001, 12_000};
        System.out.println("cents   correct   buggy");
        for (int cents : probes) {
            String expected = correctRule(cents);
            String actual = buggyRule(cents);
            String marker = expected.equals(actual) ? "" : "  <-- differs";
            System.out.printf("%-7d %-9s %s%s%n", cents, expected, actual, marker);
        }
    }
}
```

```text
cents   correct   buggy
-1      invalid   invalid
0       standard  standard
4999    standard  standard
5000    free      standard  <-- differs
5001    free      free
12000   free      free
```

The two rules agree on every probe except the one sitting exactly on the threshold. A test suite that only tried "typical" values such as 1000 and 12000 would never notice the bug. This is the core idea of **boundary value testing**: for every threshold in a rule, test one value just below it, the value exactly on it, and one value just above it. The value on the boundary tells you which operator the rule actually uses; the values on either side confirm that the neighbouring branches still work. For integer data, "just below" and "just above" mean one less and one more. Also test the extremes of the type (such as `Integer.MIN_VALUE` and `Integer.MAX_VALUE`) when a rule should hold for every possible value.

## The ternary operator

The conditional operator `condition ? valueIfTrue : valueIfFalse` is an *expression*: it produces a value, so it can appear on the right side of an assignment, as an argument, or in a `return`.

```java
// Fragment
int count = 1;
String noun = count == 1 ? "item" : "items";
System.out.println(count + " " + noun);   // 1 item

int max = a > b ? a : b;                  // same as Math.max(a, b)
```

Use the ternary for a single, simple choice between two values. Avoid nesting it: `x < 0 ? "neg" : x == 0 ? "zero" : "pos"` is legal but forces the reader to parse precedence in their head. An `if` chain or a switch is kinder to the next developer.

| Construct | Produces a value? | Best for |
|---|---|---|
| `if` / `else` | No (it is a statement) | Running different actions, multi-step logic, ranges |
| ternary `?:` | Yes | One short two-way value choice |
| switch statement | No | Legacy code; actions per discrete value |
| switch expression | Yes | Mapping discrete values (enums, strings, ints) to results |

## Switch statements: the classic form

A switch compares one *selector* value against a list of constant labels. The classic form uses colons:

```java
// Fragment: classic switch statement
switch (day) {
    case SAT:
    case SUN:
        hours = 0;
        break;
    case FRI:
        hours = 6;
        break;
    default:
        hours = 8;
}
```

In the classic form, execution jumps to the matching label and then *falls through* into every following label until it reaches a `break` or the end of the switch. Stacking `case SAT:` and `case SUN:` on top of each other uses fall-through on purpose. Forgetting a `break` uses it by accident, which is one of the oldest bugs in C-family languages.

## Switch expressions: the modern form

Java 14 made switch expressions standard. They use arrows (`->`), never fall through, can list several labels in one case (`case SAT, SUN ->`), and produce a value. When a case needs several statements, wrap them in braces and use `yield` to hand back the value.

### Program: classic and modern switch side by side

```java
public class SwitchForms {
    enum Day { MON, TUE, WED, THU, FRI, SAT, SUN }

    static int classicHours(Day day) {
        int hours;
        switch (day) {
            case SAT:
            case SUN:
                hours = 0;
                break;
            case FRI:
                hours = 6;
                break;
            default:
                hours = 8;
        }
        return hours;
    }

    static int modernHours(Day day) {
        return switch (day) {
            case SAT, SUN -> 0;
            case FRI -> 6;
            case MON, TUE, WED, THU -> 8;
        };
    }

    static String httpMeaning(int status) {
        return switch (status) {
            case 200, 201, 204 -> "success";
            case 404 -> "not found";
            default -> {
                if (status >= 500 && status <= 599) {
                    yield "server error";
                }
                yield "other (" + status + ")";
            }
        };
    }

    static String commandFor(String input) {
        return switch (input) {
            case null -> "no command supplied";
            case "start", "run" -> "starting";
            case "stop" -> "stopping";
            default -> "unknown command: " + input;
        };
    }

    public static void main(String[] args) {
        for (Day day : Day.values()) {
            System.out.println(day + " classic=" + classicHours(day) + " modern=" + modernHours(day));
        }
        System.out.println(httpMeaning(204));
        System.out.println(httpMeaning(503));
        System.out.println(httpMeaning(302));
        System.out.println(commandFor("run"));
        System.out.println(commandFor(null));
        System.out.println(commandFor("jump"));
    }
}
```

```text
MON classic=8 modern=8
TUE classic=8 modern=8
WED classic=8 modern=8
THU classic=8 modern=8
FRI classic=6 modern=6
SAT classic=0 modern=0
SUN classic=0 modern=0
success
server error
other (302)
starting
no command supplied
unknown command: jump
```

An `enum` is a type with a fixed list of named constants; Chapter 6 covers enums in depth. Here it is enough to know that `Day` has exactly seven possible values and `Day.values()` returns them in declaration order.

### Exhaustiveness

A switch *expression* must produce a value for every possible selector, so the compiler checks that the cases are **exhaustive**. For `int` or `String` selectors there are too many values to list, so you need a `default`. For an enum, you can list every constant instead, as `modernHours` does. That choice has a powerful payoff: if someone later adds a `HOLIDAY` constant to `Day`, `modernHours` stops compiling until the new case is handled. A `default` branch would have silently absorbed `HOLIDAY` into "8 hours", which may be wrong. For closed sets of values, prefer listing every case over `default`.

### What happens with null

If the selector of an ordinary switch is `null`, Java throws `NullPointerException` before any case is tried, and `default` does **not** catch it. Java 21 lets you write an explicit `case null` (as `commandFor` does) when a missing value is a legitimate input. If `null` is a bug, let it fail fast or check it with a guard before the switch.

> **Tip:** Java 21 also supports pattern matching in switch, such as `case Integer i when i > 0 ->`. Chapter 6 teaches patterns; for now, focus on constant labels.

## What happens under the hood: tracing a decision

Trace `correctRule(5000)` step by step:

1. `orderCents` is 5000. Test `5000 < 0`: `false`, so skip the first block.
2. Test `5000 >= 5000`: `true`, so run the block, which returns `"free"`.
3. The `else` block is never evaluated; `return` ends the method.

Trace `buggyRule(5000)`:

1. `5000 < 0` is `false`.
2. `5000 > 5000` is `false`, because a value is not greater than itself.
3. Fall into `else` and return `"standard"`.

For a switch expression, Java evaluates the selector once, finds the single matching label, evaluates only that arm, and uses its value. For strings, matching uses `equals` semantics (not `==`), so text read from a user matches `case "stop"` correctly.

## Common mistakes

### Mistake 1: assignment instead of comparison

```java
int count = 3;
if (count = 5) {
    System.out.println("five");
}
```

```text
AssignInIf.java:4: error: incompatible types: int cannot be converted to boolean
        if (count = 5) {
                  ^
```

`=` assigns; `==` compares. Java's `if` requires a `boolean`, so this mistake is caught at compile time. Fix: `if (count == 5)`.

### Mistake 2: accidental fall-through

```java
int level = 1;
switch (level) {
    case 1:
        System.out.println("bronze perks");
    case 2:
        System.out.println("silver perks");
    case 3:
        System.out.println("gold perks");
        break;
    default:
        System.out.println("no perks");
}
```

```text
bronze perks
silver perks
gold perks
```

A level-1 customer received every perk. Fix: add `break` after each case, or better, rewrite it with arrows (`case 1 -> System.out.println("bronze perks");`), which never fall through.

### Mistake 3: a switch expression that misses a case

```java
return switch (day) {
    case SAT, SUN -> 0;
    case FRI -> 6;
    case MON, TUE, WED -> 8;   // THU forgotten
};
```

```text
NonExhaustive.java:5: error: the switch expression does not cover all possible input values
        return switch (day) {
               ^
```

This error is your friend. Fix it by adding the missing constant, not by reflexively adding `default`.

### Mistake 4: comparing strings with ==

`if (input == "quit")` may work for literals typed in the source and fail for text read from the keyboard or a file. Fix: `if ("quit".equals(input))`, which also returns `false` instead of throwing when `input` is `null`.

### Mistake 5: off-by-one boundaries

Writing `>` when the requirement says "or more" (or `<` when it says "up to and including") produces code that is correct for every value except one. Fix: translate the wording into an operator deliberately, then prove it with a test exactly on the boundary.

## Best practices

- Write the decision table before the code. List every boundary and which row owns it.
- Put guards for invalid input first; then the remaining branches can assume valid data.
- Name thresholds with constants (`FREE_SHIPPING_MINIMUM_CENTS`) instead of scattering magic numbers.
- For each threshold, test just below, exactly on, and just above it, plus the type's extremes when relevant.
- Prefer arrow-style switch expressions for mapping discrete values to results; they cannot fall through and are checked for exhaustiveness.
- For enums, list every constant instead of `default` so the compiler flags new constants.
- Use braces on every `if` and `else`, even for one statement, to avoid the classic dangling-statement bug when someone adds a second line later.
- Keep conditions readable: extract `boolean isWeekend = day == Day.SAT || day == Day.SUN;` rather than repeating a long expression.

## Summary

- Relational operators produce `boolean` values; `<=` and `>=` include the boundary, `<` and `>` exclude it.
- `&&` and `||` short-circuit, which lets a left-hand check guard a right-hand one.
- Compare doubles with a tolerance, test `NaN` with `Double.isNaN`, and compare strings with `equals`.
- An `if`/`else if`/`else` chain runs exactly the first matching branch; design it so every input belongs to exactly one case.
- Boundary testing means checking below, at, and above each threshold.
- The ternary operator selects one of two values; do not nest it.
- Classic switch statements fall through without `break`; arrow-style switch expressions do not, and they must be exhaustive.
- `yield` returns a value from a block inside a switch expression; `case null` handles a null selector in Java 21.

## Practice

### Warm-up

1. Write a program that prints whether each of the Celsius temperatures -3, 0, and 8 is "below freezing", "at freezing", or "above freezing" using an `if` chain, and explain which temperature is the boundary probe.
2. Rewrite `max = a > b ? a : b` as an `if`/`else` statement and confirm both give the same result for (4, 9), (9, 4), and (5, 5).

### Core

1. A ticket price is 0 for ages under 3, 8 for ages 3 to 12 inclusive, 15 for ages 13 to 64 inclusive, and 9 for ages 65 and over. Negative ages are invalid. Write the decision table, list every boundary probe value (there are at least eight), then implement it and print the result for each probe.
2. Convert the classic-switch `FallThroughBug` into a switch expression that returns a `String` perk description for levels 1 to 3 and "no perks" otherwise.
3. Write a method that maps a month number (1 to 12) to its number of days in a non-leap year using a switch expression with multi-label cases.

### Challenge

1. Extend the month method to take a `boolean leapYear` and use `yield` in the February case. Then add an enum `Month` version with no `default` and observe the compiler error when you delete one constant from the switch.
2. Design a shipping rule that depends on both destination (domestic, international, unknown) and weight in grams with two thresholds. Write the full decision table first and count how many test cases boundary testing requires.

## Check your understanding

1. A rule says "accounts with 3 or fewer failed attempts may retry". Which operator expresses it, and which three attempt counts would you test first?
2. Why does `empty.length > 0 && empty[0] > 5` not throw an exception, while `empty[0] > 5 && empty.length > 0` does?
3. What is the practical difference between a switch statement and a switch expression?
4. Why might listing every enum constant be safer than writing `default` in a switch expression?
5. What happens when a `String` switch selector is `null` and there is no `case null`?
6. Why is `0.1 + 0.2 == 0.3` false, and what should you use instead when comparing money?
