# Overriding, dynamic dispatch, super, and final

Polymorphism is the reason object-oriented code can grow without constant rewrites. A payroll loop that calls `employee.monthlyPay()` keeps working when a new kind of employee is added. A web framework calls your controller's overridden method without ever knowing your class name. All of this rests on one mechanism: **dynamic dispatch**, the JVM's rule for choosing which overridden method runs.

This lesson makes that rule precise, contrasts it with the rules that are decided at compile time (overloading, static methods, fields), and shows the tools that keep overriding safe: `@Override`, `super`, and `final`.

## What you will learn

- What method overriding is and the exact rules an override must follow
- How dynamic dispatch picks an implementation from the object's runtime type
- Why overloading, static methods, and fields are resolved differently, at compile time
- What annotations are, and how `@Override`, `@Deprecated`, `@FunctionalInterface`, and `@SuppressWarnings` help you
- How `super.method()` extends inherited behavior instead of duplicating it
- How `final` methods and classes prevent unwanted extension
- Why calling an overridable method from a constructor is dangerous

## Overriding: replacing inherited behavior

A subclass **overrides** a method when it declares an instance method with the same name and the same parameter types as an inherited one. The subclass version replaces the superclass version *for objects of the subclass*.

```java
// Fragment
class Animal { String sound() { return "..."; } }
class Dog extends Animal {
    @Override String sound() { return "Woof"; }
}
```

The rules for a legal override:

| Rule | Allowed | Not allowed |
|---|---|---|
| Name and parameter types | exactly the same | different parameters (that is an overload) |
| Return type | same, or a subtype for reference types (covariant return) | an unrelated or wider type |
| Access | same or wider (`protected` to `public`) | narrower (`public` to package-private) |
| Checked exceptions | same, fewer, or narrower | new or broader checked exceptions |
| Kind of method | instance method | `static`, `private`, or `final` methods cannot be overridden |

These rules exist to protect callers. Code written against `Animal` was promised a certain signature, access level, and set of exceptions; the override may keep or improve those promises, never weaken them. This is the Liskov substitution principle from lesson 1, enforced by the compiler wherever it can be.

## Polymorphism and dynamic dispatch

**Polymorphism** ("many forms") means one variable, parameter, or array of a supertype can refer to objects of many subtypes, and each object responds in its own way to the same method call.

When you call an instance method, two separate questions are answered at two separate times:

1. **Compile time: is this call allowed?** The compiler looks at the *declared* type of the expression. `Animal a` has a `sound()` method, so `a.sound()` compiles.
2. **Run time: which body runs?** The JVM looks at the *actual* class of the object that `a` refers to at that moment, and runs the most specific override of `sound()` for that class.

That runtime choice is **dynamic dispatch** (also called late binding or virtual method invocation). In Java, every non-private, non-static, non-final instance method is dispatched this way.

```java
public class DynamicDispatch {
    static void makeNoise(Animal a) {
        // The compiler only knows "some Animal"; the JVM picks the override at runtime.
        System.out.println(a.name() + " says " + a.sound());
    }

    public static void main(String[] args) {
        Animal a = new Dog("Rex");          // declared type Animal, runtime type Dog
        System.out.println(a.sound());

        Animal[] zoo = { new Animal("Generic"), new Dog("Rex"), new Cat("Tom"), new Puppy("Bit") };
        for (Animal animal : zoo) {
            makeNoise(animal);
        }
    }
}

class Animal {
    private final String name;
    Animal(String name) { this.name = name; }
    String name() { return name; }
    String sound() { return "..."; }
}

class Dog extends Animal {
    Dog(String name) { super(name); }
    @Override String sound() { return "Woof"; }
}

class Cat extends Animal {
    Cat(String name) { super(name); }
    @Override String sound() { return "Meow"; }
}

class Puppy extends Dog {
    Puppy(String name) { super(name); }
    // No sound() here: the nearest override up the chain (Dog) is used.
}
```

```text
Woof
Generic says ...
Rex says Woof
Tom says Meow
Bit says Woof
```

The very first line matters most: the variable is declared as `Animal`, but the object is a `Dog`, so `Dog`'s `sound()` runs. The declared type never "downgrades" the object.

### What happens under the hood

You do not need JVM internals to use Java, but a simplified picture removes the mystery:

1. The compiler checks that `Animal` declares an accessible `sound()` and records a call to "the `sound()` method, signature `()String`" in the bytecode (an `invokevirtual` instruction).
2. At run time, the JVM finds the object that the reference points to and reads its class, say `Puppy`.
3. It looks for `sound()` in `Puppy`. Not found, so it moves up to `Dog`. Found: that body runs.
4. HotSpot speeds this up with a per-class method table (a *vtable*) and with inlining when only one implementation is actually seen, so dynamic dispatch is usually very cheap.

