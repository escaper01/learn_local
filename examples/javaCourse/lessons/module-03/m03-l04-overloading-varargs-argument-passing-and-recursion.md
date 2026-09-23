# Overloading, varargs, argument passing, and recursion

Open the documentation for `System.out.println` and you will find ten versions: one for `int`, one for `double`, one for `String`, one for `Object`, and more. That is **overloading**, and the Java library is built on it. `String.format` accepts any number of arguments thanks to **varargs**. And many problems, from walking a folder tree to parsing nested data, are naturally described with **recursion**: a method that solves a problem by calling itself on a smaller version of it. These three features are powerful, but each has a sharp edge. Overloads are chosen by rules that surprise even experienced developers; varargs can hide ambiguity; recursion without a base case crashes the thread. This lesson teaches the rules precisely so you can predict what Java will do before you run the code.

What you will learn:

- How to declare overloaded methods and what makes two signatures different
- When and how the compiler chooses between overloads, including widening, boxing, and varargs
- Why overload choice depends on declared (compile-time) types, not on the runtime object
- How varargs parameters work and how they relate to arrays
- How argument passing interacts with overloads and varargs
- How to design recursive methods with a base case and progress, and how to trace them
- When recursion is the wrong tool, and what `StackOverflowError` means

## Overloading: one name, several parameter lists

Two or more methods in the same class may share a name as long as their **parameter lists differ** in number, types, or order of types. The method name plus the parameter types is the **signature**, and each signature in a class must be unique.

```java
// Fragment: a legal overload family
static int area(int side) { return side * side; }                 // area(int)
static int area(int width, int height) { return width * height; } // area(int, int)
static double area(double radius) { return Math.PI * radius * radius; } // area(double)
```

What does *not* count as a difference:

- **The return type alone.** Callers are allowed to ignore return values, so the compiler could not tell which method a bare call means.
- **Parameter names.** `area(int side)` and `area(int length)` have the same signature.
- **Modifiers** such as `static` or `public`.

Good overloads mean *the same operation on different inputs*. If two methods do different things, give them different names: `parseDate` and `parseTime` are clearer than two `parse` methods.

## How the compiler chooses an overload

When you write a call, the compiler (not the running program) picks exactly one overload. It looks only at the **declared types of the argument expressions** as written in the source. It tries three phases in order and stops at the first phase that finds any applicable method:

1. **Phase 1, exact match or widening:** no boxing, no varargs. Primitive widening (such as `byte` to `int`, `int` to `long`, `float` to `double`) and reference widening (such as `String` to `Object`) are allowed.
2. **Phase 2, boxing and unboxing:** also allow `int` to `Integer` and back.
3. **Phase 3, varargs:** also allow variable-arity methods.

If several methods apply in the same phase, the compiler picks the **most specific** one: the one whose parameter types could be passed to the others. `int` is more specific than `long`, and `String` is more specific than `Object`. If no single method is most specific, the call is **ambiguous** and does not compile.

### Program: predicting overload selection

```java
public class OverloadResolution {
    static String describe(int x) { return "describe(int)"; }
    static String describe(long x) { return "describe(long)"; }
    static String describe(double x) { return "describe(double)"; }
    static String describe(Object x) { return "describe(Object)"; }
    static String describe(int... xs) { return "describe(int...) with " + xs.length + " value(s)"; }

    public static void main(String[] args) {
        byte small = 1;
        System.out.println("byte      -> " + describe(small));
        System.out.println("char 'A'  -> " + describe('A'));
        System.out.println("5         -> " + describe(5));
        System.out.println("5L        -> " + describe(5L));
        System.out.println("2.5f      -> " + describe(2.5f));
        System.out.println("Integer   -> " + describe(Integer.valueOf(4)));
        System.out.println("\"text\"    -> " + describe("text"));
        System.out.println("no args   -> " + describe());
        System.out.println("1, 2, 3   -> " + describe(1, 2, 3));
    }
}
```

```text
byte      -> describe(int)
char 'A'  -> describe(int)
5         -> describe(int)
5L        -> describe(long)
2.5f      -> describe(double)
Integer   -> describe(Object)
"text"    -> describe(Object)
no args   -> describe(int...) with 0 value(s)
1, 2, 3   -> describe(int...) with 3 value(s)
```

Walk through the surprising lines:

