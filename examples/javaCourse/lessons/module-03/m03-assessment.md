# Chapter 3 assessment and deliberate practice

This chapter review pulls together everything you learned about decisions, loops, methods, and decomposition. Read it before attempting the chapter's judgment question, implementation lab, and debug lab. The goal is not to memorize syntax but to build the habits professional developers use every day: write the rules down, test the boundaries, prove that loops stop, and keep each method small and honest about what it does.

## Lesson recaps

### Lesson 1: Conditions, switch expressions, and exhaustive decisions

Relational operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) produce `boolean` values, and `&&`, `||`, `!` combine them with short-circuit evaluation. An `if`/`else if`/`else` chain runs only the first matching branch, so a well-designed chain partitions the input: every value belongs to exactly one case. The difference between `<` and `<=` is a single boundary value, which is why every threshold needs tests just below, exactly on, and just above it. The ternary operator selects one of two values. Classic switch statements fall through without `break`; arrow-style switch expressions never fall through, produce a value (using `yield` inside blocks), and must be exhaustive. Java 21 adds `case null`.

### Lesson 2: Loops, invariants, termination, break, and continue

Every loop has initialization, a condition, a body, and progress. Use `for` for counted ranges, enhanced `for` for every element, `while` for data-dependent repetition, and `do`/`while` when the body must run at least once. An invariant is a fact true each time the condition is checked; for a running total, the accumulator holds the sum of the elements processed so far. A loop terminates only when every repeating path makes progress toward a false condition. `break` exits the nearest loop, `continue` skips to its next iteration, and labels let both target an outer loop.

### Lesson 3: Method contracts, parameters, return values, and side effects

A method declaration has modifiers, a return type, a name, parameters, and a body. `public static void main(String[] args)` is the program's entry point. Non-`void` methods must return or throw on every path. A contract states preconditions, postconditions, failure behavior, and side effects, and code enforces it by validating early. Java always passes argument values by copy; for arrays and objects, the copy is a reference, so mutation through a parameter is visible to the caller while reassigning the parameter is not.

### Lesson 4: Overloading, varargs, argument passing, and recursion

Overloads share a name and differ in parameter lists; the compiler selects one using the declared argument types (widening first, then boxing, then varargs, choosing the most specific). Varargs parameters are arrays, must come last, and are empty (not `null`) when no arguments are given. Recursive methods need a base case and progress toward it; each call has its own stack frame, and missing base cases end in `StackOverflowError`.

### Lesson 5: From examples and constraints to a decomposed algorithm

Clarify requests with concrete examples and explicit constraints, sketch pseudocode, then decompose the algorithm into methods with one purpose each. Keep rules pure (parameters in, return value out, no input or output) so they can be tested with a simple `check` harness and reused with any input source.

## Cheat sheet

### Operators and boundaries

| Requirement wording | Operator | Boundary value belongs to |
|---|---|---|
| "at least", "or more", "minimum of" | `>=` | the passing side |
| "more than", "over", "above" | `>` | the failing side |
| "at most", "up to and including" | `<=` | the passing side |
| "less than", "under", "below" | `<` | the failing side |

### Loop templates

```java
// Fragment: index loop over an array (half-open range 0 .. length-1)
for (int i = 0; i < values.length; i++) { ... }

// Fragment: inclusive counted range first .. last
for (int n = first; n <= last; n++) { ... }

// Fragment: data-driven loop with two exits
while (in.hasNextLine()) {
    String line = in.nextLine();
    if (line.equals("quit")) break;
    ...
}
```

### Switch forms

```java
// Fragment: switch expression, exhaustive over an enum
int hours = switch (day) {
    case SAT, SUN -> 0;
    case FRI -> 6;
    case MON, TUE, WED, THU -> 8;
};

// Fragment: multi-statement arm
String meaning = switch (status) {
    case 200 -> "ok";
    default -> {
        String text = "status " + status;
        yield text;
    }
};
```

### Method rules at a glance

| Topic | Rule |
|---|---|
| Return | every normal path of a non-`void` method returns a value |
| Arguments | values are copied; array and object arguments copy a reference |
| Overloads | chosen at compile time from declared argument types |
| Return type | cannot by itself distinguish overloads |
| Varargs | one per method, last parameter, empty array when no arguments |
| Recursion | base case first, then a call on a strictly smaller input |

### Integer extremes worth testing