A useful analogy: the declared type is the label on a remote control ("TV remote: has a Power button"). The runtime object is the actual TV in the room. The label decides which buttons exist; the TV decides what happens when you press one.

## Compile-time decisions: overloading, static methods, fields

Only overridden **instance methods** are chosen at runtime. Three other things look similar but are decided by the compiler from the declared type:

- **Overloading**: several methods with the same name but different parameter lists. The compiler picks one using the *declared* types of the arguments.
- **Static methods**: a static method with the same signature in a subclass *hides* the parent's; it does not override it.
- **Fields**: a field with the same name in a subclass *hides* the parent's field. Both fields exist, and the declared type chooses which you read.

```java
public class OverloadVsOverride {
    // Overloads: chosen at COMPILE time from the declared argument type.
    static String describe(Animal a) { return "describe(Animal)"; }
    static String describe(Dog d)    { return "describe(Dog)"; }

    public static void main(String[] args) {
        Animal declaredAsAnimal = new Dog();
        Dog declaredAsDog = new Dog();

        System.out.println(describe(declaredAsAnimal) + " / sound: " + declaredAsAnimal.sound());
        System.out.println(describe(declaredAsDog) + " / sound: " + declaredAsDog.sound());

        // Static methods and fields are resolved from the declared type too.
        System.out.println("static via Animal variable: " + declaredAsAnimal.kingdom());
        System.out.println("static via Dog variable:    " + declaredAsDog.kingdom());
        System.out.println("field via Animal variable:  " + declaredAsAnimal.legs);
        System.out.println("field via Dog variable:     " + declaredAsDog.legs);
    }
}

class Animal {
    int legs = 0;                               // a field is never overridden
    String sound() { return "..."; }
    static String kingdom() { return "Animal.kingdom"; }
}

class Dog extends Animal {
    int legs = 4;                               // HIDES Animal.legs (a second field)
    @Override String sound() { return "Woof"; }
    static String kingdom() { return "Dog.kingdom"; }   // HIDES, does not override
}
```

```text
describe(Animal) / sound: Woof
describe(Dog) / sound: Woof
static via Animal variable: Animal.kingdom
static via Dog variable:    Dog.kingdom
field via Animal variable:  0
field via Dog variable:     4
```

Both objects are `Dog`s, so `sound()` says `Woof` both times. But the overload, the static method, and the field all followed the variable's declared type. Calling static methods through an instance variable is legal but misleading; always write `Animal.kingdom()`.

| Mechanism | Decided when | Decided by |
|---|---|---|
| Overridden instance method | run time | the object's actual class |
| Overloaded method selection | compile time | declared types of the arguments |
| Static method (hiding) | compile time | declared type of the expression |
| Field access (hiding) | compile time | declared type of the expression |
| Private method | compile time | the class that declares it (never overridden) |

## Annotations and @Override

An **annotation** is metadata attached to code with `@Name`. It does not change what the code does by itself; the compiler, tools, or frameworks read it. You will meet many (for example in testing and web frameworks), but four built-in ones matter now:

| Annotation | Meaning | Checked by |
|---|---|---|
| `@Override` | "This method must override or implement a supertype method." | compiler: error if it does not |
| `@Deprecated` | "Do not use this any more." Optional `since` and `forRemoval` elements | compiler: warning at each use |
| `@FunctionalInterface` | "This interface has exactly one abstract method." | compiler: error if it does not |
| `@SuppressWarnings("...")` | "I have reviewed this specific warning here." | compiler: hides that warning category |

### Why @Override is not optional in practice

Without `@Override`, a typo silently creates a new method, and the old behavior keeps running:

```java
public class SilentTypo {
    public static void main(String[] args) {
        Animal a = new Dog();
        System.out.println(a.sound());   // expected Woof?
    }
}

class Animal {
    String sound() { return "..."; }
}

class Dog extends Animal {
    // Typo and no @Override: this is a brand-new method, not an override.
    String sonud() { return "Woof"; }
}
```

```text
...
```

No error, no warning, wrong output. Adding `@Override` turns this into a compile error at the exact line:

```text
error: method does not override or implement a method from a supertype
    @Override String sonud() { return "Woof"; }
    ^
```

The same protection catches a wrong parameter type, such as writing `equals(Dog other)` when you meant to override `equals(Object other)` (lesson 4).

### The other built-in annotations in use

```java
// Fragment
class Legacy {
    /** @deprecated use total(int[]) instead */
    @Deprecated(since = "2.0", forRemoval = false)
    static int sum(int a, int b) { return a + b; }
}

@FunctionalInterface
interface PriceRule {
    int apply(int cents);        // exactly one abstract method: OK
}
```

