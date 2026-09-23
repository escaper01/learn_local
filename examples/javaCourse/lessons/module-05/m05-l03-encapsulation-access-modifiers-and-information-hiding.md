# Encapsulation, access modifiers, and information hiding

A class is not only a container for code; it is a promise to every other part of the program. Some parts of that promise are public ("you may call `reserve`"), and some are private details ("stock is currently stored in an `int` field"). **Encapsulation** is the discipline of exposing the promise while hiding the details. It is what allows a team of fifty developers to change one class without breaking forty others, and what lets a library ship a new version without forcing every user to rewrite their code.

Java enforces encapsulation with **access modifiers**: keywords that tell the compiler who may see each class, field, constructor, and method. In this lesson you will learn the modifiers, learn to write getters and setters correctly, and, just as importantly, learn when *not* to write them.

What you will learn:

- The four access levels in Java and exactly what each one allows
- Why `private` is per class, not per object
- How to write getters and setters with validation, and JavaBeans naming conventions
- When getters and setters undermine encapsulation instead of providing it
- Why an operation that validates and mutates together is stronger than a getter plus a setter
- How returning a mutable collection leaks your internal state, and how to prevent it
- How hiding representation lets you change a class without breaking its callers

## Information hiding in one picture

Think of a vending machine. You see buttons, a coin slot, and a tray. You cannot open the machine and move a can from one coil to another, and you do not know whether the stock count is kept on a chip or on paper. The owner can replace the whole internal mechanism, and your way of buying a drink does not change.

Classes should work the same way:

- **Interface** (what callers see): the operations and their documented behavior.
- **Implementation** (what callers must not depend on): fields, helper methods, data structures, algorithms.

Every piece of implementation you expose becomes something you can never change freely again, because some caller might depend on it.

## The four access levels

| Modifier | Same class | Same package | Subclass in another package | Any other code |
|---|---|---|---|---|
| `private` | Yes | No | No | No |
| (none) package-private | Yes | Yes | No | No |
| `protected` | Yes | Yes | Yes, through inheritance | No |
| `public` | Yes | Yes | Yes | Yes |

Notes on each level:

- **`private`** is the default choice for fields and helper methods. Only code inside the declaring class (including its nested classes) can use it.
- **Package-private** is what you get when you write no modifier. It allows collaboration among classes in the same package while keeping them hidden from the rest of the application. Lesson 5 of this chapter uses it to hide helpers behind a small public API.
- **`protected`** is for members that subclasses need. From another package, a subclass may use a protected member only through references of its own type (or subtypes), not on arbitrary instances of the parent. It also grants package access. You will use it in Chapter 7; beginners should reach for it rarely.
- **`public`** is a commitment. Anything public is part of your API.

Top-level classes can only be `public` or package-private. Members (fields, methods, constructors, nested types) can use all four.

When the compiler blocks an access, the message is precise:

```java
// fragment: in a class other than Account
Account account = new Account();
account.balance = -100;
```

```text
error: balance has private access in Account
```

This error is encapsulation working. The fix is never to "just make it public"; it is to call an operation that owns the change.

## `private` protects the class, not the object

A common misunderstanding is that `private` means "only this object". In Java, it means "only code written inside this class". A method of `Wallet` may read the private fields of *another* `Wallet`.

```java
public class PrivateScope {
    public static void main(String[] args) {
        Wallet a = new Wallet(500);
        Wallet b = new Wallet(300);
        System.out.println("a has more than b: " + a.hasMoreThan(b));
        a.moveTo(b, 250);
        System.out.println("a=" + a.describe() + ", b=" + b.describe());
        System.out.println("a has more than b: " + a.hasMoreThan(b));
    }
}

final class Wallet {
    private long cents;

    Wallet(long cents) {
        this.cents = cents;
    }

    boolean hasMoreThan(Wallet other) {
        return this.cents > other.cents;   // allowed: same class
    }

    void moveTo(Wallet target, long amount) {
        if (amount <= 0 || amount > cents) {
            throw new IllegalArgumentException("invalid amount");
        }
        this.cents -= amount;
        target.cents += amount;            // allowed: same class
    }

    String describe() {
        return String.valueOf(cents);
    }
}
```

Output:

```text
a has more than b: true
a=250, b=550
a has more than b: false
```

This is safe because the code touching `other.cents` was written by the same author who owns the invariants of `Wallet`. The boundary is the class's source code.

## Getters and setters done right

