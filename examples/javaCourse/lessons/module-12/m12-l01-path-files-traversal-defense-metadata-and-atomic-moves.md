# Path, Files, traversal defense, metadata, and atomic moves

Every program that reads a configuration file, writes a log, or accepts a user-uploaded file is talking to the filesystem — and the filesystem is exactly the kind of untrusted boundary Chapter 11 taught you to validate carefully, because a filename is just another piece of external input, and a cleverly crafted one can trick careless code into reading or writing files far outside where it was ever supposed to look. This lesson covers the modern `java.nio.file` API (`Path` and `Files`), and then turns to the specific, well-documented security pattern of **path traversal**: what a naive defense misses, and what actually closes the gap.

What you will learn:

- `Path`: representing filesystem locations without touching the disk, and the difference between resolving and normalizing a path
- `Files`: the standard operations for reading, writing, and inspecting files and their metadata
- Path traversal: how `..` segments let untrusted input escape an intended directory, and how to reject it
- Why normalizing a path and checking `startsWith` is **not** sufficient by itself when symbolic links are involved
- Atomic moves: why writing to a temporary file and then moving it is safer than writing directly to the final destination

## Path: representing locations, not touching disk

A `Path` object represents a filesystem location — it does **not** by itself read, write, or even confirm that anything exists there. Constructing one is a pure, in-memory operation:

```java
import java.nio.file.Path;

public class PathBasics {
    public static void main(String[] args) {
        Path relative = Path.of("data", "reports", "2024.csv");
        Path absolute = Path.of("/work/data/reports/2024.csv");

        System.out.println("relative: " + relative + ", isAbsolute=" + relative.isAbsolute());
        System.out.println("absolute: " + absolute + ", isAbsolute=" + absolute.isAbsolute());
        System.out.println("fileName: " + absolute.getFileName());
        System.out.println("parent: " + absolute.getParent());
        System.out.println("nameCount: " + absolute.getNameCount());
        for (int i = 0; i < absolute.getNameCount(); i++) {
            System.out.println("  name(" + i + "): " + absolute.getName(i));
        }

        Path messy = Path.of("/work/./data/../data/reports/2024.csv");
        System.out.println("messy: " + messy);
        System.out.println("normalized: " + messy.normalize());

        Path resolved = Path.of("/work").resolve("data/reports");
        System.out.println("resolved: " + resolved);
    }
}
```

Output:

```text
relative: data/reports/2024.csv, isAbsolute=false
absolute: /work/data/reports/2024.csv, isAbsolute=true
fileName: 2024.csv
parent: /work/data/reports
nameCount: 4
  name(0): work
  name(1): data
  name(2): reports
  name(3): 2024.csv
messy: /work/./data/../data/reports/2024.csv
normalized: /work/data/reports/2024.csv
resolved: /work/data/reports
```

`Path.of` accepts either separate name segments or a single string; `resolve` joins a path onto a base (much like appending a relative URL to a base URL); `normalize` collapses `.` (current directory) and `..` (parent directory) segments **lexically** — purely by rewriting the text of the path, without checking the actual filesystem at all. That last detail matters enormously, and this lesson returns to it directly.

## Files: the standard operations

`java.nio.file.Files` is a collection of static methods for everything you actually do with a path: checking whether something exists, reading and writing content, and inspecting metadata such as size and modification time.

```java
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.List;

public class FilesBasics {
    public static void main(String[] args) throws Exception {
        Path dir = Path.of("/work/reports");
        Files.createDirectories(dir);
        Path file = dir.resolve("summary.txt");

        Files.writeString(file, "quarterly summary\nrevenue: 1000\n", StandardCharsets.UTF_8);
        System.out.println("exists: " + Files.exists(file));
        System.out.println("isRegularFile: " + Files.isRegularFile(file));
        System.out.println("isDirectory: " + Files.isDirectory(dir));
        System.out.println("size: " + Files.size(file) + " bytes");

        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        System.out.println("lines: " + lines);

        FileTime before = Files.getLastModifiedTime(file);
        Files.writeString(file, "quarterly summary\nrevenue: 1500\n", StandardCharsets.UTF_8);
        FileTime after = Files.getLastModifiedTime(file);
        System.out.println("modified time changed: " + !before.equals(after));

        Files.delete(file);
        System.out.println("exists after delete: " + Files.exists(file));
    }
}
```

