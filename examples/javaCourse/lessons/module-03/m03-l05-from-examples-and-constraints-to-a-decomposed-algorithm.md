# From examples and constraints to a decomposed algorithm

Syntax is the easy part of programming. The hard part is turning a vague request such as "summarize the expenses" into precise rules, then into an algorithm, then into code that stays correct when the requirements change next month. Professional developers do not start by typing. They ask questions, write concrete examples, identify constraints, sketch the algorithm in plain language, and split it into small methods that each do one understandable thing. This skill, called **functional decomposition**, is what separates code that works once from code a team can maintain for years. This lesson brings together everything in Chapter 3 (decisions, loops, methods, contracts) and shows the full path from a request to a tested, decomposed program.

What you will learn:

- How to clarify a requirement by asking questions and writing input/output examples
- How to identify constraints: valid ranges, malformed input, size limits, overflow
- How to write pseudocode before Java
- What functional decomposition is and how to decide where to split a method
- Why the rules of a program should be separated from its input and output
- How to check pure methods with a small self-test harness
- How to recognize poor decomposition, such as boolean flag parameters and arbitrary splits

## Step 1: turn the request into examples

Suppose a manager asks: "Write a tool that adds up our expenses from a file." That sentence hides many decisions:

- Are refunds (negative amounts) included or excluded?
- What happens to a line that says `abc` or is blank?
- Is an amount of 0 an expense?
- Could the total exceed the largest `int` (about 2.1 billion)?
- What should the tool print when there are no expenses at all?

Each answer is a **specification choice**, not an implementation accident. Record the answers as concrete examples, one per rule:

| Input amounts | Expected total | Rule it pins down |
|---|---|---|
| 300, 200 | 500 | ordinary addition |
| (none) | 0 | empty input is valid, not an error |
| 300, -50 | 300 | refunds are excluded |
| 0 | 0 | zero is not an expense |
| 2147483647, 2147483647 | 4294967294 | totals may exceed the `int` range |
| the text `abc` | reported, then skipped | malformed input is not silently ignored |

Examples are powerful because they are unambiguous. "Exclude refunds" can be misread; `300, -50 -> 300` cannot. They also become your tests later.

## Step 2: identify constraints

Constraints are the limits your algorithm must respect:

- **Domain:** which values are valid (whole numbers of at most nine digits, optionally negative).
- **Size:** how much input to expect (a handful of lines, or millions?). This influences whether you can hold everything in memory.
- **Range:** whether intermediate results can overflow. Nine-digit amounts fit in an `int`, but their sum might not, so the accumulator should be a `long`.
- **Failure policy:** stop at the first bad line, or report it and continue?

Write constraints down next to the examples. When a constraint changes later ("amounts may now include cents"), you know exactly which rules are affected.

## Step 3: sketch the algorithm in pseudocode

Pseudocode is structured plain language. It lets you check the logic without fighting the compiler.

```text
for each line of input:
    strip surrounding spaces
    if the line is blank, skip it
    if the line is a whole number, remember it as an amount
    otherwise, report it as malformed and count it
total = sum of the amounts that are greater than zero
count = number of amounts that are greater than zero
print a summary of total, count, and malformed lines
```

Now read the pseudocode against every example in the table. Does `300, -50` give 300? Does empty input give 0? Only when the pseudocode passes every example should you write Java.

## Step 4: decompose into methods

**Functional decomposition** means splitting a task into smaller functions (methods), each with a single, nameable purpose, and composing them to solve the whole. A good way to find the pieces is **top-down design**: write the top-level steps first as calls to methods that do not exist yet, then implement each method, splitting further only when a step is still too big to understand at a glance. This is also called *stepwise refinement*.

The pseudocode above suggests these pieces:

| Method | Input | Output | Touches I/O? |
|---|---|---|---|
| `isWholeNumber` | one line of text | `boolean` | No |
| `positiveTotal` | `int[]` of amounts | `long` total | No |
| `countPositive` | `int[]` of amounts | `int` count | No |
| `formatSummary` | total, count, rejected | `String` | No |
| `main` | the keyboard or a piped file | printed lines | Yes |

