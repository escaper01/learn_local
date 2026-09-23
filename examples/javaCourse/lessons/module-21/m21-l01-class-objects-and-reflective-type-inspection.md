# Class objects and reflective type inspection

Most Java code knows its types at compile time: you write `invoice.total()` and the compiler checks that `Invoice` really has a `total` method. Frameworks do not have that luxury. A JSON library must turn *any* object into text, a test runner must find *any* method marked as a test, and a dependency-injection container must build *any* class you register. They all start from the same place: a `java.lang.Class` object that describes a type at runtime, and the **reflection API** that lets code read that description.

You will rarely write reflection in everyday business code, but you will use frameworks built on it every day (JUnit, Spring, Jackson, Hibernate). When they fail, the error messages talk about classes, members, modifiers, and access. Understanding reflection turns those messages from magic into ordinary diagnostics.

What you will learn:

- What a `Class` object is and the three standard ways to obtain one
- How primitive types, arrays, nested types, and records are represented at runtime
- How to check types at runtime with `instanceof`, `isInstance`, `isAssignableFrom`, and exact class comparison
- How to list methods and fields, and the precise difference between `getMethods` and `getDeclaredMethods`
- How to read and interpret modifiers with `java.lang.reflect.Modifier`
- What generic type erasure means for runtime inspection
- When reflection is the right tool and when an ordinary interface is better

## What a Class object is

Every type loaded into a running JVM is represented by exactly one `Class` object per class loader (Lesson 4 explains the class loader part). Think of it as the **specification sheet** that the JVM keeps for the type: its name, its superclass, its interfaces, its fields, constructors, methods, annotations, and modifiers.

The class `Class` is generic: `Class<String>` describes `String`. When you do not know the type statically, you write `Class<?>`, meaning "a `Class` for some type I cannot name here".

There are three standard ways to get a `Class` object:

| Technique | Example | When the type is known | Typical use |
|---|---|---|---|
| Class literal | `String.class` | Compile time | Passing a type token to an API |
| `getClass()` | `obj.getClass()` | Runtime, from an existing object | Finding the real type behind an interface or `Object` variable |
| `Class.forName` | `Class.forName("java.lang.String")` | Runtime, from a name | Plugins, drivers, configuration-driven loading |

The following complete program demonstrates all three and shows how other kinds of types appear.

```java
import java.util.ArrayList;
import java.util.List;

public class ClassObjectsDemo {
    public static void main(String[] args) throws ClassNotFoundException {
        // 1. Class literal: known at compile time
        Class<String> fromLiteral = String.class;

        // 2. getClass(): the runtime class of an existing object
        Object text = "hello";
        Class<?> fromObject = text.getClass();

        // 3. Class.forName: a fully qualified binary name chosen at runtime
        Class<?> fromName = Class.forName("java.lang.String");

        System.out.println("Same Class object? "
                + (fromLiteral == fromObject && fromObject == fromName));

        // The static type of a variable does not matter; getClass() reports the runtime type
        List<String> names = new ArrayList<>();
        System.out.println("names.getClass() = " + names.getClass().getName());

        // Primitive types, arrays and nested types also have Class objects
        System.out.println("int.class        = " + int.class.getName());
        System.out.println("Integer.TYPE     = " + Integer.TYPE);
        System.out.println("int[].class      = " + int[].class.getName());
        System.out.println("String[][].class = " + String[][].class.getName());
        System.out.println("component type   = " + String[][].class.getComponentType().getSimpleName());

        Class<?> nested = Point.class;
        System.out.println("getName          = " + nested.getName());
        System.out.println("getSimpleName    = " + nested.getSimpleName());
        System.out.println("getCanonicalName = " + nested.getCanonicalName());
        System.out.println("isRecord         = " + nested.isRecord());
        System.out.println("superclass       = " + nested.getSuperclass().getName());
        System.out.println("package          = " + String.class.getPackageName());
        System.out.println("interfaces of String:");
        for (Class<?> i : String.class.getInterfaces()) {
            System.out.println("  " + i.getName());
        }

        // Erasure: the type argument is not part of the runtime class
        List<Integer> numbers = new ArrayList<>();
        System.out.println("List<String> class == List<Integer> class? "
                + (names.getClass() == numbers.getClass()));
    }

    record Point(int x, int y) {}
}
```

