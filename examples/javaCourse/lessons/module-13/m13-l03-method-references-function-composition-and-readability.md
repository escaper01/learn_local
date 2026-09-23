# Method references, function composition, and readability

Once you are comfortable with lambdas, you will notice that many of them do nothing except call one existing method: `s -> s.trim()`, `n -> Integer.parseInt(n)`, `x -> System.out.println(x)`. Java lets you name that method directly with a **method reference** such as `String::trim`. Separately, the standard functional interfaces carry default methods like `andThen`, `compose`, `and`, `or`, and `negate` that let you build bigger behavior out of small, tested pieces, the way you plug pipes together.

Used well, these two tools produce code that reads like a sentence. Used carelessly, they produce puzzles. This lesson teaches both the mechanics and the judgment.

What you will learn:

- The four kinds of method reference and the lambda each one abbreviates
- How the compiler decides which argument becomes the receiver in an unbound reference
- Why a bound method reference evaluates its receiver immediately, and what that means for `null`
- How `Function.andThen` and `Function.compose` order their steps
- How to combine predicates with `and`, `or`, `negate`, and `Predicate.not`, including short-circuiting
- How `Comparator` composition works
- When a method reference or composed chain helps readability and when a named method is better

## The four kinds of method reference

A method reference uses the `::` operator. Like a lambda, it has no type of its own; it needs a target functional interface, and the referenced method must be compatible with that interface's method.

| Kind | Syntax | Example | Equivalent lambda |
|---|---|---|---|
| Static method | `ClassName::staticMethod` | `Integer::parseInt` | `s -> Integer.parseInt(s)` |
| Bound instance method | `expression::method` | `System.out::println` | `x -> System.out.println(x)` |
| Unbound instance method | `ClassName::instanceMethod` | `String::trim` | `s -> s.trim()` |
| Constructor | `ClassName::new` | `ArrayList::new` | `() -> new ArrayList<>()` |

The difference between *bound* and *unbound* is the heart of the topic:

- **Bound**: the object that receives the call is fixed when the reference is created. `prefix::concat` always calls `concat` on that particular `prefix` string; the functional method's arguments become the method's arguments.
- **Unbound**: no object is fixed. The **first parameter** of the functional method becomes the receiver, and any remaining parameters become the method's arguments. `String::trim` as a `Function<String, String>` means "given a string `s`, call `s.trim()`".

```java
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.IntFunction;
import java.util.function.Supplier;

public class MethodRefKinds {
    record Point(int x, int y) {}

    public static void main(String[] args) {
        // 1. Static method: ClassName::staticMethod
        Function<String, Integer> parseLambda = s -> Integer.parseInt(s);
        Function<String, Integer> parseRef = Integer::parseInt;
        System.out.println("static: " + parseLambda.apply("42") + " " + parseRef.apply("42"));

        // 2. Bound instance method: expression::method (receiver fixed now)
        String prefix = "ID-";
        Function<String, String> tagLambda = s -> prefix.concat(s);
        Function<String, String> tagRef = prefix::concat;
        Consumer<String> printer = System.out::println;   // receiver is System.out
        printer.accept("bound: " + tagLambda.apply("7") + " " + tagRef.apply("7"));

        // 3. Unbound instance method: ClassName::instanceMethod
        //    the FIRST argument becomes the receiver
        Function<String, String> trimLambda = s -> s.trim();
        Function<String, String> trimRef = String::trim;
        System.out.println("unbound: [" + trimLambda.apply("  hi ") + "] [" + trimRef.apply("  hi ") + "]");

        //    with two parameters: first is the receiver, second is the argument
        BiFunction<String, String, Boolean> startsWith = String::startsWith; // (s, p) -> s.startsWith(p)
        Comparator<String> ignoreCase = String::compareToIgnoreCase;       // (a, b) -> a.compareToIgnoreCase(b)
        List<String> langs = new ArrayList<>(List.of("python", "Java", "go"));
        langs.sort(ignoreCase);
        System.out.println("unbound, two args: " + startsWith.apply("Java", "Ja") + " " + langs);

        // 4. Constructor: ClassName::new
        Supplier<List<String>> listFactory = ArrayList::new;          // () -> new ArrayList<>()
        BiFunction<Integer, Integer, Point> pointFactory = Point::new; // (x, y) -> new Point(x, y)
        IntFunction<int[]> arrayFactory = int[]::new;                 // n -> new int[n]
        List<String> fresh = listFactory.get();
        fresh.add("created");
        System.out.println("constructor: " + fresh + " " + pointFactory.apply(3, 4)
                + " " + Arrays.toString(arrayFactory.apply(3)));
    }
}
```