Compiling a call to `Legacy.sum(1, 2)` from another class with `javac -Xlint:deprecation` reports:

```text
warning: [deprecation] sum(int,int) in Legacy has been deprecated
```

Adding a second abstract method to a `@FunctionalInterface` fails with `Unexpected @FunctionalInterface annotation ... multiple non-overriding abstract methods found`. Functional interfaces become important with lambdas in a later chapter.

> **Tip:** Put `@SuppressWarnings` on the smallest possible scope (one method or one local variable), never on a whole class, and add a comment explaining why the warning is safe to ignore.

## super: extending instead of replacing

Inside an override, `super.method(...)` calls the superclass's version. Use it when the subclass wants to *add* to inherited behavior rather than rewrite it. This keeps one source of truth for the shared part.

```java
public class SuperAndFinal {
    public static void main(String[] args) {
        Account basic = new Account("ACC-1", 100);
        Account premium = new PremiumAccount("ACC-2", 100, 50);

        System.out.println(basic.summary());
        System.out.println(premium.summary());
        System.out.println(premium.id());

        PremiumAccount copy = ((PremiumAccount) premium).copy();  // covariant return
        System.out.println("copy is a " + copy.getClass().getSimpleName()
                + " with limit " + copy.availableLimit());
    }
}

class Account {
    private final String id;
    protected final int balance;

    Account(String id, int balance) {
        this.id = id;
        this.balance = balance;
    }

    // final: the ID format is a guarantee subclasses may not change.
    public final String id() {
        return "#" + id;
    }

    public int availableLimit() {
        return balance;
    }

    public String summary() {
        return id() + " available=" + availableLimit();
    }

    public Account copy() {
        return new Account(id, balance);
    }
}

class PremiumAccount extends Account {
    private final int overdraft;

    PremiumAccount(String id, int balance, int overdraft) {
        super(id, balance);
        this.overdraft = overdraft;
    }

    @Override
    public int availableLimit() {
        return super.availableLimit() + overdraft;    // extend, do not duplicate
    }

    @Override
    public String summary() {
        return super.summary() + " (premium, overdraft " + overdraft + ")";
    }

    @Override
    public PremiumAccount copy() {                    // narrower return type is allowed
        return new PremiumAccount(id().substring(1), balance, overdraft);
    }
}
```

```text
#ACC-1 available=100
#ACC-2 available=150 (premium, overdraft 50)
#ACC-2
copy is a PremiumAccount with limit 150
```

### Trace: premium.summary()

1. `premium`'s runtime class is `PremiumAccount`, so `PremiumAccount.summary()` runs.
2. It calls `super.summary()`. `super` calls are **not** dynamically dispatched: they always go to the parent's body, `Account.summary()`.
3. Inside `Account.summary()`, the call `availableLimit()` is an ordinary virtual call on `this`, and `this` is still the `PremiumAccount` object. So `PremiumAccount.availableLimit()` runs, which calls `super.availableLimit()` (100) and adds 50.
4. `Account.summary()` returns `#ACC-2 available=150`, and `PremiumAccount` appends the premium suffix.

Step 3 surprises many learners: even while running parent code, calls on `this` still dispatch to the object's real class.

## final methods and final classes

`final` means "no further change" and applies at three levels:

- A `final` **variable** cannot be reassigned (you have used this already).
- A `final` **method** cannot be overridden. Use it for behavior that guarantees an invariant, like the ID format above or a template method.
- A `final` **class** cannot be extended at all. `String`, `Integer`, and all records are final.

```text
error: id() in Dog cannot override id() in Animal
  overridden method is final

error: cannot inherit from final Money
```

Designing a class for inheritance is real work: you must document which methods call which, so subclasses know what overriding one affects. If you have not done that work, make the class `final`. You can remove `final` later without breaking anyone; you cannot add it later without breaking subclasses. Sealed classes (chapter 6) are the middle ground: extension only by a listed set of subclasses.

## The constructor trap

A superclass constructor runs *before* the subclass's fields are assigned. If that constructor calls an overridable method, dynamic dispatch runs the subclass override on a half-built object.

```java
public class ConstructorTrap {
    public static void main(String[] args) {
        new Child("configured");
    }
}

class Parent {
    Parent() {
        System.out.println("Parent constructor calls describe(): " + describe());
    }

    String describe() {
        return "parent";
    }
}

class Child extends Parent {
    private final String setting;

    Child(String setting) {
        super();                     // Parent runs BEFORE this.setting is assigned
        this.setting = setting;
        System.out.println("Child constructor finished: " + describe());
    }

    @Override
    String describe() {
        return "child with setting=" + setting;
    }
}
```