```text
Same Class object? true
names.getClass() = java.util.ArrayList
int.class        = int
Integer.TYPE     = int
int[].class      = [I
String[][].class = [[Ljava.lang.String;
component type   = String[]
getName          = ClassObjectsDemo$Point
getSimpleName    = Point
getCanonicalName = ClassObjectsDemo.Point
isRecord         = true
superclass       = java.lang.Record
package          = java.lang
interfaces of String:
  java.io.Serializable
  java.lang.Comparable
  java.lang.CharSequence
  java.lang.constant.Constable
  java.lang.constant.ConstantDesc
List<String> class == List<Integer> class? true
```

Several details deserve attention:

- All three techniques return the **same object**, so `==` is a valid comparison for `Class` objects from the same loader.
- `getClass()` reports the runtime class (`ArrayList`), not the declared variable type (`List`).
- `int.class` and `Integer.TYPE` are the same object, and they are different from `Integer.class`. Primitive and wrapper types are distinct at runtime.
- Array class names use a JVM descriptor format: `[I` is `int[]`, `[[Ljava.lang.String;` is `String[][]`.
- A nested class has a *binary name* with `$` (`ClassObjectsDemo$Point`), which is the name `Class.forName` expects, and a *canonical name* with `.` that matches source code.

> **Note:** `Class.forName(name)` also *initializes* the class, which runs its static initializers. Lesson 4 shows the overload that loads without initializing.

## Runtime type checking

Reflection gives you several ways to ask "what type is this?" They answer subtly different questions, and choosing the wrong one is a common source of bugs.

- `obj instanceof Animal` asks: is `obj` non-null and an instance of `Animal` or any subtype? The target type must be written in source code.
- `Animal.class.isInstance(obj)` asks exactly the same question, but the type can be a runtime value (a `Class<?>` variable).
- `obj.getClass() == Dog.class` asks: is the runtime class *exactly* `Dog`? Subclasses fail this test.
- `Animal.class.isAssignableFrom(Dog.class)` compares two `Class` objects with no instance involved: could a `Dog` be stored in an `Animal` variable?
- `Dog.class.cast(obj)` performs a checked cast using a runtime `Class` value and throws `ClassCastException` on failure.

```java
public class RuntimeTypeChecks {
    public static void main(String[] args) {
        Animal pet = new Dog("Rex");

        // instanceof: compile-time known target type, accepts subtypes
        System.out.println("pet instanceof Animal     : " + (pet instanceof Animal));
        System.out.println("pet instanceof Dog        : " + (pet instanceof Dog));
        System.out.println("pet instanceof Pet        : " + (pet instanceof Pet));

        // Class.isInstance: same question, but the type is a runtime value
        Class<?> wanted = Animal.class;
        System.out.println("Animal.isInstance(pet)    : " + wanted.isInstance(pet));

        // Exact class comparison ignores subtyping
        System.out.println("pet.getClass()==Animal    : " + (pet.getClass() == Animal.class));
        System.out.println("pet.getClass()==Dog       : " + (pet.getClass() == Dog.class));

        // isAssignableFrom compares two Class objects: "can a Dog be stored in an Animal?"
        System.out.println("Animal <- Dog assignable  : " + Animal.class.isAssignableFrom(Dog.class));
        System.out.println("Dog <- Animal assignable  : " + Dog.class.isAssignableFrom(Animal.class));

        // null is never an instance of anything
        Animal nothing = null;
        System.out.println("null instanceof Animal    : " + (nothing instanceof Animal));
        System.out.println("Animal.isInstance(null)   : " + Animal.class.isInstance(null));

        // Class.cast performs a checked cast with a runtime Class value
        Object unknown = pet;
        Dog dog = Dog.class.cast(unknown);
        System.out.println("cast ok, name = " + dog.name());
        try {
            String s = String.class.cast(unknown);
            System.out.println(s);
        } catch (ClassCastException e) {
            System.out.println("ClassCastException: " + e.getMessage());
        }

        // Pattern matching is usually clearer than reflection in ordinary code
        if (unknown instanceof Dog d && d.name().startsWith("R")) {
            System.out.println("pattern matched " + d.name());
        }
    }
}

interface Pet {}

class Animal {}

class Dog extends Animal implements Pet {
    private final String name;
    Dog(String name) { this.name = name; }
    String name() { return name; }
}
```

