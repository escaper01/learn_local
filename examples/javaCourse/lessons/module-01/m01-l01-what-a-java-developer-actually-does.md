# What a Java developer actually does

Most people imagine programming as typing code quickly. In real teams, typing is the smallest part of the job. A Java developer spends most of the day clarifying what a program must do, writing small pieces of code, checking that those pieces behave correctly, reading error messages, and explaining decisions to other people. Java runs banking systems, online shops, Android apps, data pipelines, and large parts of the internet's back-end services, so the habits you build here are the habits employers look for.

This lesson gives you the whole loop in miniature: a requirement, a first complete program, output you can check, comments that explain intent, and the difference between code that *compiles* and code that is *correct*.

What you will learn:

- What a professional Java developer's work actually consists of
- How to turn a vague request into concrete examples before writing code
- The anatomy of a complete Java program, line by line
- How to print text with `print`, `println`, and `printf`
- How escape sequences and string joining with `+` work
- The three comment styles and when to use each
- The difference between compile-time errors, runtime errors, and logic errors
- Why a program that compiles can still be wrong

## The job, broken into activities

A developer turns a request into a program whose behavior can be checked. That sentence hides many separate activities:

| Activity | What it looks like in practice |
|---|---|
| Clarifying requirements | Asking "what should happen when the quantity is zero?" before writing anything |
| Designing | Choosing which pieces of data and which steps the program needs |
| Writing code | Expressing those steps in Java source files |
| Compiling | Letting the compiler check the code against the language rules |
| Testing | Running the code with known inputs and comparing actual output with expected output |
| Debugging | Finding the cause when actual and expected differ |
| Reviewing | Reading a teammate's changes, and having yours read |
| Maintaining | Changing old code safely when requirements change |

Notice how many of these activities are about *evidence*. A professional does not say "I think it works"; they say "it produces 750 for the example of 3 items at 250 cents, and it rejects a negative quantity."

## From a request to concrete examples

Imagine a shop owner asks: "Calculate the receipt total." That request is incomplete. Before choosing any syntax, a developer asks questions:

- Are prices stored in whole cents or as decimal amounts?
- Is tax included, added, or ignored?
- Can the quantity be zero?
- What should happen if someone enters a negative quantity?

Then they write concrete examples that anyone can check without reading code:

| Quantity | Unit price (cents) | Expected total (cents) | Notes |
|---|---|---|---|
| 3 | 250 | 750 | Ordinary case |
| 0 | 250 | 0 | Empty order is allowed |
| 1 | 0 | 0 | Free item |
| -1 | 250 | rejected | Invalid input |

This table is already a test plan. When the program exists, you will run it with these inputs and compare. Writing examples first is the single most useful habit in this whole academy.

> **Tip:** Store money as whole cents (an integer) while you are learning. Decimal fractions such as 0.10 cannot always be stored exactly by the computer. Chapter 2 explains why.

## Your first complete program

Create a file named exactly `Main.java` and type this complete program:

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Welcome to Java Developer Academy");
        System.out.println("Receipt total: 750 cents");
    }
}
```

Output:

```text
Welcome to Java Developer Academy
Receipt total: 750 cents
```

Every piece of this file has a job:

| Code | Meaning |
|---|---|
| `public class Main` | Declares a class named `Main`. A class is a container for code. A public class must live in a file with the same name, `Main.java`. |
| `{` and `}` | Braces mark where a body begins and ends. Every opening brace needs a matching closing brace. |
| `public static void main(String[] args)` | The entry point: the method the Java launcher calls to start your program. Copy this line exactly for now. |
| `System.out` | The standard output stream, usually your terminal window. |
| `.println(...)` | A method that prints its argument followed by a line break. |
| `"Receipt total: 750 cents"` | A String literal: text surrounded by double quotes. |
| `;` | Ends a statement, like a full stop ends a sentence. |

Java is **case-sensitive**. `Main` and `main` are different names, and `System` and `system` are different names. You do not need to understand `public`, `static`, `void`, or `String[] args` yet. What matters now is that the launcher looks for that *exact* form. If you change it, the program may still compile but the launcher will refuse to start it. Later chapters explain every keyword.

## Compiling and running

Open a terminal in the folder containing `Main.java` and run two commands:

```bash
javac Main.java
java Main
```

The first command runs the **compiler**, `javac`. It reads `Main.java`, checks it against the language rules, and writes a new file, `Main.class`, containing bytecode. The second command runs the **launcher**, `java`. It starts a Java Virtual Machine, loads the class named `Main`, and calls its `main` method.

Notice that you give `java` a *class name* (`Main`), not a file name (`Main.class`). Lesson 2 explains what bytecode is, and lesson 3 covers packages, the classpath, and JAR files in detail.

> **Note:** For a single-file program you can also run `java Main.java`. The launcher compiles the file in memory and runs it without writing a `.class` file. This is convenient for experiments, but real projects compile first.

## Printing: print, println, and printf

`System.out` offers three printing methods you will use constantly:

- `println(x)` prints `x` and then moves to a new line.
- `print(x)` prints `x` and stays on the same line.
- `printf(format, values...)` prints values inserted into a template.

Inside a String literal, the backslash starts an **escape sequence**, a two-character code for a character you cannot type directly:

| Escape | Meaning |
|---|---|
| `\n` | New line |
| `\t` | Tab (jumps to the next tab stop) |
| `\"` | A double quote inside a string |
| `\\` | A single backslash |
| `\'` | A single quote (mainly needed in char literals) |

