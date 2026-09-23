# IDE, terminal, JShell, and API documentation

Professional developers move between several tools many times an hour. They write code in an IDE, confirm a build from the terminal, try a quick idea in JShell, and look up exact behavior in the official API documentation. Each tool answers a different kind of question. Beginners who rely on only one of them, usually the IDE's green Run button, get stuck the moment that tool hides something from them.

This lesson shows what each tool is good at, how they relate, and how to read the Java API documentation precisely enough to predict a method's result before you run it.

What you will learn:

- What an IDE does for you, and what it quietly decides on your behalf
- The settings to check in any IDE: SDK, language level, source roots, run configurations
- Why the terminal is your independent, reproducible check
- How to use JShell to explore expressions and APIs quickly
- How to read a Javadoc page: parameters, return value, exceptions
- How index ranges work in `String` methods such as `substring`, `charAt`, and `indexOf`

## What an IDE actually is

An **Integrated Development Environment** combines an editor with the JDK tools and many helpers. Popular choices for Java include IntelliJ IDEA, Eclipse, Visual Studio Code with Java extensions, and Apache NetBeans. They differ in menus and shortcuts, but they all offer the same core features:

| Feature | What it does | Why it matters |
|---|---|---|
| Syntax highlighting | Colors keywords, strings, and comments | You spot an unclosed string instantly |
| Inline errors | Runs the compiler as you type and underlines problems | You fix errors seconds after making them |
| Code completion | Suggests methods and names as you type | Faster typing, fewer spelling mistakes |
| Navigation | Jumps to a declaration, or lists every caller of a method | You understand code before changing it |
| Refactoring | Renames or moves code and updates every reference | Safe, project-wide changes |
| Formatter | Applies consistent indentation and spacing | Readable, reviewable code |
| Run configurations | Stores how to launch the program | One-click runs |
| Debugger | Pauses the program and shows its variables | Lesson 5 covers this in depth |
| Build tool integration | Imports Maven or Gradle projects | Dependencies are managed for you |

Completion and inline errors are wonderful, but remember what they are: the IDE is running the same compiler checks you learned about in lesson 1. A clean editor with no red underlines means "compiles," not "correct."

## Settings to check in any IDE

When you create or open a project, find these settings. Their exact location varies by IDE, usually under project structure or project settings.

1. **Project SDK / JDK**: which installed JDK the IDE uses to compile and run. Set it to Java 21.
2. **Language level**: which Java version's syntax is allowed. Set it to 21.
3. **Source root**: which folder holds your source packages (for example `src`). Files outside it may not be compiled.
4. **Output folder**: where compiled classes go.

Then open the **run configuration** for your program and read every field:

| Field | Meaning | Terminal equivalent |
|---|---|---|
| Main class | Fully qualified entry point | `academy.Main` |
| Program arguments | Values passed into `args` | Words after the class name |
| VM options | Options for the JVM | Options before the class name, such as `-ea` |
| Working directory | Folder used to resolve relative file paths | The folder your terminal is in |
| Classpath / module | Where classes are loaded from | `-cp out` |
| JRE / SDK | Which Java runs the program | The `java` found on your `PATH` |

A run configuration is just a saved command line. If you can read it, you can reproduce it in a terminal, and vice versa.

## Why you still need the terminal

The IDE can use a different JDK from your terminal, reuse stale compiled classes, or set a working directory you did not expect. A terminal command is explicit: every input is visible in one line.

When a program works in the IDE but fails from the terminal (or the other way round), compare these four things first: the SDK version, the classpath, the main class name, and the working directory. Almost every such mismatch is one of them. Build servers and production machines have no IDE at all, so the terminal command is what really matters in the end.

> **Tip:** Most IDEs include a built-in terminal panel. Use it to run `javac` and `java` next to your editor, so you practice both without switching windows.

### Working productively in the editor

A few habits separate efficient developers from frustrated ones, whatever IDE they use:

- Learn the shortcut for "go to declaration" and use it instead of scrolling to find where something is defined.
- Use the rename refactoring rather than find-and-replace; it understands Java, so it will not rename an unrelated word in a comment or string.
- Reformat the file before committing so that reviews show real changes, not whitespace.
- Read the quick-fix suggestion before accepting it. Sometimes "create method printn" is offered when the real fix is correcting a typo.

## JShell: a Java playground

