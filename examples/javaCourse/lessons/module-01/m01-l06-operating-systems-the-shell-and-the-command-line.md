# Operating systems, the shell, and the command line

Java runs on top of an operating system, and every Java developer works through a command line far more than beginners expect. Build tools, version control, servers, containers, and continuous-integration pipelines are all driven by commands. When `java` is "not found," when a file cannot be opened, or when a server script reports a failure code, the cause lives in the operating system and the shell, not in your Java source. Knowing that layer lets you diagnose problems that would otherwise look like magic.

What you will learn:

- What the operating system does for a running Java program
- What a process is, and what standard input, output, error, and exit codes are
- What a shell is and how it turns a line of text into a running program
- The anatomy of a command: command, options, arguments, and quoting
- Absolute and relative paths, and the current working directory
- Essential commands on Windows PowerShell and on Linux or macOS shells
- Environment variables, especially `PATH` and `JAVA_HOME`, and how command lookup works
- Redirection and pipes

## What the operating system does

The **operating system** (OS), such as Windows, Linux, or macOS, manages the computer's hardware and shares it among programs. Its core, the **kernel**, provides a few essential services:

| Service | What it means for your Java program |
|---|---|
| Processes | Each running program gets its own isolated process with its own memory |
| Memory | The JVM asks the OS for memory to hold its heap and stacks |
| Scheduling | The OS decides which threads run on which CPU core, switching many times per second |
| Filesystem | Files and folders are opened, read, and written through the OS |
| Permissions | The OS decides whether your user may read, write, or execute a file |
| Devices and network | Screens, keyboards, disks, and network cards are reached through the OS |

When you type `java Main`, the OS creates a new process for the launcher, gives it memory, starts its threads, and hands it three open channels (described below). The JVM then asks the OS for everything else it needs. None of this is Java-specific: a Python or C program asks for the same things.

## Processes, streams, and exit codes

A **process** is a running instance of a program. Each process has an ID (the PID), a current working directory, a set of environment variables, and three standard **streams**:

- **Standard input (stdin)**: where the program reads input, by default the keyboard. Java calls it `System.in`.
- **Standard output (stdout)**: where normal output goes, by default the terminal. Java calls it `System.out`.
- **Standard error (stderr)**: a separate channel for errors and warnings, also shown in the terminal by default. Java calls it `System.err`.

When a process ends, it returns an **exit code** to whoever started it. By convention `0` means success and any other number means some kind of failure. Java returns 0 when `main` finishes normally, 1 when an uncaught exception ends the program, and any value you choose with `System.exit(code)`.

This complete program writes to both output streams and ends with exit code 3:

```java
public class Streams {
    public static void main(String[] args) {
        System.out.println("Report line 1 (standard output)");
        System.err.println("Warning: input file was empty (standard error)");
        System.out.println("Report line 2 (standard output)");
        System.exit(3);
    }
}
```

Run in a Linux terminal (bash), followed by `echo "exit code: $?"`:

```text
Report line 1 (standard output)
Report line 2 (standard output)
Warning: input file was empty (standard error)
exit code: 3
```

Because stdout and stderr are separate channels, the order in which their lines appear on screen can vary. In this run the warning appeared last. Do not rely on the interleaving.

How to read the last exit code in each shell:

| Shell | Last exit code |
|---|---|
| bash or zsh | `echo $?` |
| PowerShell | `$LASTEXITCODE` |
| cmd.exe | `echo %ERRORLEVEL%` |

Build tools and servers read exit codes to decide whether a step succeeded. A test runner that exits with a non-zero code stops a deployment. That is why exit codes matter even if you never look at them yourself.

## The shell is a program, not the operating system

A terminal window runs a **shell**: an ordinary program that reads a line of text, splits it into words, finds the program to run, and starts it as a new process. Common shells:

| Platform | Common shells |
|---|---|
| Windows | PowerShell (recommended), cmd.exe |
| macOS | zsh (the default), bash |
| Linux | bash, zsh, and others |

The commands differ between shells, but the model is identical everywhere. Learning that model is more valuable than memorizing commands.

### Anatomy of a command

```text
javac --release 21 -d out src/Main.java
```

