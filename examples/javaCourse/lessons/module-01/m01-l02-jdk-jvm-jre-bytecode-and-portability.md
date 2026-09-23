# JDK, JVM, JRE, bytecode, and portability

When a Java program misbehaves only on one machine, or a build server says it cannot run a class you just compiled, the cause is usually not your code. It is the toolchain: which JDK compiled the class, which runtime is running it, and which operating system is underneath. Developers who understand the pipeline from `Main.java` to a running process diagnose these problems in minutes; developers who do not can lose days.

This lesson opens up that pipeline. You will see the bytecode the compiler produces, learn what the Java Virtual Machine does with it, and understand exactly what "portable" does and does not promise.

What you will learn:

- The difference between the JDK, the JRE, and the JVM
- Which tool in the JDK performs each job, and which one produces bytecode
- What bytecode is and how to inspect it with `javap`
- What the JVM does when it loads and runs a class, including JIT compilation
- How class-file versions work and what `UnsupportedClassVersionError` means
- Why Java programs are portable, and which things still differ between operating systems

## Three forms of the same program

Your program exists in three different forms during its life:

1. **Source code** (`Main.java`): human-readable text that you write and edit.
2. **Bytecode** (`Main.class`): compact binary instructions for an imaginary computer called the Java Virtual Machine. It is produced by the compiler and is not meant to be read by people.
3. **Native machine code**: the real instructions for your specific processor (for example x86-64 or ARM). The JVM creates this at runtime.

An analogy helps. Think of a piece of music. The composer writes a score (source code). A publisher prints standard sheet music that any trained orchestra can read (bytecode). Each orchestra, in its own concert hall with its own instruments, performs it (the JVM running on a particular machine). The same sheet music works in every hall, but the hall still affects the sound.

## JDK, JRE, and JVM

These three acronyms are often confused. They nest inside one another:

| Name | Stands for | Contains | Who needs it |
|---|---|---|---|
| JVM | Java Virtual Machine | The engine that loads, verifies, and executes bytecode | Every running Java program |
| JRE | Java Runtime Environment | A JVM plus the standard class libraries (`String`, `System`, collections, and so on) | Anyone who only *runs* Java programs |
| JDK | Java Development Kit | A complete runtime plus development tools such as the compiler | Developers, and build servers |

Historically you could download a JRE on its own. Since Java 11, most vendors ship only the JDK, and applications that need a small runtime build a custom one with the `jlink` tool. For this course you need a **JDK for Java 21**; it already includes everything a runtime has.

### The tools inside the JDK

A JDK's `bin` folder holds many command-line programs. These are the ones you will use most:

| Tool | Input | Output / job |
|---|---|---|
| `javac` | `.java` source files | Compiles source into `.class` bytecode files |
| `java` | A class name, a JAR, or a single source file | Starts a JVM and runs the program |
| `jar` | `.class` files and resources | Packages them into a single `.jar` archive |
| `javap` | `.class` files | Disassembles bytecode so you can read it |
| `jshell` | Expressions typed interactively | Evaluates Java snippets immediately |
| `javadoc` | Source with `/** */` comments | Generates HTML API documentation |
| `jlink` | Modules | Builds a custom, trimmed runtime image |

The key relationship: `javac` is the only tool in this list that turns source text into bytecode. `java` and `jar` both work with class files that already exist. (The `java Main.java` shortcut compiles in memory, but it is using the compiler internally.)

### Versions and distributions

Java is released every six months with a new **feature version** number. Some releases are designated **LTS** (long-term support) and receive updates for years; companies usually standardize on them. Java 8, 11, 17, 21, and 25 are LTS releases. This academy targets Java 21.

Java is open source (the OpenJDK project), and several vendors build and distribute JDKs from it, including Eclipse Temurin, Oracle, Amazon Corretto, Microsoft, and Azul Zulu. For learning, any Java 21 build works the same way. Check what you have:

```bash
javac --version
java --version
```

Output from the machine used to write this lesson:

```text
javac 21.0.12
openjdk 21.0.12 2026-07-21 LTS
OpenJDK Runtime Environment Temurin-21.0.12+8 (build 21.0.12+8-LTS)
OpenJDK 64-Bit Server VM Temurin-21.0.12+8 (build 21.0.12+8-LTS, mixed mode, sharing)
```

The first number after `21` is the update level. Both commands must report version 21. If they disagree, two different JDKs are installed and your terminal is finding them in different places; lesson 6 explains how the `PATH` variable decides which one wins.

## Seeing bytecode with javap

Save this complete program as `Main.java`:

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from bytecode");
    }
}
```

Compile and run it, then disassemble the class file:

```bash
javac --release 21 Main.java
java Main
javap -c Main
```

Output of `java Main`:

```text
Hello from bytecode
```

Output of `javap -c Main`:

```text
Compiled from "Main.java"
public class Main {
  public Main();
    Code:
       0: aload_0
       1: invokespecial #1                  // Method java/lang/Object."<init>":()V
       4: return

