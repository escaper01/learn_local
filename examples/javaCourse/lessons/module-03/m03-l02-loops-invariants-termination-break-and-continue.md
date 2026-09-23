# Loops, invariants, termination, break, and continue

Computers earn their keep by repeating work: summing a million transactions, retrying a network call, reading commands until the user quits, scanning a grid for a match. Loops are how Java expresses repetition, and they are also where two classic bugs live. The *off-by-one* bug processes one element too many or too few. The *non-terminating* loop hangs a server thread forever. Professional developers avoid both by reasoning about every loop with two questions: "what is true every time the loop condition is checked?" (the invariant) and "why must this loop eventually stop?" (the termination argument). This lesson gives you the syntax of every Java loop and the habits to prove your loops correct.

What you will learn:

- The four loop forms: `for`, enhanced `for`, `while`, and `do`/`while`, and when to choose each
- The four parts of any loop: initialization, condition, body, and progress
- How to state and check a loop invariant, using a running total as the main example
- How to argue that a loop terminates, and the common ways termination fails
- How `break` and `continue` change control flow, including labeled versions for nested loops
- How to read input in a loop until a quit command or the end of input

## Anatomy of a loop

Every loop, whatever its syntax, has four jobs:

| Part | Job | In `for (int i = 0; i < n; i++)` |
|---|---|---|
| Initialization | Establish starting state | `int i = 0` (plus any accumulator declared before the loop) |
| Condition | Decide whether another iteration runs | `i < n` |
| Body | Do the useful work | the statements inside the braces |
| Progress | Move state toward making the condition false | `i++` |

If any part is wrong, the loop is wrong. A wrong initialization skips or duplicates the first element. A wrong condition processes one element too many or too few. A body that forgets progress never stops.

## The for loop

The `for` loop puts initialization, condition, and update on one line, which makes it ideal when you know the range in advance.

```java
// Fragment
for (int i = 0; i < 5; i++) {        // i = 0, 1, 2, 3, 4  (5 iterations, 5 excluded)
    System.out.print(i + " ");
}
for (int n = 1; n <= 5; n++) {       // n = 1, 2, 3, 4, 5  (5 included)
    System.out.print(n + " ");
}
```

Both loops run five times, but they visit different numbers. The pattern `i = 0; i < length` is the idiom for array indices, because valid indices run from 0 to `length - 1`. The pattern `n = 1; n <= limit` is the idiom for a counted, *inclusive* range such as "the numbers 1 through 5". Before writing a loop header, say the range out loud: "from 1, up to and including 5" tells you to write `<=`. "From 0, up to but not including the length" tells you to write `<`.

The *half-open* range `[start, end)` (start included, end excluded) is Java's standard convention: it is used by array indices, `String.substring(begin, end)`, and `Arrays.copyOfRange(array, from, to)`. A half-open range from `a` to `b` has exactly `b - a` elements, which makes arithmetic easy.

## Loop invariants: what stays true

A **loop invariant** is a statement that is true every time the loop condition is about to be checked: before the first iteration, between iterations, and when the loop finally exits. It is the loop's promise.

For the classic running total over an array, the invariant is: *before the iteration with index `i` runs, `total` equals the sum of the elements at indices 0 through `i - 1`*. In other words, the accumulator holds the sum of everything strictly before position `i`, not including `values[i]` itself.

### Program: watching the invariant

```java
public class PrefixSumTrace {
    public static void main(String[] args) {
        int[] values = {4, 7, 2};
        int total = 0;
        for (int i = 0; i < values.length; i++) {
            System.out.println("before i=" + i + ": total=" + total + " (sum of first " + i + " values)");
            total += values[i];
        }
        System.out.println("after loop: total=" + total);
    }
}
```

```text
before i=0: total=0 (sum of first 0 values)
before i=1: total=4 (sum of first 1 values)
before i=2: total=11 (sum of first 2 values)
after loop: total=13
```

### Proving the loop with the invariant

An invariant argument has three steps, similar to climbing a ladder:

1. **Initialization (getting on the ladder):** before the first iteration, `i` is 0 and `total` is 0. The sum of zero elements is 0, so the invariant holds.
2. **Maintenance (climbing one rung):** if `total` equals the sum of the first `i` elements, then after `total += values[i]` it equals the sum of the first `i + 1` elements. The update `i++` then makes the invariant true again for the new `i`.
3. **Termination (reaching the top):** the loop exits when `i < values.length` becomes false, which first happens when `i == values.length`. Substituting into the invariant, `total` is the sum of the first `length` elements: the whole array.

