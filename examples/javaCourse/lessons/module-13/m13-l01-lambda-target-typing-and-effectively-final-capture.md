# Lambda target typing and effectively-final capture

Modern Java code is full of small pieces of behavior that get handed to other code: a comparison rule given to `sort`, a filter condition given to a stream, a task given to a thread pool, a callback given to a UI button. Before Java 8 you had to wrap each of these in an anonymous class, which buried one line of logic under five lines of ceremony. Lambda expressions let you write that behavior directly as a value.

Lambdas look simple, but two rules decide whether your code compiles and whether it behaves correctly: a lambda only has a type because of the place where you write it (its *target type*), and a lambda may only read local variables that are never reassigned (*effectively final* capture). Professional developers understand both rules precisely, because misunderstanding the second one is a common source of concurrency bugs.

What you will learn:

- What a functional interface is and why a lambda needs one
- The full syntax of lambda expressions: parameters, expression bodies, and block bodies
- How target typing works in assignment, method-argument, return, and cast contexts
- Exactly what "effectively final" forbids and what it does not forbid
- Why capturing a mutable object can still produce shared-state bugs
- How `this` behaves inside a lambda compared with an anonymous class
- What the JVM does with a lambda under the hood

## From anonymous classes to lambdas

A *lambda expression* is an anonymous function: a parameter list, an arrow `->`, and a body. It replaces the most common use of anonymous classes. Compare the two styles in a complete program.

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class LambdaBasics {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>(List.of("Charlie", "Al", "Bea", "Dominique"));

        // Before Java 8: an anonymous class that implements Comparator
        Comparator<String> byLengthOld = new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return Integer.compare(a.length(), b.length());
            }
        };
        names.sort(byLengthOld);
        System.out.println("anonymous class: " + names);

        // Java 8+: the same behavior as a lambda expression
        Comparator<String> byLengthNew = (a, b) -> Integer.compare(a.length(), b.length());
        names.sort(byLengthNew.reversed());
        System.out.println("lambda, reversed: " + names);

        // A lambda can be written directly where the method expects the interface
        names.sort((a, b) -> a.compareToIgnoreCase(b));
        System.out.println("alphabetical: " + names);
    }
}
```

```text
anonymous class: [Al, Bea, Charlie, Dominique]
lambda, reversed: [Dominique, Charlie, Bea, Al]
alphabetical: [Al, Bea, Charlie, Dominique]
```

The anonymous class and the lambda do the same job. The lambda drops everything the compiler can already work out: the interface name, the method name, the parameter types, and the `return` keyword.

## Functional interfaces: the shape a lambda fills

A lambda is not a free-floating function. It is always an implementation of a **functional interface**: an interface with exactly one abstract method. That single method is sometimes called the *functional method* or *SAM* (single abstract method).

Examples you already know:

- `Comparator<T>` has `int compare(T a, T b)`
- `Runnable` has `void run()`
- `java.util.concurrent.Callable<V>` has `V call() throws Exception`
- `java.util.function.Predicate<T>` has `boolean test(T t)`

Some details that decide whether an interface counts as functional:

- `default` methods and `static` methods do not count, because they already have a body.
- Abstract methods that match public methods of `Object` (such as `equals`) do not count. That is why `Comparator` is functional even though it declares `equals`.
- The `@FunctionalInterface` annotation is optional. It asks the compiler to verify the rule and documents your intent.

If you mark an interface with `@FunctionalInterface` but give it two abstract methods, the compiler refuses:

```text
error: Unexpected @FunctionalInterface annotation
    @FunctionalInterface
    ^
  Shape is not a functional interface
    multiple non-overriding abstract methods found in interface Shape
