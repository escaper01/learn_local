# Interfaces, abstract classes, and default methods

In professional Java code, most of the types you depend on are interfaces: `List`, `Map`, `Comparable`, `Runnable`, `AutoCloseable`, `Connection`, `HttpClient`. An interface lets you say *what* something can do without committing to *how*. That separation is what allows you to swap a database, fake a payment provider in a test, or add a new file format without rewriting the code that uses it.

Abstract classes solve a related but different problem: sharing real state and construction logic among closely related classes. Choosing between them is one of the most common design decisions you will make, and it is a frequent interview topic.

## What you will learn

- How to declare functionality with an interface and implement it in several classes
- How one class can play several roles by implementing multiple interfaces
- What interfaces may contain: abstract, `default`, `static`, and `private` methods, plus constants
- How to resolve a conflict when two interfaces supply the same default method
- What an abstract class is, and what it can hold that an interface cannot
- The template method pattern built on an abstract class
- A clear decision guide: interface, abstract class, or both

## Interfaces declare functionality

An **interface** is a named set of operations, a *role* that any class may agree to play. Think of a power socket: the socket defines the shape of the plug (the contract), and any appliance that fits may be plugged in. The socket does not care whether it powers a lamp or a laptop.

```java
// Fragment
interface PaymentMethod {
    boolean pay(int cents);   // implicitly public and abstract
    String label();
}
```

Methods declared without a body in an interface are implicitly `public abstract`. A class promises to fulfil the role with `implements`, and it must then provide a public body for every abstract method (or itself be declared `abstract`).

The following program declares two roles and three implementations. The `checkout` method is written only against the interface.

```java
import java.util.List;

public class CheckoutDemo {
    // Written only against the PaymentMethod role: it never sees concrete classes.
    static void checkout(PaymentMethod method, int cents) {
        boolean ok = method.pay(cents);
        System.out.println(method.label() + " paying " + cents + " cents -> "
                + (ok ? "approved" : "declined"));
    }

    public static void main(String[] args) {
        CreditCard card = new CreditCard("VISA-4242", 50_00);
        GiftCard gift = new GiftCard(20_00);

        List<PaymentMethod> methods = List.of(card, gift);
        for (PaymentMethod m : methods) {
            checkout(m, 30_00);
        }

        // One object, several roles:
        Auditable auditable = gift;
        System.out.println("Gift card audit: " + auditable.auditLine());
        System.out.println("Is gift card a PaymentMethod? " + (gift instanceof PaymentMethod));
        System.out.println("Is gift card Auditable? " + (gift instanceof Auditable));
    }
}

interface PaymentMethod {
    boolean pay(int cents);   // implicitly public and abstract
    String label();
}

interface Auditable {
    String auditLine();
}

final class CreditCard implements PaymentMethod {
    private final String number;
    private final int limitCents;
    private int usedCents;

    CreditCard(String number, int limitCents) {
        this.number = number;
        this.limitCents = limitCents;
    }

    @Override
    public boolean pay(int cents) {
        if (usedCents + cents > limitCents) {
            return false;
        }
        usedCents += cents;
        return true;
    }

    @Override
    public String label() {
        return "Card " + number;
    }
}

final class GiftCard implements PaymentMethod, Auditable {
    private int balanceCents;

    GiftCard(int balanceCents) {
        this.balanceCents = balanceCents;
    }

    @Override
    public boolean pay(int cents) {
        if (cents > balanceCents) {
            return false;
        }
        balanceCents -= cents;
        return true;
    }

    @Override
    public String label() {
        return "Gift card";
    }

    @Override
    public String auditLine() {
        return "balance=" + balanceCents;
    }
}
```

```text
Card VISA-4242 paying 3000 cents -> approved
Gift card paying 3000 cents -> declined
Gift card audit: balance=2000
Is gift card a PaymentMethod? true
Is gift card Auditable? true
```

Key observations:

- `checkout` will work unchanged with a `BankTransfer` class written next year. That is what "program to an interface" means.
- `GiftCard` implements two interfaces. A class can implement **any number** of interfaces, even though it can extend only one class.
- An interface is a type. You can declare variables, parameters, list elements, and return types with it.
- Notice where the *state* lives: `balanceCents`, `limitCents`, and `usedCents` are fields in the classes, not in the interfaces.

## What an interface may contain

Since Java 8 and Java 9, interfaces can contain more than abstract methods. Here is the full menu:

| Member | Syntax | Purpose |
|---|---|---|
| Abstract method | `String name();` | The contract; implementers must supply it |
| Default method | `default String greet() { ... }` | A shared body that implementers inherit and may override |
| Static method | `static Greeter of(...) { ... }` | Utility or factory, called as `Greeter.of(...)` |
| Private method | `private String helper() { ... }` | Helper shared by default or static methods (Java 9+) |
| Constant | `int MAX_NAME = 20;` | Implicitly `public static final` |

