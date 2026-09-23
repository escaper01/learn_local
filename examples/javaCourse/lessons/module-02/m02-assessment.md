# Chapter 2 assessment and deliberate practice

This chapter gave you a precise model of how Java represents and combines values. Almost every later chapter builds on it: collections store values, methods pass them, objects wrap them, and databases persist them. Before starting the assessment, use this review to confirm you can explain each idea without looking back, then work through the labs using the approaches described below.

## Lesson recaps

### Lesson 1: Primitive types, ranges, literals, and overflow

Java has eight primitive types with sizes fixed by the language: `byte` (8 bits), `short` (16), `int` (32), `long` (64), `float` (32), `double` (64), `char` (16-bit unsigned code unit), and `boolean`. Literals have types: plain integers are `int`, the `L` suffix makes a `long`, plain decimals are `double`, and `f` makes a `float`. Integers can be written in decimal, hexadecimal (`0x`), binary (`0b`), or octal (leading `0`). Integers are stored in two's complement, which gives each signed range one extra negative value and makes arithmetic wrap silently on overflow: `Integer.MAX_VALUE + 1` becomes `Integer.MIN_VALUE`. `Math.addExact` and related methods throw instead of wrapping.

### Lesson 2: Variables, final, scope, and definite assignment

A variable has a fixed type and a name that follows Java conventions: lowerCamelCase for variables and methods, UpperCamelCase for classes, UPPER_SNAKE_CASE for constants. Scope runs from the declaration to the end of the enclosing block. A local variable must be definitely assigned on every path before it is read, while fields receive default values. `final` permits exactly one assignment; on a reference it fixes *which object* the variable refers to, not the object's contents. `var` infers a fixed type for initialized local variables.

### Lesson 3: Numeric promotion, casting, BigDecimal, and precision

Widening conversions are automatic; narrowing needs a cast. Binary numeric promotion converts both operands to `double`, `float`, `long`, or at least `int` before arithmetic, so the operand types, not the destination, decide how an expression is computed. Casting a floating-point value to an integer truncates toward zero; integer narrowing keeps only the low bits. Floating-point values are binary approximations: never compare them with `==` and never use them for money. `BigDecimal`, built from strings and rounded explicitly with a scale and `RoundingMode`, gives exact decimal arithmetic and is compared with `compareTo`.

### Lesson 4: Operators, precedence, equality, and short-circuiting

Integer `/` truncates and `%` returns a remainder whose sign follows the left operand. Prefix increment yields the new value; postfix yields the old one. Precedence runs unary, multiplicative, additive, relational, equality, `&&`, `||`, assignment, and `+` becomes string concatenation as soon as one operand is a `String`. `&&` and `||` skip their right operand when the left decides the result, which makes guards like `x != null && x.isEmpty()` safe. `==` compares values for primitives but identity for objects; compare contents with `equals`.

### Lesson 5: Console input, parsing, validation, and formatted output

`Scanner` reads lines or tokens; mixing `nextInt` with `nextLine` leaves an unread line break. Parsing (`Integer.parseInt`) checks syntax and throws `NumberFormatException`; semantic validation checks whether a well-formed value is acceptable for the problem. Robust programs strip input, validate in layers, ask again after errors, and handle the end of input. `printf` and `String.format` control width, alignment, decimals, and grouping, and an explicit `Locale` makes output predictable.

## Cheat sheet

### Primitive types

| Type | Bits | Range or precision | Literal |
|---|---|---|---|
| `byte` | 8 | -128 to 127 | `(byte) 10` |
| `short` | 16 | -32,768 to 32,767 | `(short) 10` |
| `int` | 32 | about plus or minus 2.1 billion | `10`, `0xFF`, `0b1010`, `1_000` |
| `long` | 64 | about plus or minus 9.2 quintillion | `10L` |
| `float` | 32 | about 7 significant digits | `1.5f` |
| `double` | 64 | about 15 to 16 significant digits | `1.5`, `6.0e23` |
| `char` | 16 | 0 to 65535 | `'A'`, `'\n'`, `'A'` |
| `boolean` | not specified | `true`, `false` | `true` |

### Promotion and conversion

| Situation | Rule | Example |
|---|---|---|
| Either operand `double` | both become `double` | `7 / 2.0` is `3.5` |
| Both operands integers | result is `int` (or `long` if either is `long`) | `7 / 2` is `3` |
| `byte`, `short`, `char` in arithmetic | promoted to `int` first | `byteA + byteB` is an `int` |
| Compound assignment | includes a hidden cast | `b += 1` compiles for a `byte` |
| Double to int cast | truncate toward zero, clamp out-of-range | `(int) -3.9` is `-3` |
| Int to byte cast | keep the low 8 bits | `(byte) 130` is `-126` |

### Operators at a glance