Notice what the invariant does *not* claim. It does not say the whole array is summed during the loop, and after the loop exits `i` equals `values.length`, which is *not* a valid index. If the condition were `i <= values.length`, the body would run once more and read `values[3]` on a three-element array.

> **Tip:** When a loop confuses you, write its invariant as a comment above it, then trace an empty array, a one-element array, and a three-element array by hand. For the empty array, the body never runs and `total` stays 0, which is the correct sum of nothing.

## while and do-while

A `while` loop checks its condition before each iteration. Use it when the number of iterations depends on data rather than a fixed range: reading until input ends, halving until a value reaches zero, retrying until success.

A `do`/`while` loop checks its condition *after* each iteration, so its body always runs at least once. Use it when the first attempt must happen before you can test anything, such as displaying a menu before reading a choice.

The enhanced `for` loop (`for (String name : names)`) visits every element of an array or collection in order. Use it when you need values but not positions. It cannot tell you the index, skip elements by index, or assign into the array.

### Program: choosing the right loop

```java
public class LoopKinds {
    public static void main(String[] args) {
        // for: a counted, inclusive range 1..5
        int product = 1;
        for (int n = 1; n <= 5; n++) {
            product *= n;
        }
        System.out.println("5! = " + product);

        // while: repeat until a condition changes, count unknown in advance
        int number = 90_210;
        int digits = 0;
        while (number != 0) {
            number /= 10;
            digits++;
        }
        System.out.println("digits in 90210 = " + digits);

        // do-while: the body runs at least once
        int zero = 0;
        int zeroDigits = 0;
        do {
            zero /= 10;
            zeroDigits++;
        } while (zero != 0);
        System.out.println("digits in 0 = " + zeroDigits);

        // enhanced for: every element, no index needed
        String[] names = {"Ada", "Grace", "Linus"};
        int letters = 0;
        for (String name : names) {
            letters += name.length();
        }
        System.out.println("letters = " + letters);

        // counting down, stepping by 2
        StringBuilder countdown = new StringBuilder();
        for (int t = 10; t > 0; t -= 2) {
            countdown.append(t).append(' ');
        }
        System.out.println("countdown: " + countdown.toString().strip());
    }
}
```

```text
5! = 120
digits in 90210 = 5
digits in 0 = 1
letters = 13
countdown: 10 8 6 4 2
```

The digit counter shows why the loop kind matters. A `while` loop counting the digits of 0 would never enter its body and would report 0 digits, which is wrong: "0" has one digit. The `do`/`while` version runs once first, so it reports 1.

| Loop | Condition checked | Minimum iterations | Typical use |
|---|---|---|---|
| `for` | before each iteration | 0 | known counted range, index needed |
| enhanced `for` | implicitly, per element | 0 | every element, index not needed |
| `while` | before each iteration | 0 | unknown count, stop when data says so |
| `do`/`while` | after each iteration | 1 | act first, then decide whether to repeat |

## Termination: why a loop must stop

A loop terminates only if **every path through its body makes progress toward a state where the condition is false**. "Every path" is the important phrase: an `if`, a `continue`, or an early branch can create a path that skips the update.

A termination argument usually names a *measure*: a quantity that is bounded below and strictly decreases each iteration. For `for (int i = 0; i < n; i++)` the measure is `n - i`, which starts at `n`, drops by one every iteration, and the loop ends when it reaches 0. For the digit counter, the measure is the absolute value of `number`, which shrinks with each division by 10 until it reaches 0.

Common ways termination fails:

- **Missing progress:** a `while` loop whose body never changes the variables in its condition.
- **A path that skips progress:** a `continue` placed before the update in a `while` loop jumps straight back to the condition with nothing changed.
- **Stepping over the target:** `for (int i = 0; i != 10; i += 3)` visits 0, 3, 6, 9, 12, ... and never equals 10. Prefer `<` over `!=` in counting loops.
- **Integer overflow:** a counter that grows past `Integer.MAX_VALUE` wraps to a negative number, so `i <= Integer.MAX_VALUE` is always true.
- **Input that never ends the way you expect:** a loop waiting for the word `quit` must also stop when input ends, or it spins or crashes when a file or pipe closes.

