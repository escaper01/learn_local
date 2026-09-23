# Method contracts, parameters, return values, and side effects

A real Java application is thousands of methods calling one another. Each method is a small promise: "give me inputs like these, and I will give you a result like that, and I will (or will not) change anything else". When those promises are vague, bugs appear at the seams: a caller passes a negative width nobody expected, a calculation quietly prints to the console inside a web server, or a helper mutates an array its caller still needed. This lesson teaches you how to declare and call methods, how the `main` method fits in, how Java passes arguments, and how to write each method as an explicit contract with clear inputs, outputs, and side effects.

What you will learn:

- The parts of a method declaration and how a call transfers control and data
- What each word in `public static void main(String[] args)` means
- The difference between `void` methods and methods that return a value, and the rule that every path must return
- How to write preconditions, postconditions, and failure behavior as a contract
- Why Java is always pass-by-value, and what that means for primitives and for arrays
- Why mutating a parameter's object is visible to the caller but reassigning the parameter is not
- What side effects are and why pure calculations are easier to test

## Anatomy of a method

```java
// Fragment: a method declared inside a class
static double toFahrenheit(double celsius) {
    return celsius * 9.0 / 5.0 + 32.0;
}
```

| Part | In the example | Meaning |
|---|---|---|
| Modifiers | `static` | Belongs to the class itself, so it can be called without creating an object |
| Return type | `double` | The type of value the method hands back; `void` means nothing is returned |
| Name | `toFahrenheit` | A verb or verb phrase in camelCase |
| Parameter list | `(double celsius)` | Typed input variables; empty parentheses mean no inputs |
| Body | `{ ... }` | Statements that run when the method is called |

The name plus the parameter types form the method's **signature**: `toFahrenheit(double)`. A call such as `toFahrenheit(21.5)` supplies an **argument** (21.5) for each **parameter** (`celsius`). When the call runs, Java:

1. Evaluates each argument expression from left to right.
2. Creates a fresh storage area, called a *stack frame*, for this call's parameters and local variables.
3. Copies each argument value into the matching parameter.
4. Runs the body until a `return` statement or the closing brace.
5. Discards the frame and delivers the return value (if any) to the expression that made the call.

Because each call gets its own frame, local variables in one method are invisible to every other method, and two calls to the same method do not share locals. Chapter 4 draws these frames in detail.

## The main method

Every Java program you launch with `java` starts in a method with this exact shape:

```java
// Fragment
public static void main(String[] args) {
    // program starts here
}
```

- `public`: the Java launcher, which lives outside your class, must be allowed to call it.
- `static`: the launcher calls it without creating an object of your class first.
- `void`: `main` returns nothing to the launcher. To report failure to the operating system, a program calls `System.exit(status)` or lets an exception escape.
- `main`: the launcher looks for this name exactly. A typo such as `mian` compiles fine but cannot be launched.
- `String[] args`: the words typed after the class name on the command line. Chapter 4 covers arrays and command-line arguments.

A well-structured `main` reads like a table of contents: it calls well-named methods and wires their results together, rather than containing all the logic itself.

### Program: a main method that orchestrates helpers

```java
public class TemperatureReport {
    public static void main(String[] args) {
        double[] celsius = {-40.0, 0.0, 21.5, 100.0};
        printHeader("Temperature report");
        for (double c : celsius) {
            double f = toFahrenheit(c);
            String label = describe(c);
            System.out.println(c + " C = " + f + " F (" + label + ")");
        }
        printHeader("");
        System.out.println("average = " + average(celsius));
    }

    static void printHeader(String title) {
        if (title.isEmpty()) {
            System.out.println("----------");
            return;
        }
        System.out.println("== " + title + " ==");
    }

    static double toFahrenheit(double celsius) {
        return celsius * 9.0 / 5.0 + 32.0;
    }

    static String describe(double celsius) {
        if (celsius <= 0.0) {
            return "freezing";
        }
        if (celsius < 25.0) {
            return "mild";
        }
        return "hot";
    }

    static double average(double[] values) {
        double sum = 0.0;
        for (double v : values) {
            sum += v;
        }
        return sum / values.length;
    }
}
```

```text
== Temperature report ==
-40.0 C = -40.0 F (freezing)
0.0 C = 32.0 F (freezing)
21.5 C = 70.7 F (mild)
100.0 C = 212.0 F (hot)
----------
average = 20.375
```

