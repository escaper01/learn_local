# Chapter 1 assessment and deliberate practice

This chapter review pulls together everything from Chapter 1 before you attempt the assessment exercises. Read the recap, use the cheat sheet as a quick reference, run through the mistakes checklist, and then read the guidance for each lab. The guidance explains how to *reason* about each lab; it deliberately does not give you the fix.

## Lesson recap

**What a Java developer actually does.** Development is turning requests into programs whose behavior can be checked. Write concrete examples with expected results before code. A complete program needs a class and the exact entry point `public static void main(String[] args)`. `println` prints with a line break, `print` without, and `printf` fills placeholders such as `%s`, `%d`, `%.2f`, and `%n`. Comments come in three forms (`//`, `/* */`, `/** */`). Compiling proves the code follows the language rules; it does not prove the output is right.

**JDK, JVM, JRE, bytecode, and portability.** The JDK holds the development tools plus a runtime; the runtime holds the JVM plus the standard libraries. `javac` compiles source into bytecode; `java` starts a JVM to run it; `jar` packages classes; `javap` disassembles them. The JVM loads, verifies, interprets, and JIT-compiles bytecode. Class-file version 65 means Java 21; an older runtime rejects newer classes with `UnsupportedClassVersionError`. Bytecode is portable, but paths, separators, locale, and permissions are not.

**Compile, launch, classpath, and JAR files.** A package is part of the fully qualified class name and maps to folders. `javac -d out` writes classes under `out` in package folders. The classpath root is the folder that contains the package folders, and the launcher takes a dotted class name, never a file path. A JAR bundles classes and a manifest; `Main-Class` lets `java -jar` start it.

**IDE, terminal, JShell, and API documentation.** An IDE is a convenient view of the project, configured by an SDK, language level, source roots, and run configurations. The terminal is an independent, explicit reproduction. JShell answers small questions instantly. Javadoc pages describe parameters, return values, and exceptions; `substring(begin, end)` includes `begin` and excludes `end`.

**The edit-compile-test-debug loop.** Keep cycles small. Fix the first compiler error first. Read stack traces from the top frame down to `main`. Find logic errors by tracing variables and conditions against the requirement. Turn every fixed bug into a regression check.

**Operating systems, the shell, and the command line.** The OS runs processes with a working directory, environment variables, three standard streams, and an exit code. The shell splits a line into a command, options, and arguments, and finds bare command names by searching `PATH` in order. Relative paths depend on the working directory.

**Working with AI coding assistants.** Assistants suggest; the compiler and tests confirm. Verify generated code exactly like any other code, write precise prompts, review every command and diff a connected assistant produces, and never share secrets.

## Cheat sheet

### The toolchain

| Command | Purpose |
|---|---|
| `javac --version` / `java --version` | Confirm both report Java 21 |
| `javac --release 21 -d out src/academy/Main.java` | Compile into the `out` folder |
| `java -cp out academy.Main` | Launch by classpath root and fully qualified name |
| `java Main.java` | Compile in memory and run a single-file program |
| `jar --create --file app.jar --main-class academy.Main -C out .` | Package an executable JAR |
| `jar --list --file app.jar` | Inspect a JAR's contents |
| `java -jar app.jar` | Run the JAR's manifest entry point |
| `javap -c Main` | Show bytecode instructions |
| `jshell` | Evaluate snippets interactively |

### The entry point and printing

```java
public class Main {
    public static void main(String[] args) {
        System.out.print("no line break, ");
        System.out.println("then a line break");
        System.out.printf("%s has %d items costing %.2f%n", "Cart", 3, 7.5);
    }
}
```

### Failure stages

| Stage | Signal | First place to look |
|---|---|---|
| Shell | `command not found`, "is not recognized" | `PATH` and the installation |
| Compile | `File.java:LINE: error: ...` with a caret | The first error's line |
| Launch / class loading | `Could not find or load main class`, `Main method not found` | Classpath, package, class name, entry-point signature |
| Runtime | `Exception in thread "main"` and a stack trace | The top frame in your own code |
| Logic | Wrong output, no message | Trace table compared with expected examples |

### Useful String facts

