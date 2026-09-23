# Static members, dependency injection, and object collaboration

So far every field you wrote belonged to an individual object: each account had its own balance, each lamp its own brightness. Some data and behavior, however, belong to the class as a whole: a count of tickets issued so far, a tax-rate constant, a formatting helper that needs no object at all. Java marks these with the keyword `static`.

`static` is easy to learn and easy to overuse. Beginners discover that static methods can be called from `main` without creating objects and start making everything static. The result is code with hidden connections: classes that secretly share state, tests that pass or fail depending on the order they run in, and components that cannot be swapped out. The professional alternative is to make collaborators explicit by passing them in, which is called **dependency injection**. This lesson teaches both sides and when each is right.

What you will learn:

- The difference between static (class-level) and instance (object-level) members
- How to declare and use static fields, static methods, constants, and static initializer blocks
- Why a static method has no `this`, and the compiler errors that follow from that
- Where static fits well (constants, stateless utilities, factories) and where it hurts (mutable shared state)
- Why `static final` does not mean immutable
- What dependency injection is and how constructor injection makes a class's collaborators visible
- How to wire objects together in a composition root and substitute test doubles
- Who owns and closes collaborators

## Static versus instance members

An **instance field** exists once per object. A **static field** exists once per class, no matter how many objects you create (even zero). The same split applies to methods: an instance method runs on an object and has a `this`; a static method runs on the class and has no `this`.

```java
public class TicketDemo {
    public static void main(String[] args) {
        System.out.println("issued before any ticket: " + Ticket.issuedCount());
        Ticket a = new Ticket("Ada");
        Ticket b = new Ticket("Linus");
        Ticket c = new Ticket("Grace");

        System.out.println(a.describe());
        System.out.println(b.describe());
        System.out.println(c.describe());
        System.out.println("issued: " + Ticket.issuedCount());
        System.out.println("max per event: " + Ticket.MAX_PER_EVENT);
    }
}

final class Ticket {
    static final int MAX_PER_EVENT = 500;
    private static int issued = 0;

    private final int number;
    private final String holder;

    Ticket(String holder) {
        if (issued >= MAX_PER_EVENT) {
            throw new IllegalStateException("sold out");
        }
        issued++;
        this.number = issued;
        this.holder = holder;
    }

    static int issuedCount() {
        return issued;
    }

    String describe() {
        return "ticket #" + number + " for " + holder;
    }
}
```

Output:

```text
issued before any ticket: 0
ticket #1 for Ada
ticket #2 for Linus
ticket #3 for Grace
issued: 3
max per event: 500
```

`issued` is shared by all tickets, so each constructor sees the count left by the previous one. `number` and `holder` are separate per ticket. `issuedCount()` works before any ticket exists because it does not need one.

| Aspect | Instance member | Static member |
|---|---|---|
| Belongs to | One object | The class |
| Copies in memory | One per object | One per loaded class |
| Accessed through | A reference: `ticket.describe()` | The class name: `Ticket.issuedCount()` |
| Has `this` | Yes | No |
| Can use instance fields directly | Yes | No, needs an object reference |
| Typical uses | State and behavior of domain objects | Constants, factories, stateless helpers, `main` |

> **Tip:** Java lets you call a static method through a reference (`a.issuedCount()`), but it is misleading because the result has nothing to do with `a`. Always use the class name.

A note on the counter: the `issued` field is a simple teaching example. In a real application, a static counter is shared by every part of the program and every test, is not safe when several threads create tickets at once, and resets whenever the program restarts. Real ticket numbers would come from a collaborator such as a database sequence, which is exactly the kind of thing dependency injection handles well.

## Good uses of static

### Constants

A field that is `static final` and holds an immutable value (a primitive or a `String`) is a **constant**. By convention its name is `UPPER_SNAKE_CASE`.

```java
// fragment
static final int MAX_PER_EVENT = 500;
static final String DEFAULT_CURRENCY = "EUR";
```

### Stateless utility methods

A method whose result depends only on its parameters has no reason to live on an object. The JDK is full of these: `Math.max`, `Integer.parseInt`, `String.valueOf`, `List.of`. A class that holds only such methods gets a `private` constructor so nobody creates pointless instances.

### Static factories

As you saw in Lesson 2, `Money.ofCents(525)` is static because it creates the object; there is no object to call it on yet.

### Static initializer blocks

When a static field needs more than one expression to set up, a `static { ... }` block runs once, when the class is initialized.