```

> **Tip:** Think of a functional interface as a socket and a lambda as a plug. The plug is only meaningful once it is pushed into a socket of the right shape: the right number of parameters, compatible parameter types, and a compatible return type.

## Lambda syntax, piece by piece

The following fragments show every syntactic form. They are fragments, not complete programs.

```java
// Fragment: all common lambda forms
Runnable hello = () -> System.out.println("hi");          // no parameters
Predicate<String> empty = s -> s.isEmpty();               // one parameter, no parentheses needed
Comparator<String> cmp = (a, b) -> a.compareTo(b);        // two parameters need parentheses
BinaryOperator<Integer> add = (Integer a, Integer b) -> a + b;  // explicit types
BiFunction<String, String, String> join = (var a, var b) -> a + b; // var (Java 11+)
Function<Integer, String> label = n -> {                  // block body
    String prefix = n < 0 ? "minus " : "";
    return prefix + Math.abs(n);                          // block bodies need return
};
```

Rules to remember:

- An **expression body** (`s -> s.isEmpty()`) returns the value of the expression automatically. If the target method returns `void`, the expression must be a statement-like expression such as a method call (`s -> list.add(s)` is fine, `() -> 5` is not), and any value it produces is discarded.
- A **block body** (`n -> { ... }`) behaves like a method body. If the target returns a value, every path must `return` one.
- Parameter types are either all inferred, all explicit, or all `var`. You cannot mix `(String a, b)`.
- A lambda parameter name may not reuse the name of a local variable that is in scope, because a lambda does not create a new scope for shadowing locals.

## Target typing: where a lambda gets its type

A lambda has no type of its own. The compiler looks at the surrounding context, finds the functional interface expected there, and checks the lambda against that interface's method. This is called **target typing**. The same lambda text can therefore become completely different objects.

```java
import java.util.concurrent.Callable;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;

public class TargetTyping {
    @FunctionalInterface
    interface Validator {
        boolean validate(String input);          // the single abstract method

        default Validator and(Validator other) { // default methods do not count
            return input -> validate(input) && other.validate(input);
        }
    }

    static void describe(Validator v, String input) {
        System.out.println("Validator says " + input + " -> " + v.validate(input));
    }

    public static void main(String[] args) throws Exception {
        // The same lambda text, three different target types
        Predicate<String> p = s -> s.isEmpty();
        Function<String, Boolean> f = s -> s.isEmpty();
        Validator v = s -> s.isEmpty();

        System.out.println(p.test(""));      // Predicate's method is test
        System.out.println(f.apply("x"));    // Function's method is apply
        System.out.println(v.validate(""));  // our own method name

        // Method-argument context: the parameter type is the target
        describe(s -> s.length() >= 3, "Jo");

        // Composing two targets through a default method
        Validator notBlank = s -> !s.isBlank();
        Validator shortEnough = s -> s.length() <= 10;
        describe(notBlank.and(shortEnough), "Java 21");

        // Block body: needs an explicit return when a value is expected
        Function<Integer, String> grade = score -> {
            if (score >= 90) {
                return "A";
            }
            return score >= 75 ? "B" : "C";
        };
        System.out.println(grade.apply(80));

        // One zero-argument lambda shape, two targets: Supplier vs Callable
        Supplier<String> supplier = () -> "from Supplier";
        Callable<String> callable = () -> "from Callable";
        System.out.println(supplier.get() + " / " + callable.call());

        // Cast context
        Object o = (Runnable) () -> System.out.println("running a cast lambda");
        ((Runnable) o).run();
    }
}
```

```text
true
false
true
Validator says Jo -> false
Validator says Java 21 -> true
B
from Supplier / from Callable
running a cast lambda
```

The four contexts that can supply a target type are:

| Context | Example | Where the target comes from |
|---|---|---|
| Assignment | `Predicate<String> p = s -> s.isEmpty();` | The declared variable type |
| Method argument | `names.sort((a, b) -> a.compareTo(b));` | The parameter type of the chosen method |
| Return | `return input -> validate(input);` | The method's declared return type |
| Cast | `(Runnable) () -> work()` | The cast type |

Notice what is *not* in the table: `var`. With `var`, the compiler must infer the variable type from the right-hand side, but the lambda needs the variable type to know what it is. Neither side can go first:

```text
error: cannot infer type for local variable isEmpty
        var isEmpty = (String s) -> s.isEmpty();
            ^
  (lambda expression needs an explicit target-type)