Adding a delay or more logging never fixes a loop that does not terminate; it only makes it hang more slowly or more noisily. The fix is always to establish progress on every repeating path.

## break and continue

- `break` immediately exits the nearest enclosing loop (or switch). Execution resumes after the loop.
- `continue` immediately ends the current iteration of the nearest enclosing loop. In a `for` loop, the update (`i++`) still runs next; in a `while` loop, control jumps straight to the condition.

Nested loops need care: an unlabeled `break` exits only the innermost loop. To exit an outer loop, put a **label** (an identifier followed by a colon) before it and write `break label;` or `continue label;`.

### Program: break, continue, and labels

```java
public class BreakContinueDemo {
    public static void main(String[] args) {
        int[] readings = {12, -1, 30, 0, -5, 44, 99, 7};

        // continue: skip invalid readings, keep going
        int validSum = 0;
        for (int r : readings) {
            if (r < 0) {
                continue;
            }
            validSum += r;
        }
        System.out.println("sum of non-negative readings = " + validSum);

        // break: stop at the first reading above 40
        int firstLargeIndex = -1;
        for (int i = 0; i < readings.length; i++) {
            if (readings[i] > 40) {
                firstLargeIndex = i;
                break;
            }
        }
        System.out.println("first reading above 40 at index " + firstLargeIndex);

        // labeled break: leave BOTH loops once the target is found
        int[][] grid = {
            {3, 8, 1},
            {9, 5, 7},
            {2, 5, 6}
        };
        int target = 5;
        int foundRow = -1;
        int foundCol = -1;
        search:
        for (int row = 0; row < grid.length; row++) {
            for (int col = 0; col < grid[row].length; col++) {
                if (grid[row][col] == target) {
                    foundRow = row;
                    foundCol = col;
                    break search;
                }
            }
        }
        System.out.println("first " + target + " at row " + foundRow + ", col " + foundCol);

        // labeled continue: skip the rest of a row that contains a 9
        int rowsWithoutNine = 0;
        rows:
        for (int[] row : grid) {
            for (int value : row) {
                if (value == 9) {
                    continue rows;
                }
            }
            rowsWithoutNine++;
        }
        System.out.println("rows without a 9 = " + rowsWithoutNine);
    }
}
```

```text
sum of non-negative readings = 192
first reading above 40 at index 5
first 5 at row 1, col 1
rows without a 9 = 2
```

Without the label, `break` would leave only the inner column loop and the outer loop would keep scanning, eventually overwriting the result with the 5 at row 2. Labeled branching is legitimate but rare; if you need it often, extracting the nested search into a method that `return`s the result is usually clearer.

## Reading input until quit or end of input

A command loop is a `while` loop whose termination depends on the user. It needs two exits: an explicit quit command and the end of input (the user presses Ctrl+D on Linux or macOS, Ctrl+Z then Enter on Windows, or a piped file runs out).

### Program: a command loop

```java
import java.util.Scanner;

public class CommandLoop {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int processed = 0;
        while (in.hasNextLine()) {
            String line = in.nextLine().strip();
            if (line.isEmpty()) {
                continue;
            }
            if (line.equals("quit")) {
                System.out.println("bye");
                break;
            }
            processed++;
            System.out.println("command " + processed + ": " + line);
        }
        System.out.println("processed " + processed + " command(s)");
    }
}
```

With the input lines `list`, an empty line, `  add milk  `, `quit`, and `never reached`, it prints:

```text
command 1: list
command 2: add milk
bye
processed 2 command(s)
```

With the input `status` and `list` and no quit command, the loop stops because `hasNextLine()` returns `false` at the end of input:

```text
command 1: status
command 2: list
processed 2 command(s)
```

Here `continue` is safe inside a `while` loop because progress (consuming a line with `nextLine()`) happens *before* the `continue`. Each iteration consumes input, so the remaining input shrinks on every path.

## Common mistakes

### Mistake 1: off-by-one with <=

```java
int[] values = {4, 7, 2};
int total = 0;
for (int i = 0; i <= values.length; i++) {
    total += values[i];
}
```

```text
Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3
	at OffByOne.main(OffByOne.java:6)
```

The last valid index is `length - 1`. Fix: `i < values.length`, or use an enhanced `for` when you do not need the index. The opposite error, using `<` for a range that must include its upper endpoint, does not crash; it silently produces a result that is too small, which is worse.