Notice the last column. Every rule lives in a method with no input or output. Only `main` reads and prints.

### Program: the decomposed expense report

```java
import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class ExpenseReport {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        List<Integer> accepted = new ArrayList<>();
        int rejected = 0;
        while (in.hasNextLine()) {
            String line = in.nextLine().strip();
            if (line.isEmpty()) {
                continue;
            }
            if (isWholeNumber(line)) {
                accepted.add(Integer.parseInt(line));
            } else {
                rejected++;
                System.out.println("skipping malformed line: " + line);
            }
        }
        int[] amounts = toIntArray(accepted);
        System.out.println(formatSummary(positiveTotal(amounts), countPositive(amounts), rejected));
    }

    // Pure: is the text an optional minus sign followed by 1 to 9 digits?
    static boolean isWholeNumber(String text) {
        int start = text.startsWith("-") ? 1 : 0;
        int digitCount = text.length() - start;
        if (digitCount < 1 || digitCount > 9) {
            return false;
        }
        for (int i = start; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c < '0' || c > '9') {
                return false;
            }
        }
        return true;
    }

    // Pure: the business rule. Refunds (negative) and zero amounts are excluded.
    static long positiveTotal(int[] amounts) {
        long total = 0;
        for (int amount : amounts) {
            if (amount > 0) {
                total += amount;
            }
        }
        return total;
    }

    static int countPositive(int[] amounts) {
        int count = 0;
        for (int amount : amounts) {
            if (amount > 0) {
                count++;
            }
        }
        return count;
    }

    static String formatSummary(long total, int counted, int rejected) {
        return "expenses counted: " + counted + ", total: " + total + ", malformed lines: " + rejected;
    }

    static int[] toIntArray(List<Integer> values) {
        int[] result = new int[values.size()];
        for (int i = 0; i < result.length; i++) {
            result[i] = values.get(i);
        }
        return result;
    }
}
```

Run with the input lines `300`, `200`, `-50`, `abc`, an empty line, and `15`:

```text
skipping malformed line: abc
expenses counted: 3, total: 515, malformed lines: 1
```

`ArrayList` is a resizable list from Chapter 9; here it only collects the valid amounts because we do not know in advance how many lines will arrive. The nine-digit limit in `isWholeNumber` guarantees that `Integer.parseInt` never receives a value too large for an `int`.

## Why separate the rule from the input and output

Look at `positiveTotal`. It takes an array and returns a number. It does not know or care whether the numbers came from a keyboard, a file, a database, a web request, or a test. That separation brings three concrete benefits:

- **Testability:** you can call the rule directly with hand-written arrays and compare the result with the expected value, with no typing at a console and no output to read.
- **Reusability:** tomorrow's web version of the tool can call the same method without modification.
- **Changeability:** when the business changes the rule (say, "ignore expenses below 10"), you edit one small method; the console loop does not change at all.

Separation does not make a method magically correct. A pure method can still overflow if its accumulator is too narrow, and it still needs valid inputs. Validation remains a separate, explicit step. Separation simply makes each part small enough to check.

### Program: a self-test harness for the rules

Before learning a testing framework such as JUnit (Chapter 15), you can check pure methods with a tiny `check` helper.

```java
public class PositiveTotalChecks {
    static int failures = 0;

    static long positiveTotal(int[] amounts) {
        long total = 0;
        for (int amount : amounts) {
            if (amount > 0) {
                total += amount;
            }
        }
        return total;
    }

    static long totalAtLeast(int[] amounts, int minimum) {
        long total = 0;
        for (int amount : amounts) {
            if (amount >= minimum) {
                total += amount;
            }
        }
        return total;
    }

    static void check(String name, long actual, long expected) {
        if (actual == expected) {
            System.out.println("PASS " + name);
        } else {
            failures++;
            System.out.println("FAIL " + name + ": expected " + expected + " but was " + actual);
        }
    }

    public static void main(String[] args) {
        check("two expenses", positiveTotal(new int[] {300, 200}), 500);
        check("no expenses", positiveTotal(new int[] {}), 0);
        check("refund excluded", positiveTotal(new int[] {300, -50}), 300);
        check("zero excluded", positiveTotal(new int[] {0}), 0);
        check("no int overflow", positiveTotal(new int[] {Integer.MAX_VALUE, Integer.MAX_VALUE}), 4_294_967_294L);

        int[] aroundThreshold = {9, 10, 11};
        check("threshold 10 inclusive", totalAtLeast(aroundThreshold, 10), 21);

        System.out.println(failures == 0 ? "all checks passed" : failures + " check(s) failed");
    }
}
```