```text
static: 42 42
bound: ID-7 ID-7
unbound: [hi] [hi]
unbound, two args: true [go, Java, python]
constructor: [created] Point[x=3, y=4] [0, 0, 0]
```

Observe how the target type chooses the constructor: `ArrayList::new` as a `Supplier` calls the no-argument constructor, and `Point::new` as a `BiFunction<Integer, Integer, Point>` calls the two-argument canonical constructor. Array constructor references such as `int[]::new` are used, for example, by `stream.toArray(String[]::new)`.

### How to read an unbound reference

To decode `Type::method` against a target interface, line up the parameters:

1. Write down the functional method's parameters, for example `compare(String a, String b)`.
2. The first parameter (`a`) must be a `Type` (here `String`); it becomes the receiver.
3. The remaining parameters (`b`) must match the arguments of `method`.
4. So `String::compareToIgnoreCase` means `a.compareToIgnoreCase(b)`.

If both a static method and an instance method could match, the compiler reports ambiguity rather than guessing (see Common mistakes).

## Bound references evaluate their receiver immediately

A lambda body runs only when the lambda is called. A bound method reference is different: the expression before `::` is evaluated **when the reference is created**, and the resulting object is stored. This has two visible consequences.

```java
import java.util.function.Supplier;

public class BoundReceiverTiming {
    public static void main(String[] args) {
        // The receiver of a bound method reference is evaluated immediately
        StringBuilder current = new StringBuilder("first");
        Supplier<String> viaReference = current::toString;   // receiver captured now
        current = new StringBuilder("second");               // allowed: not a lambda capture
        System.out.println("reference sees: " + viaReference.get());

        // A lambda would need `current` to be effectively final, so copy it first
        StringBuilder snapshot = current;
        Supplier<String> viaLambda = () -> snapshot.toString();
        System.out.println("lambda sees: " + viaLambda.get());

        // Null receivers fail at different moments
        String missing = null;
        Supplier<Integer> lazyLambda = () -> missing.length();  // nothing happens yet
        System.out.println("lambda created without error");
        try {
            Supplier<Integer> eagerRef = missing::length;       // fails right here
            System.out.println("never printed " + eagerRef);
        } catch (NullPointerException e) {
            System.out.println("method reference failed at creation");
        }
        try {
            lazyLambda.get();
        } catch (NullPointerException e) {
            System.out.println("lambda failed only when called");
        }
    }
}
```

```text
reference sees: first
lambda sees: second
lambda created without error
method reference failed at creation
lambda failed only when called
```

- Because the receiver is evaluated once, a variable used as the receiver does not have to be effectively final. The reference keeps the *object* it saw, not the variable.
- A `null` receiver throws `NullPointerException` at creation time, not at call time.
- The stored receiver stays reachable as long as the reference lives. A bound reference to a large object held in a long-lived listener keeps that object in memory.

## Function composition: `andThen` and `compose`

`Function<T, R>` has two default methods that glue functions together:

- `f.andThen(g)` returns a function that runs **`f` first**, then passes its result to `g`. Read it left to right: "f, and then g".
- `f.compose(g)` returns a function that runs **`g` first**, then passes its result to `f`. This matches the mathematical notation f(g(x)).

The function you call `andThen` on always goes first. The following program prints a trace so you can watch the order.