### Mistake 2: a stray semicolon after the loop header

```java
int count = 0;
for (int i = 0; i < 5; i++);
{
    count++;
}
System.out.println("count = " + count);
```

```text
count = 1
```

The semicolon is an empty loop body, so the loop spins five times doing nothing and the block below runs once. Fix: delete the semicolon. Always put the opening brace on the same line as the loop header to make this visible.

### Mistake 3: continue skips the update in a while loop

```java
// Fragment: never terminates when it meets a negative value
int i = 0;
while (i < values.length) {
    if (values[i] < 0) {
        continue;          // jumps to the condition; i never increases
    }
    total += values[i];
    i++;
}
```

Fix: make progress on every path, either by moving `i++` before the `if` (and indexing with the old value), or by converting the loop to a `for` loop, where `continue` still runs the update.

### Mistake 4: code after an infinite loop

```java
int ticks = 0;
while (true) {
    ticks++;
}
System.out.println(ticks);
```

```text
Unreachable.java:7: error: unreachable statement
        System.out.println(ticks);
        ^
```

The compiler knows `while (true)` without a `break` can never complete normally. Fix: add a real exit condition or a `break`.

## Best practices

- Say the range in words ("1 through n inclusive", "0 up to but not including length") before writing the header.
- Prefer enhanced `for` when you need only values; it eliminates index bugs entirely.
- Declare the loop variable in the `for` header so it cannot leak or be reused by mistake.
- Write the invariant as a comment for any non-trivial accumulation or search loop.
- For every `while` loop, identify the measure that decreases; check that every path, including every `continue`, makes progress.
- Prefer `<` or `>` over `!=` for counting loops, so a step that jumps over the target still terminates.
- Give input loops an end-of-input exit as well as a quit command.
- If a loop body grows beyond a screen, extract a method; a search that needs a labeled break is often clearer as a method that returns early.

## Summary

- Every loop has initialization, a condition, a body, and progress.
- `for` suits counted ranges, enhanced `for` suits "every element", `while` suits data-dependent repetition, and `do`/`while` guarantees at least one iteration.
- An invariant is a fact that holds each time the condition is checked; for a running total, before index `i` is processed the accumulator holds the sum of the elements before `i`.
- An invariant proof has three steps: it starts true, each iteration keeps it true, and at exit it implies the desired result.
- A loop terminates when every repeating path makes progress toward a false condition.
- `break` exits a loop; `continue` skips to the next iteration; labels let both target an outer loop.
- After a standard index loop exits, the index equals the length, which is not a valid index.

## Practice

### Warm-up

1. Print the even numbers from 2 to 20 inclusive using a `for` loop, then again using a `while` loop.
2. Trace `PrefixSumTrace` by hand for the arrays `{}` and `{9}`. Write the value of `i` and `total` each time the condition is checked.

### Core

1. Write a loop that computes the sum of the integers from `a` to `b` inclusive. Test it with (1, 1), (1, 4), (3, 7), and (5, 4), and decide what an empty range should return.
2. Write a loop that finds the index of the largest value in a non-empty array. State its invariant as a comment ("before index i, `best` is the index of the largest value among indices 0 to i - 1").
3. Introduce the misplaced `continue` bug from Mistake 3 into a working loop, observe the hang (stop it with Ctrl+C), then repair it without removing the skip behavior.

### Challenge

1. Write a program that reads integers until the user types `done` or input ends, ignoring blank lines and reporting lines that are not numbers without stopping.
2. Implement a search in a two-dimensional array twice: once with a labeled `break`, once by extracting a method that returns early. Compare readability.
3. Write the termination argument (the decreasing measure) for a loop that repeatedly halves an integer until it reaches 1. What happens if the starting value is 0 or negative?

## Check your understanding

1. What are the four parts of a loop, and which one is responsible for termination?
2. State the invariant of a running-total loop over an array. What does it tell you when the loop exits?
3. Why can a `continue` statement make a `while` loop run forever but not the equivalent `for` loop?
4. When would you choose `do`/`while` instead of `while`?
5. After `for (int i = 0; i < a.length; i++)` finishes, what is the value of `i`, and is it a valid index?
6. What does `break` do inside a nested loop, and how do you exit the outer loop instead?