```java
// fragment
final class CountryCodes {
    private static final java.util.Map<String, String> NAMES;

    static {
        var map = new java.util.HashMap<String, String>();
        map.put("DE", "Germany");
        map.put("JP", "Japan");
        NAMES = java.util.Map.copyOf(map);
    }
}
```

## Where static hurts: shared mutable state

The following program shows two problems at once: a "constant" that is not constant, and a shared log that makes two tests depend on each other.

```java
import java.util.ArrayList;
import java.util.List;

public class StaticStateDemo {
    public static void main(String[] args) {
        System.out.println("cents 1999 -> " + MoneyFormat.format(1999));
        System.out.println("vat on 1000 -> " + MoneyFormat.vatCents(1000));

        Defaults.TAGS.add("hacked");
        System.out.println("shared 'constant' now: " + Defaults.TAGS);
        try {
            SafeDefaults.TAGS.add("hacked");
        } catch (UnsupportedOperationException e) {
            System.out.println("SafeDefaults refused: " + e.getClass().getSimpleName());
        }

        System.out.println("run test A then B:");
        AuditLog.clearForDemo();
        testRecordsOneEntry();
        testStartsEmpty();

        System.out.println("run test B then A:");
        AuditLog.clearForDemo();
        testStartsEmpty();
        testRecordsOneEntry();
    }

    static void testRecordsOneEntry() {
        AuditLog.record("login");
        System.out.println("  A (expects 1 entry): " + (AuditLog.size() == 1 ? "PASS" : "FAIL, size=" + AuditLog.size()));
    }

    static void testStartsEmpty() {
        System.out.println("  B (expects empty):   " + (AuditLog.size() == 0 ? "PASS" : "FAIL, size=" + AuditLog.size()));
    }
}

final class MoneyFormat {
    static final int VAT_PERCENT = 20;

    private MoneyFormat() {
    }

    static String format(long cents) {
        return String.format("%d.%02d", cents / 100, cents % 100);
    }

    static long vatCents(long netCents) {
        return netCents * VAT_PERCENT / 100;
    }
}

final class Defaults {
    static final List<String> TAGS = new ArrayList<>(List.of("new"));
}

final class SafeDefaults {
    static final List<String> TAGS = List.of("new");
}

final class AuditLog {
    private static final List<String> ENTRIES = new ArrayList<>();

    static void record(String event) {
        ENTRIES.add(event);
    }

    static int size() {
        return ENTRIES.size();
    }

    static void clearForDemo() {
        ENTRIES.clear();
    }
}
```

Output:

```text
cents 1999 -> 19.99
vat on 1000 -> 200
shared 'constant' now: [new, hacked]
SafeDefaults refused: UnsupportedOperationException
run test A then B:
  A (expects 1 entry): PASS
  B (expects empty):   FAIL, size=1
run test B then A:
  B (expects empty):   PASS
  A (expects 1 entry): PASS
```

What went wrong:

1. **`static final` is not immutable.** `final` fixes the *reference*: `Defaults.TAGS` will always point to the same list. It says nothing about the list's contents, so any code anywhere can add to it. `List.of(...)` creates an unmodifiable list, which makes the constant genuinely constant.
2. **Static state couples unrelated code.** Test B is correct on its own, but it fails when it runs after test A because both use the one `AuditLog`. Real test frameworks may run tests in any order, so such a suite passes on one machine and fails on another. The same coupling happens between features in production: any class can reach `AuditLog`, and nothing in their signatures reveals it.

`MoneyFormat`, in contrast, is a fine use of static: its methods depend only on their arguments and a true constant.

## Dependency injection: make collaborators explicit

A **dependency** (or collaborator) is another object a class needs to do its job: a place to write receipts, a clock, a repository, a payment gateway. There are two ways to get one:

- **Look it up** from somewhere global: a static field, a singleton, `System.out`, `LocalTime.now()`.
- **Receive it** from whoever creates the object. This is **dependency injection**. The most common form is **constructor injection**: dependencies are constructor parameters.

Constructor injection makes a class honest. Its constructor signature lists exactly what it requires, so anyone reading the call site sees the collaborators, the object cannot be created without them, and they can be `final`.

The example below uses an **interface**, which Chapter 7 covers in depth. For now: an interface names operations without implementing them, and a class that says `implements ReceiptSink` promises to provide them. A variable of type `ReceiptSink` can refer to any such class.