A **getter** (accessor) returns a piece of state; a **setter** (mutator) changes it. By the JavaBeans convention, a property `targetCelsius` has `getTargetCelsius()` and `setTargetCelsius(int)`, and a `boolean` property `heatingNeeded` uses `isHeatingNeeded()`. Many tools and frameworks (serialization libraries, UI binders, some persistence frameworks) recognize these names. Modern domain code and records (Chapter 6) often use the shorter style `targetCelsius()` instead; both are legitimate as long as a codebase is consistent.

A setter earns its place when it enforces the rules of the property:

```java
public class ThermostatDemo {
    public static void main(String[] args) {
        Thermostat hall = new Thermostat("Hall", 20);
        System.out.println(hall.getRoom() + " target: " + hall.getTargetCelsius());

        hall.setTargetCelsius(23);
        System.out.println("after set 23: " + hall.getTargetCelsius());

        try {
            hall.setTargetCelsius(90);
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }
        System.out.println("still: " + hall.getTargetCelsius());

        System.out.println("heating needed at 18: " + hall.isHeatingNeeded(18));
        System.out.println("heating needed at 25: " + hall.isHeatingNeeded(25));
    }
}

final class Thermostat {
    static final int MIN_CELSIUS = 5;
    static final int MAX_CELSIUS = 30;

    private final String room;
    private int targetCelsius;

    Thermostat(String room, int targetCelsius) {
        this.room = room;
        setTargetCelsius(targetCelsius);
    }

    public String getRoom() {
        return room;
    }

    public int getTargetCelsius() {
        return targetCelsius;
    }

    public void setTargetCelsius(int celsius) {
        if (celsius < MIN_CELSIUS || celsius > MAX_CELSIUS) {
            throw new IllegalArgumentException(
                    "target must be " + MIN_CELSIUS + ".." + MAX_CELSIUS + " but was " + celsius);
        }
        this.targetCelsius = celsius;
    }

    public boolean isHeatingNeeded(int currentCelsius) {
        return currentCelsius < targetCelsius;
    }
}
```

Output:

```text
Hall target: 20
after set 23: 23
rejected: target must be 5..30 but was 90
still: 23
heating needed at 18: true
heating needed at 25: false
```

Observe:

- `room` has a getter but **no setter**. A thermostat does not move rooms, so the field is `final` and nothing can change it.
- The constructor reuses the validating setter so the range rule lives in one place. This is safe only because the class is `final`; recall from the previous lesson that calling an overridable method from a constructor is a hazard.
- `isHeatingNeeded` is not a getter for a field at all. It is behavior computed from state. Callers do not need to know how it is decided.

### When not to write getters and setters

IDEs can generate a getter and setter for every field in one click. Resist it. Generating them blindly produces a class that is public data wearing a disguise.

| Situation | Better choice |
|---|---|
| The field should never change after construction | `final` field, getter only (or no getter) |
| Changes must follow a rule that involves the current state | A named operation (`withdraw`, `reserve`, `rename`) |
| Callers only need a derived answer | A query method (`isOverdue()`, `canAfford(price)`) |
| The field is an internal detail (cache, counter, helper) | No accessor at all |
| The field is a mutable collection or array | Return a copy or an unmodifiable view, never the field |
| A simple property with an independent range rule | A validating setter is fine |

The guiding idea is **"tell, don't ask"**: instead of asking an object for its data, making a decision, and pushing new data back in, tell the object what you want and let it decide.

## Keep validation and mutation in one operation

Consider stock in a warehouse. The rule: available stock never goes negative. Compare a getter/setter design with an operation-based design.

```java
public class InventoryDemo {
    public static void main(String[] args) {
        BeanInventory beans = new BeanInventory();
        beans.setAvailable(5);
        // Caller 1 remembers the rule.
        if (beans.getAvailable() >= 3) {
            beans.setAvailable(beans.getAvailable() - 3);
        }
        // Caller 2 forgets it.
        beans.setAvailable(beans.getAvailable() - 4);
        System.out.println("BeanInventory available: " + beans.getAvailable());

        Inventory stock = new Inventory(5);
        int[] requests = {3, 4, 0, 2, 1};
        for (int quantity : requests) {
            try {
                boolean ok = stock.reserve(quantity);
                System.out.println("reserve(" + quantity + ") -> " + ok + ", available=" + stock.available());
            } catch (IllegalArgumentException e) {
                System.out.println("reserve(" + quantity + ") -> error: " + e.getMessage()
                        + ", available=" + stock.available());
            }
        }
    }
}

class BeanInventory {
    private int available;

    public int getAvailable() {
        return available;
    }

    public void setAvailable(int available) {
        this.available = available;
    }
}

final class Inventory {
    private int available;

    Inventory(int initial) {
        if (initial < 0) {
            throw new IllegalArgumentException("initial stock must be >= 0");
        }
        this.available = initial;
    }

    boolean reserve(int quantity) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("quantity must be positive: " + quantity);
        }
        if (quantity > available) {
            return false;
        }
        available -= quantity;
        return true;
    }

    int available() {
        return available;
    }
}
```

