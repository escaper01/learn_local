# Predicate, Function, Consumer, Supplier, and primitive variants

In the previous lesson you wrote your own functional interfaces. In real projects you rarely need to, because the package `java.util.function` already contains more than forty ready-made ones. Every stream operation, every `Optional` method, and most modern library APIs are built on them. If you can look at a piece of behavior and immediately name the right standard interface for it, you can read and write modern Java fluently.

The trick is that you do not memorize forty names. You learn four core shapes, a few naming rules, and one question: *what goes in, and what comes out?*

What you will learn:

- The four core interfaces `Predicate`, `Function`, `Consumer`, and `Supplier`, plus `Runnable`
- The operator variants `UnaryOperator` and `BinaryOperator`, and the two-argument `Bi` variants
- The naming scheme behind primitive specializations such as `IntPredicate`, `ToIntFunction`, and `IntUnaryOperator`
- Why primitive specializations exist and when they matter
- How to choose an interface by data flow, and what each choice promises (and does not promise) to callers
- How to write methods that accept behavior as a parameter
- What to do when your lambda needs to throw a checked exception

## The four core shapes

Picture each interface as a machine with an input slot and an output slot.

- **Predicate** asks a yes/no question: something goes in, `true` or `false` comes out.
- **Function** transforms: something goes in, something (possibly of a different type) comes out.
- **Consumer** does a job: something goes in, nothing comes out. Its whole purpose is a side effect, such as printing, saving, or sending.
- **Supplier** produces: nothing goes in, something comes out.
- **Runnable** (from `java.lang`) is the fifth, degenerate shape: nothing in, nothing out.

| Interface | Abstract method | Input | Output | Typical use |
|---|---|---|---|---|
| `Predicate<T>` | `boolean test(T t)` | one `T` | `boolean` | filtering, validation, rules |
| `Function<T, R>` | `R apply(T t)` | one `T` | one `R` | mapping, parsing, converting |
| `Consumer<T>` | `void accept(T t)` | one `T` | nothing | printing, logging, saving |
| `Supplier<T>` | `T get()` | nothing | one `T` | factories, lazy defaults, IDs |
| `Runnable` | `void run()` | nothing | nothing | tasks, callbacks |
| `UnaryOperator<T>` | `T apply(T t)` | one `T` | one `T` | same-type transformation |
| `BinaryOperator<T>` | `T apply(T a, T b)` | two `T` | one `T` | combining, reducing |
| `BiFunction<T, U, R>` | `R apply(T t, U u)` | `T` and `U` | one `R` | two-input transformation |
| `BiPredicate<T, U>` | `boolean test(T t, U u)` | `T` and `U` | `boolean` | two-input rules |
| `BiConsumer<T, U>` | `void accept(T t, U u)` | `T` and `U` | nothing | `Map.forEach`, key/value actions |

`UnaryOperator<T>` is simply a `Function<T, T>`, and `BinaryOperator<T>` is a `BiFunction<T, T, T>`. They exist because "same type in, same type out" is so common that a shorter name helps.

Here is every core interface in one complete program.

```java
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.BiFunction;
import java.util.function.BiPredicate;
import java.util.function.BinaryOperator;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;
import java.util.function.UnaryOperator;

public class CoreInterfaces {
    public static void main(String[] args) {
        // Predicate<T>: T -> boolean   (a yes/no question)
        Predicate<String> isBlank = s -> s.isBlank();
        System.out.println("Predicate: " + isBlank.test("   "));

        // Function<T, R>: T -> R   (transform an input into a result)
        Function<String, Integer> wordCount = s -> s.trim().split("\\s+").length;
        System.out.println("Function: " + wordCount.apply("learn java streams"));

        // Consumer<T>: T -> nothing   (do something with the input)
        List<String> audit = new ArrayList<>();
        Consumer<String> record = msg -> audit.add("AUDIT " + msg);
        record.accept("login");
        System.out.println("Consumer: " + audit);

        // Supplier<T>: nothing -> T   (produce a value on demand)
        Supplier<List<String>> freshList = () -> new ArrayList<>();
        List<String> a = freshList.get();
        List<String> b = freshList.get();
        System.out.println("Supplier: new object each call? " + (a != b));

        // UnaryOperator<T>: T -> T   (a Function whose input and output types match)
        UnaryOperator<String> shout = s -> s.toUpperCase() + "!";
        System.out.println("UnaryOperator: " + shout.apply("hello"));

        // BinaryOperator<T>: (T, T) -> T   (combine two values of the same type)
        BinaryOperator<Integer> larger = (x, y) -> x >= y ? x : y;
        System.out.println("BinaryOperator: " + larger.apply(7, 12));

        // Two-argument variants
        BiFunction<String, Integer, String> repeat = (s, n) -> s.repeat(n);
        BiPredicate<String, Integer> hasLength = (s, n) -> s.length() == n;
        BiConsumer<String, Integer> show = (name, score) -> System.out.println("BiConsumer: " + name + "=" + score);
        System.out.println("BiFunction: " + repeat.apply("ab", 3));
        System.out.println("BiPredicate: " + hasLength.test("Java", 4));
        show.accept("Ada", 97);

        // Useful static and default helpers
        Predicate<String> notBlank = Predicate.not(isBlank);
        Function<String, String> same = Function.identity();
        System.out.println("Predicate.not: " + notBlank.test("x") + ", identity: " + same.apply("unchanged"));
    }
}
```

