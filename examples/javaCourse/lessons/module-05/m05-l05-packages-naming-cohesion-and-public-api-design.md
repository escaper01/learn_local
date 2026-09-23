# Packages, naming, cohesion, and public API design

A real Java application contains hundreds or thousands of classes. The JDK alone has several thousand. Without a way to group them, names would collide (how many projects have a class called `Date`, `List`, or `User`?), and every class could depend on every other one. **Packages** solve both problems: they give classes a namespace, and together with access modifiers they draw a boundary that decides which classes the outside world may use. On top of packages, Java 9 added **modules**, which group packages and decide which of them are visible to other modules at all.

This lesson moves your code out of the single-file world. You will organize a small ledger into packages, compile and run it from the command line, hide its helpers, design its public API deliberately, and take a first look at modules.

What you will learn:

- What the `package` declaration does and how it relates to directories
- Fully qualified names, single-type imports, on-demand imports, and static imports
- What an `import` actually does, and what it does not do
- How to resolve two classes with the same simple name
- How to compile and run a multi-package program with `javac -d` and `java -cp`
- How package-private visibility hides helpers from other packages
- Naming conventions for packages, classes, and members
- How to group classes by cohesion and design a small public API
- A first look at modules: `module-info.java`, `requires`, and `exports`

## A package is a namespace and a boundary

The first statement of a source file (apart from comments) may be a package declaration:

```java
// fragment: file src/academy/ledger/Ledger.java
package academy.ledger;

public final class Ledger {
    // ...
}
```

This has three effects:

1. **Namespace.** The class's full name is `academy.ledger.Ledger`. Another project's `com.example.Ledger` is a different class.
2. **Access boundary.** Members with no access modifier are visible to every class in `academy.ledger`, and to nothing outside it.
3. **Location convention.** Tools expect the source file at `academy/ledger/Ledger.java` under a source root, and `javac` places the compiled class at `academy/ledger/Ledger.class` under the output directory.

A file with no package declaration belongs to the *unnamed package*. That is fine for single-file experiments, which is why earlier lessons used it, but classes in the unnamed package cannot be imported by classes in named packages. Real projects always use named packages.

Packages are **not nested** in the language sense. `academy.ledger` and `academy.ledger.internal` look like parent and child, but for access purposes they are two unrelated packages: package-private members of one are invisible to the other.

## Names and imports

Every class can be referred to by its **fully qualified name**, without any import:

```java
// fragment
java.util.List<String> names = java.util.List.of("Ada", "Linus");
```

That gets tedious, so Java offers imports. The complete program below uses every kind.

```java
import java.time.LocalDate;
import java.util.*;

import static java.lang.Math.max;
import static java.lang.Math.PI;

public class ImportDemo {
    public static void main(String[] args) {
        // Fully qualified name: no import needed.
        java.util.List<String> a = java.util.List.of("x", "y");

        // Single-type import (java.time.LocalDate).
        LocalDate date = LocalDate.of(2026, 1, 5);

        // On-demand import (java.util.*) covers List, Map, TreeMap ...
        Map<String, Integer> counts = new TreeMap<>();
        counts.put("b", 2);
        counts.put("a", 1);

        // java.lang is imported automatically: String, Math, Integer, System.
        int parsed = Integer.parseInt("42");

        // Static imports let us write max and PI without the class name.
        System.out.println(a + " " + date + " " + counts + " " + parsed);
        System.out.println("max=" + max(3, 7) + ", PI=" + PI);

        // Same simple name, different packages: qualify one of them.
        java.sql.Date sqlDate = java.sql.Date.valueOf("2026-01-05");
        Date utilDate = new Date(sqlDate.getTime());
        System.out.println(sqlDate.getClass().getName() + " / " + utilDate.getClass().getName());
    }
}
```

Output:

```text
[x, y] 2026-01-05 {a=1, b=2} 42
max=7, PI=3.141592653589793
java.sql.Date / java.util.Date
```

| Form | Example | Brings into scope |
|---|---|---|
| Single-type import | `import java.time.LocalDate;` | One class |
| On-demand import | `import java.util.*;` | Every public class of that one package, as needed (not subpackages) |
| Static single import | `import static java.lang.Math.max;` | One static member |
| Static on-demand import | `import static java.lang.Math.*;` | All static members of one class |
| Implicit | (nothing to write) | Everything in `java.lang` and in your own package |

### What an import really does

An import is a **compile-time naming shortcut**. It tells the compiler "when I write `LocalDate`, I mean `java.time.LocalDate`". That is all. In particular:

- It does **not** copy code into your file or make your program larger. The compiled `.class` file refers to classes by their fully qualified names whether you imported them or not.
- It does **not** download or install anything. The class must already be available on the class path or module path. Getting libraries is the job of build tools such as Maven and Gradle (Chapter 16).
- It does **not** change access. Importing a package-private class from another package still fails; `import` cannot unlock `private` or package-private members.
- An on-demand import (`*`) is not slower at run time. It only affects how the compiler resolves names.

### Resolving name clashes

Both `java.util` and `java.sql` contain a class named `Date`. If both packages are imported on demand and you write `Date`, the compiler cannot choose:

```java
import java.util.*;
import java.sql.*;

public class Ambiguous {
    public static void main(String[] args) {
        Date today = new Date(0);
        System.out.println(today);
    }
}
```

```text
error: reference to Date is ambiguous
  both class java.sql.Date in java.sql and class java.util.Date in java.util match
```

Fixes, in order of preference: add a single-type import for the one you mean (`import java.util.Date;`, which wins over on-demand imports), or use the fully qualified name for the other one, as `ImportDemo` does with `java.sql.Date`.

## Building a multi-package program

Here is a small ledger split into two packages: `academy.ledger` holds the domain, `academy.app` holds the program entry point. The directory layout is:

```text
src/
  academy/
    app/
      Main.java
    ledger/
      Ledger.java
      LineParser.java
```

`Ledger` is the public API. It hides its storage and delegates text parsing to a helper:

```java
package academy.ledger;

import java.util.ArrayList;
import java.util.List;

/** Records deposits and withdrawals in cents. Not thread-safe. */
public final class Ledger {
    private final List<Long> entries = new ArrayList<>();
    private long balanceCents;

    /**
     * Applies one command such as "IN 500" or "OUT 200".
     *
     * @return true if the command was valid and applied; false otherwise (state unchanged)
     */
    public boolean apply(String command) {
        Long delta = LineParser.parseDelta(command);
        if (delta == null || balanceCents + delta < 0) {
            return false;
        }
        balanceCents += delta;
        entries.add(delta);
        return true;
    }

    public long balanceCents() {
        return balanceCents;
    }

    public int entryCount() {
        return entries.size();
    }
}
```

The parser is **package-private** (no `public` on the class), so only classes in `academy.ledger` can use it:

```java
package academy.ledger;

final class LineParser {
    private LineParser() {
    }

    static Long parseDelta(String command) {
        String[] parts = command.strip().split(" ");
        if (parts.length != 2) {
            return null;
        }
        long amount;
        try {
            amount = Long.parseLong(parts[1]);
        } catch (NumberFormatException e) {
            return null;
        }
        if (amount <= 0) {
            return null;
        }
        return switch (parts[0]) {
            case "IN" -> amount;
            case "OUT" -> -amount;
            default -> null;
        };
    }
}
```

(Returning `null` for "invalid" keeps this example short; Chapter 11 and Chapter 13 show clearer options such as exceptions and `Optional`. Overflow checking is also omitted here for brevity; production money code should use `Math.addExact`.)

The application imports only the public class:

```java
package academy.app;

import academy.ledger.Ledger;

public class Main {
    public static void main(String[] args) {
        Ledger ledger = new Ledger();
        String[] commands = {"IN 500", "OUT 200", "OUT 900", "PAY 5", "IN 50"};
        for (String command : commands) {
            System.out.println(command + " -> " + (ledger.apply(command) ? "OK" : "ERROR"));
        }
        System.out.println("balance=" + ledger.balanceCents() + ", entries=" + ledger.entryCount());
    }
}
```

Compile all sources into an output directory with `-d`, then run the main class by its fully qualified name with the output directory on the class path:

```bash
javac -d out src/academy/ledger/Ledger.java src/academy/ledger/LineParser.java src/academy/app/Main.java
java -cp out academy.app.Main
```

`javac -d out` creates the package directories for you: `out/academy/app/Main.class`, `out/academy/ledger/Ledger.class`, and `out/academy/ledger/LineParser.class`. Output:

```text
IN 500 -> OK
OUT 200 -> OK
OUT 900 -> ERROR
PAY 5 -> ERROR
IN 50 -> OK
balance=350, entries=3
```

On Windows PowerShell the commands are the same; use backslashes in source paths if you prefer (`src\academy\app\Main.java`). The class name given to `java` always uses dots.

### The package boundary in action

Suppose a class in `academy.app` tries to use the helper directly:

```java
package academy.app;

import academy.ledger.LineParser;

public class Sneaky {
    public static void main(String[] args) {
        System.out.println(LineParser.parseDelta("IN 5"));
    }
}
```