```text
pet instanceof Animal     : true
pet instanceof Dog        : true
pet instanceof Pet        : true
Animal.isInstance(pet)    : true
pet.getClass()==Animal    : false
pet.getClass()==Dog       : true
Animal <- Dog assignable  : true
Dog <- Animal assignable  : false
null instanceof Animal    : false
Animal.isInstance(null)   : false
cast ok, name = Rex
ClassCastException: Cannot cast Dog to java.lang.String
pattern matched Rex
```

A memory aid for `isAssignableFrom`: read `A.class.isAssignableFrom(B.class)` as "an `A` variable can be assigned *from* a `B` value". The receiver is the wider type.

> **Tip:** `getClass() ==` comparisons are appropriate inside `equals` implementations that must reject subclasses. Almost everywhere else, `instanceof` or `isInstance` expresses the intent better because it respects substitutability.

## Listing members: declared versus public

The reflection API has two families of lookup methods, and the difference is the single most important thing to memorize in this lesson.

| Method family | Which members | Access levels included | Inherited members? |
|---|---|---|---|
| `getMethods()`, `getFields()`, `getConstructors()` | Public members only | `public` only | Yes, public members of superclasses and superinterfaces |
| `getDeclaredMethods()`, `getDeclaredFields()`, `getDeclaredConstructors()` | Members declared in *this* type's source | `public`, `protected`, package-private, `private` | No |
| `getMethod(name, types...)` | One public method, searching supertypes | `public` only | Yes |
| `getDeclaredMethod(name, types...)` | One method declared here | Any | No |

Constructors are never inherited in Java, so `getConstructors()` only returns the public constructors of the class itself.

An analogy: `getDeclaredMethods` is a list of the rooms *built in this house*, including locked private rooms. `getMethods` is the public directory of the whole street you can walk into from this address, including public rooms inherited from ancestors, but no locked rooms at all.

```java
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.Comparator;

public class MemberListing {
    public static void main(String[] args) {
        System.out.println("== getDeclaredMethods() on Dog (declared here, any access) ==");
        print(Dog.class.getDeclaredMethods());

        System.out.println("== getMethods() on Dog (public, including inherited) ==");
        Method[] publicMethods = Arrays.stream(Dog.class.getMethods())
                .filter(m -> m.getDeclaringClass() != Object.class) // hide the 9 Object methods
                .toArray(Method[]::new);
        print(publicMethods);

        System.out.println("Object methods also in getMethods(): "
                + Arrays.stream(Dog.class.getMethods())
                        .filter(m -> m.getDeclaringClass() == Object.class).count());
    }

    static void print(Method[] methods) {
        Arrays.stream(methods)
                .sorted(Comparator.comparing(Method::getName)) // reflection order is unspecified
                .forEach(m -> System.out.printf("  %-28s %-9s declared in %s%n",
                        access(m),
                        m.getName(),
                        m.getDeclaringClass().getSimpleName()));
    }

    static String access(Method m) {
        String text = Modifier.toString(m.getModifiers());
        return text.isEmpty() ? "(package-private)" : text;
    }
}

class Animal {
    public void eat() {}
    protected void sleep() {}
    private void digest() {}
    public static Animal create() { return new Animal(); }
}

class Dog extends Animal {
    public void bark() {}
    void wagTail() {}
    private void chaseCat() {}
    @Override
    public void eat() {}
    public final synchronized void guard() {}
}
```