```text
Predicate: true
Function: 3
Consumer: [AUDIT login]
Supplier: new object each call? true
UnaryOperator: HELLO!
BinaryOperator: 12
BiFunction: ababab
BiPredicate: true
BiConsumer: Ada=97
Predicate.not: true, identity: unchanged
```

Notice that each interface has its own method name: `test`, `apply`, `accept`, `get`. When you hold a `Predicate`, you call `test`; there is no `apply` on it. The method name is a small reminder of the shape.

## Choosing by data flow

When you need a functional type, ask two questions in order:

1. How many inputs, and of what types?
2. What comes out: a `boolean`, a value, or nothing?

| You need to... | Inputs | Output | Choose |
|---|---|---|---|
| Check whether an order is overdue | `Order` | `boolean` | `Predicate<Order>` |
| Parse a CSV line into a `Customer` | `String` | `Customer` | `Function<String, Customer>` |
| Send an email | `Email` | nothing | `Consumer<Email>` |
| Generate a new ID | nothing | `String` | `Supplier<String>` |
| Normalize a name | `String` | `String` | `UnaryOperator<String>` |
| Combine two subtotals | two `Money` | `Money` | `BinaryOperator<Money>` |
| Check if a user may edit a document | `User`, `Document` | `boolean` | `BiPredicate<User, Document>` |

The key distinction for everyday code: a **Function takes an input and returns a transformed result**. A Consumer takes an input but returns nothing. A Runnable takes nothing and returns nothing. If the caller needs a value back, only the Function family (including the operators) fits.

## What each shape promises, and what it does not

The type is a contract with the reader. Choosing it well sets expectations; abusing it misleads.

- A `Predicate` is read as a question. Callers expect that asking twice gives the same answer and changes nothing. A predicate that secretly updates an account balance or increments a counter violates that expectation, and it will misbehave when a stream evaluates it a different number of times than you imagined.
- A `Consumer` signals "this does something". It does *not* imply purity. In fact, since it returns nothing, a consumer that has no side effect is useless.
- A `Supplier` promises only "no arguments". It does not promise that every call returns the same value, a new value, or a cached value. `() -> new ArrayList<>()` returns a fresh list each time; `() -> sharedList` returns the same object every time; `() -> UUID.randomUUID()` returns something different each time. Document which one you mean.
- "No arguments" also does not mean *safe to call twice*. A supplier that charges a credit card must not be passed to a retry helper that may call it several times.

> **Warning:** Because a `Supplier` may be called zero, one, or many times by the code you hand it to, always ask whether repeating the call is harmless. This property is called *idempotency*, and it is never implied by the type.

## Primitive specializations

Generics in Java only work with reference types. A `Function<Integer, Integer>` receives an `Integer` object, unboxes it to `int`, computes, and boxes a new `Integer` for the result. In a tight loop over millions of numbers this *autoboxing* creates garbage and costs time. Primitive specializations take and return `int`, `long`, `double`, or `boolean` directly.

The names follow a consistent scheme:

| Pattern | Meaning | Example | Method |
|---|---|---|---|
| `IntX` | the *input* is `int` | `IntPredicate`, `IntFunction<R>`, `IntConsumer` | `test(int)`, `apply(int)`, `accept(int)` |
| `ToIntX` | the *output* is `int` | `ToIntFunction<T>`, `ToIntBiFunction<T, U>` | `applyAsInt(T)` |
| `IntToLongX` | `int` in, `long` out | `IntToLongFunction`, `IntToDoubleFunction` | `applyAsLong(int)` |
| `IntUnaryOperator` | `int` in, `int` out | `IntUnaryOperator` | `applyAsInt(int)` |
| `IntBinaryOperator` | two `int` in, `int` out | `IntBinaryOperator` | `applyAsInt(int, int)` |
| `IntSupplier` | nothing in, `int` out | `IntSupplier`, `BooleanSupplier` | `getAsInt()`, `getAsBoolean()` |
| `ObjIntConsumer<T>` | a `T` and an `int` in, nothing out | `ObjIntConsumer<T>` | `accept(T, int)` |

The same families exist for `long` and `double` (`LongPredicate`, `ToDoubleFunction`, `DoubleUnaryOperator`, and so on). There are no `byte`, `short`, `char`, or `float` versions; those values widen to `int` or `double`.

```java
import java.util.List;
import java.util.function.DoubleUnaryOperator;
import java.util.function.Function;
import java.util.function.IntBinaryOperator;
import java.util.function.IntFunction;
import java.util.function.IntPredicate;
import java.util.function.IntSupplier;
import java.util.function.IntUnaryOperator;
import java.util.function.ObjIntConsumer;
import java.util.function.ToIntFunction;

public class PrimitiveVariants {
    record Item(String name, int priceCents) {}

    public static void main(String[] args) {
        // Boxed version: every call unboxes an Integer and boxes a new result
        Function<Integer, Integer> boxedSquare = n -> n * n;
        // Primitive version: int in, int out, no wrapper objects
        IntUnaryOperator square = n -> n * n;
        System.out.println(boxedSquare.apply(9) + " " + square.applyAsInt(9));

        IntPredicate isEven = n -> n % 2 == 0;               // int -> boolean
        IntBinaryOperator addExact = Math::addExact;          // (int, int) -> int
        IntFunction<String> stars = n -> "*".repeat(n);       // int -> R
        ToIntFunction<Item> price = Item::priceCents;         // T -> int
        IntSupplier answer = () -> 42;                        // () -> int
        DoubleUnaryOperator withTax = amount -> amount * 1.2; // double -> double
        ObjIntConsumer<String> printTimes = (s, n) -> System.out.println(s.repeat(n));

        System.out.println(isEven.test(10) + " " + isEven.test(7));
        System.out.println(addExact.applyAsInt(40, 2));
        System.out.println(stars.apply(5));
        System.out.println(answer.getAsInt());
        System.out.println(withTax.applyAsDouble(10.0));
        printTimes.accept("ab", 3);

        // A primitive specialization in a realistic calculation
        List<Item> cart = List.of(new Item("book", 1_999), new Item("pen", 250), new Item("mug", 899));
        int total = 0;
        for (Item item : cart) {
            total = addExact.applyAsInt(total, price.applyAsInt(item));
        }
        System.out.println("total cents = " + total);

        // Composition works on primitive operators too
        IntUnaryOperator plusOne = n -> n + 1;
        System.out.println(square.andThen(plusOne).applyAsInt(3) + " " + square.compose(plusOne).applyAsInt(3));
    }
}
```

```text
81 81
true false
42
*****
42
12.0
ababab
total cents = 3148
10 16
```

The last line previews the next lesson: `square.andThen(plusOne)` squares first and then adds one (9 + 1 = 10), while `square.compose(plusOne)` adds one first and then squares (4 squared = 16).

> **Note:** `Math::addExact` throws `ArithmeticException` on overflow instead of silently wrapping around. Choosing it inside a money calculation is a deliberate policy, not decoration.

## Writing methods that accept behavior

The real payoff of standard interfaces is that you can write *general* methods whose details are supplied by the caller. This is called **behavior parameterization**. Compare it with writing `keepValidEmails`, `keepLongNames`, and `keepOverdueOrders` as three separate loops.