```

Also notice that `Predicate<String>` and `Function<String, Boolean>` are not interchangeable even though they were created from identical text. Once the lambda becomes a `Predicate`, you call `test`; you cannot pass it where a `Function` is expected. Target typing happens once, at the point of creation.

## Capturing variables from the enclosing scope

A lambda body can use variables from the method around it. This is called **capturing**. Parameters and fields behave differently from local variables, so learn the rules separately.

The rule for local variables (and method parameters) is: **a captured local variable must be final or effectively final.** A variable is *effectively final* if it is never reassigned after it is initialized, even though you did not write the `final` keyword.

```java
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntUnaryOperator;
import java.util.function.Predicate;
import java.util.function.Supplier;

public class CaptureRules {
    private int instanceCounter = 0;             // fields are NOT subject to the rule
    private static int staticCounter = 0;

    public static void main(String[] args) {
        // 1. Capturing an effectively final local
        int minimum = 4;                         // never reassigned -> effectively final
        Predicate<String> longEnough = text -> text.length() >= minimum;
        System.out.println(longEnough.test("Java") + " " + longEnough.test("Go"));

        // 2. Variables declared INSIDE the lambda may be reassigned freely
        IntUnaryOperator digitSum = n -> {
            int sum = 0;                         // local to the lambda body
            while (n > 0) {                      // the parameter itself may change too
                sum += n % 10;
                n /= 10;
            }
            return sum;
        };
        System.out.println(digitSum.applyAsInt(2024));

        // 3. The captured reference is fixed, the object it points to is not
        List<String> log = new ArrayList<>();    // log is effectively final...
        Runnable recordStart = () -> log.add("started"); // ...but the list is mutable
        recordStart.run();
        recordStart.run();
        System.out.println(log);

        // 4. Enhanced for: each iteration declares a fresh effectively final variable
        List<Supplier<String>> greeters = new ArrayList<>();
        for (String name : List.of("Ada", "Linus")) {
            greeters.add(() -> "Hello, " + name);
        }
        greeters.forEach(g -> System.out.println(g.get()));

        // 5. Fields can be updated: the rule is about local variables only
        CaptureRules app = new CaptureRules();
        Runnable bump = () -> {
            app.instanceCounter++;
            staticCounter++;
        };
        bump.run();
        bump.run();
        System.out.println(app.instanceCounter + " " + staticCounter);
    }
}
```

```text
true false
8
[started, started]
Hello, Ada
Hello, Linus
2 2
```

### What effectively final actually constrains

Read case 3 carefully, because it is the heart of this lesson. The rule constrains **reassignment of the captured local variable itself**. It says nothing about the object that variable refers to.

- `log = new ArrayList<>();` anywhere in the method would be a reassignment, so the lambda would no longer compile.
- `log.add("started")` is not a reassignment of `log`. It mutates the list object, and that is allowed.
- Variables declared inside the lambda body (like `sum`) and the lambda's own parameters (like `n`) are not captured at all, so the rule does not apply to them.
- Fields (`instanceCounter`, `staticCounter`) are reached through `this` or the class, not copied, so they can be modified.

An analogy: capturing a local is like handing someone a photocopy of a note that contains a house address. They cannot change what is written on your note, and you promise not to change yours either, so the two copies always agree. But nothing stops anyone from walking to that house and rearranging the furniture.

### Why the rule exists

When the lambda object is created, Java copies the *current value* of each captured local into it. The lambda may run much later, possibly on another thread, possibly after the method that created it has returned and its stack frame is gone. If the local could still be reassigned, the lambda's copy and the method's variable could silently disagree. Requiring effectively final values makes the copy indistinguishable from the original.

### The rule does not make lambdas safe

Because mutation of captured objects is allowed, effectively final capture gives you **no guarantee of purity and no guarantee of thread safety**. If a lambda that adds to a captured `ArrayList` is executed concurrently by several threads (for example in a parallel stream or a thread pool), the list can lose elements or throw exceptions, because `ArrayList` is not thread-safe. The code compiles perfectly; the bug appears only at run time and not on every run.

> **Warning:** "It compiled, so the lambda cannot change anything" is false. The compiler checks one narrow rule about local variable reassignment. Shared mutable objects captured by a lambda are exactly as dangerous as shared mutable objects anywhere else.

## `this` inside a lambda

An anonymous class creates a new object, so `this` inside it refers to that anonymous object. A lambda does not introduce a new scope for names, so `this` means exactly what it means in the enclosing method.

```java
public class ThisInLambda {
    private final String label = "the ThisInLambda object";