```text
== getDeclaredMethods() on Dog (declared here, any access) ==
  public                       bark      declared in Dog
  private                      chaseCat  declared in Dog
  public                       eat       declared in Dog
  public final synchronized    guard     declared in Dog
  (package-private)            wagTail   declared in Dog
== getMethods() on Dog (public, including inherited) ==
  public                       bark      declared in Dog
  public static                create    declared in Animal
  public                       eat       declared in Dog
  public final synchronized    guard     declared in Dog
Object methods also in getMethods(): 9
```

Read the output carefully:

- The declared list contains `private chaseCat` and package-private `wagTail`, but nothing from `Animal`.
- The public list contains `create` from `Animal` and the nine public methods of `Object` (`toString`, `hashCode`, `wait` overloads, and so on), but no private or package-private methods.
- The overridden `eat` appears once, declared in `Dog`: the override replaces the inherited one.
- `protected sleep` appears in neither list for `Dog`: it is not public, and it was not declared in `Dog`. To find it you must walk up with `getSuperclass()` and call `getDeclaredMethods()` on `Animal`.

> **Warning:** The order of arrays returned by reflection is *unspecified*. It often looks stable on one JDK build and changes on another. Always sort before producing a report, a test expectation, or anything a human compares.

## Modifiers

Every class, field, method, and constructor carries a set of modifier flags packed into an `int`. `getModifiers()` returns it and the static helpers in `java.lang.reflect.Modifier` decode it: `Modifier.isPublic(mods)`, `isPrivate`, `isStatic`, `isFinal`, `isAbstract`, `isSynchronized`, `isVolatile`, `isTransient`, and `Modifier.toString(mods)` for a readable form.

A few rules to remember:

- Package-private access has **no flag**. It is the absence of `public`, `protected`, and `private`, which is why `Modifier.toString` returns an empty string for it.
- Interfaces report `abstract interface`, because every interface is implicitly abstract.
- Records and enums are implicitly `final` (enums can be non-final when constants have bodies, but that is an edge case).
- Compiler-generated members (bridge methods, synthetic fields) can appear in declared lists. `isSynthetic()` and `Method.isBridge()` identify them.

## Inspecting records, enums, and sealed types

Modern Java types have dedicated reflection methods: `isRecord()` and `getRecordComponents()`, `isEnum()` and `getEnumConstants()`, `isSealed()` and `getPermittedSubclasses()`. Record components are especially useful because, unlike methods and fields, they are returned **in declaration order**: that order is part of the record's definition (it matches the canonical constructor).

```java
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

public class TypeReport {
    public static void main(String[] args) {
        describe(Invoice.class);
        describe(Account.class);
        describe(Status.class);
        describe(Shape.class);
    }

    static void describe(Class<?> type) {
        int mods = type.getModifiers();
        System.out.println("type " + type.getSimpleName()
                + " [" + Modifier.toString(mods) + "]"
                + kind(type));

        if (type.isRecord()) {
            // Record components keep declaration order: this is part of the record's contract
            String components = Arrays.stream(type.getRecordComponents())
                    .map(rc -> rc.getType().getSimpleName() + " " + rc.getName())
                    .collect(Collectors.joining(", "));
            System.out.println("  components: " + components);
        }
        if (type.isEnum()) {
            System.out.println("  constants: " + Arrays.toString(type.getEnumConstants()));
        }
        if (type.isSealed()) {
            System.out.println("  permitted: " + Arrays.stream(type.getPermittedSubclasses())
                    .map(Class::getSimpleName).sorted().toList());
        }
        Arrays.stream(type.getDeclaredFields())
                .filter(f -> !f.isSynthetic())
                .sorted(Comparator.comparing(Field::getName))
                .forEach(f -> System.out.println("  field " + Modifier.toString(f.getModifiers())
                        + " " + f.getType().getSimpleName() + " " + f.getName()
                        + (Modifier.isStatic(f.getModifiers()) ? "   <- static" : "")));
    }

    static String kind(Class<?> type) {
        List<String> kinds = new java.util.ArrayList<>();
        if (type.isInterface()) kinds.add("interface");
        if (type.isRecord()) kinds.add("record");
        if (type.isEnum()) kinds.add("enum");
        if (type.isSealed()) kinds.add("sealed");
        if (Modifier.isAbstract(type.getModifiers())) kinds.add("abstract");
        return kinds.isEmpty() ? "" : " " + kinds;
    }
}

record Invoice(String number, long cents, List<String> lines) {}

final class Account {
    public static final String BANK = "Academy Bank";
    private final String id;
    private long balance;
    protected transient int cachedHash;
    volatile boolean locked;
    Account(String id) { this.id = id; }
}

enum Status { OPEN, PAID, CANCELLED }

sealed interface Shape permits Circle, Square {}
record Circle(double r) implements Shape {}
record Square(double side) implements Shape {}
```

