# The edit-compile-test-debug loop

Every working developer repeats one cycle all day: edit the code, compile it, test it, and debug whatever does not match expectations. The speed and discipline with which you go around this loop matters more than raw talent. Beginners often respond to a wrong result by changing things at random until the output looks right. Professionals treat a bug as an experiment: they gather evidence, form a hypothesis, test it, and keep the evidence as a regression check afterwards.

What you will learn:

- The four stages of the development loop and what each one proves
- How to read compiler messages, including cascades of errors
- How to read a runtime stack trace
- How to find logic errors with a trace table and trace printing
- How to use a debugger: breakpoints, stepping, variables, and the call stack
- How to write simple self-checking tests and keep regression cases

## The loop and what each stage proves

| Stage | Action | What success proves | What it cannot prove |
|---|---|---|---|
| Edit | Change the source | Nothing yet | Anything |
| Compile | Run `javac` (or let the IDE do it) | The code follows the language's syntax and type rules | That it computes the right answer |
| Test | Run with known inputs and compare to expected outputs | Correct behavior *for those inputs* | Correct behavior for inputs you did not try |
| Debug | Investigate a mismatch | The cause of one specific failure | That no other bugs exist |

Two ideas run through this lesson. First, a clean compile is the *start* of checking, not the end. Second, the evidence that locates a logic error comes from observing what the program actually did, step by step, and comparing it with what the requirement says it should do.

Keep each loop small. Change one thing, compile, run your examples. If you change five things and something breaks, you do not know which change caused it.

## Stage 1: compile errors

The compiler reports errors in a fixed format: file, line number, `error:`, a message, the source line, and a caret under the point of confusion. Consider this file with two mistakes:

```java
public class Main {
    public static void main(String[] args) {
        int total = 0
        total = total + 5;
        System.out.println("Total: " + totl);
    }
}
```

First compile:

```text
Main.java:3: error: ';' expected
        int total = 0
                     ^
1 error
```

Only one error is reported, even though `totl` is also misspelled. The compiler works in phases: it first checks the *structure* (grammar) of the whole file, and only if that succeeds does it check *meaning* (names and types). After adding the semicolon and compiling again:

```text
Main.java:5: error: cannot find symbol
        System.out.println("Total: " + totl);
                                       ^
  symbol:   variable totl
  location: class Main
1 error
```

Lessons from this:

- Fix the **first** error, then recompile. Later messages may be side effects of the first one, or may not appear until it is fixed.
- The number of errors is not a measure of how broken your program is. One missing quote can produce many errors; fixing it can make them all vanish.
- "Cannot find symbol" names the missing symbol and where the compiler looked. Compare its spelling character by character with the declaration.

## Stage 2: runtime errors and stack traces

Some problems appear only while the program runs. The JVM then throws an **exception**. If nothing handles it, the program stops and prints a **stack trace**. This complete program crashes on its second calculation:

```java
public class AverageCrash {
    public static void main(String[] args) {
        System.out.println("Average of 10 over 2 items: " + average(10, 2));
        System.out.println("Average of 0 over 0 items: " + average(0, 0));
        System.out.println("This line never runs.");
    }

    static int average(int total, int count) {
        return total / count;
    }
}
```

Output:

```text
Average of 10 over 2 items: 5
Exception in thread "main" java.lang.ArithmeticException: / by zero
	at AverageCrash.average(AverageCrash.java:9)
	at AverageCrash.main(AverageCrash.java:4)
```

How to read it:

1. **Exception type**: `java.lang.ArithmeticException`. This tells you the category of problem.
2. **Message**: `/ by zero`. This tells you the specific problem.
3. **Frames**, read from top to bottom: the top frame is where the exception happened (`average`, line 9). Each line below is the caller of the one above (`main`, line 4, called `average`).

The **call stack** is a stack of method invocations. `main` called `average`, so `average` sits on top of `main`. The stack trace is a snapshot of that stack at the moment of failure. The first line was printed before the crash; the third `println` never ran, because the exception ended `main`.

