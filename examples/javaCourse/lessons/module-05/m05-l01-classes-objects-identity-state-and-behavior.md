# Classes, objects, identity, state, and behavior

Up to now your programs have been a sequence of statements inside `main`, with data held in local variables and arrays. That style works for small scripts, but real applications model *things*: bank accounts, orders, students, invoices, library books. Each thing has data that changes over time and rules about how it may change. Object-oriented programming (OOP) is Java's main tool for keeping that data and those rules together, so that the rules cannot be skipped by accident.

This lesson is the foundation for everything that follows in the course. Every Java framework, library, and codebase you will meet is built out of classes and objects, and the difference between a beginner and a professional is often visible in one question: *who is allowed to change this data, and who checks that the change is valid?*

What you will learn:

- What object-oriented programming is and why Java is built around it
- How to define a class with fields (properties) and create objects from it with `new`
- The default values fields receive and why they can surprise you
- How instance methods give objects behavior, and what `this` refers to
- The difference between a reference and an object, and what identity means
- Why state should be changed only through operations that validate it
- How to recognize a data bag that lets callers break the rules

## What object-oriented programming is

In procedural code, data and the functions that work on it live apart. A `balance` variable sits in one place and a `withdraw` function somewhere else; nothing stops another part of the program from writing `balance = -500` directly.

Object-oriented programming groups them. An **object** is a bundle of:

- **State**: the data it currently holds, stored in *fields* (also called properties or instance variables).
- **Behavior**: the operations it supports, written as *instance methods*.
- **Identity**: the fact that it is a distinct thing in memory, separate from every other object, even one holding identical data.

A **class** is the definition that describes what state and behavior its objects have. A useful analogy is a cookie cutter and cookies: the class is the cutter, each object is one cookie. All cookies share a shape, but each one is separate, and biting one does not change the others.

Four ideas are traditionally associated with OOP. You will meet each of them in depth over the next chapters:

| Idea | Meaning | Where it is taught |
|---|---|---|
| Encapsulation | Keep state private and expose operations that protect it | This chapter |
| Abstraction | Callers use *what* an object does, not *how* it does it | This chapter and Chapter 7 |
| Inheritance | A class can extend another and reuse or specialize it | Chapter 7 |
| Polymorphism | One call can run different code depending on the object's actual type | Chapter 7 |

For now focus on the first two. They are the ones you will use in every single class you write.

## Defining a class and creating objects

A class declaration lists fields and methods. Creating an object uses the `new` operator, which allocates memory for a fresh object, initializes its fields, runs a constructor, and returns a **reference** to the new object.

The following complete program defines a `Book` class with three fields and creates three books.

```java
public class BookDemo {
    public static void main(String[] args) {
        Book first = new Book();
        first.title = "Java Basics";
        first.pages = 320;
        first.borrowed = true;

        Book second = new Book();
        second.title = "Domain Modeling";
        second.pages = 280;

        Book blank = new Book();

        System.out.println(first.title + ", " + first.pages + " pages, borrowed=" + first.borrowed);
        System.out.println(second.title + ", " + second.pages + " pages, borrowed=" + second.borrowed);
        System.out.println("Defaults: title=" + blank.title + ", pages=" + blank.pages + ", borrowed=" + blank.borrowed);
    }
}

class Book {
    String title;
    int pages;
    boolean borrowed;
}
```

Output:

```text
Java Basics, 320 pages, borrowed=true
Domain Modeling, 280 pages, borrowed=false
Defaults: title=null, pages=0, borrowed=false
```

Several things are worth noticing:

- Each `new Book()` creates a separate object with its own copy of `title`, `pages`, and `borrowed`. Setting `first.pages` does not affect `second.pages`.
- Fields are accessed with the dot operator: `first.title`.
- Unlike local variables, fields always have a value. If you do not assign one, Java gives them a **default value**.
- The file contains two classes. Only one top-level class per file may be `public`, and it must match the file name when you compile with `javac`. Helper classes such as `Book` can sit in the same file without `public` while you are learning; later lessons put each public class in its own file.

### Default field values

| Field type | Default value |
|---|---|
| `byte`, `short`, `int`, `long` | `0` |
| `float`, `double` | `0.0` |
| `char` | `'\u0000'` (the null character) |
| `boolean` | `false` |
| Any reference type (`String`, arrays, your own classes) | `null` |

Defaults are convenient, but they are also dangerous: a `Book` whose `title` is `null` and whose `pages` is `0` is not a meaningful book. The next lesson shows how constructors prevent such half-built objects.

> **Note:** Local variables do *not* get defaults. Reading a local variable before assigning it is a compile error ("variable x might not have been initialized"). Fields get defaults because the compiler cannot track every path by which an object might be used.

