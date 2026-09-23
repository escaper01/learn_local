# Console input, parsing, validation, and formatted output

Until now your programs have computed with values written into the source code. Real programs take input from somewhere they do not control: a user at a keyboard, a file, a web form, another system. Input is where most defects and security problems enter software, because the person or system on the other side can send anything: an empty line, extra spaces, letters where you expected digits, a number far too large, or a perfectly formed number that makes no sense for your problem.

This lesson teaches the full journey of a value from the console into your program and back out: reading with `Scanner`, converting text into numbers, validating in layers, recovering from bad input, and printing results in a precise, readable format.

What you will learn:

- How to read lines, words, and numbers from the console with `Scanner`
- The difference between line-based and token-based reading, and the `nextInt` / `nextLine` trap
- How to convert text into numbers with `Integer.parseInt` and `Double.parseDouble`, and handle `NumberFormatException`
- The two layers of validation: syntax (is it a number?) and semantics (is it an acceptable value?)
- How to ask again after invalid input and how to handle the end of input
- How to format output with `printf`, `String.format`, and `formatted`, including alignment, decimals, grouping, and locales

## Printing: print, println, and the output streams

You have used `System.out.println` since Chapter 1. Three related methods cover most needs:

| Method | Behavior | Example output of two calls |
|---|---|---|
| `System.out.println(x)` | prints `x`, then a line break | two separate lines |
| `System.out.print(x)` | prints `x` without a line break | both values on one line |
| `System.out.printf(format, args...)` | prints formatted text; add `%n` for a line break | controlled layout |

`System.out` is the **standard output** stream. There is also `System.err`, the **standard error** stream, meant for error messages and diagnostics. Both usually appear in the same terminal, but they can be redirected separately (for example, saving normal output to a file while errors still appear on screen), so send error messages to `System.err`.

## Reading input with Scanner

`java.util.Scanner` reads text from a source such as the keyboard (`System.in`) and splits it into pieces. Create one `Scanner` for `System.in` and reuse it for the whole program:

```java
import java.util.Scanner;

public class Greeting {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.print("What is your name? ");
        String name = scanner.nextLine();
        System.out.print("How old are you? ");
        int age = scanner.nextInt();
        System.out.print("What is your height in meters? ");
        double height = scanner.nextDouble();
        System.out.println();
        System.out.println("Hello, " + name + "!");
        System.out.println("Next year you will be " + (age + 1) + ".");
        System.out.println("Your height is " + height + " m.");
    }
}
```

Running it with the input lines `Amina Khalil`, `34`, and `1.72` supplied from a file or pipe produces:

```text
What is your name? How old are you? What is your height in meters? 
Hello, Amina Khalil!
Next year you will be 35.
Your height is 1.72 m.
```

When the input is piped, the typed answers are not echoed, so the three prompts appear on one line. When you run the program interactively, each answer you type appears after its prompt, and pressing Enter moves to the next line.

The main `Scanner` methods fall into two families:

| Method | Reads | Stops at |
|---|---|---|
| `nextLine()` | the rest of the current line, spaces included | the line break, which it consumes and discards |
| `next()` | one token (a run of non-whitespace characters) | the next whitespace |
| `nextInt()`, `nextLong()`, `nextDouble()`, `nextBoolean()` | one token, converted to that type | the next whitespace |
| `hasNextLine()`, `hasNext()`, `hasNextInt()`, `hasNextDouble()` | nothing; only *checks* what is available | returns `true` or `false` |

Notice that `nextLine()` returned the full name `Amina Khalil` including the space. `next()` would have returned only `Amina`.

> **Note:** `nextDouble()` interprets its input according to the default locale of the computer. On a machine configured for German, it expects `1,72`, not `1.72`. For predictable parsing, read the line and call `Double.parseDouble`, which always expects a dot, or call `scanner.useLocale(Locale.ROOT)`.

## The nextInt and nextLine trap

Mixing the token methods with `nextLine()` causes a bug that nearly every Java beginner meets:

```java
import java.util.Scanner;

public class NewlineTrap {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.print("Quantity: ");
        int quantity = scanner.nextInt();
        System.out.print("Product name: ");
        String product = scanner.nextLine();
        System.out.println();
        System.out.println("quantity=" + quantity + ", product=[" + product + "]");
        String actualProduct = scanner.nextLine();
        System.out.println("the real product line was [" + actualProduct + "]");
    }
}
```

With the input lines `3` and `Notebook`:

```text
Quantity: Product name: 
quantity=3, product=[]
the real product line was [Notebook]
```

## What happens under the hood