| Constant | Value |
|---|---|
| `Integer.MIN_VALUE` | -2147483648 |
| `Integer.MAX_VALUE` | 2147483647 |
| `-Integer.MIN_VALUE` | -2147483648 (negation overflows back to itself) |
| `Math.abs(Integer.MIN_VALUE)` | -2147483648 (the same overflow) |

## Common mistakes checklist

Before submitting any Chapter 3 exercise, check each item:

- Did you use `==` to compare, not `=`, and `equals` for strings?
- Does every threshold use the operator that matches the wording, and did you test below, at, and above it?
- Does every branch chain cover every possible input exactly once, including the extremes of the type?
- Does every classic `switch` case end in `break` (or did you switch to arrows)?
- Is your switch expression exhaustive without an unnecessary `default` hiding enum cases?
- Does every loop's range match the requirement's wording (inclusive or exclusive end)?
- Does every repeating path, including every `continue`, make progress?
- Did you trace the loop for zero, one, and several iterations?
- Does every path of a non-`void` method return a value?
- Does your method return its result rather than print it, when the task says not to print?
- Did you avoid arithmetic that can overflow, such as negating or taking the absolute value of an arbitrary `int`?

## The judgment question

The judgment question describes a loop that does not always finish. Think back to Lesson 2's termination section: what property must hold on every path through the loop body for the condition to eventually become false? Consider which kinds of "fixes" actually change that property and which merely change how the hang looks. Answer by naming the property, not a workaround.

## Approaching the implementation lab

The function lab asks you to classify any `int` into one of three categories and return a word, without printing. Work through it the way Lesson 5 recommends:

1. **Write the contract.** State the precondition (which values are allowed; read the instructions carefully) and the postcondition (exactly which string each kind of input produces, including spelling and case).
2. **Build a boundary table** before writing code. Include the value at the dividing point, the values immediately on either side of it, and the two extremes of the `int` type. Write the expected output next to each.
3. **Design the branch order.** Your conditions must partition all 4,294,967,296 possible `int` values so each lands in exactly one branch. Ask yourself: after the first comparison fails, what do you know? After the second fails, what is left?
4. **Respect the constraint about negation.** The instructions ask you to compare directly rather than negate the value. Look at the extremes table in the cheat sheet and work out why an approach that flips the sign could misbehave for one specific input.
5. **Keep it deterministic.** The method must return the same answer for the same input every time, with no input, output, or shared state.
6. **Trace before submitting.** Walk each row of your boundary table through your branches by hand, especially the two extremes. The public tests cover only a couple of rows; hidden tests check the rest of the table.

## Approaching the debug lab

The debug lab gives you a short program with a counting loop whose output is smaller than the required value. Use a disciplined debugging process rather than guessing:

1. **Predict first.** Read the loop header and write down the exact output you expect before running anything. Then compare with the required output and note the difference.
2. **Trace a table.** Make columns for the loop variable and the accumulator, and write one row each time the condition is checked, including the final check that ends the loop. Which values of the loop variable were added, and which one required value never was?
3. **Say the range in words.** Lesson 2 recommended describing a loop's range out loud: where does it start, and is the end included or excluded? Compare that sentence with the requirement's sentence.
4. **Fix the cause, not the symptom.** The instructions forbid hard-coding the total. The correct repair changes how the loop decides when to stop, keeps the accumulation line as it is, and would still be correct if the upper limit changed.
5. **Explain the repair.** Write one or two sentences stating which boundary was wrong and why your change includes exactly the intended values, no more and no fewer.

## Deliberate practice beyond the labs

The labs check a small slice of the chapter. To build real fluency, also complete these:

- Rewrite one `if` chain from Lesson 1's practice as a switch expression and compare readability.
- Write the invariant and the decreasing measure as comments for three loops you have written.
- Write a method with a documented contract and a `check` harness that covers every precondition violation.
- Implement one problem both recursively and iteratively and compare frame usage and readability.
- Take a program where `main` does everything and decompose it into pure rules plus a thin input/output layer.

## Self-assessment

You are ready for Chapter 4 when you can:

- Translate a written rule into the correct comparison operator and list its boundary tests.
- Choose between `if`, the ternary operator, and a switch expression, and justify the choice.
- State a loop invariant and a termination argument for a loop you wrote.
- Predict what a caller observes after a method mutates or reassigns an array parameter.
- Predict which overload the compiler selects for a given call.
- Trace a recursive method's calls and returns on paper.
- Explain why a rule separated from input and output is easier to test and reuse.