> **Note:** In long traces, many frames belong to the Java library (they start with `java.base/`). Scan down to the first frame that names *your* class. That is usually where to start investigating.

## Stage 3: logic errors

Logic errors produce no message at all. The program compiles, runs, and prints the wrong thing. Only a comparison with an expected result reveals them.

This complete program should print one star per rating point. For a rating of 4, the requirement is four stars:

```java
public class StarsBug {
    public static void main(String[] args) {
        int rating = 4;
        int printed = 0;
        for (int star = 1; star < rating; star++) {
            System.out.print("*");
            printed = printed + 1;
        }
        System.out.println();
        System.out.println("Stars printed: " + printed);
    }
}
```

Output:

```text
***
Stars printed: 3
```

A quick explanation of the `for` loop, since loops are formally taught in Chapter 3. `for (int star = 1; star < rating; star++)` has three parts separated by semicolons:

1. **Initialization**: `int star = 1` runs once, before anything else.
2. **Continuation condition**: `star < rating` is checked *before every repetition*. If it is true, the body runs; if it is false, the loop ends.
3. **Update**: `star++` adds one to `star` after each repetition.

### Building a trace table

A **trace table** records the value of each variable at each step, the way you would if you were the computer. It is the most important debugging tool you will ever learn, because it needs only paper.

| Step | `star` | Condition `star < rating` | Body runs? | `printed` after body |
|---|---|---|---|---|
| 1 | 1 | 1 < 4 is true | Yes | 1 |
| 2 | 2 | 2 < 4 is true | Yes | 2 |
| 3 | 3 | 3 < 4 is true | Yes | 3 |
| 4 | 4 | 4 < 4 is false | No, loop ends | 3 |

Now compare the trace with the requirement. The requirement says the values 1 through 4 should each produce a star. The trace shows `star` taking the value 4 and the *continuation condition* rejecting it. That row is the evidence: the condition's boundary is wrong for this requirement. This kind of mistake, being off by exactly one at a boundary, is so common it has a name: an **off-by-one error**.

Notice what did *not* help: the fact that it compiled, the editor's colors, or how neat the code looks. The trace plus the continuation condition located the defect.

### Trace printing

When the loop is too long to trace by hand, let the program write the trace for you. Temporary print statements labelled `TRACE` make them easy to find and remove later:

```java
public class StarsTrace {
    public static void main(String[] args) {
        int rating = 4;
        int printed = 0;
        for (int star = 1; star < rating; star++) {
            printed = printed + 1;
            System.out.println("TRACE star=" + star + " printed=" + printed
                    + " next check: " + (star + 1) + " < " + rating);
        }
        System.out.println("Loop ended. Stars printed: " + printed);
    }
}
```

Output:

```text
TRACE star=1 printed=1 next check: 2 < 4
TRACE star=2 printed=2 next check: 3 < 4
TRACE star=3 printed=3 next check: 4 < 4
Loop ended. Stars printed: 3
```

The last trace line shows exactly which comparison ended the loop too early. The fix must change that boundary so the value the requirement includes is visited, and nothing else.

## Stage 4: using a debugger

A **debugger** pauses a running program so you can inspect it. Every Java IDE has one, and the controls have the same names everywhere:

| Control | What it does |
|---|---|
| Breakpoint | Marks a line; the program pauses *before* executing it |
| Resume | Continue running until the next breakpoint |
| Step over | Execute the current line completely, including any method it calls, then pause |
| Step into | If the current line calls one of your methods, enter it and pause at its first line |
| Step out | Finish the current method and pause back in its caller |
| Variables view | Shows the values of local variables right now |
| Watch | An expression you want re-evaluated at every pause, such as `star < rating` |
| Conditional breakpoint | Pauses only when an expression is true, such as `star == 4` |
| Call stack (frames) | The chain of method calls leading to the current line |

A debugging session for `StarsBug`:

1. Set a breakpoint on the line `printed = printed + 1;`.
2. Start the program in debug mode (not ordinary run).
3. At the first pause, the variables view shows `rating = 4`, `printed = 0`, `star = 1`.
4. Step over once; `printed` becomes 1. Resume.
5. Repeat until the loop ends. Count how many pauses happened and the last value of `star` you saw inside the body.
6. Add a watch on `star < rating` to see the condition's value at each pause.

Each entry in the call stack view is a **stack frame**: one method invocation with its own local variables. In `AverageCrash`, a breakpoint inside `average` would show two frames, `average` on top of `main`. Clicking the `main` frame shows `main`'s variables. A frame shows local variables; it is not a picture of every object in memory.

> **Tip:** Before you press Step, say out loud what you expect to happen. When reality differs from your prediction, you have found the interesting spot.

## Testing: turning examples into checks

Once a bug is fixed, you need proof it stays fixed. The simplest proof is a program that checks results against expected values and reports PASS or FAIL. This complete program tests a `sumTo` method that should add 1 + 2 + ... + n:

```java
public class SumChecks {
    public static void main(String[] args) {
        check(sumTo(0), 0, "sumTo(0)");
        check(sumTo(1), 1, "sumTo(1)");
        check(sumTo(3), 6, "sumTo(3)");
        check(sumTo(4), 10, "sumTo(4)");
        System.out.println("Checks finished.");
    }

    // Adds 1 + 2 + ... + n. Expected: sumTo(4) is 10.
    static int sumTo(int n) {
        int total = 0;
        for (int i = 1; i < n; i++) {
            total = total + i;
        }
        return total;
    }

    static void check(int actual, int expected, String label) {
        if (actual == expected) {
            System.out.println("PASS " + label + " = " + actual);
        } else {
            System.out.println("FAIL " + label + ": expected " + expected + " but was " + actual);
        }
    }
}
```

Output:

```text
PASS sumTo(0) = 0
FAIL sumTo(1): expected 1 but was 0
FAIL sumTo(3): expected 6 but was 3
FAIL sumTo(4): expected 10 but was 6
Checks finished.
```

Look at the pattern of failures. `sumTo(0)` passes by luck, since both the buggy and correct versions give 0. Every other result is missing exactly its last term: 3 is 1 + 2 without the 3, 6 is 1 + 2 + 3 without the 4. That pattern points straight at the loop boundary, the same defect as in `StarsBug`. After correcting the continuation condition so that `n` itself is included, the same checks report:

```text
PASS sumTo(0) = 0
PASS sumTo(1) = 1
PASS sumTo(3) = 6
PASS sumTo(4) = 10
Checks finished.
```

The failing examples are now **regression tests**: if anyone reintroduces the bug later, these checks will catch it immediately. Always keep the smallest input that reproduced a bug.

### Choosing test inputs

One favorable example proves little. Choose inputs in categories:

| Category | Example for `sumTo` | Why |
|---|---|---|
| Typical | 4 | The ordinary case |
| Smallest valid | 0 and 1 | Boundaries are where off-by-one errors live |
| Just past a boundary | 2 | Distinguishes "first value" from "all values" bugs |
| Larger | 100 (expected 5050) | Catches errors that only show with more iterations |
| Invalid | -1 | Decide and document what should happen |

### Professional testing frameworks

Real projects use a testing framework such as **JUnit 5**, which runs many tests automatically and reports failures clearly. The following is shown for orientation only: it requires the JUnit library and a build tool such as Maven or Gradle, which later chapters set up, so it cannot be run as a single file.

```java
import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SumToTest {
    @Test
    void includesTheLastNumber() {
        assertEquals(10, SumChecks.sumTo(4));
    }

    @Test
    void zeroTermsSumToZero() {
        assertEquals(0, SumChecks.sumTo(0));
    }
}
```

The idea is identical to the `check` method above: an expected value, an actual value, and an automatic comparison.

## Debugging as an experiment, step by step

