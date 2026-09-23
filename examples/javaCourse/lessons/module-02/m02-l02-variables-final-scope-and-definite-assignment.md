# Variables, final, scope, and definite assignment

Programs remember things by storing values in variables: the running total of a shopping cart, the number of login attempts left, the name a user typed. Java is strict about variables in ways that feel fussy at first but prevent entire categories of bugs. The compiler refuses to let you read a variable that might not have a value, refuses to let you use a name outside the region where it exists, and, when you ask it to, refuses to let you change a value that should stay fixed.

This lesson teaches you to declare and use variables the way professional Java developers do: with clear names, the narrowest possible scope, and `final` wherever a value should not change.

What you will learn:

- How to declare, initialize, and reassign variables, including compound assignment
- The rules for legal identifiers and the naming conventions every Java team expects
- What scope is and how blocks, loops, and methods limit where a name is visible
- Definite assignment: why the compiler rejects reading a variable that might be unassigned
- The difference between local variables and fields, including default values
- What `final` guarantees for primitives and for references, and what it does not
- How and when to use local type inference with `var`
- Coding-style conventions that make code readable to other developers

## Declaring, initializing, and reassigning

A **declaration** introduces a variable's type and name. An **assignment** stores a value in it. You can do both at once, which is called **initialization**:

```java
int apples;        // fragment: declaration only
apples = 5;        // assignment
int oranges = 3;   // declaration with initialization
```

The `=` sign in Java means "store the value on the right into the variable on the left". It is not a statement of mathematical equality. That is why `apples = apples + 2;` makes sense: evaluate the right side using the current value, then store the result back.

**Compound assignment** operators combine an operation with assignment: `x += 3` means `x = x + 3`, and similarly `-=`, `*=`, `/=`, and `%=`.

This complete program shows declaration, reassignment, compound assignment, swapping two values through a temporary variable, and declaring two variables on one line:

```java
public class VariableBasics {
    public static void main(String[] args) {
        int apples;
        apples = 5;
        int oranges = 3;
        System.out.println("apples=" + apples + ", oranges=" + oranges);

        apples = apples + 2;
        oranges += 10;
        System.out.println("after changes: apples=" + apples + ", oranges=" + oranges);

        int temporary = apples;
        apples = oranges;
        oranges = temporary;
        System.out.println("after swap:    apples=" + apples + ", oranges=" + oranges);

        int width = 4, height = 3;
        int area = width * height;
        System.out.println("area=" + area);
    }
}
```

Output:

```text
apples=5, oranges=3
after changes: apples=7, oranges=13
after swap:    apples=13, oranges=7
area=12
```

Why does swapping need `temporary`? If you wrote `apples = oranges; oranges = apples;`, the first statement would overwrite the original value of `apples` before it could be copied, and both variables would end up holding 13.

> **Tip:** Declaring several variables on one line (`int width = 4, height = 3;`) is legal, but most style guides prefer one declaration per line because it is easier to read, review, and comment.

## Naming variables

### The rules the compiler enforces

An **identifier** (the name of a variable, method, or class) must follow these rules:

- It may contain letters, digits, `_`, and `$`.
- It must not start with a digit: `2ndPlace` is illegal, `secondPlace` is fine.
- It must not be a reserved keyword such as `class`, `int`, `new`, `if`, `for`, `public`, or `static`.
- It must not be a lone underscore `_` (reserved since Java 9).
- It is case-sensitive: `total`, `Total`, and `TOTAL` are three different names.

Using a keyword as a name produces confusing errors, because the compiler tries to parse the keyword as syntax:

```java
public class BadNames {
    public static void main(String[] args) {
        int class = 1;
    }
}
```

```text
BadNames.java:3: error: not a statement
        int class = 1;
        ^
BadNames.java:3: error: ';' expected
        int class = 1;
           ^
BadNames.java:3: error: <identifier> expected
        int class = 1;
                 ^
3 errors
```

When you see a cascade of strange errors on one line, check whether a name collides with a keyword.

### The conventions your team expects