- `byte` fits into `int`, `long`, and `double` by widening. All three apply in phase 1, and `int` is the most specific.
- `char` is a numeric type in Java; it widens to `int`.
- `2.5f` is a `float`. There is no `float` overload, so it widens to `double`.
- `Integer.valueOf(4)` is an `Integer` object. In phase 1, unboxing is not allowed, but reference widening from `Integer` to `Object` is. Phase 1 finds `describe(Object)`, so the compiler never reaches phase 2, where `describe(int)` would have applied.
- The varargs overload is only considered when nothing else fits, such as zero or three arguments.

### Compile-time types, not runtime objects

The compiler sees variable types, not the objects they will refer to at run time.

```java
public class CompileTimeChoice {
    static String kind(Object value) {
        return "kind(Object)";
    }

    static String kind(String value) {
        return "kind(String)";
    }

    public static void main(String[] args) {
        String text = "hello";
        Object sameTextAsObject = text;

        System.out.println(kind(text));
        System.out.println(kind(sameTextAsObject));
        System.out.println(kind((String) sameTextAsObject));
        System.out.println("runtime class: " + sameTextAsObject.getClass().getSimpleName());
    }
}
```

```text
kind(String)
kind(Object)
kind(String)
runtime class: String
```

`sameTextAsObject` refers to a real `String` at run time, but its declared type is `Object`, so the compiler binds the call to `kind(Object)` and writes that decision into the compiled bytecode. The running program never revisits it. A cast changes the expression's compile-time type, which changes the choice. Keep this rule separate in your mind from **overriding** (Chapter 7), where the runtime object's class *does* decide which method body runs. Overloading is decided at compile time; overriding is decided at run time.

| Question | Overloading | Overriding (Chapter 7) |
|---|---|---|
| Where are the methods? | Same class (or inherited), same name, different parameters | Subclass redefines a superclass method with the same signature |
| Who chooses? | The compiler | The JVM, while the program runs |
| Based on what? | Declared types of the arguments | Actual class of the receiving object |
| Does the return type matter for selection? | No | Must be compatible |

## Varargs: a variable number of arguments

A **varargs** parameter, written `Type... name`, lets callers pass zero or more values of that type. Inside the method, the parameter is an ordinary array.

Rules:

- A method can have at most one varargs parameter, and it must be the **last** parameter.
- Callers may pass separate values, nothing at all, or an existing array.
- Passing no values gives an **empty array** (length 0), not `null`.
- Varargs overloads are chosen last (phase 3), so a fixed-arity overload always wins when it applies.

### Program: varargs in action

```java
import java.util.Arrays;

public class VarargsDemo {
    static int sum(int... values) {
        int total = 0;
        for (int v : values) {
            total += v;
        }
        return total;
    }

    static String joinWith(String separator, String... parts) {
        if (parts.length == 0) {
            return "";
        }
        String result = parts[0];
        for (int i = 1; i < parts.length; i++) {
            result = result + separator + parts[i];
        }
        return result;
    }

    static void inspect(int... values) {
        System.out.println("received array " + Arrays.toString(values) + " of length " + values.length);
    }

    public static void main(String[] args) {
        System.out.println("sum()         = " + sum());
        System.out.println("sum(4)        = " + sum(4));
        System.out.println("sum(4, 5, 6)  = " + sum(4, 5, 6));
        int[] existing = {10, 20, 30};
        System.out.println("sum(existing) = " + sum(existing));

        System.out.println(joinWith(" / ", "home", "docs", "java"));
        System.out.println("[" + joinWith(", ") + "]");

        inspect();
        inspect(7, 8);
        System.out.println(String.format("%s scored %d of %d", "Ada", 18, 20));
    }
}
```

```text
sum()         = 0
sum(4)        = 4
sum(4, 5, 6)  = 15
sum(existing) = 60
home / docs / java
[]
received array [] of length 0
received array [7, 8] of length 2
Ada scored 18 of 20
```

`sum()` returns 0 because the loop over an empty array never runs: 0 is the *identity* for addition, the natural answer for "the sum of nothing". `String.format` itself is declared as `format(String format, Object... args)`, which is why it accepts any number of values.

### Varargs and argument passing

Because the varargs parameter is an array, the pass-by-value rule from the previous lesson applies. When the caller passes separate values, Java creates a fresh array for the call, so mutations inside the method are invisible. When the caller passes an existing array, the method receives a reference to *that* array, and assigning `values[0] = 0` inside the method changes the caller's array. Document which you rely on, or better, do not mutate a varargs array.

## Recursion: a method that calls itself

A **recursive** method solves a problem by reducing it to a smaller instance of the same problem. Every correct recursive method has two parts:

- A **base case** that returns an answer directly, without recursing.
- A **recursive case** that calls the method on a strictly smaller input, making **progress** toward the base case.