```text
type Invoice [final] [record]
  components: String number, long cents, List lines
  field private final long cents
  field private final List lines
  field private final String number
type Account [final]
  field public static final String BANK   <- static
  field private long balance
  field protected transient int cachedHash
  field private final String id
  field volatile boolean locked
type Status [final] [enum]
  constants: [OPEN, PAID, CANCELLED]
  field public static final Status CANCELLED   <- static
  field public static final Status OPEN   <- static
  field public static final Status PAID   <- static
type Shape [abstract interface] [interface, sealed, abstract]
  permitted: [Circle, Square]
```

Notice that the record's fields were sorted by name (`cents`, `lines`, `number`) because the program sorted them, while the components line preserves the real declaration order (`number`, `cents`, `lines`). Enum constants are public static final fields of the enum's own type.

## Generics and erasure

Java generics are checked by the compiler and then mostly *erased*. At runtime, an `ArrayList<String>` and an `ArrayList<Integer>` are both instances of the single class `ArrayList`, as the first program proved. Consequences:

- `obj instanceof List<String>` does not compile for an arbitrary `Object`, because the runtime cannot check the type argument.
- `rc.getType()` for `List<String> lines` returns `List`; `rc.getGenericType()` returns a `ParameterizedType` describing `List<String>` because *declarations* keep their generic signatures in the class file.
- You can inspect what a field or method *declares*; you cannot prove what a particular list object *contains* without examining its elements.

```java
// Fragment: declared generic information survives on declarations
java.lang.reflect.RecordComponent lines = Invoice.class.getRecordComponents()[2];
System.out.println(lines.getType());        // interface java.util.List
System.out.println(lines.getGenericType()); // java.util.List<java.lang.String>
```

## What happens under the hood

When you call `Dog.class.getDeclaredMethods()`, the following steps occur:

1. The `Class` object for `Dog` already exists because the class was loaded when first referenced.
2. The JVM consults its internal metadata for `Dog` (stored in metaspace, see Chapter 22), which was parsed from the method table of `Dog.class`.
3. For each method declared in that table, the reflection library creates a **new** `java.lang.reflect.Method` object (they are copies, so mutating one, for example with `setAccessible`, does not affect another lookup).
4. Security and module checks are *not* performed yet. Listing members is allowed; *using* a private member later requires access, which Lesson 2 covers.
5. The array is returned in an unspecified order.

`getMethods()` does more work: it walks the superclass chain and all superinterfaces, collects public methods, and removes those that are overridden, so the most specific declaration wins.

## When to use reflection

Reflection is the right tool when the set of types is genuinely open-ended and discovered at runtime:

- Serializers and mappers (JSON, database rows, configuration binding)
- Test frameworks discovering test methods
- Dependency injection and plugin systems
- Developer tooling: debuggers, documentation generators, inspectors

It is the wrong tool when an interface would do. If your code does `if (type.getSimpleName().equals("Circle")) ...` you have rebuilt a slow, unchecked `switch`. A sealed interface with pattern matching gives the compiler a chance to find your mistakes.

## Common mistakes

**Mistake 1: expecting inherited or private members from the wrong method.**

```java
// Wrong: expects to find the inherited public method 'create' this way
Method m = Dog.class.getDeclaredMethod("create"); // NoSuchMethodException
```