The input is a stream of characters: `3`, line break, `N`, `o`, `t`, `e`, `b`, `o`, `o`, `k`, line break. Trace how `Scanner` consumes it:

1. `nextInt()` skips leading whitespace, reads the token `3`, converts it, and **stops right before the line break**. The line break is still waiting in the input.
2. `nextLine()` reads "the rest of the current line". The rest of the current line is empty, so it immediately returns `""` and consumes the waiting line break.
3. The actual product name is still unread, and the next `nextLine()` finally returns `Notebook`.

There are two standard fixes:

- **Read everything as lines, then parse.** Call `nextLine()` for every input and convert it yourself with `Integer.parseInt(line.strip())`. This is the recommended style for interactive programs because each answer is exactly one line, and it gives you full control over validation.
- **Discard the leftover line break** by calling `scanner.nextLine();` once after `nextInt()` and before the next `nextLine()`.

Token-based reading shines when input is a stream of whitespace-separated values, such as numbers spread over several lines. `hasNextInt()` lets you consume numbers until something else appears:

```java
import java.util.Scanner;

public class TokenSum {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        int sum = 0;
        int count = 0;
        while (scanner.hasNextInt()) {
            int value = scanner.nextInt();
            sum += value;
            count++;
        }
        System.out.println("read " + count + " numbers, sum = " + sum);
        if (scanner.hasNext()) {
            System.out.println("stopped at a token that is not an int: " + scanner.next());
        }
    }
}
```

With the input lines `10 20 30` and `40 total 50`:

```text
read 4 numbers, sum = 100
stopped at a token that is not an int: total
```

Line breaks do not matter to token methods; they are just whitespace. Reading stopped at `total` because `hasNextInt()` returned `false`, so `50` was never read.

## When input does not match: InputMismatchException

If you call `nextInt()` and the next token is not an integer, `Scanner` throws an exception and, if nothing catches it, the program terminates:

```java
import java.util.Scanner;

public class MismatchCrash {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.print("Enter a number: ");
        int number = scanner.nextInt();
        System.out.println("Twice that is " + number * 2);
    }
}
```

With the input `twelve`:

```text
Enter a number: Exception in thread "main" java.util.InputMismatchException
	at java.base/java.util.Scanner.throwFor(Scanner.java:947)
	at java.base/java.util.Scanner.next(Scanner.java:1602)
	at java.base/java.util.Scanner.nextInt(Scanner.java:2267)
	at java.base/java.util.Scanner.nextInt(Scanner.java:2221)
	at MismatchCrash.main(MismatchCrash.java:7)
```

Read the stack trace from the bottom up to find *your* code: `MismatchCrash.main` at line 7, the `nextInt()` call. The lines above it are inside the JDK. A user should never see this. Either check first with `hasNextInt()`, or read the line and parse it yourself inside a `try`/`catch`.

## Parsing text into numbers

Parsing means converting text into a typed value. The wrapper classes provide the standard parsers:

| Method | Accepts | Throws on bad input |
|---|---|---|
| `Integer.parseInt("42")` | optional sign and digits within `int` range | `NumberFormatException` |
| `Long.parseLong("9000000000")` | digits within `long` range | `NumberFormatException` |
| `Double.parseDouble("3.14")` | decimal or scientific notation, always with a dot | `NumberFormatException` |
| `Boolean.parseBoolean("true")` | `"true"` in any letter case; everything else is `false` | never throws |
| `Integer.parseInt("ff", 16)` | digits in the given base | `NumberFormatException` |

`parseInt` is strict: it rejects surrounding spaces, decimal points, thousands separators, empty strings, and values outside the `int` range. So `"  7  "` must be stripped first, and `"99999999999"` fails even though it is made of digits.

`try` and `catch` let you handle the failure instead of crashing: the code inside `try` runs, and if it throws a `NumberFormatException`, execution jumps to the `catch` block. Chapter 11 covers exceptions in depth; the pattern below is all you need for now.

## Two layers of validation

Validating input is not one check but two, and it is important to keep them separate:

1. **Syntax validation** asks: *is this text a well-formed value of the type I need?* `"abc"`, `""`, and `"2.5"` are not valid integers. Parsing performs this check.
2. **Semantic validation** asks: *is this well-formed value acceptable for my problem?* `-3` is a perfectly valid integer, but not a valid rating on a 1 to 10 scale, not a valid age, and not a valid quantity. Parsing cannot know your business rules, so you must check the range yourself after parsing succeeds.

A value can pass syntax validation and still fail semantic validation. Each failure deserves a different, specific message, so the user knows what to fix.