Think of a set of nested boxes: to count the gifts, open the outer box, count what is directly inside, and ask the same question of the box inside it. The smallest box, the one with no box inside, is the base case.

The termination argument is the same as for loops: name a measure (such as `n`) that decreases with every call and cannot decrease forever before hitting the base case.

### Program: tracing recursion

```java
public class RecursionTrace {
    static int factorial(int n, int depth) {
        String indent = "  ".repeat(depth);
        System.out.println(indent + "call factorial(" + n + ")");
        if (n == 0) {
            System.out.println(indent + "base case -> 1");
            return 1;
        }
        int smaller = factorial(n - 1, depth + 1);
        int result = n * smaller;
        System.out.println(indent + "return " + n + " * " + smaller + " = " + result);
        return result;
    }

    static int digitSum(int n) {
        if (n < 10) {
            return n;
        }
        return n % 10 + digitSum(n / 10);
    }

    static long calls = 0;

    static long slowFib(int n) {
        calls++;
        if (n < 2) {
            return n;
        }
        return slowFib(n - 1) + slowFib(n - 2);
    }

    static long fastFib(int n) {
        long previous = 0;
        long current = 1;
        for (int i = 0; i < n; i++) {
            long next = previous + current;
            previous = current;
            current = next;
        }
        return previous;
    }

    public static void main(String[] args) {
        System.out.println("3! = " + factorial(3, 0));
        System.out.println("digitSum(90817) = " + digitSum(90817));
        System.out.println("slowFib(25) = " + slowFib(25) + " using " + calls + " calls");
        System.out.println("fastFib(25) = " + fastFib(25) + " using 25 loop iterations");
    }
}
```

```text
call factorial(3)
  call factorial(2)
    call factorial(1)
      call factorial(0)
      base case -> 1
    return 1 * 1 = 1
  return 2 * 1 = 2
return 3 * 2 = 6
3! = 6
digitSum(90817) = 25
slowFib(25) = 75025 using 242785 calls
fastFib(25) = 75025 using 25 loop iterations
```

## What happens under the hood: the call stack during recursion

Each call gets its own stack frame with its own copy of `n`. For `factorial(3)`:

1. The frame for `factorial(3)` is pushed. `n` is 3, not the base case, so it calls `factorial(2)` and *waits*.
2. The frame for `factorial(2)` is pushed on top. It calls `factorial(1)` and waits.
3. The frame for `factorial(1)` is pushed. It calls `factorial(0)` and waits.
4. The frame for `factorial(0)` is pushed. This is the base case: it returns 1 and its frame is popped.
5. `factorial(1)` resumes with `smaller = 1`, computes `1 * 1 = 1`, returns, and is popped.
6. `factorial(2)` resumes, computes `2 * 1 = 2`, and returns.
7. `factorial(3)` resumes, computes `3 * 2 = 6`, and returns to `main`.

The indentation in the output mirrors the stack: deeper indentation means more frames waiting. Four frames existed at the deepest point. Because every pending call holds a frame, recursion depth is limited by the thread's stack size (typically thousands to tens of thousands of simple frames, depending on JVM settings and frame size). Java does **not** perform tail-call elimination, so even a recursive call in the last position still consumes a frame.

The Fibonacci comparison shows a different cost. `slowFib(n)` calls itself twice, and those calls recompute the same values over and over: 242,785 calls to compute a number a simple loop finds in 25 steps. Recursion is elegant for naturally nested problems (trees, nested folders, divide-and-conquer sorting in Chapter 10), but a loop is usually better for simple linear repetition.

| Aspect | Recursion | Iteration |
|---|---|---|
| Natural fit | Nested or self-similar structures | Linear sequences and counters |
| Termination | Base case plus shrinking argument | Loop condition plus progress |
| Memory | One stack frame per pending call | Constant for simple loops |
| Failure mode | `StackOverflowError` when too deep | Infinite loop hangs the thread |

## Common mistakes

### Mistake 1: overloading by return type only

```java
static int parse(String text) { return Integer.parseInt(text); }
static long parse(String text) { return Long.parseLong(text); }
```

```text
ReturnTypeOnly.java:6: error: method parse(String) is already defined in class ReturnTypeOnly
    static long parse(String text) {
                ^
```

Fix: use distinct names, such as `parseInt` and `parseLong`, as the JDK does.

### Mistake 2: an ambiguous null argument

```java
static String show(String value) { return "String"; }
static String show(Integer value) { return "Integer"; }
// call:
show(null);
```

```text
AmbiguousNull.java:11: error: reference to show is ambiguous
        System.out.println(show(null));
                           ^
  both method show(String) in AmbiguousNull and method show(Integer) in AmbiguousNull match
```