```java
import java.util.function.Function;

public class CompositionOrder {
    public static void main(String[] args) {
        Function<String, String> trim = s -> {
            System.out.println("  trim(\"" + s + "\")");
            return s.trim();
        };
        Function<String, Integer> length = s -> {
            System.out.println("  length(\"" + s + "\")");
            return s.length();
        };

        System.out.println("trim.andThen(length):");
        Function<String, Integer> trimThenLength = trim.andThen(length);
        System.out.println("  result = " + trimThenLength.apply("  Java  "));

        System.out.println("length.compose(trim):");
        Function<String, Integer> sameThing = length.compose(trim);
        System.out.println("  result = " + sameThing.apply("  Java  "));

        System.out.println("length alone:");
        System.out.println("  result = " + length.apply("  Java  "));

        // Order matters even when both directions type-check
        Function<Integer, Integer> doubleIt = n -> n * 2;
        Function<Integer, Integer> addTen = n -> n + 10;
        System.out.println("doubleIt.andThen(addTen)(5) = " + doubleIt.andThen(addTen).apply(5));
        System.out.println("doubleIt.compose(addTen)(5) = " + doubleIt.compose(addTen).apply(5));
    }
}
```

```text
trim.andThen(length):
  trim("  Java  ")
  length("Java")
  result = 4
length.compose(trim):
  trim("  Java  ")
  length("Java")
  result = 4
length alone:
  length("  Java  ")
  result = 8
doubleIt.andThen(addTen)(5) = 20
doubleIt.compose(addTen)(5) = 30
```

### Step-by-step trace

For `doubleIt.andThen(addTen).apply(5)`:

1. `doubleIt` receives 5 and returns 10.
2. `addTen` receives 10 and returns 20.

For `doubleIt.compose(addTen).apply(5)`:

1. `addTen` receives 5 and returns 15.
2. `doubleIt` receives 15 and returns 30.

Also notice that building the composed function prints nothing. `andThen` and `compose` only create a new function object; no step runs until `apply` is called.

### Types must line up

The output type of the first step must be acceptable as the input of the second. `trim.andThen(length)` works because `trim` produces a `String` and `length` accepts a `String`. Reversing it, `length.andThen(trim)`, would feed an `Integer` into a function that expects a `String`, and the compiler rejects it (message shortened):

```text
error: method andThen in interface Function<T,R> cannot be applied to given types;
        Function<String, String> broken = length.andThen(trim);
                                                ^
  required: Function<? super Integer,? extends V>
  found:    Function<String,String>
```

`UnaryOperator`, `IntUnaryOperator`, `BiFunction` (`andThen` only), and `Consumer` (`andThen` runs both consumers in order) offer similar methods.

## Composing predicates

`Predicate<T>` has boolean-logic combinators:

- `p.and(q)`: true when both are true. Short-circuits: `q` is not evaluated if `p` is false.
- `p.or(q)`: true when either is true. Short-circuits: `q` is not evaluated if `p` is true.
- `p.negate()`: the opposite of `p`.
- `Predicate.not(p)`: a static helper returning `p.negate()`. It exists because you cannot call a method directly on a method reference.
- `Predicate.isEqual(x)`: tests equality with `x` using `Objects.equals`.

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;

public class PredicateComposition {
    record Employee(String name, String team, int salary, boolean active) {}

    static Predicate<Employee> traced(String label, Predicate<Employee> p) {
        return e -> {
            boolean result = p.test(e);
            System.out.println("    " + label + "(" + e.name() + ") = " + result);
            return result;
        };
    }