```java
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class CheckoutApp {
    public static void main(String[] args) {
        // Composition root: build the object graph in one place.
        ReceiptSink console = new ConsoleSink();
        RecordingSink recorder = new RecordingSink();

        Checkout storeCheckout = new Checkout(console, 20);
        Checkout testCheckout = new Checkout(recorder, 0);

        storeCheckout.finish(1000);
        testCheckout.finish(250);
        testCheckout.finish(400);

        System.out.println("recorded by test sink: " + recorder.lines());
    }
}

interface ReceiptSink {
    void write(String text);
}

final class ConsoleSink implements ReceiptSink {
    @Override
    public void write(String text) {
        System.out.println("[console] " + text);
    }
}

final class RecordingSink implements ReceiptSink {
    private final List<String> lines = new ArrayList<>();

    @Override
    public void write(String text) {
        lines.add(text);
    }

    List<String> lines() {
        return List.copyOf(lines);
    }
}

final class Checkout {
    private final ReceiptSink sink;
    private final int taxPercent;

    Checkout(ReceiptSink sink, int taxPercent) {
        this.sink = Objects.requireNonNull(sink, "sink");
        if (taxPercent < 0) {
            throw new IllegalArgumentException("taxPercent must be >= 0");
        }
        this.taxPercent = taxPercent;
    }

    void finish(long netCents) {
        long total = netCents + netCents * taxPercent / 100;
        sink.write("Paid " + total + " cents");
    }
}
```

Output:

```text
[console] Paid 1200 cents
recorded by test sink: [Paid 250 cents, Paid 400 cents]
```

`Checkout` does not know or care whether receipts go to the console, a file, a printer, or a test list. Two checkouts with different sinks share nothing. A test can inspect exactly what was written without capturing console output. No framework was needed: dependency injection is just passing objects to constructors. Frameworks such as Spring (Chapter 24) automate the wiring for large applications, but the idea is identical.

### Injecting time

Code that calls `LocalTime.now()` directly is hard to test because its result changes every run. The JDK provides `java.time.Clock` precisely so time can be injected.

```java
import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneOffset;

public class ClockDemo {
    public static void main(String[] args) {
        Clock morning = Clock.fixed(Instant.parse("2026-01-05T08:30:00Z"), ZoneOffset.UTC);
        Clock evening = Clock.fixed(Instant.parse("2026-01-05T19:15:00Z"), ZoneOffset.UTC);

        System.out.println(new Greeter(morning).greet("Ada"));
        System.out.println(new Greeter(evening).greet("Ada"));
        // In production the composition root would pass Clock.systemDefaultZone().
    }
}

final class Greeter {
    private final Clock clock;

    Greeter(Clock clock) {
        this.clock = clock;
    }

    String greet(String name) {
        LocalTime now = LocalTime.now(clock);
        String part = now.getHour() < 12 ? "morning" : now.getHour() < 18 ? "afternoon" : "evening";
        return "Good " + part + ", " + name + " (" + now + ")";
    }
}
```

Output:

```text
Good morning, Ada (08:30)
Good evening, Ada (19:15)
```

With a fixed clock, the output is the same on every run and every machine, so both branches can be tested in milliseconds instead of waiting for evening.

### Ways to obtain a collaborator

| Approach | Dependencies visible from outside? | Easy to substitute in tests? | Can the field be `final`? |
|---|---|---|---|
| Constructor injection | Yes, in the constructor signature | Yes | Yes |
| Setter injection | Partly; easy to forget to call | Yes | No |
| Static field or singleton lookup | No, hidden in method bodies | Hard | Not applicable |
| Service locator (`Registry.get(Sink.class)`) | No | Possible but awkward | Not applicable |
| Creating it inside with `new` | No | No | Yes |

Constructor injection should be your default for *required* collaborators.

## The composition root and ownership

The **composition root** is the one place, usually `main` or a small startup class, where the application creates its long-lived objects and connects them. Everything else simply receives what it needs. Keeping all `new` calls for services there gives you one readable map of the application.

Injection also raises a question of **ownership**. If a collaborator holds a resource such as an open file, a database connection, or a thread pool, someone must close it. Injecting an object does not transfer that duty automatically. A clear rule: *whoever creates a resource closes it*. The composition root creates the file writer, passes it to several services, and closes it at shutdown; the services use it but never close it themselves. Chapter 11 introduces try-with-resources for this.

## What happens under the hood