| Question | Answer |
|---|---|
| `17 / 5` and `17 % 5` | `3` and `2` |
| `-7 % 2` | `-1` (use `Math.floorMod` for a non-negative result) |
| `x++` versus `++x` in an expression | old value versus new value |
| `1 + 2 + "3"` versus `"1" + 2 + 3` | `"33"` versus `"123"` |
| Null-safe check | `s != null && !s.isEmpty()` (guard first) |
| Compare strings | `a.equals(b)` or `Objects.equals(a, b)` |

### Input and output

| Task | Tool |
|---|---|
| Read a whole line | `scanner.nextLine()` |
| Check before reading | `hasNextLine()`, `hasNextInt()` |
| Parse text | `Integer.parseInt(text.strip())`, `Double.parseDouble(...)` |
| Two decimals | `printf("%.2f", value)` |
| Column alignment | `%-10s` (left), `%8.2f` (right) |
| Predictable separators | `String.format(Locale.ROOT, ...)` |

### Money

| Do | Do not |
|---|---|
| `new BigDecimal("19.99")` | `new BigDecimal(19.99)` |
| `a.divide(b, 2, RoundingMode.HALF_EVEN)` | `a.divide(b)` for non-terminating results |
| `a.compareTo(b) == 0` | `a.equals(b)` for numeric equality |
| `long` cents for simple currency | `double` amounts |

## Common mistakes checklist

Before submitting any lab, check your code against this list:

- Does any expression divide two integers where a fraction is expected?
- Is a cast applied to an operand, or too late to a finished result?
- Could an `int` sum or product exceed about two billion before it is stored?
- Are large literals marked with `L`, and are there any accidental octal literals with a leading `0`?
- Are strings compared with `equals` rather than `==`?
- Are null guards placed first in `&&` chains?
- Is any variable modified more than once in one expression?
- Is every local variable assigned on every path, without a fake default that hides a missing case?
- Does input handling strip whitespace, reject malformed text, and separately check the allowed range?
- Is money represented exactly and rounded by an explicit rule?

## The judgment question

The judgment question describes a symptom rather than a syntax problem: code that compiles and runs but produces subtly wrong amounts. When you see a symptom like that, ask which lesson's model explains it. Compilation only proves the code follows the language rules; it says nothing about whether the chosen representation can hold the values correctly. Think about how the values are stored, which type each intermediate step uses, and where rounding happens.

## Approaching the implementation lab

The implementation lab asks for an average of two `int` values that is correct for every possible pair of inputs, including the extremes.

1. Write the contract first: what should the method return for `(2, 4)`, for `(1, 2)`, and for `(0, 0)`? Which of these must produce a fractional result?
2. Build a boundary table before writing code. Include two large positive values, the most negative and most positive values together, and zero. For each row, estimate the exact mathematical answer on paper.
3. For every intermediate step in your planned expression, ask the Lesson 1 and Lesson 3 question: *what type is this step computed in, and can its value leave that type's range?* An intermediate result that overflows produces a wrong answer even though the final return type could have held the correct one.
4. Remember that the order of conversions matters. A conversion applied after an overflowing or truncating step cannot repair it.
5. Keep the method pure: no printing, no reading input, and the same result for the same arguments every time.

Hidden tests check the boundaries you listed in step 2. If your table covered them, you already know the expected results.

## Approaching the debug lab

The debug lab prints a whole number where a fractional average is required. Resist the temptation to change the printed text directly; the goal is to repair the calculation so it would stay correct for other inputs.

1. Run the program and write down the actual output next to the expected output.
2. Trace the expression step by step as in the Lesson 3 trace table: for each operator, write the operand types, the promoted type, and the intermediate value.
3. Identify the first step where the intermediate value differs from the mathematically correct one. That step is the defect.
4. Decide which operand must change type, and *when*, so that the step you identified is computed in floating point. Then explain in one sentence why converting the finished result is not enough.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Write a console program that reads a list of prices as lines, validates each one (empty, non-numeric, negative), and prints a receipt with aligned columns and an exact `BigDecimal` total.
2. Write a small "number explorer" that reads an integer and prints it in decimal, binary, hexadecimal, and octal, whether it is even, its last digit, and whether doubling it would overflow an `int`.
3. Rewrite one of your earlier programs so that every constant has a name, every variable has the narrowest scope, every non-reassigned variable is `final`, and all output uses `printf` with an explicit locale.
4. Take the expression `a + b * c / d % e` with sample values and trace it by hand, then confirm with code. Repeat with `double` and `int` mixtures until your predictions are always right.

## Self-assessment

You are ready for Chapter 3 when you can do all of the following without notes:

- State the size and range of `int` and `long`, and explain two's complement with a small example.
- Predict the result of any mix of `int`, `long`, and `double` arithmetic, including integer division and remainders of negative numbers.
- Explain why `0.1 + 0.2 != 0.3` and how to calculate with money correctly.
- Explain what `final` protects for a primitive and for an array.
- Explain why `x != null && x.isEmpty()` never throws and why the swapped version can.
- Read a line of user input, reject malformed and out-of-range values with specific messages, and ask again.
- Format a table of values with aligned columns and a fixed number of decimal places.