The `+` operator joins (concatenates) text with other values. It is evaluated from left to right, which matters when numbers are involved. Here is a complete program that shows all of this:

```java
public class PrintingDemo {
    public static void main(String[] args) {
        System.out.print("Loading");
        System.out.print("...");
        System.out.println(" done");
        System.out.println();
        System.out.println("Item\tQty\tPrice");
        System.out.println("Pen\t3\t2.50");
        System.out.println("She said \"hi\" and left.");
        System.out.println("Folder: C:\\java\\bin");
        System.out.println("Line one\nLine two");
        System.out.println("Total: " + 3 * 250 + " cents");
        System.out.println("Joined: " + 3 + 250);
        System.out.println("Added: " + (3 + 250));
        System.out.println(3 + 250 + " came first");
    }
}
```

Output:

```text
Loading... done

Item    Qty     Price
Pen     3       2.50
She said "hi" and left.
Folder: C:\java\bin
Line one
Line two
Total: 750 cents
Joined: 3250
Added: 253
253 came first
```

Study the last four lines carefully:

1. `"Total: " + 3 * 250 + " cents"`: multiplication happens before `+`, so `3 * 250` becomes `750` first, then it is joined to the text.
2. `"Joined: " + 3 + 250`: working left to right, `"Joined: " + 3` produces the text `"Joined: 3"`, and then `+ 250` joins more text, giving `3250`. No addition happened.
3. `"Added: " + (3 + 250)`: parentheses force the numeric addition first.
4. `3 + 250 + " came first"`: the left-most `+` has two numbers, so it adds them to `253` before the text appears.

The empty `System.out.println()` prints just a line break, producing a blank line.

## Formatted output with printf

When you need numbers aligned or rounded, `printf` is clearer than joining strings. The first argument is a **format string** containing placeholders called format specifiers. Each specifier is replaced by the next value in the list.

| Specifier | Formats | Example result |
|---|---|---|
| `%s` | Any value as text | `Notebook` |
| `%d` | A whole number | `42` |
| `%.2f` | A decimal number with 2 digits after the point | `7.50` |
| `%n` | A line break for the current platform | (new line) |
| `%8s` | Text right-aligned in 8 characters | `   right` |
| `%-8s` | Text left-aligned in 8 characters | `left    ` |
| `%05d` | A whole number padded with zeros to width 5 | `00042` |
| `%%` | A literal percent sign | `%` |

```java
public class PrintfDemo {
    public static void main(String[] args) {
        String item = "Notebook";
        int quantity = 3;
        double unitPrice = 2.5;

        System.out.printf("Item: %s%n", item);
        System.out.printf("Quantity: %d%n", quantity);
        System.out.printf("Unit price: %.2f%n", unitPrice);
        System.out.printf("%s x %d = %.2f%n", item, quantity, quantity * unitPrice);
        System.out.printf("[%8s] [%-8s] [%5d] [%05d]%n", "right", "left", 42, 42);
        System.out.printf("Progress: 75%%%n");
    }
}
```

Output:

```text
Item: Notebook
Quantity: 3
Unit price: 2.50
Notebook x 3 = 7.50
[   right] [left    ] [   42] [00042]
Progress: 75%
```