What an interface **cannot** have: constructors, and instance fields. Any "field" you declare is automatically a `static final` constant shared by the whole program, so it must be initialised immediately.

```java
// Fragment: does not compile
interface Stateful {
    int count;          // not a per-object field: it is a constant and needs a value
}
```

```text
error: = expected
    int count;
             ^
```

This program shows each kind of member, and a conflict between two default methods.

```java
public class InterfaceFeatures {
    public static void main(String[] args) {
        Greeter english = new EnglishGreeter("Ada");
        Greeter pirate = new PirateGreeter("Grace");

        System.out.println(english.greet());          // inherited default method
        System.out.println(pirate.greet());           // overridden default method
        System.out.println(Greeter.shout(english));   // static interface method
        System.out.println("Max name length: " + Greeter.MAX_NAME);

        Robot robot = new Robot();
        System.out.println(robot.hello());            // conflict resolved explicitly
    }
}

interface Greeter {
    int MAX_NAME = 20;                     // implicitly public static final

    String name();                         // abstract: every implementer must supply it

    default String greet() {               // default: shared behavior with a body
        return "Hello, " + trimmedName() + "!";
    }

    static String shout(Greeter g) {       // static: called as Greeter.shout(...)
        return g.greet().toUpperCase();
    }

    private String trimmedName() {         // private: helper for the defaults only
        String n = name().strip();
        return n.length() > MAX_NAME ? n.substring(0, MAX_NAME) : n;
    }
}

final class EnglishGreeter implements Greeter {
    private final String name;
    EnglishGreeter(String name) { this.name = name; }
    @Override public String name() { return name; }
}

final class PirateGreeter implements Greeter {
    private final String name;
    PirateGreeter(String name) { this.name = name; }
    @Override public String name() { return name; }
    @Override public String greet() { return "Ahoy, " + name + "!"; }
}

interface Speaker {
    default String hello() { return "speaker says hi"; }
}

interface Display {
    default String hello() { return "display says hi"; }
}

// Two unrelated defaults with the same signature: the class MUST decide.
final class Robot implements Speaker, Display {
    @Override
    public String hello() {
        return Speaker.super.hello() + " and " + Display.super.hello();
    }
}
```

```text
Hello, Ada!
Ahoy, Grace!
HELLO, ADA!
Max name length: 20
speaker says hi and display says hi
```

### Default methods: what they are for

Default methods were added so that existing interfaces could grow without breaking every implementation. When Java 8 added `forEach` and `removeIf` to collection interfaces, millions of existing classes kept compiling because those methods came with default bodies.

A default method can only work with what the interface itself offers: its other methods. It cannot read instance fields, because the interface has none. `greet()` above works by calling `name()`, which each class implements using its own field.

> **Note:** Default methods give interfaces shared *behavior*. They do not give interfaces shared *state*. Only classes (including abstract classes) have constructors and per-instance fields.

### Resolving default method conflicts

If a class inherits two default methods with the same signature from unrelated interfaces, the compiler refuses to guess. Without the override in `Robot`, you get:

```text
error: types Speaker and Display are incompatible;
  class Robot inherits unrelated defaults for hello() from types Speaker and Display
```

The class must override the method. Inside the override, `InterfaceName.super.method()` calls a specific interface's default. The resolution rules, in order:

1. A method declared in a class (or inherited from a superclass) always wins over an interface default. "Classes win."
2. Otherwise, a more specific interface wins: if `B extends A` and both define the default, `B`'s version is used.
3. Otherwise, the class must override and choose explicitly.

## Abstract classes: shared state and construction

An **abstract class** is a class marked `abstract`. It cannot be instantiated directly; it exists to be extended. It may contain:

- abstract methods (no body) that subclasses must implement
- concrete methods with bodies
- **instance fields** holding per-object state
- **constructors** that validate and initialise that state
- any access modifier on its members, including `protected` and `private`

Think of an abstract class as a partly built house: the foundation, plumbing, and walls are finished and shared, but each buyer must choose the kitchen. You cannot live in the half-built house itself.

```java
// Fragment: does not compile
Report r = new Report();   // Report is abstract
```

```text
error: Report is abstract; cannot be instantiated
```

### The template method pattern

The most important use of an abstract class is the **template method**: a `final` method defines the fixed steps of an algorithm, and one or more `abstract` methods let subclasses fill in the varying parts.