```java
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;

public class BehaviorParameters {
    // Keep only the elements for which the predicate answers true
    static <T> List<T> keep(List<T> items, Predicate<? super T> rule) {
        List<T> result = new ArrayList<>();
        for (T item : items) {
            if (rule.test(item)) {
                result.add(item);
            }
        }
        return result;
    }

    // Turn every element into something else
    static <T, R> List<R> transform(List<T> items, Function<? super T, ? extends R> f) {
        List<R> result = new ArrayList<>();
        for (T item : items) {
            result.add(f.apply(item));
        }
        return result;
    }

    // Retry an operation. Only safe if repeated get() calls are acceptable!
    static <T> T retry(Supplier<T> operation, int maxAttempts) {
        RuntimeException last = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return operation.get();
            } catch (RuntimeException e) {
                System.out.println("attempt " + attempt + " failed: " + e.getMessage());
                last = e;
            }
        }
        throw last;
    }

    static int calls = 0;

    static String flakyLookup() {
        calls++;
        if (calls < 3) {
            throw new IllegalStateException("service busy");
        }
        return "record #17";
    }

    public static void main(String[] args) {
        List<String> emails = List.of("ada@example.org", "not-an-email", "linus@example.org");

        List<String> valid = keep(emails, e -> e.contains("@"));
        List<Integer> lengths = transform(valid, String::length);
        Consumer<String> printer = s -> System.out.println("send to " + s);

        System.out.println(valid);
        System.out.println(lengths);
        valid.forEach(printer);

        String result = retry(BehaviorParameters::flakyLookup, 5);
        System.out.println(result + " after " + calls + " calls");
    }
}
```

```text
[ada@example.org, linus@example.org]
[15, 17]
send to ada@example.org
send to linus@example.org
attempt 1 failed: service busy
attempt 2 failed: service busy
record #17 after 3 calls
```

Two professional details in the signatures:

- `Predicate<? super T>` accepts a predicate written for a supertype. A `Predicate<Object>` or `Predicate<CharSequence>` can filter a `List<String>`. This is the "consumer super" half of the PECS rule you met with generics.
- `Function<? super T, ? extends R>` accepts functions that take a supertype and return a subtype. The standard library uses exactly this form in `Stream.map`.

`keep` and `transform` are loop-based versions of what streams call `filter` and `map`. You will use the stream versions in the next chapter, but it is valuable to see that there is no magic: a stream operation is a loop that calls your lambda.

## When the standard interfaces do not fit

### Checked exceptions

None of the `java.util.function` methods declare checked exceptions. A lambda that calls a method throwing `IOException` therefore cannot target `Function`:

```java
// Fragment: does not compile
Function<Path, String> read = path -> Files.readString(path);
```

```text
error: unreported exception IOException; must be caught or declared to be thrown
        Function<Path, String> read = path -> Files.readString(path);
                                                              ^
```

Options, in order of preference: handle the exception inside the lambda in a way that is meaningful for the domain; declare your own functional interface whose method `throws IOException`; or wrap the checked exception in an unchecked one at a clearly defined boundary.

```java
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.function.Function;

public class ThrowingFunctionDemo {
    @FunctionalInterface
    interface ThrowingFunction<T, R> {
        R apply(T input) throws IOException;
    }

    static <T, R> Function<T, R> unchecked(ThrowingFunction<T, R> f) {
        return input -> {
            try {
                return f.apply(input);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        };
    }

    static String load(String name) throws IOException {
        if (name.isEmpty()) {
            throw new IOException("empty resource name");
        }
        return "contents of " + name;
    }

    public static void main(String[] args) {
        Function<String, String> loader = unchecked(ThrowingFunctionDemo::load);
        System.out.println(loader.apply("config.txt"));
        try {
            loader.apply("");
        } catch (UncheckedIOException e) {
            System.out.println("wrapped: " + e.getCause().getMessage());
        }
    }
}
```

```text
contents of config.txt
wrapped: empty resource name
```

`UncheckedIOException` keeps the original `IOException` as its cause, so no diagnostic information is lost.

### Domain names and more parameters

There is no standard three-argument function. When you need one, or when a domain name would make code clearer than a generic shape (`TaxRule` rather than `Function<Invoice, Money>`), declare your own `@FunctionalInterface`. The trade-off is that your interface does not inherit helper methods such as `andThen` unless you write them.

## Under the hood: why `IntStream` and `IntPredicate` exist together

A `Predicate<Integer>` called on a primitive value goes through three steps: box the `int` into an `Integer` (possibly allocating), call `test`, and unbox inside the lambda body. `IntPredicate.test(int)` skips the first and last steps. The JIT compiler can sometimes eliminate boxing, but you should not rely on it for performance-critical numeric code. The standard library pairs every primitive stream (`IntStream`, `LongStream`, `DoubleStream`) with matching primitive functional interfaces so that whole pipelines can stay unboxed.