1. **Reproduce**: find an input that reliably shows the problem. Write it down.
2. **State the expectation**: what exactly should the output be for that input, according to the requirement?
3. **Locate the stage**: compile error, runtime exception, or wrong output?
4. **Narrow the region**: is the input read correctly? Is the calculation right? Is the output formatted right? Check each boundary between stages with a trace print or a breakpoint.
5. **Hypothesize**: "the loop stops one iteration early because of its condition."
6. **Test the hypothesis**: predict what the trace will show if you are right, then look.
7. **Fix the cause**, not the symptom. Adding one to the final result would make one example pass while leaving the loop wrong.
8. **Rerun every check**, including the ones that already passed, and keep the new case as a regression test.
9. **Remove temporary trace output** before committing.

## Common mistakes

**Random editing.** Changing `<` to `<=`, then back, then adding `+ 1` somewhere else, without predicting the effect. You may reach correct output for one input while breaking others. Always state a hypothesis first.

**Patching the output instead of the cause.**

```java
System.out.println("Stars printed: " + (printed + 1));
```

This fragment prints the right number for one rating and hides the real defect. The loop still prints three stars.

**Reading only the last compiler error.** Scroll to the top. The first error is the one to fix.

**Ignoring the stack trace's line number.** The trace tells you the file and line. Start there instead of guessing.

**Testing only the example from the task description.** It may pass by coincidence, as `sumTo(0)` did above. Add boundaries.

**Forgetting to recompile.** You fixed the source but ran the old `.class` file. If a fix "does nothing," confirm the class was rebuilt.

## Best practices

- Write expected results before running the program.
- Keep each edit-compile-test cycle small: one logical change at a time.
- Fix the earliest meaningful compiler error first.
- Use trace tables for loops and conditions; use a debugger when the trace gets long.
- Label temporary prints clearly (`TRACE`) and remove them afterwards.
- Turn every fixed bug into a regression check with the smallest failing input.
- Test boundaries: zero, one, the last valid value, and one past it.

## Summary

- The loop is edit, compile, test, debug. Each stage proves something different, and compiling proves only that the rules of the language are satisfied.
- Compiler messages give file, line, caret, and message; fix the first one and recompile.
- A stack trace lists exception type, message, and frames from the failure point down to `main`.
- Logic errors are found by comparing a trace of actual behavior with the requirement. For loops, trace the loop variable and evaluate the continuation condition at every step.
- A debugger lets you pause at breakpoints, step over, into, and out of methods, and inspect variables and stack frames.
- Self-checking programs and, later, JUnit tests turn examples into automatic regression checks.

## Practice

**Warm-up**

1. Build a trace table for `StarsBug` with `rating = 2` and predict the output before running it.
2. Introduce a compile error on purpose and practice reading the file, line, caret, and message aloud.

**Core**

3. Fix `StarsBug` so it prints exactly `rating` stars. Test it with ratings 0, 1, 4, and 5 and record expected versus actual for each.
4. Run `AverageCrash` in your IDE's debugger with a breakpoint in `average`. Record the frames shown in the call stack view and the variable values in each frame.
5. Add a check for `sumTo(100)` with expected value 5050 to `SumChecks` and run it against the buggy and the corrected versions.

**Challenge**

6. Write a program with a `countEven(int n)` method that should count the even numbers from 1 to n inclusive. Write at least five checks covering typical, boundary, and zero cases before writing the method body. Then implement it and make every check pass.
7. Take a working program and ask a friend (or yourself a day later) to introduce a single logic error without telling you where. Find it using only trace printing, and write down each hypothesis you tested.

## Check your understanding

1. What does a successful compile prove, and what does it leave unproven?
2. Why should you fix the first compiler error before reading the others?
3. In a stack trace, which frame shows where the exception happened, and what do the frames below it represent?
4. A loop is supposed to process the values 1 through 5, but the output shows only 1 through 4. Which two pieces of information identify the defect?
5. What is the difference between "step over" and "step into"?
6. Why is patching the final printed value a poor fix for an off-by-one loop?