When the JVM first actively uses a class (creating an instance, calling a static method, or reading a non-constant static field), it **initializes** the class: static fields receive their defaults, then static initializers and static blocks run in source order, exactly once. Static fields live with the class's runtime data, not inside any object, which is why there is one copy regardless of how many objects exist.

A compile-time constant such as `static final int MAX_PER_EVENT = 500` is special: the compiler copies its value directly into the code that uses it. If you change the constant, you must recompile the classes that use it, or they keep the old value. This is one more reason constants should truly never change.

Static methods are called without passing any receiver object, which is exactly why `this` is unavailable inside them.

## Common mistakes

### Using `this` or instance fields in a static method

```java
class Counter {
    private int count;

    static int current() {
        return this.count;
    }
}
```

```text
error: non-static variable this cannot be referenced from a static context
```

A static method runs for the class, not for an object, so there is no `this`. Either make the method an instance method or pass the object in as a parameter. The same root cause produces "non-static method ... cannot be referenced from a static context" when `main` calls an instance method directly.

### Making everything static to silence those errors

Turning fields and methods static "so `main` can use them" converts every object's state into global state. Create objects in `main` and call their instance methods instead.

### Believing `static final` makes a collection constant

As the demo showed, a `static final ArrayList` can still be changed by anyone. Use `List.of`, `Set.of`, `Map.of`, or `List.copyOf` for constant collections.

### Hidden dependencies

```java
// wrong: the dependency is invisible from the constructor
final class Checkout {
    void finish(long cents) {
        Printer.INSTANCE.print("Paid " + cents);   // global lookup
    }
}
```

Nothing tells a reader or a test that `Checkout` needs a printer. Inject it through the constructor.

### Tests that share static state

If test results depend on execution order, look for static mutable fields. Replace them with instance state owned by an injected collaborator, so each test builds fresh objects.

## Best practices

- Use `static` for true constants, stateless utilities, factories, and `main`. Avoid static mutable fields.
- Give utility classes a `private` constructor and make them `final`.
- Declare constant collections with unmodifiable factories.
- Inject required collaborators through the constructor, store them in `private final` fields, and reject `null` with `Objects.requireNonNull`.
- Depend on a small interface (`ReceiptSink`) rather than a concrete class when you expect different implementations, such as production versus test.
- Inject time (`Clock`), randomness (`java.util.random.RandomGenerator` or `Random` with a seed), and I/O instead of reaching for globals.
- Wire the application in one composition root; decide there who owns and closes each resource.

## Summary

- Static members belong to the class; instance members belong to each object.
- A static method has no `this` and cannot use instance fields without an object reference.
- Good static uses: constants, stateless helpers, factories. Risky: mutable shared state, which couples code and makes tests order-dependent.
- `static final` fixes a reference, not the contents of the referenced object.
- Dependency injection means receiving collaborators instead of looking them up globally.
- Constructor injection makes a class's required collaborators visible in its signature and lets them be `final`.
- A composition root builds and connects the object graph; resource ownership must be decided explicitly.

## Practice

### Warm-up

1. Add a static method `resetForTests()` to a counter class, then explain why needing such a method is a warning sign.
2. Write a `final` utility class `Temperatures` with a private constructor and static methods `celsiusToFahrenheit` and `fahrenheitToCelsius`.

### Core

1. Replace the static `AuditLog` with an instance-based `AuditLog` class and inject it into a `LoginService` through the constructor. Write two "tests" in `main` that each build their own log, and show they pass in either order.
2. Create two `Checkout` instances with two different `RecordingSink` objects and prove their receipts are kept separately.
3. Write an `OverdueChecker` that takes a `Clock` and decides whether a library loan with a due date is overdue. Test it with fixed clocks one day before, on, and after the due date.

### Challenge

1. Design a small "order notification" feature with an `OrderService` that needs a `Clock`, a `ReceiptSink`, and an ID generator interface. Wire it in a composition root with production implementations, then again with test implementations, without changing `OrderService`.
2. Explain in writing who should close a `java.io.Writer` that the composition root passes to two services, and what goes wrong if one service closes it.

## Check your understanding

1. How many copies of a static field exist if you create 1,000 objects of its class? And of an instance field?
2. Why does `this` not exist inside a static method?
3. A class declares `static final List<String> NAMES = new ArrayList<>();`. Can other code add names to it? Why?
4. Why can static mutable state make a test pass when run alone but fail when run after another test?
5. What does constructor injection make visible that a global lookup inside a method hides?
6. What is a composition root, and why is it a good place to decide who closes shared resources?