  public static void main(java.lang.String[]);
    Code:
       0: getstatic     #7                  // Field java/lang/System.out:Ljava/io/PrintStream;
       3: ldc           #13                 // String Hello from bytecode
       5: invokevirtual #15                 // Method java/io/PrintStream.println:(Ljava/lang/String;)V
       8: return
}
```

Read the `main` section line by line:

1. `getstatic` fetches the `System.out` object.
2. `ldc` loads the constant string `"Hello from bytecode"`.
3. `invokevirtual` calls `println` on that object with that string.
4. `return` ends the method.

You also see a method called `Main()` that you never wrote. It is a **default constructor** the compiler adds automatically; Chapter 5 explains constructors. This is a first lesson in reading bytecode: it does not map one-to-one onto your source lines.

### The JVM is a stack machine

Here is a second complete program with a small method:

```java
public class Calculator {
    public static void main(String[] args) {
        int total = add(3, 4);
        System.out.println("3 + 4 = " + total);
    }

    static int add(int a, int b) {
        return a + b;
    }
}
```

Output:

```text
3 + 4 = 7
```

The bytecode for `add`, from `javap -c Calculator` (fragment of the full listing):

```text
  static int add(int, int);
    Code:
       0: iload_0
       1: iload_1
       2: iadd
       3: ireturn
```

The JVM works like a stack of plates. `iload_0` pushes the first parameter (`a`) onto the operand stack. `iload_1` pushes `b`. `iadd` pops both, adds them, and pushes the result. `ireturn` pops the result and returns it. The `i` prefix means "int". Every JVM on every platform understands exactly these instructions, which is the foundation of portability.

## What happens under the hood when you run `java Main`

1. The operating system starts the `java` launcher as a new process.
2. The launcher creates the JVM and reserves memory for it, including the **heap** where objects live.
3. The **class loader** finds `Main.class` (using the classpath, covered in lesson 3) and reads its bytes.
4. The **bytecode verifier** checks that the instructions are well-formed and safe: no jumping into the middle of an instruction, no treating a number as an object reference.
5. The class is **initialized**, and the JVM looks up `public static void main(String[] args)`.
6. The **interpreter** starts executing bytecode instructions one at a time.
7. The JVM watches which methods run often. Those "hot" methods are handed to the **JIT (just-in-time) compiler**, which translates them into native machine code for your exact processor. Later calls run that fast native code instead.
8. The **garbage collector** periodically frees memory used by objects the program can no longer reach.
9. When `main` returns (and no other non-daemon threads are running), the JVM shuts down and the process exits.

This design explains a common observation: Java programs often start a little slowly and then run fast, because the JIT compiler needs a moment to identify and optimize hot code.

## Class-file versions and compatibility

Every class file begins with the same four bytes, `CA FE BA BE` (the "magic number"), followed by a version number. Here are the first eight bytes of the `Main.class` compiled above:

```text
0000000 ca fe ba be 00 00 00 41
```

Hexadecimal `41` is decimal 65, the class-file major version for Java 21. Each Java feature release has its own number:

| Java version | Class-file major version |
|---|---|
| 8 | 52 |
| 11 | 55 |
| 17 | 61 |
| 21 | 65 |
| 25 | 69 |

You can also see it with `javap -v Main`, which prints `major version: 65`.

The compatibility rule is simple:

- A **newer** runtime can run **older** class files. A Java 21 JVM happily runs classes compiled for Java 17.
- An **older** runtime **cannot** run **newer** class files. It does not know what new features they might use.

When the second rule is broken, the JVM refuses to load the class. To reproduce the error on a Java 21 runtime, the version byte of a class file was changed to 66 (the next release). Running it produced:

```text
Error: LinkageError occurred while loading main class Main
	java.lang.UnsupportedClassVersionError: Main has been compiled by a more recent version of the Java Runtime (class file version 66.0), this version of the Java Runtime only recognizes class file versions up to 65.0
```

When you see this in real life, it almost always means "compiled with a newer JDK than the one running it." The fix is to run with the newer runtime, or to compile for the older target.

### Compiling for an older target with --release

The `--release` option tells `javac` which Java version to target. It checks both the language features *and* the library APIs you use against that version:

```bash
javac --release 17 -d r17 Main.java
javap -v -cp r17 Main
```

The class in `r17` reports `major version: 61` and will run on Java 17 or newer. Throughout this academy we use `--release 21` so that the compiler and our intended runtime always agree.

> **Warning:** `UnsupportedClassVersionError` is a version mismatch, not a bug in your source code. Do not edit working code to "fix" it. Compare `javac --version` with `java --version` on the machine that fails.

## Portability: what it does and does not guarantee

Because bytecode is the same everywhere, a `.class` file compiled on Windows runs unchanged on Linux or macOS with a compatible JVM. This is the famous "write once, run anywhere" promise.

But the program still runs *on* a real operating system, and some things differ. This complete program reports a few of them:

```java
import java.io.File;