The compiler accepts `int X_Value_2;`, but other developers will not. Java has strong, near-universal naming conventions:

| Kind of name | Convention | Examples |
|---|---|---|
| Local variables, fields, parameters | lowerCamelCase | `total`, `loginAttempts`, `firstName` |
| Methods | lowerCamelCase, usually a verb | `calculateTotal`, `isValid`, `sendEmail` |
| Classes, interfaces, records, enums | UpperCamelCase (PascalCase), a noun | `Invoice`, `PaymentService`, `OrderStatus` |
| Constants (`static final`) | UPPER_SNAKE_CASE | `MAX_ATTEMPTS`, `VAT_RATE` |
| Packages | all lowercase, reverse domain | `com.example.billing` |
| Type parameters | a single uppercase letter | `T`, `E`, `K`, `V` |

Beyond capitalization, good names describe *meaning*, not type or implementation:

- Prefer `remainingAttempts` over `n`, `x`, `count2`, or `intValue`.
- Booleans read well as questions: `isActive`, `hasDiscount`, `canRetry`.
- Include units when they matter: `timeoutMillis`, `weightKg`, `priceCents`.
- Avoid abbreviations that only you understand: `custAddrLn2` versus `customerAddressLine2`.
- Short names such as `i` and `j` are fine for small loop counters whose scope is a few lines.

## Scope: where a name exists

The **scope** of a variable is the region of code in which its name can be used. For a local variable, scope starts at its declaration and ends at the closing brace of the block that contains it. A **block** is any code between `{` and `}`: a method body, a loop body, an `if` branch, or even a bare block.

```java
public class ScopeDemo {
    static int count = 100;

    public static void main(String[] args) {
        int total = 0;
        for (int i = 1; i <= 3; i++) {
            int squared = i * i;
            total += squared;
            System.out.println("i=" + i + " squared=" + squared + " total=" + total);
        }
        System.out.println("final total=" + total);

        {
            int inner = 42;
            System.out.println("inside block: inner=" + inner);
        }

        int count = 7;
        System.out.println("local count=" + count + ", field count=" + ScopeDemo.count);
    }
}
```

Output:

```text
i=1 squared=1 total=1
i=2 squared=4 total=5
i=3 squared=9 total=14
final total=14
inside block: inner=42
local count=7, field count=100
```

Walk through the scopes:

- `total` is declared in `main`, so it lives until the end of `main`. It keeps accumulating across loop iterations because it was declared *outside* the loop.
- `i` is declared in the `for` header, so it exists only inside that loop.
- `squared` is declared inside the loop body, so a fresh `squared` is created on every iteration and disappears at the end of each one.
- `inner` exists only inside the bare block.
- The local `count` **shadows** the static field `count`: inside `main`, the plain name `count` now means the local variable. The field is still reachable through its class name, `ScopeDemo.count`. Shadowing a field is legal but confusing; avoid it except in constructors and setters where `this.name = name` is the established idiom (Chapter 5).

Trying to use a variable after its scope ends is a compile error:

```java
public class OutOfScope {
    public static void main(String[] args) {
        for (int i = 0; i < 3; i++) {
            int squared = i * i;
        }
        System.out.println(squared);
    }
}
```

```text
OutOfScope.java:6: error: cannot find symbol
        System.out.println(squared);
                           ^
  symbol:   variable squared
  location: class OutOfScope
1 error
```

The fix depends on intent. If you need the value after the loop, declare the variable before the loop. If you do not, the error is telling you that the print statement is in the wrong place.

> **Note:** Java does not allow a local variable to redeclare another local variable that is still in scope. `int total = 0; { int total = 5; }` is a compile error ("variable total is already defined"). Only fields can be shadowed.

## Definite assignment

Java has a rule called **definite assignment**: a local variable must be assigned on *every* possible path before it is read. The compiler checks this without running your program.

```java
public class Unassigned {
    public static void main(String[] args) {
        int score;
        boolean passed = args.length > 0;
        if (passed) {
            score = 80;
        }
        System.out.println(score);
    }
}
```