`create` is declared in `Animal`, not `Dog`. Fix: use `getMethod("create")` for public inherited members, or walk `getSuperclass()` and call `getDeclaredMethod` on the declaring class.

**Mistake 2: relying on reflection order.**

```java
// Wrong: the first declared field is not guaranteed to be the first in source
Field first = Invoice.class.getDeclaredFields()[0];
```

Fix: for records use `getRecordComponents()`, which is ordered; otherwise sort by name or use an explicit annotation that defines order.

**Mistake 3: using wrapper classes for primitive types.**

```java
// Wrong: the field is declared as long, not Long
boolean isLong = field.getType() == Long.class; // false for a 'long' field
```

Fix: compare against `long.class` (or `Long.TYPE`). Primitive and wrapper `Class` objects are different.

**Mistake 4: loading arbitrary class names from untrusted input.**

```java
// Wrong: request text chooses any class on the class path
Class<?> type = Class.forName(request.getParameter("type"));
```

`Class.forName` runs static initializers of whatever class is named, which can have side effects. Fix: map the untrusted text to an allowlist, for example `Map.of("invoice", Invoice.class, "account", Account.class)`, and reject everything else.

## Best practices

- Prefer class literals and `getClass()`; reserve `Class.forName` for configuration-driven loading with an allowlist.
- Always sort reflective results before printing or asserting on them.
- Use `getRecordComponents()` for records instead of guessing from fields.
- Filter out `isSynthetic()` members and bridge methods when building reports.
- Cache the `Class`, `Method`, and `Field` objects you need; lookups are relatively expensive compared with ordinary calls.
- Keep reflection inside infrastructure code with narrow, typed entry points. Business logic should see interfaces, not `Method` objects.

## Summary

- A `Class` object is the JVM's runtime description of a type; obtain it with a class literal, `getClass()`, or `Class.forName`.
- Primitives (`int.class`), arrays (`[I`), and nested types (`Outer$Inner`) all have `Class` objects with their own naming rules.
- `instanceof` and `isInstance` respect subtyping; `getClass() ==` checks the exact class; `isAssignableFrom` compares two types.
- `getDeclaredX` returns members declared on that type at any access level; `getX` returns public members, including inherited ones.
- Modifiers are bit flags decoded with `Modifier`; package-private has no flag.
- Generic type arguments of objects are erased at runtime, but declarations keep generic signatures.
- Reflection order is unspecified, except for record components, which follow declaration order.

## Practice

**Warm-up:** Write a program that prints the name, simple name, superclass, and interfaces of `java.util.ArrayList`, `int[]`, and a record of your own. Predict each line before running it.

**Core:** Build a `describe(Class<?>)` utility that prints every declared constructor with its parameter types and modifiers, sorted by parameter count. Run it on a class that has a public, a private, and a package-private constructor.

**Core:** For a three-level hierarchy (`Vehicle`, `Car`, `SportsCar`), print the result of `getMethods()` and `getDeclaredMethods()` for each class side by side. Explain every difference in a comment.

**Challenge:** Write `allMethodsIncludingInherited(Class<?>)` that walks the superclass chain and collects declared methods of every access level, skipping overridden ones and synthetic or bridge methods. Compare its output with `getMethods()` and explain which extra methods it finds.

**Challenge:** Design an "inspect a type" feature that accepts a type name from user input. Write down the allowlist, what happens for an unknown name, and why you never pass the raw text to `Class.forName`.

## Check your understanding

1. Why is `==` a valid way to compare two `Class` objects obtained in the same application, and what would make it return false for two classes with the same name?
2. A subclass overrides one public method and declares one private helper. Which of these appear in the subclass's declared-method list, and which appear in its public-method list?
3. What is the difference between `Animal.class.isInstance(obj)` and `obj.getClass() == Animal.class` when `obj` is a `Dog`?
4. Why does `Modifier.toString` return an empty string for some members, and what does that tell you?
5. Why can you learn from reflection that a field is declared as `List<String>`, but not prove that a given list object contains only strings?
6. Why should reflective reports be sorted, and which reflective result already has a reliable order?