`null` fits any reference type, and neither `String` nor `Integer` is more specific. Fix: cast to state intent, `show((String) null)`, or better, avoid overload families where `null` is a plausible argument.

### Mistake 3: varargs not last

```java
static String label(int... values, String prefix) { ... }
```

```text
VarargsNotLast.java:2: error: varargs parameter must be the last parameter
    static String label(int... values, String prefix) {
                               ^
```

Fix: move it to the end: `label(String prefix, int... values)`.

### Mistake 4: recursion without a reachable base case

```java
public class NoBaseCase {
    static int countDown(int n) {
        return countDown(n - 1);
    }

    public static void main(String[] args) {
        try {
            countDown(5);
        } catch (StackOverflowError e) {
            System.out.println("StackOverflowError: the recursion never reached a base case");
        }
    }
}
```

```text
StackOverflowError: the recursion never reached a base case
```

Each call pushed another frame until the stack was exhausted. Without the `catch`, the thread would die with a long stack trace. Fix: add a base case (`if (n <= 0) return 0;`) and check that every recursive call moves toward it. Also check inputs that could skip past the base case, such as a negative `n` when the base case tests `n == 0`. Catching `StackOverflowError` is shown here only for demonstration; production code fixes the recursion instead.

### Mistake 5: expecting the runtime type to pick the overload

Passing an `Object` variable that happens to hold a `String` calls the `Object` overload, as `CompileTimeChoice` showed. Fix: if behavior must depend on the runtime class, use overriding (Chapter 7) or pattern matching (Chapter 6), not overloading.

## Best practices

- Overload only when every version performs the same conceptual operation; otherwise choose distinct names.
- Avoid overloads that differ only between a primitive and its wrapper (`int` versus `Integer`) or between two unrelated reference types that may receive `null`.
- Keep the same parameter order across an overload family, and make simpler overloads delegate to the most general one.
- Make varargs results sensible for zero arguments; return the identity value (0 for sums, empty text for joins) or require at least one argument with a signature such as `max(int first, int... rest)`.
- Do not mutate a varargs array; treat it as read-only input.
- For recursion, write the base case first, then the recursive case, then state the decreasing measure in a comment.
- Validate recursive inputs so they cannot skip the base case, and prefer iteration when the depth could be large.

## Summary

- Overloaded methods share a name and differ in parameter lists; the return type alone cannot distinguish them.
- The compiler chooses an overload using the declared types of the arguments: first widening only, then boxing, then varargs, picking the most specific match in the first successful phase.
- The runtime class of an argument never changes which overload was selected.
- A varargs parameter is an array; zero arguments produce an empty array, and varargs must come last.
- A recursive method needs a base case and progress toward it; each call has its own stack frame.
- Java does not eliminate tail calls, so very deep recursion causes `StackOverflowError`.
- Naive branching recursion can repeat work exponentially; iteration or remembering results fixes it.

## Practice

### Warm-up

1. Write overloads `max(int, int)`, `max(int, int, int)`, and `max(double, double)`. Make the three-argument version reuse the two-argument one.
2. Before running, predict which `describe` overload `OverloadResolution` would pick for a `short` variable and for the literal `'7'`. Then check.

### Core

1. Write `static int product(int... values)` and decide what the empty product should be. Test zero, one, and several arguments.
2. Write a recursive `power(int base, int exponent)` for non-negative exponents. Trace `power(2, 3)` on paper, listing each frame's arguments and return value.
3. Write a recursive `countOccurrences(String text, char target)` that examines the first character and recurses on the rest. Test an empty string.

### Challenge

1. Rewrite `slowFib` so it remembers results in a `long[]` passed along with each call. Count the calls for `n = 25` and compare with 242,785.
2. Design an overload family `format(int)`, `format(long)`, and `format(Object)`. Write five calls whose selection a teammate might guess wrong, predict each, and verify.
3. Write a recursive binary search over a sorted `int[]` with parameters `(array, target, low, high)`, state the measure that shrinks, and test a missing value.

## Check your understanding

1. Why can two methods not differ only in their return types?
2. When is the choice between overloaded methods made, and what information is used?
3. A variable declared as `Object` refers to a `String`. Which of `kind(Object)` and `kind(String)` does a call with that variable select, and why?
4. What does a varargs parameter contain when the caller passes no arguments?
5. What two elements must every recursive method have, and what happens when one is missing?
6. Why does `slowFib(25)` make so many calls, and what does that suggest about choosing between recursion and iteration?