Output:

```text
exists: true
isRegularFile: true
isDirectory: true
size: 32 bytes
lines: [quarterly summary, revenue: 1000]
modified time changed: false
exists after delete: false
```

`createDirectories` creates every missing directory in a path, including intermediate ones (equivalent to a recursive "make directory" operation); it does nothing if the directories already exist, unlike `createDirectory`, which throws if its immediate parent is missing. `writeString`/`readAllLines` are the modern, always-specify-the-charset replacement for older, ambiguous I/O idioms — always pass `StandardCharsets.UTF_8` explicitly (Chapter 4's encoding lesson explained exactly why relying on a platform default is unsafe). The modification-time check reports `false` here purely because the second write happened fast enough that many filesystems' timestamp resolution did not register a change within the same instant — a useful reminder that file timestamps are not a reliable audit trail at fine time granularity; use application-level tracking (a database `updated_at` column, for instance) when you need that precision.

## Path traversal: the vulnerability

**Path traversal** (sometimes called directory traversal) is what happens when untrusted input containing `..` segments is used to build a file path, letting an attacker "climb out" of an intended directory into somewhere they should never be able to reach — a genuine, well-documented, and still common real-world vulnerability class. The standard defense: resolve the untrusted name against a fixed root, normalize the result, and confirm it still starts with that root.

```java
import java.nio.file.Path;

public class TraversalCheck {
    static Path resolveInsideRoot(Path root, String requestedName) {
        Path candidate = root.resolve(requestedName).normalize();
        if (!candidate.startsWith(root)) {
            throw new SecurityException("path escapes allowed root: " + requestedName);
        }
        return candidate;
    }

    public static void main(String[] args) {
        Path root = Path.of("/work/uploads").normalize();

        Path safe = resolveInsideRoot(root, "photo.png");
        System.out.println("accepted: " + safe);

        Path nested = resolveInsideRoot(root, "albums/2024/photo.png");
        System.out.println("accepted: " + nested);

        try {
            resolveInsideRoot(root, "../../etc/passwd");
        } catch (SecurityException e) {
            System.out.println("rejected: " + e.getMessage());
        }

        try {
            resolveInsideRoot(root, "albums/../../../etc/shadow");
        } catch (SecurityException e) {
            System.out.println("rejected: " + e.getMessage());
        }
    }
}
```

Output:

```text
accepted: /work/uploads/photo.png
accepted: /work/uploads/albums/2024/photo.png
rejected: path escapes allowed root: ../../etc/passwd
rejected: path escapes allowed root: albums/../../../etc/shadow
```

`root.resolve(requestedName)` joins the untrusted name onto the trusted root; `.normalize()` then collapses any `..` segments *within that combined path*, exactly as `PathBasics` demonstrated; and `startsWith(root)` confirms the fully-collapsed result did not climb out past the root after all the `..` segments cancelled out. Both malicious attempts here are correctly rejected — the `..` segments, once normalized away, leave a path that no longer starts with `/work/uploads`, exactly as intended.

## Why this defense alone is not enough: symbolic links

Here is the chapter's concept-check question, made concrete, and it is a genuinely subtle gap: `normalize()` operates **purely on the text of the path** — it has no idea whether any component along the way is actually a symbolic link pointing somewhere else entirely on the real filesystem.

```java
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class SymlinkEscape {
    static Path resolveInsideRootLexicalOnly(Path root, String requestedName) {
        Path candidate = root.resolve(requestedName).normalize();
        if (!candidate.startsWith(root)) {
            throw new SecurityException("path escapes allowed root: " + requestedName);
        }
        return candidate;
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createDirectories(Path.of("/work/uploads"));
        Path secretDir = Files.createDirectories(Path.of("/work/secret"));
        Files.writeString(secretDir.resolve("passwords.txt"), "root:hunter2\n", StandardCharsets.UTF_8);

        Path link = root.resolve("innocent-looking-file.txt");
        Files.createSymbolicLink(link, secretDir.resolve("passwords.txt"));

        Path candidate = resolveInsideRootLexicalOnly(root, "innocent-looking-file.txt");
        System.out.println("lexical check accepted: " + candidate);

        Path realPath = candidate.toRealPath();
        System.out.println("real path after resolving the symlink: " + realPath);
        System.out.println("does the real path stay inside root? " + realPath.startsWith(root.toRealPath()));

        String leaked = Files.readString(candidate, StandardCharsets.UTF_8);
        System.out.println("content actually read through the \"safe\" path: " + leaked.trim());
    }
}
```

Output:

```text
lexical check accepted: /work/uploads/innocent-looking-file.txt
real path after resolving the symlink: /work/secret/passwords.txt
does the real path stay inside root? false
content actually read through the "safe" path: root:hunter2
```

The requested filename, `innocent-looking-file.txt`, has no `..` in it at all — it passes the lexical `startsWith` check completely legitimately, because *textually*, `/work/uploads/innocent-looking-file.txt` genuinely does start with `/work/uploads`. But that file is actually a **symbolic link** pointing to `/work/secret/passwords.txt`, entirely outside the intended root — and reading through the "safe" path reads the secret file's real content regardless. This is exactly the chapter's concept-check answer: **`normalize()` plus `startsWith()` alone does not handle symlink escapes**, because normalization never inspects the real filesystem, only the path's text. `Path.toRealPath()` resolves every symbolic link along the way and reveals where the path *actually* leads — the correct, complete defense checks the **real** path against the **real** root (`root.toRealPath()`), not the lexical one, and combines that with filesystem-level policy (refusing to follow symlinks at all, or restricting which targets they may point to) whenever untrusted names are involved. Treat any user-controlled filename as needing this full defense, not just the simpler lexical check, whenever the underlying filesystem might contain symbolic links you do not fully control.

## Atomic moves: avoid a half-written file

Writing directly to a file that other code might read concurrently risks that code seeing a partially-written, corrupt result. The standard fix: write to a temporary location first, then **move** the completed file into place — and specifically, move it **atomically**, so any observer sees either the old file or the fully-complete new one, never something in between.

```java
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

public class AtomicMove {
    public static void main(String[] args) throws Exception {
        Path dir = Files.createDirectories(Path.of("/work/atomic"));
        Path temp = dir.resolve("output.tmp");
        Path target = dir.resolve("output.json");

        Files.writeString(temp, "{\"status\":\"complete\"}", StandardCharsets.UTF_8);
        System.out.println("temp file written, target does not exist yet: " + Files.exists(target));

        Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        System.out.println("after atomic move: temp exists=" + Files.exists(temp) + ", target exists=" + Files.exists(target));
        System.out.println("target content: " + Files.readString(target, StandardCharsets.UTF_8));
    }
}
```

Output:

```text
temp file written, target does not exist yet: false
after atomic move: temp exists=false, target exists=true
target content: {"status":"complete"}
```

`StandardCopyOption.ATOMIC_MOVE` asks the filesystem to perform the rename as a single, indivisible operation — on most filesystems, a rename within the same volume genuinely is atomic at the operating-system level, meaning no process can ever observe a half-renamed state. Combined with writing to a temporary file first (so any failure *during* the write leaves only an incomplete, clearly-named `.tmp` file, never a corrupted version of the real target), this is the standard pattern for safely publishing a file that other processes might read concurrently: write somewhere private, then atomically swap it into its public, final name only once it is completely ready.

## What happens under the hood

`Path` and `Files` are deliberately separated in the `java.nio.file` API for exactly the same reason Chapter 11 emphasized separating validation layers: a `Path` is pure data — a location description you can construct, join, and normalize entirely in memory, with zero filesystem interaction and zero possibility of failure — while every `Files` method is where actual I/O, and therefore actual checked exceptions and actual real-world race conditions, come into play. This separation is precisely why the traversal defense in this lesson works purely on `Path` objects (fast, safe, in-memory string manipulation) right up until the final `toRealPath()` step, which is the one point where the defense must genuinely consult the real filesystem to catch what pure text manipulation cannot.

## Common mistakes

**1. Trusting `normalize()` plus `startsWith()` alone as a complete traversal defense.** It correctly catches `..`-based attempts but misses symbolic links entirely; use `toRealPath()` against a real, resolved root for genuinely untrusted input.

**2. Building a `Path` from untrusted string concatenation instead of `resolve`.** `resolve` correctly handles path-separator differences and absolute-path edge cases that naive string concatenation does not.

**3. Reading or writing files without specifying a charset.** Exactly Chapter 4's lesson: always pass `StandardCharsets.UTF_8` (or another explicit charset) rather than relying on a platform default.

**4. Writing directly to a file other processes might be reading concurrently.** A reader can observe a partially-written, corrupt result; write to a temporary file and move it atomically instead.

**5. Assuming file modification timestamps are a reliable, fine-grained audit trail.** Filesystem timestamp resolution varies and can be coarser than your application's actual write frequency.

## Best practices

- Treat any filename or path segment derived from untrusted input exactly like the console input from Chapter 2: validate it fully before using it to touch the real filesystem.
- For genuinely untrusted filenames, resolve against a root, normalize, **and** resolve to the real path (`toRealPath()`) before the `startsWith` check, catching both `..`-based and symlink-based escapes.
- Always pass an explicit charset to text-based `Files` methods.
- Use the write-to-temp-then-atomic-move pattern whenever other code might read a file while it is being produced.
- Prefer `Files.createDirectories` over `createDirectory` unless you specifically need the "parent must already exist" behavior.

## Summary

- `Path` represents a filesystem location purely in memory; `resolve` joins paths, and `normalize` lexically collapses `.`/`..` segments without touching the disk.
- `Files` performs the actual I/O: existence checks, reading, writing, and metadata, and always needs an explicit charset for text.
- The standard path-traversal defense resolves untrusted input against a root, normalizes it, and checks that the result still starts with that root.
- That lexical defense alone does not catch symbolic links pointing outside the root; resolving to the real path with `toRealPath()` and checking against the real root closes that gap.
- Writing to a temporary file and then moving it atomically into place avoids exposing a partially-written file to concurrent readers.

## Practice

Warm-up:

1. Build a `Path` from several segments, print its `getFileName()` and `getParent()`, and normalize a version of it containing `.` and `..` segments.
2. Write a small text file with `Files.writeString`, read it back with `Files.readString`, and print its size with `Files.size`.
3. Attempt to resolve an untrusted name containing `..` against a fixed root using this lesson's `resolveInsideRoot` method, and confirm it is rejected.

Core:

1. Extend `resolveInsideRoot` to also call `toRealPath()` and check against the root's real path, exactly as this lesson's symlink example demonstrated, and verify it now rejects a symlink-based escape while still accepting ordinary nested files.
2. Write a method that safely writes content to a named file inside a fixed, application-controlled directory, using the temp-file-then-atomic-move pattern, and demonstrate that the target file never appears in a partially-written state even if you simulate a failure between the write and the move.
3. Given a list of untrusted filenames (some valid, some containing traversal attempts), write a method that partitions them into "accepted" and "rejected" using this lesson's defense, and report both lists.

Challenge:

1. Design a small "upload storage" class that accepts a base directory and an untrusted filename, applies the full traversal-and-symlink defense from this lesson, and provides `save(byte[] content)` and `read()` methods, refusing to construct at all if the resolved location would escape the root.
2. Research (by writing a small experiment) what `Files.move` without `ATOMIC_MOVE` does differently from with it when the source and target are on the same filesystem, and document your findings.

## Check your understanding

1. What is the difference between what `Path.resolve` and `Path.normalize` each do, and does either one touch the real filesystem?
2. What exactly does the standard traversal defense (`resolve`, `normalize`, `startsWith`) check for, and what specific attack does it correctly stop?
3. Why does that same defense fail to stop a symbolic link pointing outside the allowed root, even when the requested filename itself contains no `..` segments?
4. What method resolves a path's symbolic links to reveal where it actually points on the real filesystem?
5. Why is writing to a temporary file and then moving it into place safer than writing directly to the final target file?
6. Why should `Files.readAllLines`/`writeString` always be called with an explicit charset argument?