| Part | Example | Role |
|---|---|---|
| Command | `javac` | The program to run |
| Option (flag) | `--release 21`, `-d out` | Changes the program's behavior; some take a value |
| Positional argument | `src/Main.java` | What the program should act on |

The same shape appears in shell commands:

```text
Linux/macOS:  ls -la ./src
Windows:      Get-ChildItem -Force .\src
```

`ls` or `Get-ChildItem` is the command, `-la` or `-Force` is an option, and `./src` or `.\src` is the positional argument.

### Quoting

The shell splits the line on spaces. To pass a value that contains a space as a *single* argument, quote it. This complete program shows exactly what arrives in `args`:

```java
public class EchoArgs {
    public static void main(String[] args) {
        System.out.println("Received " + args.length + " argument(s):");
        for (String arg : args) {
            System.out.println("[" + arg + "]");
        }
    }
}
```

Running `java EchoArgs Main.java "My Documents" two words` prints:

```text
Received 4 argument(s):
[Main.java]
[My Documents]
[two]
[words]
```

`"My Documents"` arrived as one argument without the quotes, while `two words` arrived as two. The shell did the splitting and removed the quotes before Java ever saw them. (The `for` loop repeats once per argument; loops are covered in Chapter 3.)

## Paths and the working directory

A **path** names a file or folder.

- An **absolute path** starts from the root of the filesystem: `C:\Users\ana\project\Main.java` on Windows, or `/home/ana/project/Main.java` on Linux.
- A **relative path** is interpreted starting from the process's **current working directory**: `src/Main.java` means "the `src` folder inside wherever I am now."

Two special names work in relative paths on every platform: `.` means the current folder and `..` means the parent folder.

Every process inherits its working directory from the shell that started it. This complete program reports it, along with other facts about its environment:

```java
public class WhereAmI {
    public static void main(String[] args) {
        System.out.println("Working directory: " + System.getProperty("user.dir"));
        System.out.println("Home directory:    " + System.getProperty("user.home"));
        System.out.println("Operating system:  " + System.getProperty("os.name"));
        System.out.println("JAVA_HOME:         " + System.getenv("JAVA_HOME"));
        System.out.println("NOT_SET_ANYWHERE:  " + System.getenv("NOT_SET_ANYWHERE"));

        String path = System.getenv("PATH");
        System.out.println("PATH entries:");
        for (String entry : path.split(java.io.File.pathSeparator)) {
            System.out.println("  " + entry);
        }
    }
}
```

Output when run from `/tmp/proj` on a Linux machine:

```text
Working directory: /tmp/proj
Home directory:    /root
Operating system:  Linux
JAVA_HOME:         /opt/java/openjdk
NOT_SET_ANYWHERE:  null
PATH entries:
  /opt/java/openjdk/bin
  /usr/local/sbin
  /usr/local/bin
  /usr/sbin
  /usr/bin
  /sbin
  /bin
```

On your machine every line will be different, which is exactly the point: the same program sees a different environment depending on where and how it is started. `System.getenv` returns `null` for a variable that does not exist.

Now the consequence. Compiled classes were in `/tmp/proj/out`. Running the same launch command from the parent folder `/tmp` fails:

```text
$ cd /tmp
$ java -cp out WhereAmI
Error: Could not find or load main class WhereAmI
Caused by: java.lang.ClassNotFoundException: WhereAmI
```

`out` is a relative path, so from `/tmp` it means `/tmp/out`, which does not exist. The class files are fine; the working directory changed.

### Path differences between systems