This program uses **variables** (`item`, `quantity`, `unitPrice`), which are named storage for values. Chapter 2 covers them thoroughly; for now read `int quantity = 3;` as "create a whole-number variable called quantity holding 3."

> **Note:** `printf` does not add a line break by itself. End the format string with `%n` when you want one. Some countries write decimals with a comma; `printf` follows the computer's locale settings, which Chapter 2 lesson 5 explains.

## Comments: notes for humans

The compiler ignores comments completely. They exist for the people who read your code later, including you in six months. Java has three forms:

- `// line comment` runs from the two slashes to the end of that line.
- `/* block comment */` can span several lines.
- `/** documentation comment */` is placed directly before a class or method. The `javadoc` tool turns these into API documentation pages, like the ones you will read in lesson 4.

```java
/**
 * Prints a one-line receipt for a fixed order.
 * Prices are stored in whole cents to avoid rounding surprises.
 */
public class Receipt {
    public static void main(String[] args) {
        int quantity = 3;          // number of notebooks bought
        int unitPriceCents = 250;  // 2.50 in cents

        /*
         * Requirement: total = quantity * unit price.
         * Worked example: 3 * 250 = 750 cents.
         */
        int totalCents = quantity * unitPriceCents;

        System.out.println("Items: " + quantity);
        System.out.println("Unit price: " + unitPriceCents + " cents");
        System.out.println("Receipt total: " + totalCents + " cents");
        // System.out.println("Debug line that is switched off");
    }
}
```

Output:

```text
Items: 3
Unit price: 250 cents
Receipt total: 750 cents
```

The last line of `main` is "commented out": it is still in the file but the compiler skips it. Good comments explain *why* (the requirement, a business rule, a surprising decision). Poor comments repeat *what* the code already says, such as `// add one` above `count = count + 1;`.

## Three kinds of errors

Problems in a program fall into three families, and each is discovered at a different moment:

| Kind | When it appears | Who reports it | Example |
|---|---|---|---|
| Compile-time error | When you run `javac` | The compiler, with file, line, and a caret | Missing semicolon, misspelled method name |
| Runtime error | While the program runs | The JVM, as an exception with a stack trace | Dividing a whole number by zero |
| Logic error | Never reported automatically | Only you, by comparing output with examples | Adding where you should multiply |

Logic errors are the dangerous ones, because nothing warns you. Consider this complete program:

```java
public class ReceiptBug {
    public static void main(String[] args) {
        int quantity = 3;
        int unitPriceCents = 250;
        int totalCents = quantity + unitPriceCents;
        System.out.println("Receipt total: " + totalCents + " cents");
    }
}
```

Output:

```text
Receipt total: 253 cents
```

It compiles without a single warning. It runs without crashing. It is still wrong, because the requirement table said 3 items at 250 cents must total 750.

### What compiling actually proves

The compiler checks **form**: that the grammar is valid, that every name you use exists, and that values have compatible types (you cannot store text in a whole-number variable, for example). It knows nothing about receipts, taxes, or your customer. A helpful analogy: the compiler is a spell-checker and grammar-checker, not a fact-checker. The sentence "Paris is the capital of Germany" is perfectly spelled and perfectly wrong.

So after a successful compile you know the source obeys the language rules. Whether the program does the right thing is a separate question that only running it against expected examples can answer. That is why the example table from earlier is not optional.

## What happens under the hood

Here is the step-by-step story of `Receipt.java` from the comment section:

1. `javac Receipt.java` reads the text file, skips all comments, and checks every statement.
2. The compiler writes `Receipt.class`, a file of bytecode instructions (not readable text).
3. `java Receipt` starts the Java Virtual Machine (JVM) as a process on your operating system.
4. The JVM finds and loads `Receipt.class`, checks that the bytecode is safe, and looks for the exact `public static void main(String[] args)` method.
5. Statements inside `main` run from top to bottom: `quantity` receives 3, `unitPriceCents` receives 250, `totalCents` receives the product 750.
6. Each `println` sends characters to standard output, which your terminal displays.
7. When `main` finishes, the JVM exits and the terminal prompt returns.

## Common mistakes

**Missing semicolon.**

```java
System.out.println("Receipt total: 750 cents")
```

```text
Main.java:3: error: ';' expected
        System.out.println("Receipt total: 750 cents")
                                                      ^
1 error
```