```text
Unassigned.java:8: error: variable score might not have been initialized
        System.out.println(score);
                           ^
1 error
```

If `passed` is false, nothing assigns `score`, so the read on line 8 is rejected, even if you "know" that `passed` is always true when you run it. The compiler reasons about every path, not about your intentions. That is a feature: in languages without this rule, reading an uninitialized variable produces garbage values and bugs that appear only sometimes.

There are two good fixes. Either give the variable a meaningful value on every branch, or restructure so the variable is declared where its value is known. The pattern below assigns `result` exactly once on each branch of an if/else chain, so the compiler can prove it is always assigned:

```java
public class DefiniteAssignment {
    static int fieldCounter;
    static String fieldName;

    static String grade(int score) {
        String result;
        if (score >= 90) {
            result = "A";
        } else if (score >= 75) {
            result = "B";
        } else if (score >= 60) {
            result = "C";
        } else {
            result = "retry";
        }
        return result;
    }

    public static void main(String[] args) {
        System.out.println("field defaults: " + fieldCounter + " and " + fieldName);
        for (int score : new int[] {95, 75, 60, 12}) {
            System.out.println(score + " -> " + grade(score));
        }
    }
}
```

Output:

```text
field defaults: 0 and null
95 -> A
75 -> B
60 -> C
12 -> retry
```

The final `else` matters. Remove it and `result` is unassigned for scores below 60, so the compiler rejects the `return`.

> **Warning:** Do not "fix" a definite-assignment error by writing `int score = 0;` at the declaration unless 0 is a genuinely correct value. A dummy initial value silences the compiler but can hide the real bug: a path you forgot to handle.

## Local variables versus fields

The output line `field defaults: 0 and null` shows an important difference. **Fields** (variables declared in a class, outside any method) receive default values automatically: `0` for numbers, `false` for booleans, `'\u0000'` for `char`, and `null` for references. **Local variables** receive no default at all, which is exactly why definite assignment exists for them.

| | Local variable | Field |
|---|---|---|
| Declared | Inside a method or block | Inside a class, outside methods |
| Lifetime | Until its block ends | As long as its object (or class, if `static`) exists |
| Default value | None; must be assigned before reading | `0`, `0.0`, `false`, `'\u0000'`, or `null` |
| Visible to other methods | No | Yes, subject to access modifiers |

A default value is not the same as a *valid* value. A `Customer` object whose `name` field is `null` because nobody set it is technically initialized but logically broken. Chapter 5 shows how constructors guarantee valid object state.

## final: values that must not be reassigned

Declaring a variable `final` means it can be **assigned exactly once**. Any later assignment is a compile error. `final` communicates intent ("this value does not change") and lets the compiler enforce it.

```java
import java.util.Arrays;

public class FinalDemo {
    static final int MAX_ATTEMPTS = 3;
    static final double VAT_RATE = 0.2;

    public static void main(String[] args) {
        final int passingScore = 60;
        System.out.println("passing score " + passingScore + ", max attempts " + MAX_ATTEMPTS);

        final String label;
        if (args.length > 0) {
            label = "custom";
        } else {
            label = "default";
        }
        System.out.println("label assigned exactly once: " + label);

        final int[] scores = {70, 80, 90};
        scores[0] = 75;
        System.out.println("final array, element changed: " + Arrays.toString(scores));

        double net = 50.0;
        System.out.println("gross = " + net * (1 + VAT_RATE));
    }
}
```

Output:

```text
passing score 60, max attempts 3
label assigned exactly once: default
final array, element changed: [75, 80, 90]
gross = 60.0
```

Three lessons hide in this program.

**A final variable can be assigned later, but only once.** `label` is a *blank final*: declared without a value, then assigned exactly once on each branch. Definite assignment rules apply, plus the compiler proves no path assigns it twice.

**Constants are `static final` fields with UPPER_SNAKE_CASE names.** `MAX_ATTEMPTS` belongs to the class, not to any object, and never changes. Named constants replace magic numbers: `attempts < MAX_ATTEMPTS` explains itself, while `attempts < 3` does not.