    public static void main(String[] args) {
        List<Employee> staff = List.of(
                new Employee("Ada", "core", 9_000, true),
                new Employee("Bo", "web", 6_500, false),
                new Employee("Cy", "core", 5_000, true),
                new Employee("Di", "web", 8_000, true));

        Predicate<Employee> active = traced("active", Employee::active);
        Predicate<Employee> wellPaid = traced("wellPaid", e -> e.salary() >= 7_000);

        // and() short-circuits: wellPaid is not asked when active is false
        Predicate<Employee> seniorActive = active.and(wellPaid);
        for (Employee e : staff) {
            System.out.println(e.name() + " -> " + seniorActive.test(e));
        }

        // negate() and Predicate.not()
        Predicate<String> isBlank = String::isBlank;
        Predicate<String> hasText = Predicate.not(String::isBlank);
        System.out.println(isBlank.negate().test("x") + " " + hasText.test(" "));

        // or() combines alternatives
        Predicate<Employee> coreOrInactive = ((Predicate<Employee>) e -> e.team().equals("core"))
                .or(e -> !e.active());
        List<String> picked = new ArrayList<>();
        for (Employee e : staff) {
            if (coreOrInactive.test(e)) {
                picked.add(e.name());
            }
        }
        System.out.println("core or inactive: " + picked);

        // Comparators compose too
        List<Employee> sorted = new ArrayList<>(staff);
        sorted.sort(Comparator.comparing(Employee::team)
                .thenComparing(Employee::salary, Comparator.reverseOrder()));
        List<String> order = new ArrayList<>();
        sorted.forEach(e -> order.add(e.team() + ":" + e.name()));
        System.out.println(order);

        // A pipeline assembled from a list of stages
        List<UnaryOperator<String>> stages = List.of(String::strip, s -> s.replaceAll("\\s+", " "), String::toLowerCase);
        Function<String, String> normalize = Function.identity();
        for (UnaryOperator<String> stage : stages) {
            normalize = normalize.andThen(stage);
        }
        System.out.println("[" + normalize.apply("   Hello    BIG   World ") + "]");
    }
}
```

```text
    active(Ada) = true
    wellPaid(Ada) = true
Ada -> true
    active(Bo) = false
Bo -> false
    active(Cy) = true
    wellPaid(Cy) = false
Cy -> false
    active(Di) = true
    wellPaid(Di) = true
Di -> true
true false
core or inactive: [Ada, Bo, Cy]
[core:Ada, core:Cy, web:Di, web:Bo]
[hello big world]
```

For Bo, `wellPaid` never ran, because `and` stopped as soon as `active` was false. If a predicate had a side effect, that side effect would happen for some employees and not others. That is another reason predicates should be free of side effects: composition order becomes observable when they are not.

The comparator chain reads naturally: sort by team, then by salary in reverse order. `Comparator.comparing`, `thenComparing`, `reversed`, `nullsFirst`, and `nullsLast` are all composition helpers built on the same idea.

The last block shows a useful technique: start with `Function.identity()` (a function that returns its input unchanged) and fold a list of stages together with `andThen`. The stages run in list order.

## Readability: when to use which form

A method reference is not automatically better than a lambda. Choose the form that the next reader understands fastest.

| Situation | Prefer | Why |
|---|---|---|
| Calling one well-known method with the same arguments | Method reference, e.g. `String::toUpperCase` | Names the operation directly |
| Arguments are rearranged or a constant is added | Lambda, e.g. `s -> s.substring(1)` | A reference cannot express extra arguments |
| The reference would be ambiguous or surprising | Lambda | Removes guesswork about the receiver |
| Logic spans several statements | Named private method plus a method reference | The name documents intent and can be tested |
| A composed chain has unclear intermediate types | Named stages in local variables | Each variable's type is visible |

Compare these two versions of the same validation:

```java
// Fragment: hard to read
Predicate<String> valid = ((Predicate<String>) String::isBlank).negate()
        .and(s -> s.length() <= 40).and(s -> s.chars().allMatch(Character::isLetterOrDigit));

// Fragment: named stages
Predicate<String> hasText = Predicate.not(String::isBlank);
Predicate<String> shortEnough = s -> s.length() <= 40;
Predicate<String> alphanumeric = s -> s.chars().allMatch(Character::isLetterOrDigit);
Predicate<String> valid2 = hasText.and(shortEnough).and(alphanumeric);
```

Both compile and behave identically. The second one can be read, debugged, and reused piece by piece.

## Common mistakes

### Mistake 1: assuming the argument of `andThen` runs first

`f.andThen(g)` runs `f` first. If you want `g` first, write `f.compose(g)` or, more readably, `g.andThen(f)`. When in doubt, add a trace print as in the composition program above.

### Mistake 2: calling a method on a method reference

```java
// Wrong
Predicate<String> hasText = String::isEmpty.negate();
```

```text
error: method reference not expected here
```

A method reference has no type until it meets a target, so you cannot call `negate` on it. Use `Predicate.not(String::isEmpty)`, or first assign it to a `Predicate<String>` variable.

### Mistake 3: ambiguous method references

```java
// Wrong
Function<Integer, String> text = Integer::toString;
```

```text
error: incompatible types: invalid method reference
    reference to toString is ambiguous
      both method toString(int) in Integer and method toString() in Integer match