```text
error: LineParser is not public in academy.ledger; cannot be accessed from outside package
```

This is exactly what we want. `Ledger`'s authors can rename `LineParser`, change its return type, or replace it with a regular expression, and no code outside the package can break, because none can depend on it.

## What happens under the hood: finding classes

When the JVM needs `academy.ledger.Ledger`, the class loader converts the name to a relative path, `academy/ledger/Ledger.class`, and searches each entry of the class path (directories and JAR files) in order. This is why the directory structure must match the package name, and why running `java Main` from inside `out/academy/app` fails with "Could not find or load main class": the loader looks for `Main` in the unnamed package, not for `academy.app.Main`.

At the bytecode level there are no imports at all. Every reference to another class is stored with its fully qualified name, which is why imports cost nothing at run time.

## Naming conventions

| Element | Convention | Examples |
|---|---|---|
| Package | All lowercase, dot-separated, often reversed domain | `com.example.billing`, `academy.ledger` |
| Class, interface, enum, record | `UpperCamelCase` noun | `Ledger`, `InvoiceLine`, `PaymentStatus` |
| Method | `lowerCamelCase`, usually a verb | `apply`, `reserveSeat`, `isOverdue` |
| Field, local variable, parameter | `lowerCamelCase` noun | `balanceCents`, `dueDate` |
| Constant (`static final` immutable) | `UPPER_SNAKE_CASE` | `MAX_PER_EVENT` |

Reversed internet domains (`com.example...`, `org.example...`) prevent collisions between organizations. Avoid package names that start with `java` or `javax`; those are reserved for the platform. Include units in names when they are not obvious: `balanceCents`, `timeoutMillis`.

## Cohesion: deciding what goes together

**Cohesion** means the things in a package belong together: they serve one responsibility and tend to change for the same reasons. Two common ways to organize a project:

| Package by layer | Package by feature |
|---|---|
| `app.controllers`, `app.services`, `app.repositories` | `app.ledger`, `app.members`, `app.reports` |
| One feature is spread across many packages | One feature lives in one package |
| Helpers must be `public` to be shared across layers | Helpers can stay package-private |
| Easy to find "all controllers" | Easy to find "everything about ledgers" |

Many teams prefer packaging by feature because it lets package-private visibility do real work. Whatever you choose, watch for warning signs: a package named `util`, `common`, `misc`, or `manager` that keeps growing usually collects unrelated responsibilities; a domain package that imports console, file, or network classes has absorbed concerns that belong at the edges.

Dependencies between packages should point one way: `academy.app` depends on `academy.ledger`, never the reverse. The domain should not know how it is presented.

## Designing a public API

Once another package or project uses a public class, every public element becomes a promise. Before making something public, decide and document:

- **Units**: cents or euros? milliseconds or seconds?
- **Null behavior**: may arguments be `null`? can the result be `null`?
- **Errors**: does invalid input return `false`, throw, or return an empty result? Is state changed on failure?
- **Mutability and ownership**: does a returned collection reflect later changes? may the caller keep it?
- **Thread safety**: can several threads use one instance?

Keep the surface small. `Ledger` exposes three methods; its list of entries, its parser, and its balance field are all hidden. Adding a public method later is easy. Removing or changing one breaks every caller.

> **Tip:** When you are unsure whether something should be public, leave it package-private. Wait for a real caller in another package to need it, then design the public version deliberately.

## A first look at modules

Packages hide *classes*. But a `public` class is visible to everyone on the class path, including classes like `academy.ledger.internal.Audit` that are public only so that your own packages can share them. **Modules** (Java 9 and later, part of the Java Platform Module System) add a layer above packages: a module declares which of its packages are exported, and only exported packages are accessible to other modules, even if their classes are public.

A module is described by a `module-info.java` file at the root of its source tree:

```java
// fragment: file academy.ledger/module-info.java
module academy.ledger {
    exports academy.ledger;
}
```

```java
// fragment: file academy.app/module-info.java
module academy.app {
    requires academy.ledger;
}
```

- `exports academy.ledger;` makes that package's public types usable by other modules. The package `academy.ledger.internal` is not exported, so it stays private to the module.
- `requires academy.ledger;` declares that `academy.app` depends on that module. Every module implicitly requires `java.base`, which contains `java.lang`, `java.util`, and other core packages.

With one directory per module, the layout and commands are:

```text
mods/
  academy.app/
    module-info.java
    academy/app/Main.java
  academy.ledger/
    module-info.java
    academy/ledger/Ledger.java
    academy/ledger/LineParser.java
    academy/ledger/internal/Audit.java
```