**`final` on a reference freezes the variable, not the object.** `scores` is `final`, yet `scores[0] = 75` compiles and runs. The variable `scores` must keep referring to the *same array*, but the array's contents can still change. What `final` forbids is pointing the variable at a different object:

```java
public class ReassignFinal {
    public static void main(String[] args) {
        final int[] scores = {70, 80, 90};
        scores = new int[] {1, 2, 3};
        final int limit = 10;
        limit = 20;
    }
}
```

```text
ReassignFinal.java:4: error: cannot assign a value to final variable scores
        scores = new int[] {1, 2, 3};
        ^
ReassignFinal.java:6: error: cannot assign a value to final variable limit
        limit = 20;
        ^
2 errors
```

Think of a final reference as a leash tied to one particular dog. You cannot re-tie the leash to another dog, but the dog itself can still move around. To make the *contents* unchangeable you need an immutable object, which Chapter 4 covers.

| Declaration | Reassign the variable? | Change the object's contents? |
|---|---|---|
| `int x = 1;` | Yes | Not applicable |
| `final int x = 1;` | No | Not applicable |
| `int[] a = {1};` | Yes | Yes |
| `final int[] a = {1};` | No | Yes |
| `final String s = "hi";` | No | No (`String` is immutable) |

## var: local type inference

Since Java 10, you can write `var` instead of an explicit type for a **local variable with an initializer**. The compiler infers the type from the right-hand side. `var` does **not** make Java dynamically typed: the inferred type is fixed forever, exactly as if you had written it.

```java
import java.util.ArrayList;

public class VarDemo {
    public static void main(String[] args) {
        var count = 10;
        var price = 19.99;
        var name = "Java";
        var names = new ArrayList<String>();
        names.add(name);
        count = count + 1;
        System.out.println(count + " " + price + " " + name + " " + names);
        System.out.println("count is still an int: " + ((Object) count).getClass().getSimpleName());
    }
}
```

Output:

```text
11 19.99 Java [Java]
count is still an int: Integer
```

(`count` is an `int`; converting it to `Object` for the check boxes it into an `Integer`, a wrapper you will study in Chapter 8.)

`var` has limits, each enforced by the compiler:

```java
public class VarMistakes {
    public static void main(String[] args) {
        var count = 10;
        count = "ten";
        var nothing = null;
        var later;
    }
}
```

```text
VarMistakes.java:4: error: incompatible types: String cannot be converted to int
        count = "ten";
                ^
VarMistakes.java:5: error: cannot infer type for local variable nothing
        var nothing = null;
            ^
  (variable initializer is 'null')
VarMistakes.java:6: error: cannot infer type for local variable later
        var later;
            ^
  (cannot use 'var' on variable without initializer)
3 errors
```

`var` is also not allowed for fields, method parameters, or method return types. Use it when the type is obvious from the right-hand side (`var names = new ArrayList<String>();`) and avoid it when it hides important information (`var result = service.process();` forces the reader to look up what `process` returns).

## What happens under the hood

Local variables live in the current method's **stack frame**, a small area of memory created when the method is called and discarded when it returns. That is why their lifetime ends with their block and why they need no default: the compiler has already proven every read is preceded by a write, so the JVM never needs to zero them for you.

Scope is a compile-time concept. At run time, the bytecode refers to local variables by numbered slots, and slots can be reused once a variable's scope ends. `final` on a local variable leaves no trace at all in the bytecode; it is purely a compile-time check. `var` also vanishes after compilation: the class file records the inferred type exactly as if you had written it by hand.

## Common mistakes

**1. Declaring a variable inside a loop when it must survive the loop.** An accumulator such as `int total = 0;` placed inside the loop body is reset on every iteration, and cannot be read after the loop. Declare accumulators before the loop.

**2. Silencing definite assignment with a fake default.** `String status = "";` followed by an if/else that forgets a case compiles fine but returns an empty status for the forgotten case. Prefer a structure (final `else`, or a `switch` expression in Chapter 3) that makes the compiler check completeness.