    @Override
    public String toString() {
        return label;
    }

    void show() {
        Runnable anonymous = new Runnable() {
            @Override
            public void run() {
                // `this` is the anonymous Runnable itself
                System.out.println("anonymous: this is a Runnable? " + (this instanceof Runnable));
                System.out.println("anonymous: outer = " + ThisInLambda.this);
            }
        };
        // `this` inside a lambda means exactly what it means in show()
        Runnable lambda = () -> System.out.println("lambda: this = " + this);

        anonymous.run();
        lambda.run();
    }

    public static void main(String[] args) {
        new ThisInLambda().show();
    }
}
```

```text
anonymous: this is a Runnable? true
anonymous: outer = the ThisInLambda object
lambda: this = the ThisInLambda object
```

A consequence: a lambda that uses `this` (or any instance field or method) captures the enclosing object and keeps it reachable for as long as the lambda lives. Registering such a lambda as a long-lived listener can keep a large object in memory longer than you expect.

## What happens under the hood

You do not need these details to write lambdas, but they explain the rules.

1. The compiler turns the lambda body into a private synthetic method in the enclosing class. Captured values become extra parameters of that method.
2. At the place where the lambda appears, the compiler emits an `invokedynamic` instruction instead of creating an anonymous class file.
3. The first time that instruction runs, the JVM's `LambdaMetafactory` generates a small hidden class that implements the target functional interface and forwards the call to the synthetic method.
4. Each evaluation of the lambda expression produces an object of that hidden class, holding copies of the captured values. A lambda that captures nothing may be reused as a single instance, but that is an implementation choice, not a promise, so never compare lambdas with `==`.

Step 4 is why captured locals must be effectively final: the object stores a copy of the value, not a live link to the variable.

## Anonymous class versus lambda

| Aspect | Anonymous class | Lambda expression |
|---|---|---|
| Can implement | Any interface or extend a class, with any number of methods | Only a functional interface |
| Meaning of `this` | The anonymous object | The enclosing instance |
| Can declare fields or state | Yes | No |
| Local capture rule | Final or effectively final | Final or effectively final |
| Shadowing enclosing locals | Allowed (new scope) | Not allowed (same scope) |
| Compiled form | A separate `.class` file | `invokedynamic` plus a runtime-generated hidden class |

## Common mistakes

### Mistake 1: reassigning a captured local

```java
// Wrong
int minimum = 4;
Predicate<String> longEnough = text -> text.length() >= minimum;
minimum = 5;
```

```text
error: local variables referenced from a lambda expression must be final or effectively final
        Predicate<String> longEnough = text -> text.length() >= minimum;
                                                                ^
```

The error points at the lambda, but the cause is the later reassignment. Fix it by introducing a separate variable for the new value, or by making the threshold a parameter of a method that builds the predicate: `static Predicate<String> atLeast(int min) { return t -> t.length() >= min; }`.

### Mistake 2: counting inside a lambda

```java
// Wrong
int count = 0;
List.of("a", "bb", "ccc").forEach(s -> count++);
```

```text
error: local variables referenced from a lambda expression must be final or effectively final
        List.of("a", "bb", "ccc").forEach(s -> count++);
                                               ^