public class PlatformInfo {
    public static void main(String[] args) {
        System.out.println("Java version:   " + System.getProperty("java.version"));
        System.out.println("Java vendor:    " + System.getProperty("java.vendor"));
        System.out.println("Operating system: " + System.getProperty("os.name"));
        System.out.println("CPU architecture: " + System.getProperty("os.arch"));
        System.out.println("Name separator: " + File.separator);
        System.out.println("Path separator: " + File.pathSeparator);
        System.out.println("Line separator length: " + System.lineSeparator().length());
        System.out.println("Runtime feature version: " + Runtime.version().feature());
    }
}
```

Output on a Linux machine:

```text
Java version:   21.0.12
Java vendor:    Eclipse Adoptium
Operating system: Linux
CPU architecture: amd64
Name separator: /
Path separator: :
Line separator length: 1
Runtime feature version: 21
```

On Windows the same class file prints a Windows operating-system name, `\` as the name separator, `;` as the path separator, and a line-separator length of 2 (carriage return plus line feed). The *bytecode* is identical; the *environment* is not.

| Aspect | Windows | Linux and macOS |
|---|---|---|
| Folder separator in paths | `\` (Java also accepts `/`) | `/` |
| Separator between path list entries | `;` | `:` |
| Line ending in text files | `\r\n` | `\n` |
| File names case-sensitive? | Usually not | Linux yes; macOS usually not |
| Typical absolute path | `C:\Users\ana\data.txt` | `/home/ana/data.txt` |

Things that portability does **not** guarantee:

- That a hard-coded path like `C:\data\input.txt` exists on another machine.
- That the same fonts, locale, time zone, or default character encoding are configured.
- That file permissions allow your program to read or write where it tries to.
- That native libraries (code written in C for one platform) are available.

## Common mistakes

**Having only a runtime, not a JDK.** Running `javac` prints `command not found` (or "is not recognized" on Windows) while `java` works. You installed a runtime only, or the JDK's `bin` folder is not on `PATH`. Install a full JDK 21.

**Compiler and launcher from different versions.** `javac --version` says 21 but `java --version` says 17. Classes compile but fail with `UnsupportedClassVersionError`. Fix the `PATH` so both come from the same JDK.

**Passing the class file to the launcher.**

```bash
java Main.class
```

```text
Error: Could not find or load main class Main.class
Caused by: java.lang.ClassNotFoundException: Main.class
```

The launcher wants the class *name*, `Main`. It adds `.class` itself when searching.

**Thinking the JVM runs `.java` files directly.** Even `java Main.java` compiles the source first, in memory. A syntax error there is still a compile-time error.

**Assuming portability covers file paths.** A program that reads `C:\\reports\\today.txt` works on your laptop and fails on the Linux server. Keep paths out of code and pass them in as configuration or arguments.

## Best practices

- Pin one JDK version per project (here, 21) and verify it with both `javac --version` and `java --version`.
- Always compile with `--release 21` in this course so the target is explicit.
- When a class will not load, check versions before reading source code.
- Use `javap -c` when you are curious what the compiler did with an expression; it is a free, precise answer.
- Never hard-code operating-system-specific paths; later chapters show `java.nio.file.Path` for portable file handling.
- Remember that other languages, such as Kotlin and Scala, also compile to JVM bytecode. The JVM runs bytecode, not "Java" specifically.

## Summary

- The JDK contains development tools plus a runtime; the runtime contains the JVM plus standard libraries.
- `javac` compiles source into bytecode; `java` launches a JVM to run bytecode; `jar` packages class files; `javap` shows bytecode.
- Bytecode is a platform-independent instruction set for a stack-based virtual machine.
- The JVM loads, verifies, interprets, and JIT-compiles hot code into native machine code, and manages memory with a garbage collector.
- Class files carry a version (65 for Java 21). Newer runtimes run older classes; older runtimes reject newer ones with `UnsupportedClassVersionError`.
- Portability covers bytecode, not the surrounding environment: paths, separators, line endings, locale, and permissions still differ.

## Practice

**Warm-up**

1. Run `javac --version` and `java --version`. Write down both versions and the vendor name.
2. Compile `Main.java` and list the folder. Identify which file is source and which is bytecode.

**Core**

3. Run `javap -c` on the `Calculator` class. Find the `iadd` instruction and explain the three instructions around it.
4. Change `add` to subtract instead. Predict which instruction replaces `iadd`, then check with `javap`.
5. Compile the same file with `--release 17` into a separate folder and confirm the major version with `javap -v`.
6. Run `PlatformInfo` on your own machine and compare your output with the Linux output above. List every difference.

**Challenge**

7. Write a paragraph explaining to a non-programmer why the same `.class` file can run on Windows and Linux, but a program that hard-codes a Windows folder path fails on Linux.
8. If you have two JDK versions installed, compile with the newer one and run with the older one. Record the exact error and explain it using the version table.

## Check your understanding

1. Which JDK tool turns `.java` source into `.class` bytecode, and which tools only work with class files that already exist?
2. What is the difference between a JRE and a JDK?
3. What does the JIT compiler do, and why does it make programs faster over time?
4. A class compiled with Java 21 fails on a server with `UnsupportedClassVersionError`. What is the most likely cause?
5. Name three things that can still differ when the same bytecode runs on two operating systems.
6. Why does `javap -c` show a method you did not write?
