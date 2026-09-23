# Compile, launch, classpath, and JAR files

Real Java applications are not a single `Main.java` sitting in a folder. They contain hundreds of classes organized into packages, compiled into a separate output folder, and shipped as JAR archives. The most common "it works on my machine" failure for beginners is not a coding error at all: it is launching a class from the wrong folder or with the wrong name. Understanding packages, the classpath, and JAR files turns those failures from mysteries into two-minute fixes.

What you will learn:

- What a package is and how it maps to folders on disk
- What a fully qualified class name is
- How `javac -d` separates source files from compiled output
- What the classpath is and how the launcher uses it to find classes
- How to pass command-line arguments to `main`
- How to create, inspect, and run a JAR file, and what the manifest does
- How to tell compile errors, class-loading errors, and runtime errors apart

## Packages: a class's family name

A **package** groups related classes and gives them a namespace, the same way a surname distinguishes two people called Sam. The first statement of a source file declares its package:

```java
package academy;
```

The package becomes part of the class's full name. A class `Main` in package `academy` has the **fully qualified name** `academy.Main`. Two different libraries can each have a class called `Main` without conflict, because their full names differ.

Packages mirror folders. The rule is strict: a class in package `academy` is stored in a folder named `academy`, and a class in package `com.shop.billing` lives in the folder path `com/shop/billing`. Package names are written in lowercase by convention, and companies often start them with their reversed domain name.

## A two-class packaged project

Create this layout (the project root is whatever folder you are working in):

```text
project/
  src/
    academy/
      Main.java
      Greeter.java
```

`src/academy/Greeter.java`:

```java
package academy;

public class Greeter {
    public static String greet(String name) {
        return "Hello, " + name + "! Packaged application is running.";
    }
}
```

`src/academy/Main.java`, a complete program that uses `Greeter`:

```java
package academy;

public class Main {
    public static void main(String[] args) {
        String message = Greeter.greet("learner");
        System.out.println(message);
        System.out.println("Running class: " + Main.class.getName());
    }
}
```

Because both classes are in the same package, `Main` can use `Greeter` by its short name.

## Compiling into an output folder

From the project root, run:

```bash
javac --release 21 -d out src/academy/Main.java src/academy/Greeter.java
```

- `--release 21` fixes the target Java version.
- `-d out` chooses the **destination** folder for compiled classes. The compiler creates the package folders inside it for you.
- The remaining arguments are the source files to compile.

After compiling, the `out` folder contains:

```text
out/academy/Main.class
out/academy/Greeter.class
```

Keeping source (`src`) and compiled output (`out`) in separate folders is a professional habit. You can delete `out` at any time and rebuild it, and you never accidentally ship source files or commit build output to version control.

## The classpath: where the launcher looks

When you run `java`, the JVM needs to find class files. The **classpath** is the list of places it searches. You set it with `-cp` (long forms: `-classpath` or `--class-path`). If you do not set it, the classpath is just the current folder.

The launcher combines two pieces of information:

1. A classpath **root**, such as `out`.
2. A fully qualified class name, such as `academy.Main`.

It turns the dots in the name into folder separators, appends `.class`, and looks under each root. So `academy.Main` with root `out` means "look for `out/academy/Main.class`."

```bash
java -cp out academy.Main
```

Output:

```text
Hello, learner! Packaged application is running.
Running class: academy.Main
```

The critical point: the classpath root is the folder that **contains** the package folder, not the package folder itself. And the thing after the options is a **class name with dots**, not a path to a file.

A useful analogy is a library. The classpath is the list of buildings to search. The fully qualified name is the call number, such as "academy shelf, Main book." You would not hand the librarian the path through the building; you give the building and the call number.

### What goes wrong with the wrong combination

These are real outputs from the project above. Each one is a mismatch between root and name.

Root is correct, but the name leaves out the package:

```text
$ java -cp out Main
Error: Could not find or load main class Main
Caused by: java.lang.ClassNotFoundException: Main
```

The launcher looked for `out/Main.class`, which does not exist.

Root points inside the package folder:

```text
$ java -cp out/academy Main
Error: Could not find or load main class Main
Caused by: java.lang.NoClassDefFoundError: Main (wrong name: academy/Main)
```

The launcher found a file called `Main.class`, opened it, and discovered the class inside calls itself `academy/Main`. The name and location disagree, so it refuses.

Root points inside the package folder *and* the full name is used:

```text
$ java -cp out/academy academy.Main
Error: Could not find or load main class academy.Main
Caused by: java.lang.ClassNotFoundException: academy.Main
```

Now the launcher looks for `out/academy/academy/Main.class`.

A file path is passed instead of a class name:

```text
$ java out/academy/Main.class
Error: Could not find or load main class out.academy.Main.class
Caused by: java.lang.ClassNotFoundException: out.academy.Main.class
```