```

Beginners often "fix" this with `int[] count = {0}` or an `AtomicInteger`. That compiles because the array reference is effectively final, but it hides a mutable accumulator inside behavior that may later run concurrently. Prefer computing the result directly: `long count = list.size();` or `list.stream().filter(...).count()`.

### Mistake 3: capturing a classic `for` loop counter

```java
// Wrong
for (int i = 0; i < 3; i++) {
    tasks.add(() -> i * 10);
}
```

`i` is reassigned by `i++`, so it is not effectively final and you get the same "must be final or effectively final" error. Copy it inside the loop (`int index = i;` then capture `index`) or use an enhanced `for` loop, which declares a fresh variable for each iteration.

### Mistake 4: reusing a local name as a lambda parameter

```java
// Wrong
String text = "outer";
Predicate<String> p = text -> text.isEmpty();
```

```text
error: variable text is already defined in method main(String[])
```

Choose a different parameter name. Lambdas share the enclosing scope.

### Mistake 5: using `var` for a lambda

`var f = (String s) -> s.isEmpty();` fails with "lambda expression needs an explicit target-type". Declare the functional interface type instead.

## Best practices

- Keep lambdas short. If a lambda grows beyond a few lines, move the logic into a named method and refer to it; the name documents the intent and the method can be unit tested.
- Prefer lambdas that compute a result from their parameters over lambdas that mutate captured objects.
- Treat any captured mutable object as shared state. Ask: can this lambda run on another thread, or run later than I expect?
- Put `@FunctionalInterface` on every interface you intend to be implemented by lambdas, so a later edit that adds a second abstract method fails at compile time.
- Give lambda parameters meaningful names in anything longer than a one-liner: `order -> order.total()` reads better than `o -> o.total()` in complex code.
- Do not rely on lambda identity (`==`) or on `toString()` of a lambda; both are implementation details.
- Be aware that capturing `this` keeps the enclosing object alive, which matters for listeners and caches.

## Summary

- A lambda is an implementation of a functional interface: an interface with exactly one abstract method.
- A lambda has no type of its own; its target type comes from assignment, method-argument, return, or cast context. `var` cannot supply one.
- The same lambda text can target different interfaces, producing objects with different method names.
- Captured local variables and parameters must be final or effectively final: they must never be reassigned.
- Effectively final restricts reassignment of the captured variable only. The object it refers to can still be mutated, so races and impurity remain possible.
- Fields, lambda parameters, and variables declared inside the lambda body are not restricted by the capture rule.
- `this` inside a lambda refers to the enclosing instance, not to the lambda.

## Practice

### Warm-up

1. Rewrite three anonymous classes from earlier chapters (a `Comparator`, a `Runnable`, and a custom single-method interface) as lambdas.
2. Write `Predicate<String>` values for "is empty", "is all uppercase", and "has at least N characters", and decide what each should do when the input is `null`.

### Core

1. Write a method `static Predicate<String> longerThan(int limit)` that returns a lambda capturing its parameter. Call it with two different limits and explain why each predicate remembers its own limit.
2. Take a method that counts matching words by incrementing a captured `int[]` inside `forEach`. Rewrite it so the count is calculated as a result instead of accumulated through a side effect.
3. Declare `@FunctionalInterface interface PriceRule { long apply(long cents); }` and write three lambdas for it. Then add a second abstract method and record the exact compiler error.

### Challenge

1. Write a program where a lambda adds to a captured `ArrayList` and is run from several threads. Do not claim a specific output; instead, describe the possible failures and explain why effectively final capture did not prevent them. Then redesign it so each task returns its value and one thread assembles the result.

## Check your understanding

1. Why can the same lambda text become a `Predicate<String>` in one statement and a `Function<String, Boolean>` in another?
2. Which four contexts can supply a lambda's target type, and why does `var` fail to provide one?
3. A lambda captures a local `List` and calls `add` on it. Does this compile? What does the effectively-final rule guarantee, and what does it leave open?
4. Why is capturing the counter of a classic `for` loop rejected, while capturing the variable of an enhanced `for` loop is accepted?
5. How does `this` inside a lambda differ from `this` inside an anonymous class, and what memory consequence can that have?
6. Why does the JVM's strategy of copying captured values explain the need for the effectively-final rule?