## Common mistakes

### Mistake 1: calling the wrong method name

```java
// Wrong
Predicate<String> isBlank = s -> s.isBlank();
boolean b = isBlank.apply(" ");
```

```text
error: cannot find symbol
  symbol:   method apply(String)
  location: variable isBlank of type Predicate<String>
```

Fix: call `test`. Each interface has its own method name.

### Mistake 2: choosing Consumer when a result is needed

```java
// Wrong
Consumer<String> upper = s -> s.toUpperCase();
String r = upper.accept("x");
```

```text
error: incompatible types: void cannot be converted to String
```

The first line compiles (the result of `toUpperCase` is silently discarded), which is exactly why this is dangerous. If the caller needs a value, use `Function<String, String>` or `UnaryOperator<String>`.

### Mistake 3: boxed types in numeric hot paths

`Function<Integer, Integer>` and `BinaryOperator<Integer>` work, but in large numeric loops prefer `IntUnaryOperator` and `IntBinaryOperator`. Also remember that comparing two `Integer` objects with `==` compares references, not values.

### Mistake 4: a predicate with side effects

```java
// Wrong: the "question" changes state
Predicate<Account> canWithdraw = acc -> {
    acc.lockFunds(100);          // side effect hidden in a yes/no question
    return acc.balance() >= 100;
};
```

Callers may evaluate a predicate several times, or not at all when an earlier condition short-circuits. Keep predicates free of side effects and perform the action separately.

### Mistake 5: assuming a Supplier caches

`Supplier<Config> config = () -> loadConfigFromDisk();` reads the disk on every `get()` call. If you want the value computed once, compute it once and keep the result, or build an explicit memoizing wrapper.

## Best practices

- Choose the interface by data flow first, then check that its implied meaning (question, transformation, action, production) matches your intent.
- Prefer standard interfaces in public APIs; they compose with streams, `Optional`, and library helpers.
- Use primitive specializations for numeric work on large data.
- Accept `? super T` for inputs and `? extends R` for outputs in generic higher-order methods.
- Document Supplier semantics: fresh or shared value, cost of each call, and whether repeated calls are safe.
- Introduce a custom functional interface for checked exceptions, more than two parameters, or when a domain name makes intent clearer.

## Summary

- `Predicate<T>` answers a yes/no question, `Function<T, R>` transforms an input into a result, `Consumer<T>` acts without returning, `Supplier<T>` produces without input, and `Runnable` does neither.
- `UnaryOperator` and `BinaryOperator` are same-type specializations of `Function` and `BiFunction`; `Bi` variants take two inputs.
- Primitive specializations follow a naming scheme (`IntX`, `ToIntX`, `IntToLongX`, `XAsInt`) and avoid boxing.
- A type describes shape, not safety: a Supplier is not automatically idempotent and a Consumer is not pure.
- Standard functional interfaces cannot throw checked exceptions; handle, wrap, or define your own interface.

## Practice

### Warm-up

1. For each task, name the best interface: parse a line into a `Product`, generate an order number, send an SMS, check whether a user is an administrator, combine two totals, double every `int` in an array.
2. Rewrite `Function<Integer, Boolean> isPositive` using the most specific standard interface.

### Core

1. Write a generic method `static <T> int countMatching(List<T> items, Predicate<? super T> rule)` and use it with a `Predicate<Object>` on a `List<String>`.
2. Write `static <T> void forEachIndexed(List<T> items, ObjIntConsumer<T> action)` and use it to print numbered lines.
3. Build a `retry` helper and write down, in a comment above it, the conditions a caller's Supplier must satisfy before being passed in.

### Challenge

1. Design a `@FunctionalInterface TriFunction<A, B, C, R>` with a default `andThen` method that accepts a `Function<? super R, ? extends V>`. Test it with a three-argument price calculation.

## Check your understanding

1. Which standard interface describes turning an input into a transformed result, and how does it differ from Consumer and Runnable?
2. What does the name `ToDoubleFunction<Order>` tell you about its input, output, and method name?
3. Why might a `Predicate` with a side effect behave differently from what its author expected?
4. What exactly does a `Supplier` promise, and what must be documented separately?
5. Why does a lambda calling `Files.readString` fail to compile as a `Function<Path, String>`, and what are your options?