JShell, included in every JDK since Java 9, is a **REPL** (read-evaluate-print loop). You type an expression or declaration, and it shows the result immediately, without a class, a `main` method, or a compile step. It is perfect for answering small questions like "what does this method return?"

Start it by typing `jshell` in a terminal. Here is a real session (your prompt looks the same; the results were produced by JShell 21):

```text
|  Welcome to JShell -- Version 21.0.12
|  For an introduction type: /help intro

jshell> 7 / 2
$1 ==> 3

jshell> 7 / 2.0
$2 ==> 3.5

jshell> "Java".substring(1)
$3 ==> "ava"

jshell> String word = "Academy"
word ==> "Academy"

jshell> word.length()
$5 ==> 7

jshell> word.substring(0, 3)
$6 ==> "Aca"

jshell> Math.max(4, 9)
$7 ==> 9

jshell> int x = "hello"
|  Error:
|  incompatible types: java.lang.String cannot be converted to int
|  int x = "hello";
|          ^-----^

jshell> /vars
|    int $1 = 3
|    double $2 = 3.5
|    String $3 = "ava"
|    String word = "Academy"
|    int $5 = 7
|    String $6 = "Aca"
|    int $7 = 9

jshell> /exit
|  Goodbye
```

Observations:

- Every expression's result is saved in a scratch variable such as `$1`, which you can reuse.
- Semicolons are optional for single statements.
- Type errors are reported immediately, with a caret under the problem, exactly like `javac`.
- `7 / 2` is `3` while `7 / 2.0` is `3.5`. That difference is a Chapter 2 topic, and JShell is how you would investigate it.

Useful JShell commands:

| Command | Effect |
|---|---|
| `/vars` | List variables you have declared |
| `/methods` | List methods you have declared |
| `/imports` | Show active imports |
| `/list` | Show everything you have typed |
| `/help` | Show help |
| `/exit` | Leave JShell |

> **Note:** A line that works in JShell is a *snippet*, not a program. To turn it into a runnable file you still need a class and a `main` method. In this academy, code labelled "fragment" belongs inside a method; code labelled "complete program" can be saved and run as-is.

## Reading API documentation

The Java standard library has thousands of classes. Nobody memorizes them. Professionals read the **API documentation** (generated by the `javadoc` tool from the `/** */` comments you met in lesson 1). Search for "Java 21 API String" in a browser, or use your IDE's quick-documentation popup, and make sure the page says version 21.

Every class page follows the same structure:

1. **Module and package**: `String` lives in module `java.base`, package `java.lang`. Classes in `java.lang` are available without an import.
2. **Class description**: what the class represents and important rules (for example, Strings cannot be changed after creation).
3. **Method summary**: a table listing every method with its return type and a one-line description.
4. **Method details**: the full contract for each method.

A method's detail section tells you:

- **Parameters**: the name and meaning of each input.
- **Returns**: what the method gives back.
- **Throws**: which exceptions occur, and under what conditions.

This is a **contract**. If you call the method with inputs that satisfy it, you get the promised result. If you violate it, the documented exception tells you what happened.

### Indexes and half-open ranges

Many `String` methods use **indexes**: positions counted from 0. For the text `"Java"`:

| Index | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Character | J | a | v | a |

The length is 4, so valid character indexes run from 0 to 3.

The two-argument `substring(beginIndex, endIndex)` method is documented as returning the characters starting at `beginIndex` and extending to the character at `endIndex - 1`. In other words, the begin index is **inclusive** and the end index is **exclusive**. Mathematicians call this a half-open range, written `[begin, end)`.

A helpful picture is to number the *gaps between* characters rather than the characters themselves:

```text
 | J | a | v | a |
 0   1   2   3   4
```

`substring(b, e)` cuts at gap `b` and gap `e`, and returns what lies between. Three consequences follow directly, and they are why Java uses this convention everywhere:

- The length of the result is always `end - begin`.
- `substring(0, s.length())` is the whole string.
- `substring(i, i)` is an empty string, not an error.

This complete program exercises several `String` methods:

```java
public class StringApiDemo {
    public static void main(String[] args) {
        String word = "Java";

        System.out.println("length()        = " + word.length());
        System.out.println("charAt(0)       = " + word.charAt(0));
        System.out.println("charAt(3)       = " + word.charAt(3));
        System.out.println("substring(1)    = " + word.substring(1));
        System.out.println("substring(0, 2) = " + word.substring(0, 2));
        System.out.println("substring(2, 4) = " + word.substring(2, 4));
        System.out.println("substring(2, 2) = [" + word.substring(2, 2) + "]");
        System.out.println("indexOf('v')    = " + word.indexOf('v'));
        System.out.println("indexOf('x')    = " + word.indexOf('x'));
        System.out.println("toUpperCase()   = " + word.toUpperCase());
        System.out.println("original still  = " + word);
    }
}
```

Output:

```text
length()        = 4
charAt(0)       = J
charAt(3)       = a
substring(1)    = ava
substring(0, 2) = Ja
substring(2, 4) = va
substring(2, 2) = []
indexOf('v')    = 2
indexOf('x')    = -1
toUpperCase()   = JAVA
original still  = Java
```

Notes on each result:

- `substring(1)` (one argument) runs from index 1 to the end.
- `substring(0, 2)` has length 2 - 0 = 2.
- `substring(2, 4)` uses `4`, which equals the length. That is legal as an *end* index because the end is exclusive.
- `indexOf` returns `-1` when the character is absent. The documentation states this; guessing would not tell you.
- `toUpperCase()` returns a **new** String. The original is unchanged because Strings are immutable.

### Putting the API to work

This complete program splits a file name into its parts using only documented methods:

```java
public class FileNameParts {
    public static void main(String[] args) {
        String fileName = "Receipt.java";
        int dot = fileName.indexOf('.');

        String baseName = fileName.substring(0, dot);
        String extension = fileName.substring(dot + 1);

        System.out.println("File:      " + fileName);
        System.out.println("Dot index: " + dot);
        System.out.println("Base name: " + baseName + " (" + baseName.length() + " chars)");
        System.out.println("Extension: " + extension);
        System.out.println("Ends with .java? " + fileName.endsWith(".java"));
        System.out.println("Ends with .JAVA? " + fileName.endsWith(".JAVA"));
    }
}
```

Output:

```text
File:      Receipt.java
Dot index: 7
Base name: Receipt (7 chars)
Extension: java
Ends with .java? true
Ends with .JAVA? false
```

`substring(0, dot)` stops *before* the dot because the end index is excluded; that exclusion is exactly what you want here. `endsWith` checks a suffix and, like almost all `String` comparisons, is case-sensitive.

### When you break the contract

The documentation for `substring` says it throws `IndexOutOfBoundsException` if the begin index is negative, if the end index is larger than the length, or if begin is larger than end. This complete program breaks the contract on purpose:

```java
public class BadIndex {
    public static void main(String[] args) {
        String word = "Java";
        System.out.println(word.substring(1, 5));
    }
}
```

Output (stack trace shortened):

```text
Exception in thread "main" java.lang.StringIndexOutOfBoundsException: Range [1, 5) out of bounds for length 4
	at java.base/java.lang.String.checkBoundsBeginEnd(String.java:4855)
	at java.base/java.lang.String.substring(String.java:2823)
	at BadIndex.main(BadIndex.java:4)
```

Notice the message itself uses the half-open notation `[1, 5)`. `StringIndexOutOfBoundsException` is a more specific kind of the documented `IndexOutOfBoundsException`. The last line points to your code: `BadIndex.java`, line 4.

### Other classes worth browsing

`Math` holds common numeric functions. Reading its documentation reveals details you would never guess:

```java
public class MathApiDemo {
    public static void main(String[] args) {
        System.out.println("Math.max(7, 12)   = " + Math.max(7, 12));
        System.out.println("Math.min(7, 12)   = " + Math.min(7, 12));
        System.out.println("Math.abs(-5)      = " + Math.abs(-5));
        System.out.println("Math.pow(2, 10)   = " + Math.pow(2, 10));
        System.out.println("Math.sqrt(81)     = " + Math.sqrt(81));
        System.out.println("Math.round(2.5)   = " + Math.round(2.5));
        System.out.println("Math.round(-2.5)  = " + Math.round(-2.5));
        System.out.println("Integer.parseInt(\"42\") + 1 = " + (Integer.parseInt("42") + 1));
    }
}
```

Output:

```text
Math.max(7, 12)   = 12
Math.min(7, 12)   = 7
Math.abs(-5)      = 5
Math.pow(2, 10)   = 1024.0
Math.sqrt(81)     = 9.0
Math.round(2.5)   = 3
Math.round(-2.5)  = -2
Integer.parseInt("42") + 1 = 43
```

