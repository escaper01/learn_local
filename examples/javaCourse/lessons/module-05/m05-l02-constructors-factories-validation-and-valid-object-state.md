# Constructors, factories, validation, and valid object state

In the previous lesson you created objects with `new Book()` and then filled in fields one by one. Between those steps the object existed in a half-built state: a book with no title, an account with no number. In a real program, such an object can escape into a list, get saved to a database, or be handed to another method before anyone finishes setting it up. Bugs caused by half-built objects are among the hardest to trace because the error appears far away from the line that created the problem.

Constructors fix this. A constructor is the gate every new object must pass through, and it is the single best place to guarantee that an object is valid from the first moment anyone can see it. Professional Java code leans heavily on this idea: *if an object exists, it is valid*.

What you will learn:

- What a constructor is, how it differs from a method, and when Java supplies a default one
- How to write multiple constructors (overloading) and chain them with `this(...)`
- How to validate arguments so an invalid object is never created
- How `final` fields and constructors work together to create objects that cannot drift into invalid states
- What static factory methods are and when they read better than constructors
- The exact order in which fields, initializers, and constructors run
- Why calling an overridable method from a constructor is dangerous

## What a constructor is

A constructor looks like a method, but it has the same name as the class and **no return type**, not even `void`. It runs exactly once per object, as part of `new`.

```java
// fragment
final class Customer {
    private final String name;

    Customer(String name) {          // constructor: class name, no return type
        this.name = name;
    }
}

Customer c = new Customer("Ada");   // new allocates, then runs the constructor
```

Key facts:

- If you write **no constructor at all**, the compiler adds a *default constructor* with no parameters and an empty body. That is why `new Book()` worked in the previous lesson.
- As soon as you write **any** constructor, the default one is no longer generated. If you still want a no-argument constructor, you must write it yourself.
- A constructor can have any access modifier (`public`, `private`, package-private). A `private` constructor prevents outside code from calling `new` directly, which is the basis of static factories below.
- A constructor cannot be called like a normal method on an existing object. It only runs during `new` (or when another constructor chains to it).

### Parameters, fields, and `this`

The most common constructor pattern gives parameters the same names as fields and uses `this.` to tell them apart. `this.name` is the field of the object being built; plain `name` is the parameter. Forgetting `this.` is a classic beginner bug shown in the Common mistakes section.

## Validation: refuse to create invalid objects

If every method of `Customer` assumes a nonblank name, then *every* `Customer` must have one. The constructor is the only place that can guarantee it for all instances. If the arguments are invalid, the constructor throws an exception, and **no object is produced**: the `new` expression never completes, and the variable on the left is never assigned.

```java
public class ValidationDemo {
    public static void main(String[] args) {
        String[] candidates = {"  Ada Lovelace ", "", "   ", null, "Grace"};
        for (String candidate : candidates) {
            try {
                Customer customer = new Customer(candidate);
                System.out.println("created: [" + customer.name() + "]");
            } catch (IllegalArgumentException e) {
                System.out.println("rejected " + describe(candidate) + ": " + e.getMessage());
            }
        }
    }

    private static String describe(String text) {
        return text == null ? "null" : "\"" + text + "\"";
    }
}

final class Customer {
    private final String name;

    Customer(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name required");
        }
        this.name = name.strip();
    }

    String name() {
        return name;
    }
}
```

Output:

```text
created: [Ada Lovelace]
rejected "": name required
rejected "   ": name required
rejected null: name required
created: [Grace]
```

Three design choices are visible here:

1. **Fail fast.** The problem is reported at the line that caused it, with a message that names the rule, instead of surfacing later as a mysterious `NullPointerException`.
2. **Normalize once.** `strip()` removes surrounding whitespace so every other method can rely on a clean name.
3. **`final` field.** Once assigned, `name` can never change. Validation in the constructor plus no way to modify the field means the rule holds for the object's entire life.

`IllegalArgumentException` is the standard unchecked exception for "the caller passed a bad argument". For null checks, `java.util.Objects.requireNonNull(value, "message")` throws a `NullPointerException` with your message and returns the value, which keeps constructors short.

> **Note:** A partially valid object pushes checks onto every caller. If `Customer` allowed a blank name, every piece of code that prints, saves, or compares customers would need its own blank check, and one of them would eventually forget.

## Multiple constructors and `this(...)` chaining

Sometimes callers reasonably want to create the same kind of object from different information. Java allows several constructors in one class as long as their parameter lists differ; this is **constructor overloading**. To avoid repeating validation, one constructor can call another with `this(...)`. The usual pattern is one *primary* constructor that does all the work, and convenience constructors that supply defaults and delegate to it.