## Behavior: instance methods and `this`

Data alone is only half an object. Methods declared without the `static` keyword are **instance methods**: they run *on* a particular object and can read and write that object's fields.

```java
public class LampDemo {
    public static void main(String[] args) {
        Lamp desk = new Lamp();
        Lamp hall = new Lamp();

        desk.turnOn();
        desk.dim(40);
        hall.turnOn();
        hall.turnOff();

        System.out.println("desk: " + desk.describe());
        System.out.println("hall: " + hall.describe());
    }
}

class Lamp {
    boolean on;
    int brightness = 100;

    void turnOn() {
        on = true;
    }

    void turnOff() {
        on = false;
    }

    void dim(int percent) {
        brightness = percent;
    }

    String describe() {
        return on ? "on at " + brightness + "%" : "off";
    }
}
```

Output:

```text
desk: on at 40%
hall: off
```

When `desk.turnOn()` runs, the method body writes `on = true`. Which lamp's `on`? The one the method was called on. Inside every instance method there is a hidden reference named `this` that points to the receiving object. `on = true` is shorthand for `this.on = true`. When `hall.turnOn()` runs, `this` refers to the hall lamp instead.

The line `int brightness = 100;` is a **field initializer**: every new lamp starts at 100 instead of the default 0.

A fragment showing where `this` becomes necessary, when a parameter has the same name as a field:

```java
// fragment
void rename(String title) {
    this.title = title; // left: the field; right: the parameter
}
```

Without `this.`, the name `title` refers to the nearest declaration, which is the parameter, and the field would never change.

## References, identity, and equality

A variable of a class type does not hold the object itself. It holds a **reference**, which you can think of as the object's address. The object lives on the heap; variables merely point at it. This has consequences that surprise many beginners:

- Assigning one reference variable to another copies the reference, not the object. Both variables now point at the same object.
- `==` on references asks "are these the same object?" This is **identity**.
- Two different objects can hold equal data but still be two objects.

```java
public class IdentityDemo {
    public static void main(String[] args) {
        Account alice = new Account("ACC-1", 100);
        Account alias = alice;
        Account twin = new Account("ACC-1", 100);

        System.out.println("alice == alias: " + (alice == alias));
        System.out.println("alice == twin:  " + (alice == twin));

        alias.deposit(50);
        System.out.println("alice balance after deposit through alias: " + alice.balance());
        System.out.println("twin balance: " + twin.balance());

        reset(alice);
        System.out.println("alice balance after reset(alice): " + alice.balance());
    }

    static void reset(Account account) {
        account.withdraw(account.balance());
        account = new Account("ACC-99", 999);
    }
}

class Account {
    private final String number;
    private long balance;

    Account(String number, long openingBalance) {
        this.number = number;
        this.balance = openingBalance;
    }

    void deposit(long amount) {
        balance += amount;
    }

    void withdraw(long amount) {
        balance -= amount;
    }

    long balance() {
        return balance;
    }

    String number() {
        return number;
    }
}
```

Output:

```text
alice == alias: true
alice == twin:  false
alice balance after deposit through alias: 150
twin balance: 100
alice balance after reset(alice): 0
```

(The `Account(...)` block is a constructor and `private` hides the fields; both are covered in detail in the next two lessons.)

### Step-by-step trace

1. `new Account("ACC-1", 100)` creates object #1. `alice` holds a reference to it.
2. `alias = alice` copies the reference. Both variables point at object #1. No new account exists.
3. `new Account("ACC-1", 100)` creates object #2 with the same data. `twin` points at it.
4. `alice == alias` compares references: same object, so `true`. `alice == twin` compares two different objects: `false`, even though every field matches.
5. `alias.deposit(50)` changes object #1. Reading through `alice` shows 150 because it is the same object. Object #2 is untouched.
6. `reset(alice)` passes a *copy of the reference*. Inside the method, `account.withdraw(...)` changes object #1 through that copy. Then `account = new Account(...)` only redirects the method's local parameter; `alice` in `main` still points at object #1, now at 0.

Java always passes arguments by value. For reference types, the value being copied is the reference. That is why a method can change the object you pass it but cannot make your variable point somewhere else.

### Entities versus values

Two accounts that both hold 100 are still two different accounts: money deposited into one must not appear in the other. Such objects are **entities**: their identity matters and persists while their state changes. By contrast, two measurements of "5 kilograms" are interchangeable; such objects are **values**, and comparing them by content makes sense. Chapter 6 introduces records for values; Chapter 7 covers `equals` and `hashCode` for defining content equality. For now remember that `==` on objects compares identity, never content.

## State with rules: invariants