```text
PASS two expenses
PASS no expenses
PASS refund excluded
PASS zero excluded
PASS no int overflow
PASS threshold 10 inclusive
all checks passed
```

Every row of the examples table became a check. The threshold check uses the boundary technique from Lesson 1: values just below, exactly at, and just above 10. If someone later changes `>=` to `>`, the check fails with the message `expected 21 but was 11`.

## Decomposing a rule set

Decomposition also works for validation rules. Given the constraints "a password needs at least 10 characters, at least one digit, and both upper- and lower-case letters", each constraint becomes its own small predicate method, and one method composes them.

### Program: one method per constraint

```java
public class PasswordRules {
    static final int MIN_LENGTH = 10;

    public static void main(String[] args) {
        String[] candidates = {"short1A", "longenoughbutweak", "Longenough42", "ALLUPPER12345"};
        for (String candidate : candidates) {
            System.out.println(candidate + " -> " + describeProblems(candidate));
        }
    }

    static String describeProblems(String password) {
        String problems = "";
        if (!isLongEnough(password)) {
            problems = addProblem(problems, "shorter than " + MIN_LENGTH);
        }
        if (!hasDigit(password)) {
            problems = addProblem(problems, "no digit");
        }
        if (!hasUpperAndLower(password)) {
            problems = addProblem(problems, "needs upper and lower case");
        }
        return problems.isEmpty() ? "ok" : problems;
    }

    static boolean isLongEnough(String password) {
        return password.length() >= MIN_LENGTH;
    }

    static boolean hasDigit(String password) {
        for (int i = 0; i < password.length(); i++) {
            if (Character.isDigit(password.charAt(i))) {
                return true;
            }
        }
        return false;
    }

    static boolean hasUpperAndLower(String password) {
        boolean upper = false;
        boolean lower = false;
        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            if (Character.isUpperCase(c)) {
                upper = true;
            } else if (Character.isLowerCase(c)) {
                lower = true;
            }
        }
        return upper && lower;
    }

    static String addProblem(String existing, String problem) {
        return existing.isEmpty() ? problem : existing + "; " + problem;
    }
}
```

```text
short1A -> shorter than 10
longenoughbutweak -> no digit; needs upper and lower case
Longenough42 -> ok
ALLUPPER12345 -> needs upper and lower case
```

Each predicate is short enough to verify by reading, and each can be tested alone. Adding a fourth rule means adding one method and one `if`, not rewriting a tangle.

## What happens under the hood: reading a decomposed program

When `main` in `ExpenseReport` runs with the sample input:

1. The loop reads `300`. `isWholeNumber("300")` returns `true`, so 300 is added to the list. `200` and `-50` follow the same path.
2. `abc` fails `isWholeNumber`, so `rejected` becomes 1 and a message is printed.
3. The empty line is skipped by `continue`; `hasNextLine()` stays in charge of termination.
4. `15` is accepted. Input ends, so `hasNextLine()` returns `false` and the loop exits.
5. `toIntArray` converts the list to `[300, 200, -50, 15]`.
6. `positiveTotal` returns 515 and `countPositive` returns 3. `formatSummary` builds the text and `main` prints it.

Each step can be understood by reading one short method. That is the goal of decomposition: at every level, the code reads like the pseudocode.

## Signs of good and poor decomposition

| Good sign | Warning sign |
|---|---|
| The method name states one purpose (`positiveTotal`) | The name needs "and" (`readAndSumAndPrint`) |
| Inputs arrive as parameters, results leave as return values | Results are passed through mutable `static` fields |
| The method can be tested without a keyboard or screen | Testing requires typing input and reading output |
| A `boolean` result answers a question (`hasDigit`) | A `boolean` parameter switches between two unrelated behaviors |
| Splits follow meaning (validate, calculate, format) | Splits happen every ten lines, regardless of meaning |