```java
public class ConstructorDemo {
    public static void main(String[] args) {
        System.out.println("Creating a:");
        Book a = new Book("Java Basics", "R. Rivera", 320);
        System.out.println("Creating b:");
        Book b = new Book("Domain Modeling", "K. Osei");
        System.out.println("Creating c:");
        Book c = new Book("Field Notes");

        System.out.println(a.describe());
        System.out.println(b.describe());
        System.out.println(c.describe());
    }
}

final class Book {
    private static final int DEFAULT_PAGES = 100;

    private final String title;
    private final String author;
    private final int pages;

    Book(String title, String author, int pages) {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title is required");
        }
        if (author == null || author.isBlank()) {
            throw new IllegalArgumentException("author is required");
        }
        if (pages < 1) {
            throw new IllegalArgumentException("pages must be positive: " + pages);
        }
        this.title = title.strip();
        this.author = author.strip();
        this.pages = pages;
        System.out.println("  primary constructor stored " + this.title);
    }

    Book(String title, String author) {
        this(title, author, DEFAULT_PAGES);
        System.out.println("  two-argument constructor finished");
    }

    Book(String title) {
        this(title, "Unknown");
        System.out.println("  one-argument constructor finished");
    }

    String describe() {
        return title + " by " + author + " (" + pages + " pages)";
    }
}
```

Output:

```text
Creating a:
  primary constructor stored Java Basics
Creating b:
  primary constructor stored Domain Modeling
  two-argument constructor finished
Creating c:
  primary constructor stored Field Notes
  two-argument constructor finished
  one-argument constructor finished
Java Basics by R. Rivera (320 pages)
Domain Modeling by K. Osei (100 pages)
Field Notes by Unknown (100 pages)
```

(The `println` calls inside the constructors exist only to make the chain visible. Real constructors should not print.)

### Trace of `new Book("Field Notes")`

1. The one-argument constructor starts and immediately calls `this(title, "Unknown")`.
2. The two-argument constructor starts and immediately calls `this(title, author, DEFAULT_PAGES)`.
3. The primary constructor validates all three values, assigns the fields, and prints.
4. Control returns to the two-argument constructor, which finishes its remaining statements.
5. Control returns to the one-argument constructor, which finishes last.

Rules for `this(...)` in Java 21:

- It must be the **first statement** in the constructor body. Nothing, not even a `println`, may come before it.
- A constructor can call either `this(...)` or `super(...)` first, not both.
- Chains may not form a cycle; the compiler rejects recursive constructor invocation.

> **Tip:** Only add overloads that represent the same unambiguous concept. `new Money(500)` is ambiguous: cents or dollars? When the arguments need a name to be understood, a static factory is clearer.

## Static factory methods

A **static factory** is a `static` method that returns an instance of its class. Combined with a `private` constructor, it becomes the only way to create objects.

```java
import java.math.BigDecimal;

public class FactoryDemo {
    public static void main(String[] args) {
        Money fee = Money.ofCents(525);
        Money price = Money.ofMajorUnits("12.40");
        Money nothing = Money.zero();

        System.out.println("fee = " + fee.format());
        System.out.println("price = " + price.format());
        System.out.println("total = " + fee.plus(price).format());
        System.out.println("zero is shared: " + (nothing == Money.zero()));

        try {
            Money.ofMajorUnits("3.999");
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }
        try {
            Money.ofCents(-1);
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }
    }
}

final class Money {
    private static final Money ZERO = new Money(0);

    private final long cents;

    private Money(long cents) {
        if (cents < 0) {
            throw new IllegalArgumentException("amount must be >= 0 cents: " + cents);
        }
        this.cents = cents;
    }

    static Money ofCents(long cents) {
        return cents == 0 ? ZERO : new Money(cents);
    }

    static Money ofMajorUnits(String text) {
        BigDecimal amount = new BigDecimal(text.strip());
        if (amount.scale() > 2) {
            throw new IllegalArgumentException("more than two decimal places: " + text);
        }
        return ofCents(amount.movePointRight(2).longValueExact());
    }

    static Money zero() {
        return ZERO;
    }

    Money plus(Money other) {
        return ofCents(Math.addExact(cents, other.cents));
    }

    String format() {
        return String.format("%d.%02d", cents / 100, cents % 100);
    }
}
```

Output:

```text
fee = 5.25
price = 12.40
total = 17.65
zero is shared: true
rejected: more than two decimal places: 3.999
rejected: amount must be >= 0 cents: -1
```

Notice that `fee.plus(price)` returns a *new* `Money` instead of changing `fee`. Because `Money` has only `final` fields and no mutating methods, it is **immutable**, which makes it safe to share, like the single `ZERO` instance.

### Constructors versus static factories