The launcher treated the whole path as a class name, turning slashes into dots, and of course no class has that name.

| Command | Looks for | Result |
|---|---|---|
| `java -cp out academy.Main` | `out/academy/Main.class` | Runs |
| `java -cp out Main` | `out/Main.class` | Class not found |
| `java -cp out/academy Main` | `out/academy/Main.class`, but its internal name is `academy.Main` | Wrong name |
| `java -cp out/academy academy.Main` | `out/academy/academy/Main.class` | Class not found |

### Several classpath entries

A classpath can contain several roots and JAR files, separated by the operating system's path separator:

- Windows: semicolon, as in `java -cp "out;lib\helper.jar" academy.Main`
- Linux and macOS: colon, as in `java -cp out:lib/helper.jar academy.Main`

For example, compiling each class into a different folder and then launching with both on the classpath works:

```bash
javac -d classes src/academy/Greeter.java
javac -d app -cp classes src/academy/Main.java
java -cp app:classes academy.Main
```

Output:

```text
Hello, learner! Packaged application is running.
Running class: academy.Main
```

Notice that `javac` also accepts `-cp`: when compiling `Main.java` it needs to find the already-compiled `Greeter` class to check that `greet` exists.

> **Warning:** On Linux and macOS, a semicolon in a shell command *ends the command*. Typing `java -cp out;app.jar academy.Main` in bash runs `java -cp out` (which prints the launcher's usage help) and then tries to run `app.jar academy.Main` as a separate command. Use colons on Unix-like systems, and quote the classpath on Windows.

## Passing arguments to main

The `String[] args` parameter of `main` receives the words typed after the class name. This complete program prints them (the `for` loop repeats once per argument; loops are taught in Chapter 3):

```java
public class ArgsDemo {
    public static void main(String[] args) {
        System.out.println("Argument count: " + args.length);
        for (int i = 0; i < args.length; i++) {
            System.out.println("args[" + i + "] = " + args[i]);
        }
    }
}
```

Running `java -cp out ArgsDemo red "light blue" 42` prints:

```text
Argument count: 3
args[0] = red
args[1] = light blue
args[2] = 42
```

Running it with no arguments prints:

```text
Argument count: 0
```

Every argument arrives as a String, even `42`. Quotes group words into one argument; the quotes themselves are removed by the shell. Anything placed *before* the class name is an option for the launcher; anything *after* it belongs to your program.

## JAR files

A **JAR** (Java ARchive) is a ZIP file containing compiled classes, resources such as configuration files or images, and a special file called the **manifest**. It lets you ship an application or library as a single file.

Create one from the compiled output:

```bash
jar --create --file academy.jar --main-class academy.Main -C out .
```

- `--create --file academy.jar` names the archive to create.
- `--main-class academy.Main` records the entry point in the manifest.
- `-C out .` means "change into `out`, then add everything there." This keeps the package folders at the top of the archive, exactly as the classpath expects.

List the contents:

```bash
jar --list --file academy.jar
```

```text
META-INF/
META-INF/MANIFEST.MF
academy/
academy/Greeter.class
academy/Main.class
```

The manifest is a small text file:

```text
Manifest-Version: 1.0
Created-By: 21.0.12 (Eclipse Adoptium)
Main-Class: academy.Main
```

Now the JAR can be run from any folder, even after copying it somewhere else:

```bash
java -jar academy.jar
```

```text
Hello, learner! Packaged application is running.
Running class: academy.Main
```

With `-jar`, the launcher reads `Main-Class` from the manifest and uses the JAR itself as the classpath. You can also treat a JAR like a folder on the classpath and name the class yourself: `java -cp academy.jar academy.Main` produces the same output.

A JAR created without `--main-class` has no entry point recorded:

```text
$ java -jar plain.jar
no main manifest attribute, in plain.jar
```

### What a JAR is not

- It is not a JVM; the user still needs a Java runtime installed (or bundled by other means).
- It does not automatically include the libraries your code depends on. Build tools such as Maven and Gradle manage dependencies and can produce a JAR that bundles them, but that is a deliberate configuration choice covered later in the academy.
- It should contain compiled classes and resources, not your `src` folder. Source in a JAR does nothing for the launcher.

## Three different failure stages

When someone reports "it does not work," find out which stage failed. Each stage has a different tool, different messages, and a different fix.

| Stage | Tool | Typical message | Where to look |
|---|---|---|---|
| Compile | `javac` | `error: cannot find symbol` with file, line, and caret | The source code at that line |
| Class loading | `java` launcher | `Could not find or load main class`, `ClassNotFoundException`, `NoClassDefFoundError` | Classpath, package, and class name |
| Runtime | Your running code | `Exception in thread "main"` with a stack trace | The logic at the top line of your code in the trace |

Class loading can also fail *after* the program starts. Here the compiled `Greeter.class` was deleted from a copy of the output folder and the program was launched from that copy:

```text
Exception in thread "main" java.lang.NoClassDefFoundError: academy/Greeter
	at academy.Main.main(Main.java:5)
Caused by: java.lang.ClassNotFoundException: academy.Greeter
```

`Main` was found and started, but at line 5 it needed `Greeter`, which was not on the classpath. The code is fine; the classpath is incomplete. This is exactly what happens when a library JAR is missing from a deployment.

## What happens under the hood

Step by step, for `java -cp out academy.Main`:

1. The shell splits the line into the program name `java` and the arguments `-cp`, `out`, and `academy.Main`.
2. The launcher reads options until it reaches the first non-option: the main class name.
3. The JVM starts. Its application class loader is configured with the classpath `out`.
4. The class loader converts `academy.Main` to the relative path `academy/Main.class` and checks each classpath entry in order.
5. It finds `out/academy/Main.class`, reads the bytes, and verifies that the class inside really is named `academy.Main`.
6. The launcher finds `public static void main(String[] args)` and calls it with any remaining arguments.
7. When `main` first uses `Greeter`, the class loader repeats steps 4 and 5 for `academy.Greeter`. Classes are loaded lazily, on first use.

## Common mistakes

**Running from the wrong folder.** A relative classpath such as `out` is resolved against the terminal's current folder. If you `cd` into `src`, `-cp out` points at `src/out`, which does not exist. Run from the project root or use the correct relative path.

**Forgetting the package in the launch name.** If the source starts with `package academy;`, the class name is `academy.Main`, always.

**Pointing `-cp` at the package folder.** Point it at the folder above the first package folder.

**Wrong separator for the operating system.** Semicolons on Windows, colons on Linux and macOS.

**Stale classes.** You fixed the source but did not recompile, so the old `.class` still runs. When behavior seems impossible, delete the output folder and rebuild from scratch.

**Mismatched package and folder.** A file in `src/academy` that declares `package tools;` compiles into `out/tools`, surprising everyone. Keep the declaration and folder identical.

## Best practices

- Always compile with `-d` into a dedicated output folder and never edit files inside it.
- Launch with an explicit `-cp` so your command does not depend on hidden defaults such as a `CLASSPATH` environment variable.
- Use packages from the start, even in small projects.
- Before investigating code, read the failure message and decide which stage failed.
- When cleaning build output, delete only the output folder you created. Never run a recursive delete on a path you have not double-checked.
- Inspect JARs with `jar --list` before shipping them; confirm the classes and manifest are what you expect.

## Summary

- A package is part of a class's fully qualified name (`academy.Main`) and maps directly to folders (`academy/Main.class`).
- `javac -d out` writes compiled classes into package folders under `out`.
- The classpath lists roots; the launcher combines a root with the dotted class name to locate a class file.
- The classpath root is the folder containing the package folders, and the launcher needs the fully qualified name, not a file path.
- Multiple classpath entries are separated by `;` on Windows and `:` on Linux and macOS.
- `args` receives the words after the class name, always as Strings.
- A JAR is an archive of classes, resources, and a manifest; `Main-Class` in the manifest lets `java -jar` start it.
- Compile errors, class-loading errors, and runtime exceptions are different stages with different fixes.

## Practice

**Warm-up**

1. Build the two-class `academy` project from an empty `out` folder and list every file that appears.
2. Run it with the correct command, then reproduce each of the three wrong commands in the table and match your messages to the ones shown.

**Core**

3. Move `Greeter` into a new package `academy.text`. Update the package declaration, the folder, and `Main` (you will need `import academy.text.Greeter;` at the top of `Main.java`). Rebuild and launch.
4. Create `academy.jar`, copy it to a different folder, and run it with `java -jar`. Then run it with `-cp` and the class name.
5. Run `ArgsDemo` with arguments containing spaces, quotes, and an empty string `""`. Record how many arguments arrive each time.

**Challenge**

6. Compile `Greeter` into `lib` and package it as `greeter.jar`. Compile `Main` against that JAR, then launch `Main` with a classpath containing both your output folder and `greeter.jar`. Finally remove the JAR from the classpath and explain the resulting error and its stage.
7. Write a short troubleshooting checklist for "Could not find or load main class" that a teammate could follow without asking you.

## Check your understanding

1. What is the fully qualified name of a class declared `public class Report` in a file starting with `package com.shop.billing;`, and where must its class file live relative to the classpath root?
2. Why does `-cp out/academy Main` fail with a "wrong name" message for a class in package `academy`?
3. What does `-C out .` do in the `jar` command, and why does it matter for the classpath inside the JAR?
4. What is the difference between the message from a missing class at launch and a `NoClassDefFoundError` after the program has started?
5. Which character separates classpath entries on your operating system, and what goes wrong in bash if you use the other one?
6. Where do the values in `args` come from, and what type are they?