**3. Believing `final` makes an object immutable.** `final List<String> names` can still receive `names.add(...)`. `final` protects the variable, not the object.

**4. Using `=` when you mean `==`.** In a condition, `if (x = 5)` does not compile for an `int` because the result of the assignment is an `int`, not a `boolean`. But `if (done = true)` *does* compile for a `boolean` and always runs the branch. Write `if (done)` instead of comparing booleans to `true`.

**5. Meaningless names.** `int d; // elapsed time in days` needs a comment; `int elapsedDays;` does not. If you need a comment to explain what a variable holds, rename the variable.

**6. Swapping without a temporary.** `a = b; b = a;` loses the original `a`. Use a temporary variable.

## Best practices

- Declare each variable as close as possible to its first use, in the narrowest scope that works.
- Initialize a variable when you declare it if you know its correct value; otherwise let the compiler's definite-assignment check work for you.
- Make local variables and fields `final` by default when they are not reassigned. Many teams treat an unexpected reassignment as a code smell.
- Replace magic numbers with named `static final` constants.
- Follow the naming conventions table exactly; consistency across a codebase matters more than personal preference.
- Keep one declaration per line and use `var` only where the type is obvious.
- Format consistently: four-space indentation (or your team's standard), a space around binary operators, braces on every `if` and loop body even when it has one statement.

## Summary

- A variable has a fixed type and a name; `=` stores a value, and compound operators such as `+=` update it.
- Identifiers cannot start with a digit or be keywords. By convention, variables and methods use lowerCamelCase, classes use UpperCamelCase, and constants use UPPER_SNAKE_CASE.
- Scope runs from a declaration to the end of its enclosing block. Loop variables and variables declared in a loop body disappear after the loop.
- Definite assignment means a local variable must be assigned on every path before it is read; fields get default values instead.
- `final` allows exactly one assignment. For references it fixes which object the variable refers to, not the object's contents, so a `final` array's elements can still change.
- `var` infers a fixed static type for initialized local variables only.

## Practice

Warm-up:

1. Declare variables for a product name, quantity, unit price in cents, and whether it is in stock. Print them in one sentence.
2. Rename these variables to follow Java conventions and to describe their meaning: `int X;`, `double t_c;`, `boolean flag;`, `static final int max = 5;`.
3. Swap the values of two `String` variables using a temporary variable and print them before and after.

Core:

1. Write a program with a loop that computes the product of the numbers 1 to 10. Decide where the accumulator must be declared, choose its type carefully (look back at Lesson 1), and explain your choices in a comment.
2. Write a method that returns a shipping label (`"free"`, `"standard"`, or `"heavy"`) from a weight in grams. Declare the result variable without an initial value and make the compiler prove it is assigned on every path. Then delete one branch and read the error.
3. Declare `final int[] temperatures = {21, 23, 19};`. Write code that changes an element, then code that tries to reassign the variable. Record which compiles and explain why.

Challenge:

1. Take a program you wrote in Chapter 1 and refactor it: narrow every variable's scope, make every non-reassigned variable `final`, replace every magic number with a named constant, and rename anything that needs a comment to explain it. Compare the before and after versions with a classmate or in writing.
2. Write two versions of a method that counts how many numbers in an array are above average: one using `var` everywhere legal and one using no `var`. Decide which lines genuinely benefit from `var` and justify each choice.

## Check your understanding

1. Why does the compiler reject reading a local variable that is assigned in only one branch of an `if`, even when you are sure that branch always runs?
2. A variable is declared inside a `for` loop's body. Can it be read after the loop? What is the fix if you need its final value?
3. What default value does an `int` field have, and what default value does an `int` local variable have?
4. Given `final StringBuilder sb = new StringBuilder("a");`, which of `sb.append("b");` and `sb = new StringBuilder("c");` compiles, and why?
5. What type does the compiler infer for `var total = 0L;`, and can you later assign `total = 2.5;`?
6. Which name follows Java conventions for a constant holding the maximum upload size in megabytes: `maxUploadMb`, `MaxUploadMb`, or `MAX_UPLOAD_MB`?