| Expression | Result |
|---|---|
| `"Java".length()` | `4` |
| `"Java".charAt(0)` | `'J'` |
| `"Java".substring(2, 4)` | `"va"` |
| `"Java".indexOf('x')` | `-1` |
| `"Main.java".endsWith(".java")` | `true` |
| `"Main.JAVA".endsWith(".java")` | `false` (case-sensitive) |

## Common-mistakes checklist

Before you submit anything in this chapter, check:

- The file name matches the public class name exactly, including capital letters.
- Every statement ends with a semicolon and every brace is matched.
- Text uses double quotes; single quotes hold exactly one character.
- The entry point is spelled exactly as the launcher requires, every word included.
- You fixed the first compiler error before reading the others.
- You launched with the classpath root and the fully qualified class name, not a file path.
- You recompiled after editing, so no stale class is running.
- You tested boundary cases, not only the example in the instructions.
- IDE and terminal agree on SDK, classpath, main class, and working directory.
- Any generated or copied code was read, compiled, and tested before acceptance.

## Guidance for the professional judgment question

The judgment question describes a program that behaves differently in two environments. Think back to lesson 4's table of run-configuration fields and lesson 3's launch rules. Ask yourself which inputs to a launch can differ between two environments even when the source code is identical, and which answer lists those inputs rather than things that cannot affect whether a class starts.

## Guidance for the function lab: classFile

The lab asks for a method that decides whether a file name has a particular, case-sensitive ending. Approach it like a professional:

1. **Write the contract in one sentence.** What must be true about the input for the answer to be `true`? Is the check about the *end* of the name, or anywhere inside it?
2. **Build a boundary table before writing code.** Include at least: an ordinary match, a different extension, an empty string, a name that is *only* the suffix, a name where the suffix appears but is not at the end, and a name with the suffix in different capitalization. Write the expected result for each.
3. **Find the right API.** Lesson 4 showed you how to read the `String` documentation. Look through the method summary for a method whose purpose matches your one-sentence contract, and read whether it is case-sensitive and what it does with an empty string.
4. **Keep the method pure.** It must return a value and must not print. Output would not be checked and could break the harness's comparison.
5. **Trace every row of your table** through your implementation by hand, then run the public test, and only then submit.

Be wary of approaches that search for the suffix anywhere, or that change the case of the input first. Your boundary table will tell you whether either of those matches the contract.

## Guidance for the debug lab: A launcher entry point

The program contains a single `print` statement that is already correct, yet the program does not produce its output. Reason in stages, as lesson 5 taught:

1. **Which stage fails?** Compile it first. Does `javac` report an error? If it compiles cleanly, the problem is not syntax.
2. **Launch it and read the launcher's message word for word.** The message names what the launcher was looking for and even prints the form it expects.
3. **Compare, token by token,** the declaration in the file with the form the message prints. Lesson 1 said to preserve the entry-point spelling exactly; find the difference.
4. **Make the smallest change** that resolves the difference. Do not add extra print statements, move the `print` elsewhere, or change the text: the expected output must match exactly, with no extra line break.
5. **Explain the fix in your own words:** why could the compiler accept the file while the launcher refused to start it? Your answer should mention what the compiler checks versus what the launcher requires.

## Deliberate practice plan

Complete these before moving on to Chapter 2:

1. From an empty folder, write, compile, and run a packaged two-class program from the terminal only, then package it as a JAR and run it from another folder.
2. Reproduce the same run in your IDE and write down every run-configuration field and its terminal equivalent.
3. Produce, on purpose, one error from each failure stage in the cheat sheet, and write a one-line diagnosis for each.
4. Trace a small loop on paper, then confirm your trace with a debugger.
5. Ask an AI assistant for a small method, then verify it with at least five test cases you wrote first. Record what you found.

## Self-check

1. Can you explain every stage between `Main.java` and a running JVM process without notes?
2. Given a class file's location and package, can you write the correct launch command on the first try?
3. Can you read a Javadoc method entry and predict its result, including edge cases?
4. Can you distinguish a shell error, a compile error, a class-loading error, a runtime exception, and a logic error from their symptoms alone?
5. Can you explain why a clean compile, a confident assistant, or an IDE's green button is not proof of correctness?