An **invariant** is a rule about an object's state that must hold at every moment a caller can observe it. Examples:

- An account balance is never negative.
- A reservation never holds more seats than the venue has.
- A lamp's brightness is between 0 and 100.

Look back at `Lamp.dim(int percent)`: it accepts `dim(250)` or `dim(-3)` without complaint. The class *states* no rule, so it enforces none. Adding a rule means deciding **where** it lives. There are three candidate designs for an account:

| Design | Who enforces "balance is never negative"? | Can a caller break it? |
|---|---|---|
| Public writable `balance` field | Every caller, if they remember | Yes, with one assignment |
| `setBalance(long)` that stores whatever it is given | Every caller, if they remember | Yes, with one call |
| A `withdraw(amount)` method that checks, then subtracts, while the field is private | The account itself, in one place | No |

The first two designs look different but are equivalent: a setter that accepts any value is just a public field with extra typing. Only the third puts the rule next to the data it protects. The object *owns* its mutation.

```java
public class InvariantDemo {
    public static void main(String[] args) {
        OpenAccount open = new OpenAccount();
        open.balance = 100;
        open.balance = open.balance - 150;
        System.out.println("OpenAccount balance: " + open.balance);

        GuardedAccount guarded = new GuardedAccount(100);
        long[] attempts = {30, 0, -5, 200, 70, 1};
        for (long amount : attempts) {
            boolean accepted = guarded.withdraw(amount);
            System.out.println("withdraw(" + amount + ") -> " + (accepted ? "accepted" : "rejected")
                    + ", balance=" + guarded.balance());
        }
    }
}

class OpenAccount {
    long balance;
}

final class GuardedAccount {
    private long balance;

    GuardedAccount(long openingBalance) {
        if (openingBalance < 0) {
            throw new IllegalArgumentException("opening balance must be >= 0");
        }
        this.balance = openingBalance;
    }

    boolean withdraw(long amount) {
        if (amount <= 0 || amount > balance) {
            return false;
        }
        balance -= amount;
        return true;
    }

    long balance() {
        return balance;
    }
}
```

Output:

```text
OpenAccount balance: -50
withdraw(30) -> accepted, balance=70
withdraw(0) -> rejected, balance=70
withdraw(-5) -> rejected, balance=70
withdraw(200) -> rejected, balance=70
withdraw(70) -> accepted, balance=0
withdraw(1) -> rejected, balance=0
```

Notice the order inside `withdraw`: **validate first, then mutate**. If the subtraction happened before the check, a rejected withdrawal would already have damaged the balance. A failed operation must leave the object exactly as it was. This "all or nothing" property is sometimes called *failure atomicity*.

Here the method reports failure by returning `false`. Throwing an exception such as `IllegalArgumentException` is the other common choice; Chapter 11 discusses when each fits. Both are fine as long as the state is untouched on failure.

> **Tip:** Name methods after domain operations (`withdraw`, `reserve`, `publish`, `borrow`) rather than after fields (`setBalance`, `setStock`). A domain operation has a natural place to put the rule; a field setter usually does not.

## Collaboration between objects

Objects rarely work alone. A receipt printer asks an account for its balance; a transfer moves money between two accounts. Good collaboration follows one guideline: **ask an object to do something, instead of reaching into its data and doing it yourself** ("tell, don't ask").

```java
// fragment: a transfer coordinates two accounts through their operations
boolean transfer(GuardedAccount from, GuardedAccount to, long amount) {
    if (!from.withdraw(amount)) {
        return false;           // nothing changed anywhere
    }
    to.deposit(amount);         // assumes GuardedAccount has a validated deposit
    return true;
}
```

The transfer does not touch any balance field. If the withdrawal is rejected, it stops before the deposit. In a real system with a database, making both sides succeed or fail together becomes a *transaction* concern, which later chapters handle.

## What happens under the hood

When the JVM executes `new GuardedAccount(100)`:

1. The class is loaded if this is its first use.
2. Memory for one object is reserved on the heap, large enough for its fields plus a small header the JVM uses for bookkeeping (type information, locking, hash code).
3. Every field is set to its default value (`balance = 0`).
4. Field initializers and the constructor run (`balance = 100`).
5. The expression evaluates to a reference to the new object, which is stored in `guarded`.

Methods are *not* copied into each object. There is one copy of `withdraw`'s code per class; each call receives the target object as the hidden `this` reference. When no variable refers to an object any more, the garbage collector may reclaim its memory. You never free objects manually in Java.

## Common mistakes

### Calling instance members from `main` without an object

```java
public class StaticContext {
    long balance;

    void deposit(long amount) {
        balance += amount;
    }

    public static void main(String[] args) {
        deposit(50);
        System.out.println(balance);
    }
}
```