Output:

```text
BeanInventory available: -2
reserve(3) -> true, available=2
reserve(4) -> false, available=2
reserve(0) -> error: quantity must be positive: 0, available=2
reserve(2) -> true, available=0
reserve(1) -> false, available=0
```

`BeanInventory` has a `private` field, so it *looks* encapsulated. It is not: the stock rule lives in each caller, and the second caller drove the stock to -2. `Inventory` has no setter at all. The only way to decrease stock is `reserve`, which checks availability and decrements in the same method. The rule is written once and cannot be skipped.

There is a second, subtler problem with the getter-then-setter pattern. Between `getAvailable()` and `setAvailable(...)` there is a window in which the check has been made but the change has not. If anything else modifies the stock in that window (another part of the code, or another thread in a concurrent program), the check is based on stale information. Putting check and change into one method closes the window *within the class's own code*.

> **Warning:** Encapsulation does not by itself make a class thread-safe. If several threads call `reserve` at the same moment, you still need synchronization or other concurrency tools, which Chapter 17 covers. What encapsulation gives you is a *single place* to add that protection later.

## Leaking representation through collections

A `private` field does not help if a getter hands out the object itself. Collections are the most common leak.

```java
import java.util.ArrayList;
import java.util.List;

public class LeakDemo {
    public static void main(String[] args) {
        LeakyCourse leaky = new LeakyCourse(3);
        leaky.enroll("Ada");
        leaky.enroll("Linus");
        leaky.enroll("Grace");
        leaky.getStudents().add("Mallory");
        System.out.println("leaky roster (capacity 3): " + leaky.getStudents());

        Course safe = new Course(3);
        safe.enroll("Ada");
        safe.enroll("Linus");
        List<String> view = safe.students();
        try {
            view.add("Mallory");
        } catch (UnsupportedOperationException e) {
            System.out.println("safe roster refused outside add: " + e.getClass().getSimpleName());
        }
        safe.enroll("Grace");
        System.out.println("earlier snapshot: " + view);
        System.out.println("current roster:   " + safe.students());
        System.out.println("enroll 4th: " + safe.enroll("Mallory"));
    }
}

class LeakyCourse {
    private final int capacity;
    private final List<String> students = new ArrayList<>();

    LeakyCourse(int capacity) {
        this.capacity = capacity;
    }

    boolean enroll(String name) {
        if (students.size() >= capacity) {
            return false;
        }
        students.add(name);
        return true;
    }

    List<String> getStudents() {
        return students;
    }
}

final class Course {
    private final int capacity;
    private final List<String> students = new ArrayList<>();

    Course(int capacity) {
        this.capacity = capacity;
    }

    boolean enroll(String name) {
        if (students.size() >= capacity) {
            return false;
        }
        students.add(name);
        return true;
    }

    List<String> students() {
        return List.copyOf(students);
    }
}
```

Output:

```text
leaky roster (capacity 3): [Ada, Linus, Grace, Mallory]
safe roster refused outside add: UnsupportedOperationException
earlier snapshot: [Ada, Linus]
current roster:   [Ada, Linus, Grace]
enroll 4th: false
```

`LeakyCourse.getStudents()` returns a reference to the internal list, so a caller bypassed the capacity rule with a single `add`. `Course.students()` returns `List.copyOf(students)`: an unmodifiable snapshot. Callers can read it but cannot change the course through it, and the snapshot does not change when the course does.

| Technique | Caller can modify it? | Reflects later changes? | Cost |
|---|---|---|---|
| Return the field | Yes, and changes hit your object | Yes | None, but unsafe |
| `List.copyOf(field)` | No (throws `UnsupportedOperationException`) | No, it is a snapshot | Copies the list; rejects `null` elements |
| `Collections.unmodifiableList(field)` | No | Yes, it is a read-only view | No copy |
| `new ArrayList<>(field)` | Yes, but only the copy | No | Copies the list |

The same concern applies in the other direction: if a constructor stores a caller's list without copying it, the caller can still modify it afterwards. Chapter 4 introduced defensive copying; Chapter 6 revisits it for records.

## Why hiding representation pays off: API evolution

Suppose `Inventory` later needs to track stock per warehouse using a `Map<String, Integer>`. Because callers only use `reserve(quantity)` and `available()`, you can rewrite the internals and every caller keeps compiling and working. If callers had written `inventory.available -= 3` directly, changing the field would break all of them.

