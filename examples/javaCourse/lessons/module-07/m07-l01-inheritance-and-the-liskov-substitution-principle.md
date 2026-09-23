# Inheritance and the Liskov substitution principle

Almost every Java program you will ever work on uses inheritance, even if you never write `extends` yourself. Every class inherits from `Object`. Frameworks hand you base classes to extend. Collections are used through supertypes such as `List` and `Map`. Understanding what inheritance really promises, and when it quietly breaks those promises, is one of the dividing lines between someone who can write Java syntax and someone who can design Java software.

This lesson teaches the mechanics first (how `extends`, `super`, and `protected` work) and then the rule that makes inheritance safe: a subtype must be a genuine, working substitute for its supertype.

## What you will learn

- How `extends` creates an IS-A relationship and what a subclass inherits
- How constructors chain with `super(...)` and in which order they run
- What the `protected` modifier allows, and why it should be used sparingly
- How to refer to a subclass object through a superclass variable (upcasting) and how to safely go back (downcasting)
- Why `Object` is at the top of every class hierarchy
- The Liskov substitution principle (LSP) and how to recognise a subtype that breaks it
- Why composition is often a better tool than inheritance for reusing code

## Inheritance: an IS-A relationship

Inheritance lets one class build on another. The existing class is called the **superclass** (also parent or base class). The new class is the **subclass** (child or derived class). You declare the relationship with `extends`.

```java
// Fragment
class Employee { /* name, salary, monthlyPay() ... */ }
class Manager extends Employee { /* adds a bonus */ }
```

Read `Manager extends Employee` as "a Manager **is an** Employee". That sentence must be true in your domain, not just convenient in your code. A manager really is an employee: they get paid, they have a name, they appear on the payroll. That is the test to apply before you ever type `extends`.

A subclass automatically inherits the superclass's accessible fields and methods. It can then:

- add new fields and methods (a manager has a bonus)
- **override** inherited methods to specialise behavior (a manager's pay includes the bonus)
- use the inherited members as if they were its own

Java allows **single class inheritance only**: a class has exactly one direct superclass. If you do not write `extends`, the compiler inserts `extends Object` for you. Trying to name two superclasses is a syntax error:

```java
// Fragment: does not compile
class C extends A, B { }
```

```text
error: '{' expected
class C extends A, B { }
                 ^
```

(A class can implement many *interfaces*; that is the subject of the next lesson.)

## Constructors, super, and protected in action

Constructors are **not** inherited. Instead, every constructor must first run a constructor of its superclass, so that the inherited part of the object is set up before the subclass part. You choose which one with `super(...)`.

This first complete program shows inheritance, constructor chaining, a `protected` field, and overriding together.

```java
public class InheritanceBasics {
    public static void main(String[] args) {
        Employee ada = new Employee("Ada", 5000);
        Manager grace = new Manager("Grace", 7000, 1500);

        System.out.println(ada.describe());
        System.out.println(grace.describe());
        System.out.println("Ada pay: " + ada.monthlyPay());
        System.out.println("Grace pay: " + grace.monthlyPay());
        System.out.println("Grace is an Employee? " + (grace instanceof Employee));
        System.out.println("Name via inherited method: " + grace.name());
    }
}

class Employee {
    private final String name;          // only Employee's own code can touch this
    protected final int baseSalary;     // subclasses may read this directly

    Employee(String name, int baseSalary) {
        System.out.println("Employee constructor runs for " + name);
        this.name = name;
        this.baseSalary = baseSalary;
    }

    String name() {
        return name;
    }

    int monthlyPay() {
        return baseSalary;
    }

    String describe() {
        return name + " (employee)";
    }
}

class Manager extends Employee {
    private final int bonus;

    Manager(String name, int baseSalary, int bonus) {
        super(name, baseSalary);        // runs the Employee constructor first
        System.out.println("Manager constructor runs for " + name);
        this.bonus = bonus;
    }

    @Override
    int monthlyPay() {
        return baseSalary + bonus;      // protected field is visible here
    }

    @Override
    String describe() {
        return name() + " (manager, bonus " + bonus + ")";
    }
}
```

```text
Employee constructor runs for Ada
Employee constructor runs for Grace
Manager constructor runs for Grace
Ada (employee)
Grace (manager, bonus 1500)
Ada pay: 5000
Grace pay: 8500
Grace is an Employee? true
Name via inherited method: Grace
```

Notice three things:

1. Creating `grace` printed **two** constructor messages, parent first.
2. `Manager` could read `baseSalary` directly because it is `protected`, but it had to call `name()` to get the name, because `name` is `private`. Private members exist inside every `Manager` object, but only `Employee`'s code can touch them.
3. `@Override` marks methods that replace inherited ones. Lesson 3 covers overriding in depth; for now, treat it as a safety label the compiler checks.

### Step-by-step trace of `new Manager("Grace", 7000, 1500)`

1. Memory for one object is allocated, large enough for `name`, `baseSalary`, and `bonus`. Every field starts at its default (`null`, `0`).
2. The `Manager` constructor starts. Its first statement is `super(name, baseSalary)`.
3. Control jumps to the `Employee` constructor. That constructor implicitly calls `super()` for `Object` first, which does nothing visible.
4. `Employee` prints its message and assigns `name` and `baseSalary`.
5. Control returns to `Manager`, which prints its message and assigns `bonus`.
6. The finished reference is stored in `grace`.

Construction always runs **top-down**: `Object`, then `Employee`, then `Manager`. There is only one object; it just has layers initialised in order.

### The rules for super(...)

- In Java 21, `super(...)` (or `this(...)`) must be the **first statement** of a constructor.
- If you write neither, the compiler inserts `super()` (no arguments) for you.
- If the superclass has no no-argument constructor, that automatic `super()` fails to compile, so you must call `super(...)` with arguments explicitly.

`super` has a second use: `super.someMethod()` calls the superclass version of a method from inside an override. You will use that in lesson 3.

## The protected modifier

You already know `private` (this class only), package-private (no modifier: same package), and `public` (everyone). `protected` sits between package-private and public:

| Modifier | Same class | Same package | Subclass in another package | Everyone else |
|---|---|---|---|---|
| `private` | yes | no | no | no |
| (none) package-private | yes | yes | no | no |
| `protected` | yes | yes | yes, through the subclass's own objects | no |
| `public` | yes | yes | yes | yes |

The subtle part: a subclass in a *different* package may use an inherited protected member through `this` or through references of its own type, but not through an arbitrary reference to the superclass.

```java
// Fragment: Manager lives in package com.acme.hr.admin, Employee in com.acme.hr
class Manager extends Employee {
    int doubledBase() { return baseSalary * 2; }             // OK: my own inherited field
    int peek(Employee other) { return other.baseSalary; }     // compile error in another package
    int peekManager(Manager other) { return other.baseSalary; } // OK: reference of my own type
}
```

```text
error: baseSalary has protected access in Employee
    int peek(Employee other) { return other.baseSalary; }
                                           ^
```

> **Warning:** A protected field is part of your class's public-facing contract for every subclass that will ever exist. If you later rename or reinterpret it, every subclass breaks. Prefer `private` fields plus `protected` or public *methods* that expose exactly what subclasses need.

## Referencing subclass objects through superclass types

Because a `Manager` IS-A `Employee`, a variable of type `Employee` may hold a `Manager`. This is called **upcasting** and it is automatic and always safe.

```java
// Fragment
Employee e = new Manager("Grace", 7000, 1500);  // upcast: no cast needed
Object o = e;                                    // everything is an Object
```

Two different types are involved, and it is essential to keep them apart:

- The **declared (static) type** of the variable, here `Employee`, decides which methods you are *allowed to call*. The compiler checks this.
- The **runtime type** of the object, here `Manager`, decides *which implementation runs* when you call an overridden method.

Going the other way, from a supertype variable to a subtype, is **downcasting**. It needs an explicit cast and can fail at runtime, so check first with `instanceof`. Java 16+ pattern matching (`x instanceof Car car`) checks and casts in one step.

```java
public class SuperclassReferences {
    public static void main(String[] args) {
        Vehicle[] fleet = { new Car("Civic"), new Truck("Actros", 18), new Car("Golf") };

        for (Vehicle v : fleet) {
            System.out.println(v.label() + " -> wheels: " + v.wheels());
        }

        Vehicle first = fleet[0];
        // first.openTrunk();   // does not compile: Vehicle has no openTrunk()

        if (first instanceof Car car) {          // safe downcast with a pattern
            System.out.println(car.openTrunk());
        }

        Vehicle second = fleet[1];
        try {
            Car wrong = (Car) second;            // compiles, but fails at runtime
            System.out.println(wrong.openTrunk());
        } catch (ClassCastException e) {
            System.out.println("ClassCastException: a Truck is not a Car");
        }

        Object anything = fleet[2];              // every object is an Object
        System.out.println("Stored as Object: " + anything.getClass().getSimpleName());
    }
}

class Vehicle {
    private final String model;

    Vehicle(String model) {
        this.model = model;
    }

    String label() {
        return getClass().getSimpleName() + " " + model;
    }

    int wheels() {
        return 4;
    }
}

class Car extends Vehicle {
    Car(String model) {
        super(model);
    }

    String openTrunk() {
        return "Trunk opened on " + label();
    }
}

class Truck extends Vehicle {
    private final int wheelCount;

    Truck(String model, int wheelCount) {
        super(model);
        this.wheelCount = wheelCount;
    }

    @Override
    int wheels() {
        return wheelCount;
    }
}
```

```text
Car Civic -> wheels: 4
Truck Actros -> wheels: 18
Car Golf -> wheels: 4
Trunk opened on Car Civic
ClassCastException: a Truck is not a Car
Stored as Object: Car
```

The loop treats every vehicle uniformly through `Vehicle`, yet the truck reports 18 wheels. That is the power of inheritance: code written against the supertype automatically works with subtypes, including ones written years later. But that power depends entirely on the subtypes *behaving* like the supertype, which brings us to the most important idea in this lesson.

## Object: the root of every hierarchy

Every class ultimately extends `java.lang.Object`, so every object has these methods, among others:

| Method | Default behavior | Usually overridden? |
|---|---|---|
| `toString()` | class name, `@`, and a hexadecimal hash, such as `Car@1b6d3586` | Yes, for readable output |
| `equals(Object)` | same as `==` (identity) | Yes, for value-like classes |
| `hashCode()` | identity-based number | Yes, whenever `equals` is |
| `getClass()` | the runtime class | Cannot be overridden (it is `final`) |

Lesson 4 is devoted to `equals` and `hashCode`. For now, remember that "every object is an `Object`" is the reason a variable of type `Object` can hold anything.

## The Liskov substitution principle

Barbara Liskov stated the principle that bears her name. In practical terms:

> **Note:** If code works correctly with a supertype, it must keep working correctly when handed any subtype. A subtype may *add* abilities and may *strengthen* what it guarantees, but it must not demand more from callers or deliver less than the supertype promised.

The compiler checks only the *shape* of a subtype: method names, parameter types, return types. It cannot check *behavior*. A subclass can compile perfectly and still be a broken substitute. LSP is about that behavioral contract. Concretely, a well-behaved subtype:

- accepts **at least** every input the supertype accepts (it must not add stricter preconditions)
- delivers **at least** every guarantee the supertype makes about results (it must not weaken postconditions)
- preserves the supertype's invariants (facts that are always true about its state)
- does not throw new kinds of failures for operations the supertype says will succeed

If a subtype refuses an input its parent promised to accept, every caller written against the parent is now at risk. That caller did nothing wrong; it trusted the contract.

### The classic example: Square extends Rectangle

Geometry says a square is a rectangle, so it is tempting to model it that way. But the class `Rectangle` promises something geometry does not: width and height can be changed independently.

```java
public class SquareRectangleProblem {
    // Written against Rectangle's promise: width and height change independently.
    static void stretchToBanner(Rectangle r) {
        r.setWidth(10);
        r.setHeight(2);
        int expected = 10 * 2;
        System.out.println(r.getClass().getSimpleName()
                + ": expected area " + expected + ", actual area " + r.area());
    }

    public static void main(String[] args) {
        stretchToBanner(new Rectangle(1, 1));
        stretchToBanner(new Square(1));
    }
}

class Rectangle {
    protected int width;
    protected int height;

    Rectangle(int width, int height) {
        this.width = width;
        this.height = height;
    }

    void setWidth(int width) {
        this.width = width;
    }

    void setHeight(int height) {
        this.height = height;
    }

    int area() {
        return width * height;
    }
}

class Square extends Rectangle {
    Square(int side) {
        super(side, side);
    }

    // To stay a square, each setter silently changes BOTH sides.
    @Override
    void setWidth(int width) {
        this.width = width;
        this.height = width;
    }

    @Override
    void setHeight(int height) {
        this.width = height;
        this.height = height;
    }
}
```

```text
Rectangle: expected area 20, actual area 20
Square: expected area 20, actual area 4
```

`stretchToBanner` is correct code. It relies only on what `Rectangle` promises. `Square` compiles, overrides legally, and even keeps its own invariant (all sides equal), yet it breaks the parent's promise. The bug appears in code that never mentions `Square`. That is what makes LSP violations so costly: the failure shows up far from the cause.

The alternatives a Square could choose are all bad: silently changing both sides (above), throwing `UnsupportedOperationException` from a setter (refusing an operation the parent promised), or ignoring one call. The design itself is wrong, not the implementation.

### Fixing the design

The fix is to stop promising what not every shape can deliver. Immutable shapes behind a narrow interface have no independent setters to break:

```java
public class ShapesDoneRight {
    public static void main(String[] args) {
        Shape[] shapes = { new Rect(10, 2), new Sq(3) };
        for (Shape s : shapes) {
            System.out.println(s.describe() + " has area " + s.area());
        }

        Rect banner = new Rect(1, 1).withWidth(10).withHeight(2);
        System.out.println("Banner: " + banner.describe() + ", area " + banner.area());

        Sq bigger = new Sq(3).withSide(5);
        System.out.println("Bigger: " + bigger.describe() + ", area " + bigger.area());
    }
}

interface Shape {
    int area();
    String describe();
}

record Rect(int width, int height) implements Shape {
    public int area() { return width * height; }
    public String describe() { return "Rect " + width + "x" + height; }
    Rect withWidth(int w) { return new Rect(w, height); }
    Rect withHeight(int h) { return new Rect(width, h); }
}

record Sq(int side) implements Shape {
    public int area() { return side * side; }
    public String describe() { return "Square " + side; }
    Sq withSide(int s) { return new Sq(s); }
}
```

```text
Rect 10x2 has area 20
Square 3 has area 9
Banner: Rect 10x2, area 20
Bigger: Square 5, area 25
```

`Shape` promises only what every shape can honour: an area and a description. Each type offers its own "change" operations that return new values, so nobody can be surprised.

> **Tip:** When a subtype needs to throw on, ignore, or reinterpret an inherited operation, stop and question the abstraction itself. The problem is almost always a supertype that promises too much.

### Optional operations are a documented exception

The JDK's `List` interface documents `add` as an *optional operation*: `List.of(...)` returns lists that throw `UnsupportedOperationException` on `add`. This does not violate LSP, because the contract explicitly warns callers that modification may be unsupported. The lesson: a subtype may only refuse what the supertype's documented contract allows it to refuse.

## Composition: reuse without inheritance

Inheritance is often misused just to reuse code. **Composition** means holding a reference to another object and delegating to it. It is a HAS-A relationship, and it lets you reuse behavior without inheriting construction details, protected state, or promises you cannot keep.

```java
import java.util.ArrayList;
import java.util.List;

public class CompositionDemo {
    public static void main(String[] args) {
        ConsoleNotifier console = new ConsoleNotifier();
        AuditNotifier audited = new AuditNotifier(console);

        Notifier[] notifiers = { console, audited };
        for (Notifier n : notifiers) {
            n.send("Build 42 passed");
        }
        System.out.println("Audit log: " + audited.log());
    }
}

interface Notifier {
    void send(String message);
}

final class ConsoleNotifier implements Notifier {
    @Override
    public void send(String message) {
        System.out.println("[console] " + message);
    }
}

final class AuditNotifier implements Notifier {
    private final Notifier delegate;                 // HAS-A, not IS-A
    private final List<String> log = new ArrayList<>();

    AuditNotifier(Notifier delegate) {
        this.delegate = delegate;
    }

    @Override
    public void send(String message) {
        log.add(message);                            // extra behavior
        delegate.send(message);                      // reuse by delegation
    }

    List<String> log() {
        return List.copyOf(log);
    }
}
```

```text
[console] Build 42 passed
[console] Build 42 passed
Audit log: [Build 42 passed]
```

`AuditNotifier` can wrap *any* `Notifier` (console, email, a test fake) chosen at runtime. With inheritance it could only extend one concrete class, chosen at compile time. Wrappers still have contracts, though: decide and document whether an audit failure should stop delivery.

| Question | Inheritance (`extends`) | Composition (field + delegation) |
|---|---|---|
| Relationship | IS-A | HAS-A / uses-a |
| Chosen when | compile time | can be chosen at runtime |
| Coupling | tight: sees protected state and depends on parent internals | loose: only the collaborator's public interface |
| How many | one superclass | any number of collaborators |
| Main risk | fragile base class, LSP violations | a little more boilerplate |

## Common mistakes

### 1. Forgetting to call a superclass constructor that needs arguments

```java
// Wrong
class Employee { Employee(String name) { } }
class Manager extends Employee {
    Manager(String name) {
        System.out.println("creating manager");   // implicit super() inserted before this
    }
}
```

```text
error: constructor Employee in class Employee cannot be applied to given types;
  required: String
  found:    no arguments
```

Fix: start the constructor with `super(name);`.

### 2. Putting code before super(...) in Java 21

```java
// Wrong in Java 21
Manager(String name) {
    System.out.println("creating manager");
    super(name);
}
```

```text
error: call to super must be first statement in constructor
```

Fix: make `super(...)` the first statement. If you need to compute an argument, use a `private static` helper method: `super(normalize(name));`.

### 3. Calling a subclass-only method through a superclass variable

```java
// Wrong
Vehicle v = new Car("Civic");
v.openTrunk();
```

```text
error: cannot find symbol
  symbol:   method openTrunk()
  location: variable v of type Vehicle
```

Fix: either the method belongs in the supertype (every vehicle can do it), or check the type first with `if (v instanceof Car car) car.openTrunk();`. If you find yourself downcasting often, the abstraction is probably missing a method.

### 4. Casting without checking

`(Car) someVehicle` compiles for any `Vehicle` but throws `ClassCastException` at runtime when the object is actually a `Truck`. Use `instanceof` patterns, or better, a polymorphic method.

### 5. Inheriting for code reuse when IS-A is false

`class Stack extends ArrayList` gives a stack `add(index, x)` and `remove(index)`, letting callers break stack order. Keep an `ArrayList` as a private field instead.

## Best practices

- Apply the IS-A test *and* the behavioral test: "Can every piece of code written for the parent use this child without surprises?"
- Prefer composition for reuse; use inheritance for genuine specialisation of a stable abstraction.
- Keep fields `private`. Expose protected *methods* only when a subclass genuinely needs a hook.
- Program against the most general type that offers what you need: `List<String> names = new ArrayList<>();`.
- Mark classes `final` unless you have designed and documented them for extension (lesson 3).
- Write **contract tests**: one test method that runs against every implementation of a type. If a new subclass fails the parent's test, it is not a valid substitute.
- Document failure behavior (what inputs are accepted, what exceptions are possible) as part of the supertype contract, so implementers know exactly what they must honour.

## Summary

- `extends` creates an IS-A relationship; a class has exactly one direct superclass, and `Object` is the ultimate root.
- Constructors are not inherited; `super(...)` runs the parent constructor first, and construction proceeds from `Object` down.
- `protected` grants access to the same package and to subclasses; protected fields couple subclasses to your internals.
- A superclass variable can hold a subclass object. The declared type controls what you may call; the runtime type controls which override runs. Downcast only after `instanceof`.
- The Liskov substitution principle says subtypes must be behavioral substitutes: no stricter input requirements, no weaker guarantees, no broken invariants, no surprise failures.
- LSP violations compile fine and fail in innocent client code, far from their cause.
- Composition (HAS-A plus delegation) is frequently the safer way to reuse behavior.

## Practice

### Warm-up

1. Create `Animal` with a private `name`, a constructor, and a `describe()` method. Create `Cat extends Animal` that calls `super(name)`. Add print statements to both constructors and predict the output order before running.
2. Store a `Cat` in an `Animal` variable and an `Object` variable. List which methods you can call through each variable.

### Core

1. Build a `BankAccount` with a `withdraw(int amount)` method documented as: "succeeds for any amount up to the balance". Write a `SavingsAccount` subclass that refuses withdrawals over 500. Write a method that relies on the parent's promise and show how the subclass breaks it. Then redesign so the limit is part of the documented contract of the supertype, or so the two types no longer share that promise.
2. Replace the Rectangle/Square hierarchy in your own words using immutable records and a narrow interface, and add a contract test method `checkArea(Shape s, int expected)` that runs against both.
3. Turn a `Stack extends ArrayList<String>` design into composition, exposing only `push`, `pop`, `peek`, and `isEmpty`.

### Challenge

1. Write one contract test method that can run against every `Notifier` implementation, including a `FailingNotifier` whose documented behavior is to throw `IllegalStateException`. Decide whether `AuditNotifier` should record messages that failed to send, document the decision, and make the test verify it.
2. Find a class in the JDK documentation that is designed for extension (for example one with "protected" hook methods). Write down which methods subclasses are expected to override and which guarantees they must preserve.

## Check your understanding

1. What exactly runs, and in what order, when you create an object of a class that is three levels deep in a hierarchy?
2. Why does calling a subclass-only method through a superclass variable fail at compile time even though the object really has that method?
3. A subclass in another package wants to read a protected field of a *different* object that is only known as the superclass type. Is that allowed? Why might Java make that restriction?
4. A subclass accepts fewer inputs than its parent promised. Which kind of promise is broken, and where in the program would you expect the bug to appear?
5. Give one situation where composition is clearly better than inheritance, and one where inheritance is the natural choice.
6. Why does `List.of(...).add(x)` throwing an exception not count as a substitution failure, while a `Square` changing both sides does?