The compiler rejects this:

```text
error: non-static method deposit(long) cannot be referenced from a static context
error: non-static variable balance cannot be referenced from a static context
```

`main` is `static`: it belongs to the class, not to any object, so there is no `this` whose `balance` could be meant. Fix it by creating an object and calling through it: `StaticContext account = new StaticContext(); account.deposit(50);`. Better still, keep `main` in its own class and put the account logic in an `Account` class.

### Using a reference field that was never assigned

```java
class Library {
    Book featured;          // defaults to null
}
// in main:
Library library = new Library();
library.featured.pages = 10;
```

This compiles but fails at run time:

```text
Exception in thread "main" java.lang.NullPointerException: Cannot assign field "pages" because "<local1>.featured" is null
```

Declaring a field of type `Book` creates a *place for a reference*, not a book. Either create the object (`library.featured = new Book();`) or, better, require it in a constructor so a `Library` can never exist without one. (The `<local1>` appears because the program was compiled without debug information; with `javac -g` the message names the variable.)

### Expecting `==` to compare contents

Two `Account` objects with the same number and balance are not `==`. If you need "same data" comparison, that is a deliberate design decision (Chapter 7), not what `==` does.

### Mutating before validating

```java
// wrong: the balance changes even when the withdrawal is rejected
void withdraw(long amount) {
    balance -= amount;
    if (amount > balance) {
        return;
    }
}
```

Trace it with a balance of 10 and a withdrawal of 15: the balance becomes -5 *before* any decision is made. Every guard must run before the first line that changes state.

### Public fields or blanket setters "for flexibility"

Adding `public` or `setBalance` so "other code can adjust it" silently moves your invariant into every caller. The rule is only as strong as the most careless caller.

## Best practices

- Design a class from the operations its users need, then choose the fields that support them, not the other way around.
- Make fields `private` by default. Expose behavior, not storage.
- Validate every input in the method that changes state, before the change.
- Leave the object unchanged when an operation fails.
- Keep each class focused on one concept. A `Book` that also prints menus and reads files is doing three jobs.
- Name classes with nouns in `UpperCamelCase` (`LibraryMember`), methods with verbs in `lowerCamelCase` (`borrowBook`), and fields with nouns in `lowerCamelCase` (`dueDate`).
- Use `long` cents (or `BigDecimal`) for money, never `double`.

## Summary

- A class defines state (fields) and behavior (methods); an object is one instance created with `new`.
- Fields get default values: `0`, `false`, or `null`. Defaults rarely represent valid domain state.
- Instance methods act on the object they are called on; `this` refers to that object.
- Variables hold references. Assignment copies references; `==` compares identity.
- Java passes arguments by value, and for objects the value is the reference.
- An invariant is a rule the object must keep true. The object should own every change to the state the invariant governs, through methods that validate before mutating.
- A public writable field and an unrestricted setter both let any caller bypass the rule.

## Practice

### Warm-up

1. Create a `Student` class with `name`, `year`, and `enrolled` fields. Create two students, print their fields, and print a third student with no assignments to see the defaults.
2. Add a `describe()` method to `Student` that returns a one-line summary, and call it on each object.

### Core

1. Write a `Counter` class with `increment()`, `reset()`, and `value()`. Create two counters and show that incrementing one does not affect the other.
2. Build an `Account` with a private `long` balance in cents, a `deposit(long)` that rejects nonpositive amounts, and a `withdraw(long)` that rejects nonpositive amounts and overdrafts. For each operation, test zero, negative, exactly-the-balance, and more-than-the-balance inputs, and print the balance after each call to prove failed calls preserved it.
3. Make `deposit` reject a deposit whose result would overflow `long` (hint: `Math.addExact` throws `ArithmeticException` on overflow).

### Challenge

1. Model a `ParkingLot` with a fixed capacity and operations `enter()` and `leave()`. Decide and document what happens when a car enters a full lot or leaves an empty one. Write a `main` that exercises every boundary.
2. Write a short paragraph explaining, with a concrete call sequence, how adding a public `setBalance(long)` would let a caller defeat your `withdraw` rule.

## Check your understanding

1. What is the difference between a class and an object? Give a real-world analogy other than cookies.
2. After `Account b = a; b.deposit(10);`, does the object referenced by `a` change? Why?
3. Why can a method change the fields of an object passed to it but not change which object the caller's variable refers to?
4. What default value does a `String` field receive, and why can that lead to a `NullPointerException` later?
5. An account must never go negative. Compare three designs: a writable public field, a setter that stores any value, and an operation that checks the amount before subtracting. Which one keeps the rule in a single place, and why do the other two fail?
6. Why must validation run before the first statement that changes state?