| Aspect | Constructor | Static factory |
|---|---|---|
| Name | Always the class name | Any descriptive name (`ofCents`, `parse`, `empty`) |
| Distinguishes same parameter types | No: two `(long)` constructors cannot coexist | Yes: `ofCents(long)` and `ofMillis(long)` can |
| Always creates a new object | Yes | No: may return a cached instance such as `ZERO` |
| Return type | Exactly the class | The class, a subtype, or an interface |
| Validation | Must validate | Must validate (or delegate to a validating constructor) |
| Discoverability | Obvious (`new`) | Needs naming conventions: `of`, `from`, `valueOf`, `parse`, `create` |

The JDK uses both: `new ArrayList<>()` is a constructor, while `List.of(...)`, `Integer.valueOf(...)`, and `LocalDate.of(2026, 1, 5)` are factories. Neither mechanism excuses skipping validation.

## What happens under the hood: initialization order

When `new` runs, Java executes initialization in a fixed order. Knowing it lets you predict what any field holds at any moment.

```java
public class InitOrder {
    public static void main(String[] args) {
        System.out.println("main: before new");
        Widget w = new Widget("gear");
        System.out.println("main: after new, " + w.summary());
    }
}

class Widget {
    private final String name;
    private int size = trace("field initializer: size = 10", 10);

    {
        trace("instance initializer block", 0);
    }

    Widget(String name) {
        trace("constructor body starts, size is " + size, 0);
        this.name = name;
        trace("constructor body ends", 0);
    }

    private static int trace(String message, int value) {
        System.out.println("  " + message);
        return value;
    }

    String summary() {
        return name + "/" + size;
    }
}
```

Output:

```text
main: before new
  field initializer: size = 10
  instance initializer block
  constructor body starts, size is 10
  constructor body ends
main: after new, gear/10
```

The full sequence for `new Widget("gear")`:

1. Memory is allocated and **every field is set to its default** (`name = null`, `size = 0`).
2. The superclass constructor runs (`Widget` implicitly extends `Object`, whose constructor does nothing visible).
3. Field initializers and instance initializer blocks (`{ ... }`) run **in the order they appear** in the source.
4. The rest of the constructor body runs.
5. `new` returns the reference.

Step 2 is the important one for the next section: the superclass part of an object is constructed *before* the subclass's field initializers and constructor body.

## Never call an overridable method from a constructor

You will study inheritance properly in Chapter 7. For now you need just two facts: `class Badge extends Card` means a `Badge` is a specialized `Card`, and a method in `Badge` marked `@Override` replaces the `Card` version for `Badge` objects, **even when the call happens inside `Card`'s own code**. That replacement is decided at run time based on the object's actual class.

Combine that with the initialization order and you get a trap:

```java
public class ConstructorTrap {
    public static void main(String[] args) {
        Badge badge = new Badge("Ada");
        System.out.println("After construction: " + badge.label());
    }
}

class Card {
    Card() {
        System.out.println("Card constructor sees: " + label());
    }

    String label() {
        return "plain card";
    }
}

class Badge extends Card {
    private final String owner;
    private int level = 3;

    Badge(String owner) {
        super();
        this.owner = owner;
        System.out.println("Badge constructor sees: " + label());
    }

    @Override
    String label() {
        return owner + " (level " + level + ")";
    }
}
```

Output:

```text
Card constructor sees: null (level 0)
Badge constructor sees: Ada (level 3)
After construction: Ada (level 3)
```

### Step-by-step trace

1. `new Badge("Ada")` allocates the object. All fields hold defaults: `owner = null`, `level = 0`.
2. `Badge`'s constructor calls `super()`, so `Card()` runs **before** anything else in `Badge`.
3. `Card()` calls `label()`. The object is really a `Badge`, so `Badge.label()` runs.
4. `Badge.label()` reads `owner` and `level`, which are still at their defaults, because `Badge`'s field initializer (`level = 3`) and constructor body (`this.owner = owner`) have not run yet. Result: `null (level 0)`.
5. Only after `Card()` returns do `level = 3` and `this.owner = owner` execute.

The superclass could not have known that a subclass would override `label()` and depend on its own fields. The overridden method observed state that was not initialized yet. Even a `final` field like `owner` is seen as `null` here. In real code this produces `NullPointerException`s, wrong validation results, or objects registered in an inconsistent state.

How to avoid it:

- From a constructor, call only methods that are `private`, `static`, or `final` (these cannot be overridden), or methods of a `final` class.
- Do not pass `this` to other objects (listeners, registries, threads) before the constructor finishes. This is called letting `this` *escape*.
- JDK 21 added a lint check for this: compiling with `javac -Xlint:this-escape` warns "possible 'this' escape before subclass is fully initialized" for public classes that can be subclassed from other code.

Making a class `final` (as with `Customer`, `Book`, and `Money` above) removes the risk entirely because no subclass can exist.

## Common mistakes

### Forgetting `this.` when names are shadowed