```text
Parent constructor calls describe(): child with setting=null
Child constructor finished: child with setting=configured
```

Even a `final` field is observed as `null` here. With a method that dereferences the field, this becomes a `NullPointerException` in code that looks perfectly correct. Rule: constructors should call only `private`, `static`, or `final` methods.

## Common mistakes

### 1. Expecting the declared type to choose the override

```java
Animal a = new Dog();
a.sound();   // many beginners predict "..."
```

Wrong prediction: the parent's body. Actual: `Woof`. The declared type only decides whether the call compiles.

### 2. Expecting overloading to use the runtime type

`describe(declaredAsAnimal)` picks `describe(Animal)` even though the object is a `Dog`. If you need runtime-type behavior, put the behavior in an overridden method on the object instead of an overload.

### 3. Narrowing access or adding checked exceptions

```java
// Wrong
class Animal { void load() { } }
class Dog extends Animal {
    @Override void load() throws java.io.IOException { }
}
```

```text
error: load() in Dog cannot override load() in Animal
  overridden method does not throw IOException
```

Fix: handle the exception inside the override, or wrap it in an unchecked exception documented by the contract. Similarly, an override cannot make a public method package-private ("attempting to assign weaker access privileges").

### 4. Trying to override a static method

```java
// Wrong
@Override static String name() { return "y"; }
```

```text
error: name() in Dog cannot override name() in Animal
  overriding method is static
```

Static methods belong to classes, not objects, so there is no runtime object to dispatch on.

### 5. Copy-pasting parent logic instead of calling super

Duplicated code drifts: the parent gets a bug fix and the copy does not. Call `super.method()` and add only what differs.

## Best practices

- Always write `@Override` on every overriding or implementing method. Let the compiler check your intent.
- Design for polymorphism: prefer `shape.area()` over `if (shape instanceof Circle) ... else if ...` chains for behavior that belongs to the object.
- Use `super.method()` to extend behavior; keep the shared part in one place.
- Make classes `final` unless designed and documented for extension; make template and invariant-guarding methods `final`.
- Never call overridable methods from constructors.
- Do not hide fields or static methods on purpose; rename instead. Hidden members confuse every reader.
- Use `@Deprecated` with a Javadoc `@deprecated` tag that names the replacement.

## Summary

- An override has the same name and parameter types as an inherited instance method; it may widen access, narrow the return type, and throw fewer checked exceptions, never the reverse.
- Dynamic dispatch chooses an overridden instance method from the object's runtime class. The declared type only determines what may be called.
- Overload selection, static methods, and fields are resolved at compile time from declared types.
- `@Override` turns silent signature mistakes into compile errors; `@Deprecated`, `@FunctionalInterface`, and `@SuppressWarnings` are other compiler-checked annotations.
- `super.method()` calls the parent body directly, without dispatch, while calls on `this` inside parent code still dispatch to the subclass.
- `final` methods cannot be overridden and `final` classes cannot be extended.
- Overridable calls from constructors observe uninitialised subclass fields.

## Practice

### Warm-up

1. Create `Shape` with `double area()` returning 0 and three subclasses that override it. Put them in a `Shape[]` and print each area in a loop. Predict every line first.
2. Remove `@Override` from one method and introduce a typo in its name. Observe the silent bug, then restore `@Override` and read the error.

### Core

1. Add overloads `describe(Animal)` and `describe(Dog)` and a method `sound()` overridden in `Dog`. Pass an `Animal` variable containing a `Dog` to `describe`, and separately call `sound()` on it. Write down your predictions, run, and explain each result with the table from this lesson.
2. Build `Logger` with `log(String message)` and `TimestampLogger` that overrides it using `super.log(...)` so that the prefix is added without duplicating the parent's formatting.
3. Make one method of a class `final` and try to override it; make the class `final` and try to extend it. Record both errors.

### Challenge

1. Write a parent class whose constructor calls an overridable `init()` method, and a subclass whose `init()` uses a field set in its own constructor. Reproduce the failure, then redesign so the problem cannot occur (for example, a private helper or a static factory method).
2. Trace `premium.summary()` from this lesson on paper, listing every method body entered in order, and mark which calls were dispatched dynamically and which were not.

## Check your understanding

1. A variable declared as a superclass type refers to a subclass object, and you call an overridden instance method. Which body runs, and what determines that?
2. What two questions are answered for every instance method call, and when is each answered?
3. Why does overloading ignore the runtime type of arguments, while overriding does not?
4. What does `@Override` actually do at compile time, and what bug does it prevent?
5. Inside `Account.summary()`, called through `super.summary()` from `PremiumAccount`, why does `availableLimit()` run the subclass version?
6. Why is it risky to call an overridable method from a constructor, and what should constructors call instead?