Read the message in three parts: the file (`Main.java`), the line number (`3`), and the caret `^` pointing at where the compiler got confused. Fix: add `;` at the end of the statement.

**Lowercase `system`.**

```java
system.out.println("Receipt total: 750 cents");
```

```text
Main.java:3: error: package system does not exist
```

Java is case-sensitive. The class is `System` with a capital S.

**Misspelled method name.**

```java
System.out.printn("Receipt total: 750 cents");
```

```text
Main.java:3: error: cannot find symbol
  symbol:   method printn(String)
  location: variable out of type PrintStream
```

"Cannot find symbol" means a name does not exist. The message even tells you which name (`printn`) and where it looked. Fix the spelling to `println`.

**Single quotes around text.**

```java
System.out.println('Receipt total: 750 cents');
```

```text
Main.java:3: error: unclosed character literal
...
4 errors
```

Single quotes are for exactly one character, such as `'A'`. Text needs double quotes. Notice that one mistake produced four errors: fix the *first* error and recompile before reading the rest.

**File name does not match the public class.** A file `Main.java` containing `public class Receipt`:

```text
Main.java:1: error: class Receipt is public, should be declared in a file named Receipt.java
```

Rename the file or the class so they match exactly, including capital letters.

**A lone backslash in a Windows path.**

```java
System.out.println("Folder: C:\java\bin");
```

```text
PrintingDemo.java:10: error: illegal escape character
```

`\j` is not a valid escape sequence. Write `\\` for each literal backslash.

**Removing `public` from `main`.** The class still compiles, but launching it fails:

```text
Error: Main method not found in class Main, please define the main method as:
   public static void main(String[] args)
```

The launcher is strict about the entry-point signature. Keep it exactly as shown.

## Best practices

- Write the expected output for at least three examples *before* you run the program.
- Read error messages from the top: file, line, caret, then the message text.
- Change one thing at a time, then recompile and rerun, so you know which change mattered.
- Name the file after its public class and match capitalization exactly.
- Indent the body of every brace consistently (four spaces is the common Java convention).
- Use comments to record requirements and reasons, not to narrate obvious code.
- Keep a short notebook of requirement, expected result, actual result, and correction for every bug you fix. Patterns emerge quickly.

## Summary

- A Java developer's job is to turn requests into programs whose behavior can be *checked*, not merely typed.
- Concrete examples with expected results come before code and become your test plan.
- A complete program needs a class and the exact `public static void main(String[] args)` entry point.
- `println` adds a line break, `print` does not, and `printf` fills placeholders like `%s`, `%d`, `%.2f`, and `%n`.
- `+` joins text left to right; use parentheses when you want numeric addition inside printed text.
- Comments come in three forms (`//`, `/* */`, `/** */`) and are ignored by the compiler.
- Compilation proves the code follows the language rules. It does not prove the program computes the right answer; only running it against expected examples does.

## Practice

**Warm-up**

1. Type the first `Main` program without copying and pasting, compile it, and run it.
2. Change the total to 1000 cents. Write down the exact line you expect before running.
3. Print your name, then your favourite language, on two lines using a single `println` and `\n`.

**Core**

4. Remove the semicolon from one statement. Record the file, line, and caret position the compiler reports. Restore it.
5. Predict the output of `System.out.println("Sum: " + 2 + 2);` and of `System.out.println(2 + 2 + " is the sum");`, then run both.
6. Use `printf` to print a three-row table of items, quantities, and prices with aligned columns.
7. Add a documentation comment above your class and two line comments that explain *why* a value was chosen.

**Challenge**

8. Write a requirement table for "print a receipt for up to three different items", including at least one edge case. Then write a program that prints the expected receipt for your first example and compare it line by line with your table.
9. Deliberately introduce one compile-time error and one logic error into a working program. Explain in writing why only one of them was reported.

## Check your understanding

1. Why should you write expected examples before writing code?
2. What is the difference between `print` and `println`, and what does `%n` do in `printf`?
3. What does `"Total: " + 1 + 2` print, and why?
4. Which of the three comment forms is used to produce API documentation, and where is it placed?
5. A program compiles and runs without crashing but prints the wrong number. Which kind of error is this, and what does the successful compile tell you?
6. Why does the launcher refuse to start a class whose `main` method is missing `public`?