```java
import java.util.Scanner;

public class RatingValidator {
    static final int MIN_RATING = 1;
    static final int MAX_RATING = 10;

    static String classify(String line) {
        String text = line.strip();
        if (text.isEmpty()) {
            return "rejected: empty input";
        }
        int rating;
        try {
            rating = Integer.parseInt(text);
        } catch (NumberFormatException error) {
            return "rejected: not a whole number";
        }
        if (rating < MIN_RATING || rating > MAX_RATING) {
            return "rejected: must be from " + MIN_RATING + " to " + MAX_RATING;
        }
        return "accepted: " + rating;
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        while (scanner.hasNextLine()) {
            String line = scanner.nextLine();
            System.out.printf("%-14s -> %s%n", "[" + line + "]", classify(line));
        }
    }
}
```

With eight input lines, including an empty line and one surrounded by spaces:

```text
[5]            -> accepted: 5
[-3]           -> rejected: must be from 1 to 10
[abc]          -> rejected: not a whole number
[]             -> rejected: empty input
[12]           -> rejected: must be from 1 to 10
[  7  ]        -> accepted: 7
[2.5]          -> rejected: not a whole number
[99999999999]  -> rejected: not a whole number
```

Study how the checks are layered: first normalize (`strip` removes surrounding whitespace), then reject empty input, then parse (syntax), then check the range (semantics). `-3` and `12` parse successfully and are rejected only by the range check. `99999999999` looks numeric but exceeds the `int` range, so parsing rejects it; if that input is legitimate in your domain, parse it as a `long` instead.

| Input | Normalized | Syntax (parse) | Semantics (1 to 10) | Result |
|---|---|---|---|---|
| `5` | `5` | ok | ok | accepted |
| `-3` | `-3` | ok | fails | rejected, out of range |
| `abc` | `abc` | fails | not checked | rejected, not a number |
| (empty) | (empty) | not attempted | not checked | rejected, empty |
| `  7  ` | `7` | ok | ok | accepted |

> **Tip:** Put validation in a method that returns a result instead of printing inside the parsing logic. `classify` can be tested with dozens of inputs without typing anything, which is exactly how you will write automated tests in Chapter 15.

## Asking again after invalid input

An interactive program should not give up at the first mistake. A loop keeps asking until it receives a valid value. It must also handle the **end of input**: when input comes from a file, or a user presses Ctrl+D (Linux/macOS) or Ctrl+Z then Enter (Windows), there are no more lines, and `nextLine()` would throw `NoSuchElementException`. Checking `hasNextLine()` first avoids that.

```java
import java.util.Scanner;

public class AskUntilValid {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        Integer age = null;
        while (age == null) {
            System.out.print("Age (0-130): ");
            if (!scanner.hasNextLine()) {
                System.out.println();
                System.out.println("No more input; giving up.");
                return;
            }
            String line = scanner.nextLine().strip();
            try {
                int candidate = Integer.parseInt(line);
                if (candidate >= 0 && candidate <= 130) {
                    age = candidate;
                } else {
                    System.out.println("Please enter an age from 0 to 130.");
                }
            } catch (NumberFormatException error) {
                System.out.println("\"" + line + "\" is not a whole number.");
            }
        }
        System.out.println("Thank you. Recorded age " + age + ".");
    }
}
```

With the input lines `abc`, `200`, and `42`:

```text
Age (0-130): "abc" is not a whole number.
Age (0-130): Please enter an age from 0 to 130.
Age (0-130): Thank you. Recorded age 42.
```

With only the line `abc` followed by the end of input:

```text
Age (0-130): "abc" is not a whole number.
Age (0-130): 
No more input; giving up.
```

`age` is declared as `Integer` (the wrapper class) rather than `int` so it can be `null`, meaning "no valid age yet". You will study wrappers in Chapter 8. Loops (`while`) are covered fully in Chapter 3.

> **Warning:** Do not call `scanner.close()` on a `Scanner` that wraps `System.in` if any other part of the program might read input later. Closing the `Scanner` also closes `System.in`, and it cannot be reopened. Create one `Scanner` for the console and let it live for the whole program.

## Formatted output with printf

String concatenation is fine for simple messages, but reports, receipts, and tables need control over width, alignment, and decimal places. `System.out.printf` (and `String.format`, which returns the text instead of printing it) takes a **format string** containing **format specifiers** that start with `%`, followed by the values to insert.

The general shape of a specifier is `%[flags][width][.precision]conversion`:

| Specifier | Meaning | Example | Output |
|---|---|---|---|
| `%d` | integer | `printf("%d", 42)` | `42` |
| `%5d` | integer, right-aligned in 5 characters | `printf("[%5d]", 42)` | `[   42]` |
| `%-5d` | left-aligned in 5 characters | `printf("[%-5d]", 42)` | `[42   ]` |
| `%05d` | zero-padded | `printf("%05d", 42)` | `00042` |
| `%,d` | thousands grouping | `printf("%,d", 1234567)` | `1,234,567` |
| `%+d` | always show sign | `printf("%+d", 42)` | `+42` |
| `%f` / `%.2f` | decimal, 6 or 2 decimal places | `printf("%.2f", 3.14159)` | `3.14` |
| `%9.2f` | width 9, 2 decimals | `printf("[%9.2f]", 3.5)` | `[     3.50]` |
| `%e` | scientific notation | `printf("%.3e", 123456.789)` | `1.235e+05` |
| `%s` | any value as text | `printf("%s", "hi")` | `hi` |
| `%-10s` | text, left-aligned in 10 | `printf("[%-10s]", "hi")` | `[hi        ]` |
| `%c`, `%b`, `%x` | char, boolean, hexadecimal | `printf("%x", 255)` | `ff` |
| `%n` | platform line separator | | line break |
| `%%` | a literal percent sign | `printf("%d%%", 85)` | `85%` |

This program prints a small receipt and demonstrates the most useful specifiers:

```java
import java.util.Locale;

public class Receipt {
    public static void main(String[] args) {
        String[] items = {"Coffee", "Blueberry muffin", "Water"};
        int[] quantities = {2, 1, 3};
        double[] prices = {3.5, 2.75, 1.2};

        System.out.printf(Locale.ROOT, "%-18s %4s %9s%n", "Item", "Qty", "Amount");
        double total = 0;
        for (int i = 0; i < items.length; i++) {
            double amount = quantities[i] * prices[i];
            total += amount;
            System.out.printf(Locale.ROOT, "%-18s %4d %9.2f%n", items[i], quantities[i], amount);
        }
        System.out.printf(Locale.ROOT, "%-18s %4s %9.2f%n", "Total", "", total);
        System.out.println();

        System.out.printf(Locale.ROOT, "grouping: %,d%n", 1234567);
        System.out.printf(Locale.ROOT, "zero pad: %05d%n", 42);
        System.out.printf(Locale.ROOT, "sign:     %+d%n", 42);
        System.out.printf(Locale.ROOT, "science:  %.3e%n", 123456.789);
        System.out.printf(Locale.ROOT, "hex:      %x, char: %c, bool: %b%n", 255, 'J', true);
        System.out.printf(Locale.ROOT, "percent:  %d%%%n", 85);
        System.out.printf(Locale.ROOT, "rounded:  %.1f and %.0f%n", 2.25, 2.5);

        String line = String.format(Locale.ROOT, "%s scored %d points", "Amina", 97);
        System.out.println(line);
        System.out.println("Locale.GERMANY: " + String.format(Locale.GERMANY, "%,.2f", 1234567.891));
        System.out.println("Locale.US:      " + String.format(Locale.US, "%,.2f", 1234567.891));
        System.out.println("text block: " + """
                %s has %d lessons""".formatted("Chapter 2", 5));
    }
}
```

Output:

```text
Item                Qty    Amount
Coffee                2      7.00
Blueberry muffin      1      2.75
Water                 3      3.60
Total                       13.35

grouping: 1,234,567
zero pad: 00042
sign:     +42
science:  1.235e+05
hex:      ff, char: J, bool: true
percent:  85%
rounded:  2.3 and 3
Amina scored 97 points
Locale.GERMANY: 1.234.567,89
Locale.US:      1,234,567.89
text block: Chapter 2 has 5 lessons
```

Details worth noticing:

- **Widths make columns line up.** `%-18s` pads text on the right; `%9.2f` pads numbers on the left. Use the same widths in the header and the rows.
- **Formatting rounds for display only.** `%.2f` changes how a number is shown, not the stored value. The `rounded:` line shows that `printf` rounds half up: `2.25` with one decimal becomes `2.3`, and `2.5` with no decimals becomes `3`.
- **Locale changes punctuation.** Germany uses `.` for grouping and `,` for decimals; the US uses the opposite. Without an explicit locale, `printf` uses the computer's default locale, so the same program can print different text on different machines. Pass `Locale.ROOT` (or a specific locale) when output must be predictable, for example when another program will read it or a test compares it.
- **`formatted`** is an instance method on `String` (Java 15 and later) that works like `String.format` and pairs nicely with text blocks.
- Mismatched specifiers fail at run time: `printf("%d", "text")` throws `IllegalFormatConversionException`, and too few arguments throws `MissingFormatArgumentException`.