```

Both the static `Integer.toString(int)` and the instance `n.toString()` fit. Write the lambda `n -> Integer.toString(n)` or use `String::valueOf`.

### Mistake 4: composing in an order whose types do not match

`length.andThen(trim)` fails because `Integer` is not a `String`. Before composing, write the type after each stage: `String -> String -> Integer`. The chain must flow from each output into the next input.

### Mistake 5: bound references to `null` or to objects that should be fresh

`config::value` captures the current `config` object. If `config` is `null` you get an immediate `NullPointerException`, and if `config` is later replaced, the reference keeps using the old object. Use a lambda when you intentionally want the latest value at call time.

## Best practices

- Use method references for single, well-named operations; use lambdas when arguments must be rearranged or combined.
- Extract multi-line lambdas into private methods with descriptive names, then refer to them with `ClassName::method` or `this::method`.
- Break long composition chains into named, typed stages.
- Remember that `andThen` means "this first, then that", and `compose` means "that first, then this".
- Keep predicates side-effect free so that short-circuiting in `and` and `or` never changes program behavior.
- Prefer `Predicate.not(...)` over casts when negating a method reference.
- Be deliberate about bound receivers: they are evaluated once, immediately, and kept alive.

## Summary

- There are four kinds of method reference: static (`Integer::parseInt`), bound instance (`System.out::println`), unbound instance (`String::trim`), and constructor (`ArrayList::new`, `int[]::new`).
- In an unbound reference, the first parameter of the functional method becomes the receiver.
- A bound reference evaluates its receiver immediately; a lambda evaluates its body only when called.
- `f.andThen(g)` runs `f` then `g`; `f.compose(g)` runs `g` then `f`. Building a composition runs nothing.
- Predicates combine with `and`, `or`, `negate`, and `Predicate.not`; `and` and `or` short-circuit.
- Readability decides between a reference, a lambda, and a named method.

## Practice

### Warm-up

1. Convert each lambda to a method reference, or explain why it cannot be converted: `s -> s.length()`, `s -> System.out.println(s)`, `() -> new HashMap<>()`, `s -> s.substring(2)`, `(a, b) -> a.equals(b)`.
2. For `String::equalsIgnoreCase` used as a `BiPredicate<String, String>`, write the equivalent lambda and identify the receiver.

### Core

1. Build a `normalize -> validate -> length` chain as three named `Function` variables, write the type after each stage, and combine them with `andThen`. Then build the same chain with `compose` and check that both give identical results.
2. Write predicates `isAdult`, `hasEmail`, and `isBanned` for a `Customer` record and combine them into "adult with email and not banned". Add trace output and predict which predicates run for each of four sample customers before running it.
3. Sort a list of products by category, then by price descending, then by name, using only `Comparator` composition.

### Challenge

1. Write a method `static <T> Function<T, T> pipeline(List<UnaryOperator<T>> stages)` that composes any number of stages. Test it with an empty list, and explain why `Function.identity()` is the correct starting value.

## Check your understanding

1. What is the difference between a bound and an unbound instance method reference, and how does the compiler decide the receiver of an unbound one?
2. When is the receiver of `obj::method` evaluated, and how does that differ from `() -> obj.method()`?
3. In a chain `f.andThen(g)`, which function receives the original input? What changes with `f.compose(g)`?
4. Why does `String::isEmpty.negate()` fail to compile, and what is the idiomatic alternative?
5. How can short-circuiting in `Predicate.and` make side effects inside a predicate observable?
6. Give one situation where a lambda is clearer than the equivalent method reference.