```java
import java.util.List;

public class ReportTemplate {
    public static void main(String[] args) {
        Report sales = new SalesReport(List.of(120, 80, 200));
        Report errors = new ErrorReport(List.of("disk full", "timeout"));

        System.out.println(sales.render());
        System.out.println(errors.render());
        System.out.println(sales.render());
        System.out.println("Sales rendered " + sales.renderCount() + " times");
    }
}

abstract class Report {
    private final String title;       // real per-instance state
    private int renderCount;          // mutable per-instance state

    protected Report(String title) {  // constructor that validates shared state
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title required");
        }
        this.title = title;
    }

    // Template method: fixed algorithm, subclasses fill in one step.
    public final String render() {
        renderCount++;
        return "== " + title + " (#" + renderCount + ") ==\n" + body();
    }

    public final int renderCount() {
        return renderCount;
    }

    protected abstract String body();  // the step every subclass must supply
}

final class SalesReport extends Report {
    private final List<Integer> amounts;

    SalesReport(List<Integer> amounts) {
        super("Sales");
        this.amounts = List.copyOf(amounts);
    }

    @Override
    protected String body() {
        int total = 0;
        for (int a : amounts) {
            total += a;
        }
        return "orders=" + amounts.size() + ", total=" + total;
    }
}

final class ErrorReport extends Report {
    private final List<String> errors;

    ErrorReport(List<String> errors) {
        super("Errors");
        this.errors = List.copyOf(errors);
    }

    @Override
    protected String body() {
        return String.join("; ", errors);
    }
}
```

```text
== Sales (#1) ==
orders=3, total=400
== Errors (#1) ==
disk full; timeout
== Sales (#2) ==
orders=3, total=400
Sales rendered 2 times
```

Look at what `Report` does that no interface could: its **constructor** rejects a blank title for every subclass, and each object keeps its **own** `renderCount` in an instance field. The two `Sales` renders counted independently of the `Errors` render. A default method in an interface could format the header, but it would have nowhere to store a counter per object and no constructor to enforce the title rule.

The `protected` constructor signals that only subclasses call it. Making `render()` `final` guarantees subclasses cannot skip the counting or the header.

## Using both: interface for the role, abstract class for convenience

The JDK often combines the two: `List` is the interface; `AbstractList` is an optional abstract helper that implements most of it. Callers depend on the interface, and implementers may choose the helper. This is called a **skeletal implementation**.

```java
public class SkeletalImplementation {
    public static void main(String[] args) {
        Shape[] shapes = { new Circle("wheel", 1.0), new Square("tile", 2.0), new Triangle(3, 4) };
        for (Shape s : shapes) {
            System.out.printf("%-10s area=%.2f%n", s.name(), s.area());
        }
    }
}

// The role: what callers depend on.
interface Shape {
    String name();
    double area();
}

// Optional helper for implementers: shared state and constructor.
abstract class NamedShape implements Shape {
    private final String name;

    protected NamedShape(String name) {
        this.name = name;
    }

    @Override
    public final String name() {
        return name;
    }
}

final class Circle extends NamedShape {
    private final double radius;
    Circle(String name, double radius) { super(name); this.radius = radius; }
    @Override public double area() { return Math.PI * radius * radius; }
}

final class Square extends NamedShape {
    private final double side;
    Square(String name, double side) { super(name); this.side = side; }
    @Override public double area() { return side * side; }
}

// Not forced to use the helper: implements the interface directly.
record Triangle(double base, double height) implements Shape {
    @Override public String name() { return "triangle"; }
    @Override public double area() { return base * height / 2; }
}
```

```text
wheel      area=3.14
tile       area=4.00
triangle   area=6.00
```

`NamedShape` is itself abstract even though it declares no abstract method of its own: it inherits `area()` from `Shape` without implementing it. The record `Triangle` cannot extend any class (records implicitly extend `java.lang.Record`), but it can still implement `Shape`. That flexibility is exactly why callers should depend on the interface.

## Abstract class vs interface

| Feature | Interface | Abstract class |
|---|---|---|
| How many can a class use? | Implement many | Extend exactly one |
| Instance fields (per-object state) | No, only `static final` constants | Yes |
| Constructors | No | Yes |
| Method bodies | `default`, `static`, `private` methods | Any concrete methods |
| Abstract methods | Yes (implicitly `public`) | Yes (any non-private access) |
| Member access | Methods public or private; constants public | Any access modifier |
| Usable by records and enums | Yes, they can implement interfaces | No, they cannot extend classes |
| Typical meaning | A role or capability ("can pay", "is comparable") | A partially built family of closely related classes |

### Decision guide