```java
class Pet {
    String name;
    int age;

    Pet(String name, int age) {
        name = name;   // assigns the parameter to itself
        age = age;
    }
}
// new Pet("Rex", 4) then printing name + " is " + age
```

This compiles, and prints:

```text
null is 0
```

Inside the constructor, `name` means the parameter, so the fields are never touched. Fix: `this.name = name; this.age = age;`. Declaring the fields `final` turns this silent bug into a compile error, because the compiler notices the final fields are never assigned.

### Expecting a no-argument constructor after writing another one

```java
class Customer {
    private final String name;
    Customer(String name) { this.name = name; }
}
// elsewhere:
Customer c = new Customer();
```

```text
error: constructor Customer in class Customer cannot be applied to given types;
  required: String
  found:    no arguments
```

Writing any constructor removes the default one. Either pass the required argument or, if a no-argument form genuinely makes sense, write it and chain it to the primary constructor.

### Statements before `this(...)`

```java
Book(String title) {
    System.out.println("creating " + title);
    this(title, "Unknown");
}
```

```text
error: call to this must be first statement in constructor
```

Move the delegation to the first line. (A preview feature in later JDKs relaxes this rule, but in Java 21 it is strict.)

### Leaving a `final` field unassigned

```java
class Order {
    private final String id;
    private final int quantity;

    Order(int quantity) {
        this.quantity = quantity;
    }
}
```

```text
error: variable id might not have been initialized
```

Every constructor path must assign every `final` field exactly once. This error is your friend: it proves no `Order` can exist without an `id`.

### Calling overridable methods or leaking `this` during construction

Covered above. If you need setup logic that subclasses can customize, do it in a separate method called *after* construction, or use a factory that constructs first and then initializes.

## Best practices

- Establish every invariant in the constructor; after construction the object must be fully valid.
- Validate first, then assign. Throw `IllegalArgumentException` (or `NullPointerException` via `Objects.requireNonNull`) with a message that names the rule.
- Prefer `final` fields. Objects that cannot change after construction cannot become invalid later.
- Use one primary constructor and have the others delegate with `this(...)` so validation lives in one place.
- Use static factories when a name clarifies meaning or units, when you may want to cache instances, or when two creation paths share the same parameter types.
- Keep constructors free of heavy work: no file or network access, no printing, no starting threads.
- Mark classes `final` unless you have designed them for extension; this also removes the overridable-call hazard.

## Summary

- A constructor has the class name and no return type; it runs once during `new`.
- Java supplies a no-argument default constructor only when you write none.
- Overloaded constructors should chain with `this(...)`, which must be the first statement, to a single validating constructor.
- If a constructor throws, no object is created and no variable receives a reference.
- `final` fields plus constructor validation give objects that stay valid for their whole life.
- Static factories offer descriptive names, caching, and flexibility, but must still validate.
- Initialization order is: defaults, superclass constructor, field initializers and initializer blocks in source order, then the constructor body.
- Calling an overridable method from a superclass constructor runs subclass code before the subclass's fields are initialized.

## Practice

### Warm-up

1. Add a no-argument constructor to a `Lamp` class that chains to a `Lamp(int brightness)` constructor with a default of 100.
2. Rewrite the `Pet` class from Common mistakes with `final` fields and observe the compiler error before fixing it.

### Core

1. Write a `Temperature` class that stores degrees Celsius in a `final double` field. Give it a private constructor and two factories, `celsius(double)` and `fahrenheit(double)`. Reject values below absolute zero (-273.15 °C) with a clear message. Print conversions for 0 °C, 100 °C, 32 °F, and a rejected value.
2. Write a `Rectangle` with constructors `(width, height)` and `(side)` for squares, chaining the second to the first. Reject nonpositive sides. Test every constructor with a valid and an invalid input.
3. Explain in your own words what a caller receives when a constructor throws, and demonstrate it with a `try`/`catch` that prints whether the variable was assigned.

### Challenge

1. Build an `EmailAddress` class with a `parse(String)` factory that trims, lowercases, and rejects inputs without exactly one `@` or with an empty local or domain part. Keep the constructor private. Write a table of at least eight test inputs with expected outcomes before coding.
2. Reproduce the `Card`/`Badge` trap with a subclass whose overridden method calls a method on a field (for example `owner.length()`). Observe the failure, then redesign the classes so it cannot happen.

## Check your understanding

1. When does the compiler generate a default constructor, and when does it stop doing so?
2. Why should convenience constructors delegate to one primary constructor instead of each validating on their own?
3. Name two advantages a static factory such as `Money.ofCents` has over a public constructor.
4. List the steps Java performs between `new Widget("gear")` starting and the reference being returned.
5. A superclass constructor calls a method that a subclass overrides. What values will the subclass's fields hold when that method runs, and why?
6. Why does declaring a field `final` help catch constructor bugs?