Things to notice:

- Methods can be declared in any order inside the class; `main` can call methods declared below it.
- `printHeader` is `void`, yet it uses `return;` to finish early. In a `void` method, `return` with no value simply ends the call.
- `describe` uses early returns instead of `else`; once a `return` runs, nothing after it in that method executes.
- `average` has a hidden precondition: `values` must not be empty. With an empty array, `sum / values.length` is `0.0 / 0`, which produces `NaN` for doubles. A professional contract states that assumption or handles it.

## Return values and the every-path rule

A method with a non-`void` return type must return a value of that type on **every path that completes normally**. The compiler checks this by reading your branches; it does not reason about which values are actually possible. If one path can reach the closing brace without a `return`, the method does not compile. A path may instead *throw* an exception, which is how a method says "I cannot produce a valid result".

Returning a value is more flexible than printing it. A returned value can be printed, stored, compared in a test, sent over a network, or passed to another method. A printed value can only be read by a human.

## Methods as contracts

A method's signature tells the compiler what types it accepts. A **contract** tells humans what the method actually promises:

- **Preconditions:** what must be true of the inputs (for example, "width and height are non-negative").
- **Postconditions:** what is true of the result when the method returns normally (for example, "the result equals width times height").
- **Failure behavior:** what happens when a precondition is violated or the result cannot be represented (which exception, with what message).
- **Side effects:** what else changes (a file written, an array mutated, a line printed), ideally "nothing".

Write the contract as a comment above the method, then make the code enforce it. Validating preconditions at the top of the method and throwing `IllegalArgumentException` is called *failing fast*: the error appears where the bad value entered, not three methods later.

### Program: a contract enforced in code

```java
public class RectangleContract {
    /**
     * Returns width * height.
     * Precondition: width >= 0 and height >= 0.
     * Postcondition: the result equals the mathematical product.
     * Throws IllegalArgumentException for a negative dimension and
     * ArithmeticException if the product does not fit in an int.
     */
    static int rectangleArea(int width, int height) {
        if (width < 0 || height < 0) {
            throw new IllegalArgumentException("negative dimension: " + width + "x" + height);
        }
        return Math.multiplyExact(width, height);
    }

    static void tryArea(int width, int height) {
        try {
            System.out.println(width + "x" + height + " -> " + rectangleArea(width, height));
        } catch (IllegalArgumentException | ArithmeticException e) {
            System.out.println(width + "x" + height + " -> " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    public static void main(String[] args) {
        tryArea(3, 4);
        tryArea(0, 4);
        tryArea(-2, 4);
        tryArea(50_000, 50_000);
        System.out.println("unchecked multiply: " + (50_000 * 50_000));
    }
}
```

```text
3x4 -> 12
0x4 -> 0
-2x4 -> IllegalArgumentException: negative dimension: -2x4
50000x50000 -> ArithmeticException: integer overflow
unchecked multiply: -1794967296
```

The last line shows what the contract protects against: plain `int` multiplication silently wraps around to a meaningless negative number. `Math.multiplyExact` throws instead. Chapter 11 covers exceptions and `try`/`catch` in depth; for now, read `throw` as "stop this method and report a failure to the caller".

## Arguments are always passed by value

Java has exactly one argument-passing rule: **the value of each argument is copied into the parameter**. What that value *is* depends on the type:

- For a primitive (`int`, `double`, `boolean`, ...), the value is the number or boolean itself. The method gets its own copy; changing the parameter never changes the caller's variable.
- For an array or any other object, the variable does not hold the object; it holds a **reference** (think of it as the object's address). The method gets a copy of the reference. Now two variables, the caller's and the parameter, refer to the *same* object.

A useful analogy: a reference is like a house address written on a card. Passing an array to a method photocopies the card, not the house. If the method follows its copy of the address and repaints the front door, the caller sees the new paint, because there is only one house. If the method erases its card and writes a different address on it, the caller's card is unaffected; it still points to the original house.

### Program: mutate versus reassign

```java
import java.util.Arrays;

public class PassByValue {
    static void increment(int number) {
        number = number + 1;
        System.out.println("  inside increment: number = " + number);
    }

    static void fillWithSevens(int[] data) {
        for (int i = 0; i < data.length; i++) {
            data[i] = 7;
        }
    }

    static void replaceArray(int[] data) {
        data = new int[] {99, 99, 99};
        System.out.println("  inside replaceArray: data = " + Arrays.toString(data));
    }

    public static void main(String[] args) {
        int count = 5;
        increment(count);
        System.out.println("after increment: count = " + count);

        int[] scores = {1, 2, 3};
        replaceArray(scores);
        System.out.println("after replaceArray: scores = " + Arrays.toString(scores));

        fillWithSevens(scores);
        System.out.println("after fillWithSevens: scores = " + Arrays.toString(scores));
    }
}
```

```text
  inside increment: number = 6
after increment: count = 5
  inside replaceArray: data = [99, 99, 99]
after replaceArray: scores = [1, 2, 3]
after fillWithSevens: scores = [7, 7, 7]
```

## What happens under the hood: tracing the three calls

1. `increment(count)`: the value 5 is copied into `number`. The method changes `number` to 6 in its own frame. When the frame is discarded, 6 disappears. `count` in `main` was never touched.
2. `replaceArray(scores)`: the reference held by `scores` is copied into `data`, so both refer to the array `[1, 2, 3]`. Then `data = new int[] {99, 99, 99}` creates a second array and points only the local parameter at it. `scores` still refers to `[1, 2, 3]`. When the method returns, nobody refers to the `[99, 99, 99]` array any more, and the garbage collector may reclaim it.
3. `fillWithSevens(scores)`: `data` again refers to the same array as `scores`. The assignments `data[i] = 7` follow the reference and change the shared array's elements, so `main` sees `[7, 7, 7]`.

The rule to remember: **assigning to a parameter changes only the parameter; assigning through a parameter (to an element or field) changes the shared object.** There is no way for a Java method to make the caller's variable refer to a different object. If a method wants to give the caller a new array, it must `return` it and let the caller assign it.

## Side effects and pure methods

A **side effect** is any observable change a method makes besides returning a value: printing, writing a file, modifying a parameter's object, changing a `static` field, or reading the clock or the keyboard. A **pure** method has no side effects and returns the same result for the same arguments every time.

### Program: pure versus impure

```java
public class SideEffects {
    static int callCount = 0;

    // Pure: result depends only on the arguments; nothing else changes.
    static int discountedPrice(int priceCents, int percentOff) {
        return priceCents - priceCents * percentOff / 100;
    }

    // Impure: changes shared state and prints; result depends on history.
    static int discountedPriceNoisy(int priceCents, int percentOff) {
        callCount++;
        int extra = callCount > 2 ? 5 : 0;
        int result = priceCents - priceCents * (percentOff + extra) / 100;
        System.out.println("  [log] call " + callCount + " -> " + result);
        return result;
    }

    public static void main(String[] args) {
        System.out.println("pure:  " + discountedPrice(2_000, 10));
        System.out.println("pure:  " + discountedPrice(2_000, 10));
        System.out.println("pure:  " + discountedPrice(2_000, 10));

        for (int i = 0; i < 3; i++) {
            int value = discountedPriceNoisy(2_000, 10);
            System.out.println("noisy: " + value);
        }
    }
}
```

```text
pure:  1800
pure:  1800
pure:  1800
  [log] call 1 -> 1800
noisy: 1800
  [log] call 2 -> 1800
noisy: 1800
  [log] call 3 -> 1700
noisy: 1700
```

The impure version gives a different answer on the third call with identical arguments, because it depends on a hidden `static` counter. Tests become order-dependent, and the log line appears wherever the method is used, even in contexts with no console. Side effects are not evil (a program that never prints is useless), but they belong at the edges of a program, in a few clearly named methods, while the calculations in the middle stay pure.

| Kind of method | Example | Easy to test? | Safe to call twice? |
|---|---|---|---|
| Pure calculation | `toFahrenheit(double)` | Yes: compare the returned value | Yes |
| Mutates a parameter | `fillWithSevens(int[])` | Yes, if the contract documents it | Depends on the caller |
| Reads or writes global state | `discountedPriceNoisy` | Hard: results depend on call order | No |
| Performs input/output | `printHeader(String)` | Needs captured output | Visible effect each time |

## Common mistakes

### Mistake 1: a path with no return

```java
static String grade(int score) {
    if (score >= 90) {
        return "distinction";
    } else if (score >= 50) {
        return "pass";
    }
}
```

```text
MissingReturn.java:8: error: missing return statement
    }
    ^
```

Scores below 50 reach the closing brace with nothing to return. Fix: add a final `return "fail";` or turn the last `else if` into `else`, so every path returns. Do not "fix" it by returning a meaningless placeholder such as `null`.

### Mistake 2: calling an instance method from main

```java
public class StaticContext {
    int square(int x) {
        return x * x;
    }

    public static void main(String[] args) {
        System.out.println(square(4));
    }
}
```

```text
StaticContext.java:7: error: non-static method square(int) cannot be referenced from a static context
        System.out.println(square(4));
                           ^
```

`main` is `static`, so there is no object for a non-static method to run on. For now, fix it by declaring the helper `static int square(int x)`. Chapter 5 explains instance methods and objects.

### Mistake 3: ignoring the return value

```java
int price = 10;
doubled(price);          // returns 20, but the result is thrown away
System.out.println(price);
```

```text
10
```

Calling a method that returns a value does not change your variable. Fix: `price = doubled(price);`.

### Mistake 4: a misspelled main

A class whose entry point is spelled `mian` compiles, but launching it fails:

```text
error: can't find main(String[]) method in class: NoMain
```

Fix: the launcher needs exactly `public static void main(String[] args)`.

### Mistake 5: expecting a reassigned parameter to update the caller

Writing `data = new int[] {...}` inside a method and expecting the caller's array variable to change is the most common misunderstanding of argument passing. Fix: return the new array and assign it at the call site, or mutate the existing array's elements if that is genuinely the documented contract.

## Best practices

- Give each method one job and a name that states it as a verb: `calculateTotal`, `isValidEmail`, `printReceipt`.
- Prefer returning results over printing them; keep printing in a small number of output methods.
- Write the contract (preconditions, postconditions, failures, side effects) before the body.
- Validate preconditions at the top and fail fast with `IllegalArgumentException` and a message that includes the bad value.
- Do not mutate parameters unless mutation is the method's documented purpose; if it is, say so in the name (`fillWithSevens`, `sortInPlace`).
- Avoid mutable `static` fields as hidden channels between methods; pass data in parameters and return it.
- Keep methods short enough to read at a glance; if a method needs section comments, the sections are probably separate methods.

## Summary

- A method declaration has modifiers, a return type, a name, a parameter list, and a body; the name plus parameter types form its signature.
- `public static void main(String[] args)` is the program's entry point; each keyword has a specific purpose.
- Non-`void` methods must return a value (or throw) on every path; `void` methods may use `return;` to exit early.
- A contract states preconditions, postconditions, failure behavior, and side effects; code enforces it by validating early.
- Java always copies argument values. For objects and arrays, the copied value is a reference to the same object.
- Mutating through a parameter is visible to the caller; reassigning the parameter itself is not, so the caller's variable keeps referring to its original object.
- Pure methods are the easiest to test and reuse; confine side effects to the edges.

## Practice

### Warm-up

1. Write `static int cube(int n)` and call it from `main` for 0, 2, and -3.
2. Write a `void` method `printBanner(String text, int width)` that returns early without printing when `text` is empty.

### Core

1. Separate a console calculator into four methods: read two numbers, validate them, calculate, and display. Only the read and display methods may touch the console.
2. Write a contract comment and implementation for `static int safeDivide(int dividend, int divisor)` that fails fast on a zero divisor. Test it with a normal case, a negative case, and the failing case.
3. Write one method that doubles every element of an `int[]` in place and another that returns a new doubled array without touching its input. Before running, predict what the caller's array contains after each call.

### Challenge

1. Add a precondition check to `average` so an empty array is rejected with a clear message, and decide whether rejecting or returning `0.0` is the better contract. Justify your choice in a comment.
2. Refactor `SideEffects.discountedPriceNoisy` into a pure calculation plus a separate logging call, so the calculation is deterministic and can be tested without reading output.

## Check your understanding

1. What is the difference between a parameter and an argument?
2. Explain each keyword in `public static void main(String[] args)`.
3. A method receives an `int[]` and assigns a brand-new array to its parameter. What does the caller's variable refer to after the call, and why?
4. A method receives an `int[]` and sets element 0 to 42. What does the caller observe, and why is this different from question 3?
5. Why does the compiler reject a non-`void` method whose last `else if` has no final `else`?
6. Name three kinds of side effects, and explain why a pure method is easier to test.