```bash
javac -d mout --module-source-path mods $(find mods -name "*.java")
java --module-path mout -m academy.app/academy.app.Main
```

The program prints the same six lines as before. (`$(find ...)` is Bash syntax for listing all source files; in PowerShell you can list the files explicitly.) If `academy.app` tries to import the public class `academy.ledger.internal.Audit`, compilation fails:

```text
error: package academy.ledger.internal is not visible
  (package academy.ledger.internal is declared in module academy.ledger, which does not export it)
```

The JDK itself is split into modules such as `java.base`, `java.sql`, and `java.net.http`; `java --list-modules` prints them. You do not need modules for small programs, and many applications still run on the class path. Chapter 21 covers modules in depth, including `opens`, services, and migration. For now, remember the layering:

| Level | Hides | Declared with |
|---|---|---|
| Class member | Fields and methods | `private`, package-private, `protected`, `public` |
| Package | Classes | `public` or no modifier on the class |
| Module | Whole packages | `exports` in `module-info.java` |

## Common mistakes

### Source directory does not match the package

A file declaring `package academy.ledger;` saved as `src/Ledger.java` still compiles when listed explicitly, but tools and other compilations that search source paths will not find it, and the mismatch confuses readers. Keep directories and packages identical.

### Running a packaged class by its simple name

```bash
cd out/academy/app
java Main
```

```text
Error: Could not find or load main class Main
Caused by: java.lang.NoClassDefFoundError: Main (wrong name: academy/app/Main)
```

Run from the output root with the fully qualified name: `java -cp out academy.app.Main`.

### Expecting an import to grant access or fetch a library

Importing a package-private class does not make it accessible, and importing a class from a library you have not added to the class path produces "package ... does not exist". Imports only shorten names.

### Ambiguous on-demand imports

Two on-demand imports that both contain the same simple name produce "reference to Date is ambiguous". Use a single-type import or a fully qualified name.

### Making everything public "just in case"

Each public type is a promise you must keep. Start package-private and widen only for real callers.

## Best practices

- Always use named packages with lowercase, domain-based names.
- Group by responsibility (often by feature) so helpers can stay package-private.
- Keep dependencies pointing inward: user interface and I/O depend on the domain, not the other way around.
- Prefer single-type imports in production code; they document exactly what a file uses. Many teams let the IDE manage imports.
- Document units, nulls, errors, mutability, and thread safety on public methods.
- Compile to a separate output directory (`-d out`) and never commit compiled `.class` files.
- Consider modules for libraries and larger applications that need strong encapsulation between packages.

## Summary

- A `package` declaration gives a class a namespace and an access boundary; directories mirror package names.
- Classes can be referenced by fully qualified names; imports only shorten names at compile time.
- Imports do not copy code, download libraries, or change access rules. `java.lang` is imported automatically.
- Name clashes are resolved with single-type imports or fully qualified names.
- `javac -d out` compiles into package directories; `java -cp out package.ClassName` runs them.
- Package-private classes and members are invisible outside their package, which keeps helpers replaceable.
- Cohesive packages group things that change together; a small, documented public API can evolve safely.
- Modules group packages, and only exported packages are accessible to other modules.

## Practice

### Warm-up

1. Rewrite `ImportDemo` using only fully qualified names and no imports. Confirm it prints the same output.
2. Create the `Ambiguous` program, record the error, then fix it two different ways.

### Core

1. Build the ledger example yourself with the three files in the shown layout. Compile with `javac -d out` and run with `java -cp out academy.app.Main`. List the generated `.class` files.
2. Add a class in `academy.app` that tries to call `LineParser.parseDelta`. Record the diagnostic and explain in one sentence why it protects the ledger's authors.
3. Split a small budget program into `budget.domain` (the model), `budget.console` (reading input and printing), and `budget.app` (the `main` composition root). Check that `budget.domain` imports nothing from the other two.

### Challenge

1. Turn the ledger into two modules as shown, add an `internal` package, and prove that the application module cannot use it even though its class is `public`.
2. Write the documentation comment for a public `Ledger.transfer(Ledger target, long cents)` method that states units, null handling, failure behavior, and whether state changes on failure. Then list the smallest public API a second application would need to use your ledger.

## Check your understanding

1. What three things does a package declaration determine?
2. What exactly does `import java.time.LocalDate;` do, and what does it not do?
3. Why can `academy.ledger.internal` classes not see package-private members of `academy.ledger`?
4. How do you resolve a clash between `java.util.Date` and `java.sql.Date` in one file?
5. What is the practical difference between hiding a helper with package-private visibility and hiding a whole package with a module that does not export it?
6. Why is it cheaper to make something public later than to make it non-public later?