| Aspect | Windows | Linux and macOS |
|---|---|---|
| Root | Drive letters: `C:\` | A single root: `/` |
| Separator | `\` (most tools also accept `/`) | `/` |
| Home folder | `C:\Users\name` | `/home/name` (Linux), `/Users/name` (macOS) |
| Case-sensitive names | Usually not | Linux: yes. macOS: usually not |
| Executable files | Identified by extension (`.exe`, `.bat`) | Identified by an execute permission |

On Linux, `Main.java` and `main.java` are two different files. A program that works on Windows can fail on a Linux server because of a single wrong capital letter.

## Essential commands

| Task | PowerShell (Windows) | bash / zsh (Linux, macOS) |
|---|---|---|
| Show current folder | `Get-Location` (alias `pwd`) | `pwd` |
| List files | `Get-ChildItem` (alias `ls`, `dir`) | `ls -la` |
| Change folder | `Set-Location src` (alias `cd`) | `cd src` |
| Go to parent folder | `cd ..` | `cd ..` |
| Create folder | `New-Item -ItemType Directory out` (or `mkdir out`) | `mkdir -p out` |
| Show file contents | `Get-Content Main.java` (alias `cat`) | `cat Main.java` |
| Copy | `Copy-Item a.txt b.txt` | `cp a.txt b.txt` |
| Move or rename | `Move-Item a.txt b.txt` | `mv a.txt b.txt` |
| Delete a file | `Remove-Item a.txt` | `rm a.txt` |
| Find where a command lives | `Get-Command java` | `which java` or `command -v java` |
| Show an environment variable | `$env:JAVA_HOME` | `echo $JAVA_HOME` |
| Clear the screen | `Clear-Host` (alias `cls`) | `clear` |

> **Warning:** Deleting from the command line usually bypasses the recycle bin. A recursive delete (`rm -r`, `Remove-Item -Recurse`) of the wrong path can destroy a project in an instant. Run `pwd` and list the target first, and never delete a path you have not read carefully.

Useful shell skills: press **Tab** to auto-complete file and folder names, press the **Up arrow** to recall previous commands, and press **Ctrl+C** to stop a running program.

## Environment variables and PATH

An **environment variable** is a named text value that every process inherits from its parent. Two matter immediately for Java:

- `JAVA_HOME`: the folder where a JDK is installed. Many build tools read it to find Java.
- `PATH`: a list of folders the shell searches when you type a bare command name.

### How the shell finds a command

When you type `java` with no folder in front of it, the shell does not search your whole disk. Step by step:

1. It checks whether `java` is a built-in command or alias of the shell itself.
2. It reads the `PATH` variable and splits it into a list of folders (on `;` in Windows, on `:` elsewhere).
3. It looks in each folder, in order, for an executable named `java` (on Windows, `java.exe` and other executable extensions).
4. The **first** match wins, and the shell starts that program.
5. If no folder contains a match, the shell reports that the command was not found.

Here is what that failure looks like in each shell, reproduced by running with a `PATH` that did not include the JDK's `bin` folder, even though the `java` program was present on disk:

```text
bash:        bash: line 1: java: command not found
PowerShell:  The term 'java' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.
cmd.exe:     'java' is not recognized as an internal or external command,
             operable program or batch file.
```

In bash, the exit code for "command not found" was 127.

This failure happens *before* Java starts. Your source, your class files, and your classpath are not involved at all, so do not look there. Diagnose it by checking the variable and the installation:

```powershell
$env:Path -split ';'
Get-Command java
```

```bash
echo "$PATH" | tr ':' '\n'
which java
```

The "first match wins" rule also explains the mysterious "wrong version" problem from lesson 2: if two JDKs are installed, whichever `bin` folder appears earlier in `PATH` supplies `java`.

### Setting PATH for the current session

These commands affect only the current terminal window and disappear when you close it. The folder names are examples; use the real location of your JDK.

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java --version
```

```bash
export JAVA_HOME="$HOME/jdks/jdk-21"
export PATH="$JAVA_HOME/bin:$PATH"
java --version
```

Making the change permanent is done through the Windows environment-variable settings, or by adding the `export` lines to your shell's startup file (such as `~/.zshrc` or `~/.bashrc`). JDK installers and version managers often do this for you. After a permanent change, open a **new** terminal: existing windows keep the environment they started with.

## Redirection and pipes

The shell can connect streams to files and to other programs:

| Syntax | Meaning |
|---|---|
| `command > file.txt` | Send stdout to a file (replacing it) |
| `command >> file.txt` | Append stdout to a file |
| `command 2> errors.txt` | Send stderr to a file |
| `command < input.txt` | Read stdin from a file |

A **pipe**, written as a vertical bar between two commands, sends the stdout of the first command into the stdin of the second.