1. Start with an **interface** for any type other code will depend on. It keeps callers flexible and keeps your single superclass slot free.
2. Add **default methods** for small conveniences that can be expressed purely in terms of the interface's other methods.
3. Introduce an **abstract class** only when implementations genuinely share state, validation in a constructor, or a fixed algorithm (template method).
4. If you need both, provide the interface for callers and the abstract class as an optional helper for implementers.

## Common mistakes

### 1. Forgetting to implement an abstract method

```java
// Wrong
interface Shape { double area(); String name(); }
class Circle implements Shape {
    public String name() { return "circle"; }
}
```

```text
error: Circle is not abstract and does not override abstract method area() in Shape
```

Fix: implement `area()`, or declare `Circle` abstract if it is meant to be a partial helper.

### 2. Implementing an interface method without public

```java
// Wrong
interface Named { String name(); }
class Person implements Named {
    String name() { return "p"; }     // package-private
}
```

```text
error: name() in Person cannot implement name() in Named
  attempting to assign weaker access privileges; was public
```

Fix: interface methods are public, so the implementation must be `public String name()`.

### 3. Treating interface fields as per-object state

```java
// Wrong idea
interface Limits { int MAX = 10; }
Limits.MAX = 11;
```

```text
error: cannot assign a value to static final variable MAX
```

Interface "fields" are shared constants. Put mutable state in the implementing class.

### 4. Hiding business policy in default methods

A default method like `default boolean isFraud() { return amount() > 10_000; }` quietly applies one team's rule to every implementation. Defaults should be neutral conveniences. Real policy belongs in a named class that can be tested and replaced.

### 5. Using an abstract class just to share two lines of code

This spends the only superclass slot and couples every subclass to the base. A small helper method, a static utility, or composition is usually cheaper.

## Best practices

- Name interfaces after roles or capabilities: `PaymentMethod`, `Closeable`, `Comparable`, `Repository`.
- Keep interfaces small and focused. A class can implement several small ones; nobody wants to implement one giant one.
- Declare variables and parameters with interface types: `PaymentMethod m`, `List<String> names`.
- Give abstract classes `protected` constructors and make template methods `final`.
- Keep the fields of an abstract class `private`; expose narrow `protected` methods if subclasses need them.
- Document the contract of every abstract and default method: accepted inputs, return guarantees, exceptions.
- Remember that adding an *abstract* method to a published interface breaks every implementer; adding a *default* method usually does not.

## Summary

- An interface declares functionality as a role. A class implements any number of interfaces and must supply public bodies for their abstract methods.
- Interfaces may hold abstract, default, static, and private methods plus `public static final` constants, but no constructors and no instance fields.
- Default methods share behavior built from the interface's own methods; they cannot store per-object state.
- Conflicting defaults from unrelated interfaces must be resolved by overriding, optionally calling `X.super.method()`.
- An abstract class cannot be instantiated, but it can have constructors, instance fields, concrete and abstract methods, and any access level.
- The template method pattern uses a `final` method in an abstract class to fix an algorithm while subclasses supply steps.
- Prefer interfaces for types others depend on; add an abstract class when implementations share real state or construction logic.

## Practice

### Warm-up

1. Declare an interface `Describable` with `String describe()` and a default method `printDescription()`. Implement it in two unrelated classes and call both through a `Describable[]` array.
2. Try to add an instance field and a constructor to an interface. Record the compiler messages.

### Core

1. Design a `ReportSource` interface with `String fetch()`. Write two independent implementations (an in-memory source and one that builds text from a list). Then decide, in writing, whether an abstract base class would add useful shared lifecycle behavior (such as counting fetches in a field) or merely duplicate a few lines.
2. Write a class that implements both `Describable` and `AutoCloseable`. Explain why this is possible even though it could never extend two classes.
3. Create two interfaces with the same default method signature and a class that implements both. Resolve the conflict so the output combines both defaults.

### Challenge

1. Build a small `Exporter` interface with an abstract `export(List<String> rows)` method, an abstract skeletal class `AbstractExporter` whose constructor validates a file extension and whose `final` template method adds a header and footer, and two concrete exporters (CSV and plain text). Also implement the interface directly in a record that does not use the helper.
2. Add a new default method to your published `Exporter` interface. Which implementations must change? Now add a new abstract method instead. Compare the effect.

## Check your understanding

1. An interface can supply method bodies through default methods. So what can an abstract class provide that an interface cannot?
2. Why can a default method call `name()` but not read a field called `name`?
3. When a class inherits the same default method from two unrelated interfaces, what must it do, and how can it reuse one of the inherited bodies?
4. Why does a record implement interfaces but never extend an abstract class?
5. In the template method pattern, why is the template method usually `final` and the step method `protected abstract`?
6. You are designing a type that three other teams will implement. Would you publish an interface, an abstract class, or both? Justify the choice.