The less you expose, the more freedom you keep. Visibility can be widened later with little risk; narrowing it after others depend on it breaks their code.

## What happens under the hood

Access checks happen mainly at **compile time**: `javac` refuses to compile code that uses an inaccessible member. The JVM also verifies access when it links classes, so you cannot bypass the rules by hand-editing bytecode. Reflection can override some checks for code that explicitly requests it, and the module system (next lessons) restricts even that for packages a module does not open. Access modifiers are therefore a genuine boundary, not just documentation.

Access modifiers cost nothing at run time for ordinary calls. The JIT compiler inlines small getters, so a simple accessor is typically as fast as a direct field read.

## Common mistakes

### Making a field public to fix a compile error

```java
account.balance = -100;   // error: balance has private access in Account
```

Wrong fix: change `private long balance` to `public long balance`. Right fix: call the operation that owns the change (`account.withdraw(100)`) or, if no such operation exists, design one with validation.

### Generating a setter for every field

A `setId` on an entity lets callers change identity; a `setCreatedAt` lets them rewrite history; a `setBalance` bypasses `withdraw`. Delete setters that do not correspond to a legitimate, validated domain action.

### Getter-then-setter logic outside the class

```java
// wrong: the rule lives in the caller
if (inventory.getAvailable() >= qty) {
    inventory.setAvailable(inventory.getAvailable() - qty);
}
```

Every caller must remember the check, and the check and change are separated. Move the logic into one method on the class.

### Returning internal mutable objects

Returning a `List`, `Map`, array, or `StringBuilder` field lets callers mutate your state. Return a copy or an unmodifiable view.

### Assuming `private` means per object

Code in `Wallet` can read another `Wallet`'s private fields. That is intentional and useful for comparisons and transfers.

## Best practices

- Start every field as `private`. Widen only with a concrete reason.
- Prefer `final` fields; add mutation only through named operations.
- Name mutating methods after domain actions and put validation inside them, before any state change.
- Leave the object unchanged when an operation fails.
- Never return internal mutable collections or arrays; never store caller-supplied ones without copying.
- Keep helper classes and methods package-private or private. Your public surface is your maintenance burden.
- Document public methods: units, allowed ranges, null behavior, and what happens on failure.

## Summary

- Encapsulation hides implementation behind operations so callers depend only on promises.
- Java has four access levels: `private`, package-private (no keyword), `protected`, and `public`.
- `private` restricts access to the declaring class's code, not to a single object.
- Getters and setters are useful when they enforce rules; generated for every field, they expose representation.
- An operation such as `reserve(quantity)` that validates and mutates in one place keeps the invariant in one place and removes the gap between check and change.
- Returning a mutable collection field leaks state; return `List.copyOf` or an unmodifiable view.
- Encapsulation gives you one place to add thread safety later, but does not provide it automatically.
- Hidden representation can change without breaking callers.

## Practice

### Warm-up

1. Create a `Person` class with private `name` and `age` fields, a constructor, getters for both, and a `setAge` that rejects values below 0 or above 150.
2. From another class, try to assign `person.age` directly and record the exact compiler message.

### Core

1. Add `release(int quantity)` to `Inventory`. Reject nonpositive quantities and detect `int` overflow (use `Math.addExact`). Show that failed calls preserve stock.
2. Write a `Playlist` class that stores song titles. Provide `add`, `remove`, and a `songs()` method that callers cannot use to modify the playlist. Prove it with a `try`/`catch`.
3. Take a class with generated getters and setters for every field (for example `Order` with `id`, `status`, `total`, `createdAt`). Decide which setters to delete and which domain operations to add. Justify each decision in a comment.

### Challenge

1. Rewrite `Inventory` to store stock per warehouse in a `Map<String, Integer>` while keeping the exact public methods callers already use, plus a new `reserve(String warehouse, int quantity)`. Confirm your earlier test program still compiles unchanged.
2. List which members of `Inventory` must be `public` if it moves into its own package and a class in another package must reserve stock. What evidence would justify making anything else public?

## Check your understanding

1. Which access level do you get when you write no modifier, and who can use such a member?
2. Why can a method in `Wallet` read the private field of a different `Wallet` object?
3. A class has a private `stock` field with an unrestricted setter. Is it encapsulated? Explain using the stock rule.
4. What benefit does a single `reserve(quantity)` method have over callers using `getAvailable()` followed by `setAvailable(...)`? Does that design alone make it safe for many threads?
5. What is the difference between returning `List.copyOf(list)` and `Collections.unmodifiableList(list)`?
6. Why is it easier to widen visibility later than to narrow it?