Running the `Streams` program with both outputs redirected, in bash:

```bash
java Streams > report.txt 2> errors.txt
echo "exit code: $?"
cat report.txt
cat errors.txt
```

```text
exit code: 3
Report line 1 (standard output)
Report line 2 (standard output)
Warning: input file was empty (standard error)
```

Nothing appeared on screen while it ran; each stream went to its own file. This is why programs should write errors to `System.err`: users and scripts can separate them from real output. A pipe works the same way: `java Streams 2>/dev/null | grep "line 2"` hid the errors and filtered the output down to `Report line 2 (standard output)`.

## Common mistakes

**Running commands from the wrong folder.** Relative paths in `javac src/Main.java` or `-cp out` depend on the working directory. Check with `pwd` or `Get-Location` first.

**Editing PATH and reusing an old terminal.** The old window still has the old environment. Open a new one.

**Adding the JDK folder instead of its `bin` folder to PATH.** The executables live in `bin`. `JAVA_HOME` points at the JDK folder; `PATH` needs `JAVA_HOME/bin`.

**Unquoted paths with spaces.** `cd C:\Program Files\Java` passes two arguments. Write `cd "C:\Program Files\Java"`.

**Wrong capitalization on Linux.** `javac main.java` fails when the file is `Main.java`:

```text
error: file not found: main.java
```

**Using Windows syntax in bash or the reverse.** `$env:Path` is PowerShell; `$PATH` is bash. `;` separates PATH entries on Windows and ends a command in bash.

## Best practices

- Learn one shell well (PowerShell on Windows, zsh or bash elsewhere) and know the basic equivalents in the other.
- Before running a command that changes or deletes files, print the working directory and list the target.
- Verify tool locations with `Get-Command` or `which` whenever versions surprise you.
- Keep file names free of spaces and use consistent capitalization, so projects move between systems cleanly.
- Write diagnostic messages to `System.err` and meaningful exit codes with `System.exit` in command-line tools.
- Prefer passing paths as arguments or configuration over hard-coding them.

## Summary

- The OS manages processes, memory, scheduling, files, and permissions; the JVM asks it for all of them.
- Every process has a working directory, environment variables, stdin, stdout, stderr, and an exit code (0 means success).
- A shell reads a line, splits it into a command, options, and arguments (respecting quotes), finds the program, and starts it.
- Relative paths are resolved against the working directory, so the same command can fail from a different folder.
- The shell finds bare command names by searching the folders listed in `PATH`, in order; the first match wins. If the JDK's `bin` folder is missing from `PATH`, `java` is "not found" even when it exists on disk.
- Redirection (`>`, `2>`, `<`) and pipes (`|`) connect streams to files and to other programs.

## Practice

**Warm-up**

1. Open a terminal, print your working directory, list its files, and change into a project folder and back out with `cd ..`.
2. Print your `PATH` in your shell and find the folder that contains `java`. Confirm it with `Get-Command java` or `which java`.

**Core**

3. Compile and run a program from its own folder, then run the same launch command from the parent folder. Predict and then explain the failure.
4. Run `EchoArgs` with at least four different quoting patterns and record how many arguments arrive each time.
5. Run `Streams`, then print the exit code in your shell. Redirect stdout and stderr into two separate files and inspect both.

**Challenge**

6. In a new terminal, temporarily remove the JDK's `bin` folder from `PATH` (only for that session), reproduce the "not found" message, then restore it without closing the window. Write down each command you used.
7. Write a program that prints a message to stdout for valid arguments and an error to stderr with exit code 2 when no arguments are given. Demonstrate both cases from the shell, showing the exit code each time.

## Check your understanding

1. What is the difference between the operating system and the shell?
2. In `javac --release 21 -d out src/Main.java`, which parts are options, which values belong to options, and which part is the positional argument?
3. Why can the same `java -cp out Main` command work in one folder and fail in another?
4. A fresh terminal says `java` is not recognized, yet `java.exe` exists on disk. Which environment variable does the shell search, and what would you check?
5. What is the difference between stdout and stderr, and why would a script care?
6. What exit code does a Java program return when an uncaught exception ends it, and how do you read it in your shell?