Two surprises the documentation explains: `pow` and `sqrt` return `double` values (hence `1024.0` and `9.0`), and `round` rounds halves toward positive infinity, so `-2.5` becomes `-2`, not `-3`. Reading the contract beats assuming.

## Step by step: answering a question with the tools

Suppose you are unsure what `"Academy".substring(3, 5)` returns.

1. **Documentation**: find `substring(int, int)` on the `String` page. Note begin inclusive, end exclusive, and the exceptions.
2. **Prediction**: indexes 3 and 4 hold `d` and `e`; index 5 is excluded. Predict `"de"`, length 5 - 3 = 2.
3. **JShell**: type the expression and compare with your prediction.
4. **Program**: use it in real code, and add an example with an edge case (such as an end index equal to the length) to your notes.

Prediction before execution is the key step. If you only run code and read the result, you learn what happened once; if you predict first, you learn whether your mental model is right.

## Common mistakes

**Assuming the end index is included.** Asking `substring(0, 3)` for four characters. Remember: the result length is `end - begin`.

**Using `length()` as a character index.** `word.charAt(word.length())` throws `StringIndexOutOfBoundsException`. The last character is at `length() - 1`.

**Expecting a String method to change the original.**

```java
String word = "Java";
word.toUpperCase();
System.out.println(word);
```

This fragment prints `Java`. The upper-case copy was created and thrown away. Fix: `word = word.toUpperCase();`.

**Reading documentation for the wrong version.** Methods are added over time. A method from a newer release will not compile against Java 21. Check the version on the page.

**Trusting the Run button blindly.** The IDE ran old classes, or a different JDK, or a different working directory. Reproduce from the terminal.

**Pasting JShell snippets into a file without a class.** A file containing only `System.out.println(7 / 2);` does not compile as a program. Wrap it in a class with `main`.

## Best practices

- Configure every project with an explicit SDK and language level of 21.
- Know how to reproduce every IDE run from the terminal, and do it regularly.
- Use JShell for small experiments, then move the confirmed code into a proper file.
- Read the Returns and Throws sections before using an unfamiliar method.
- Write down one edge case for every API method you learn: empty input, end of range, missing value.
- Prefer the official API documentation over memory, blog posts, or generated answers when they disagree.

## Summary

- An IDE combines an editor, compiler checks, navigation, refactoring, run configurations, and a debugger. It does not prove correctness.
- Check the SDK, language level, source root, and run configuration fields; a run configuration is just a saved command line.
- When IDE and terminal disagree, compare SDK, classpath, main class, and working directory.
- JShell evaluates snippets instantly and is ideal for testing predictions.
- Javadoc pages describe each method's parameters, return value, and exceptions as a contract.
- String indexes start at 0. In `substring(begin, end)` the begin index is included and the end index is excluded, so the result length is `end - begin`.
- String methods return new Strings; the original never changes.

## Practice

**Warm-up**

1. In your IDE, find the project SDK, language level, and the run configuration for a program you wrote. Write down each field.
2. Start JShell and evaluate `10 / 3`, `10 / 3.0`, and `"Academy".length()`.

**Core**

3. Predict, then check in JShell: `"Developer".substring(2, 5)`, `"Developer".substring(4)`, `"Developer".charAt(0)`, and `"Developer".indexOf('e')`.
4. Change your run configuration's working directory and program arguments. Then write the equivalent terminal command.
5. Using only the API documentation, find a `String` method that tests whether text starts with a given prefix. Write two calls that return `true` and one that returns `false`.

**Challenge**

6. Write a program that takes a full name such as `"Ada Lovelace"` and prints the first name, the last name, and the initials, using `indexOf`, `substring`, and `charAt`. Test it with a single-word name too and describe what happens.
7. Find `String.repeat` and `String.strip` in the documentation. For each, record the parameters, the return value, any exceptions, and one edge case, then verify each claim in JShell.

## Check your understanding

1. Name four settings or run-configuration fields that can make an IDE run behave differently from a terminal run.
2. What is the length of the String returned by `substring(b, e)`, and why?
3. For a String of length 4, why is 4 legal as an end index but not as a `charAt` index?
4. Where in a Javadoc page do you find which exception a method can throw?
5. Why does calling `toUpperCase()` without using its result leave the variable unchanged?
6. What is the difference between a JShell snippet and a complete program?