A **boolean flag parameter** such as `process(amounts, true)` is a common smell: the reader cannot tell what `true` means, and the method secretly contains two algorithms. Two well-named methods (`sumExpenses`, `sumRefunds`) are clearer.

Over-decomposition is also a problem. A method that wraps a single obvious expression, used once, adds a name to learn without adding clarity. Split when the new method has a meaningful name, a clear contract, and makes its caller easier to read.

## Common mistakes

### Mistake 1: calculating and printing in one method

```java
// Fragment: hard to test and reuse
static void positiveTotal(int[] amounts) {
    long total = 0;
    for (int amount : amounts) {
        if (amount > 0) total += amount;
    }
    System.out.println("Total: " + total);
}
```

The only way to check this method is to read the console. A web version cannot reuse it. Fix: return the total and let the caller decide how to display it.

### Mistake 2: an accumulator narrower than the result

Summing two `Integer.MAX_VALUE` amounts into an `int` total prints `-2`, because the sum wraps around. Fix: widen the accumulator to `long`, or use `Math.addExact` to fail loudly when a documented limit is exceeded.

### Mistake 3: coding before the rules are clear

Writing code first and discovering "are refunds included?" during testing leads to patches scattered across the program. Fix: write the examples table and pseudocode first; they take minutes and save hours.

### Mistake 4: silently dropping bad input

Skipping `abc` without a message produces a total the user trusts but should not. Fix: decide the failure policy explicitly (reject, report and skip, or stop) and test it.

## Best practices

- Write examples, including edge cases (empty, one element, boundaries, extremes), before writing code.
- Record every clarified rule as a check that runs automatically.
- Keep business rules in pure methods; confine reading and printing to `main` or dedicated I/O methods.
- Name methods after their meaning: `parseAmount`, `validateTransaction`, `positiveTotal`, `formatSummary`.
- Choose accumulator types from the range constraint, not from the input type.
- Replace boolean flag parameters with two well-named methods.
- Start with a direct, correct algorithm; optimize only after measuring a real problem.

## Summary

- Clarify requirements by asking questions and writing concrete input/output examples; each answer is a specification choice.
- List constraints: valid domain, input size, numeric range, and failure policy.
- Sketch pseudocode and check it against the examples before writing Java.
- Functional decomposition splits a task into methods with one purpose each; top-down design writes the high-level calls first.
- A rule that takes parameters and returns a value, with no input or output inside, can be tested directly and reused with any input source.
- A small `check` harness turns your examples into repeatable tests.
- Watch for methods named with "and", hidden static state, boolean flags, and splits that do not follow meaning.

## Practice

### Warm-up

1. Write five input/output examples for a method `countVowels(String text)`, including an empty string and upper-case vowels.
2. Write pseudocode for finding the largest positive amount in an array, and decide what to return when there is none.

### Core

1. Add a requirement to `ExpenseReport`: expenses below 10 are ignored. Change only the calculation, not the console loop, and add checks for 9, 10, and 11.
2. Design a menu-driven expense tool (add, list, total, quit). Write the pseudocode, then identify which methods are deterministic and which touch input or output.
3. Extend `PasswordRules` with a rule "no spaces allowed", adding one predicate method and its checks.

### Challenge

1. Refactor a 40-line `main` that reads grades, validates them, computes the average and letter grade, and prints a report into at least four methods. Write a check for every pure method.
2. Replace `formatSummary` so the tool can produce either a one-line summary or a multi-line report, without adding a boolean flag parameter. Explain your design.

## Check your understanding

1. Why is an input/output example more useful than a sentence such as "exclude refunds"?
2. What constraint led `positiveTotal` to use a `long` accumulator?
3. What benefits come from keeping a calculation separate from the code that reads input from the console?
4. Does moving a rule into a pure method remove the need to validate its input? Explain.
5. What is wrong with a method call such as `process(amounts, true)`, and how would you redesign it?
6. How would you test that a threshold rule is inclusive rather than exclusive?