## Common mistakes

**1. Mixing `nextInt()` and `nextLine()`.** The leftover line break makes the next `nextLine()` return an empty string. Read lines and parse, or consume the leftover line break.

**2. Treating parsing as complete validation.** `Integer.parseInt("-3")` succeeds, but `-3` may still be an invalid quantity. Always follow parsing with a range or rule check.

**3. Forgetting to strip.** `Integer.parseInt(" 7")` throws. Call `strip()` (or `trim()`) first, and decide deliberately whether internal spaces are allowed.

**4. Crashing on the end of input.** Calling `nextLine()` when no input remains throws `NoSuchElementException`. Guard loops with `hasNextLine()`.

**5. Closing the console Scanner too early.** After `scanner.close()`, every later read from `System.in` fails.

**6. Relying on the default locale.** A program that prints `3.50` on your machine prints `3,50` on a colleague's, and `nextDouble()` may reject `1.72`. Choose the locale explicitly when it matters.

**7. Printing a stack trace to the user.** Catch expected input errors and explain what went wrong in plain language; reserve stack traces for logs.

## Best practices

- Read interactive input one line at a time with `nextLine()`, then strip, parse, and validate.
- Validate in layers: presence (not empty), syntax (parses), semantics (acceptable range or rule). Give a specific message for each failure.
- Put validation logic in methods that return results, so it can be tested without a keyboard.
- Always handle the end of input.
- Keep one `Scanner` for `System.in` and do not close it while the program runs.
- Use `printf` or `String.format` for tables and reports, and pass an explicit `Locale` for output other programs or tests will read.
- Send error messages to `System.err` and normal results to `System.out`.

## Summary

- `Scanner` reads lines (`nextLine`) or whitespace-separated tokens (`next`, `nextInt`, `nextDouble`); the `hasNext...` methods check what is available without consuming it.
- `nextInt` leaves the line break unread, so a following `nextLine` returns an empty string.
- `Integer.parseInt` and `Double.parseDouble` convert text and throw `NumberFormatException` on malformed or out-of-range text.
- Syntax validation (does it parse?) and semantic validation (is the value acceptable?) are different checks. A line that parses as `-3` fails the semantic range check for a 1 to 10 rating.
- Loop to ask again after invalid input, and use `hasNextLine()` to handle the end of input.
- `printf`, `String.format`, and `formatted` control width, alignment, decimals, grouping, and signs; the locale controls separators.

## Practice

Warm-up:

1. Ask for the user's first name and favorite number (read both as lines), then print "Hello, NAME. Your number doubled is X."
2. Print the numbers 1 to 5 with their squares and cubes in three right-aligned columns of width 6.
3. Print `1234567.891` with `Locale.US`, `Locale.GERMANY`, and `Locale.FRANCE`, and describe the differences.

Core:

1. Write a temperature converter that reads a Celsius value as a line, rejects non-numbers and values below -273.15 with different messages, and prints the Fahrenheit value with one decimal place.
2. Write `static String validateQuantity(String line)` that returns `"ok"` or a specific error message for empty input, non-integers, zero or negative values, and values above 99. Test it with at least eight inputs, including surrounding spaces.
3. Read whitespace-separated numbers until the end of input and print their count, minimum, maximum, and average (with two decimals). Handle the case of no numbers at all.

Challenge:

1. Build a menu loop that repeatedly shows options 1 to 3 plus `q` to quit, validates the choice, and never crashes on empty input, letters, out-of-range numbers, or the end of input.
2. Print a formatted receipt from input lines of the form `name,quantity,unitPrice` (for example `Coffee,2,3.50`). Reject malformed lines with a message that includes the line number, and print the total at the end. Use `BigDecimal` for the money, as you learned in Lesson 3.

## Check your understanding

1. Why does `nextLine()` return an empty string when it is called right after `nextInt()`?
2. The input `-3` is given for a rating that must be from 1 to 10. Which validation step accepts it, and which step must reject it?
3. What does `Integer.parseInt("  12 ")` do, and how do you make it succeed?
4. What happens when your program calls `nextLine()` after the input has ended, and how do you prevent it?
5. What does `printf("[%-6s|%6.1f]", "ab", 3.14159)` print?
6. Why might a program that prints prices with `printf("%.2f", price)` produce different text on two computers, and how do you prevent it?
