# Byte versus character streams, buffering, and UTF-8

Chapter 4 taught you that text becomes bytes through an encoding, and that decoding with the wrong one silently corrupts it. This lesson puts that knowledge to work with Java's actual I/O classes: the fundamental split between **byte streams** (raw bytes — images, compressed data, any binary format) and **character streams** (text, always through an explicit encoding), plus **buffering**, the single most impactful, easy performance improvement available for I/O-heavy code.

What you will learn:

- Byte streams (`InputStream`/`OutputStream`): reading and writing raw bytes with no interpretation
- Character streams (`Reader`/`Writer`): reading and writing text through an explicit charset
- What `BufferedReader.readLine()` returns at end of file — and why that specific value matters for loop design
- Buffering: why wrapping a stream in a buffered decorator dramatically reduces the number of expensive underlying I/O operations
- What happens, concretely, when text is read back with the wrong charset

## Byte streams: raw bytes, no interpretation

`InputStream` and `OutputStream` (and their common file-based subclasses, `FileInputStream`/`FileOutputStream`) read and write raw bytes with **no interpretation whatsoever** — not even an assumption that the data represents text at all.

```java
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

public class ByteStreamDemo {
    public static void main(String[] args) throws Exception {
        Path file = Path.of("/work/data.bin");

        try (FileOutputStream out = new FileOutputStream(file.toFile())) {
            out.write(new byte[] {72, 101, 108, 108, 111});
            out.write(33);
        }

        try (FileInputStream in = new FileInputStream(file.toFile())) {
            int b;
            StringBuilder raw = new StringBuilder();
            while ((b = in.read()) != -1) {
                raw.append(b).append(' ');
            }
            System.out.println("raw bytes: " + raw.toString().trim());
        }

        byte[] allBytes = Files.readAllBytes(file);
        System.out.println("as text: " + new String(allBytes, java.nio.charset.StandardCharsets.UTF_8));
    }
}
```

Output:

```text
raw bytes: 72 101 108 108 111 33
as text: Hello!
```

Notice `InputStream.read()` returns an `int`, not a `byte` — specifically so it can return `-1` as a distinct "end of stream" signal, a value no legitimate byte (0 to 255) could ever be confused with. The bytes `{72, 101, 108, 108, 111, 33}` are meaningless numbers to the stream itself; only when you deliberately interpret them as UTF-8 text (via `new String(bytes, charset)`) do they become `"Hello!"`. Byte streams are the correct choice for images, compressed archives, serialized binary formats, or any data that is not fundamentally text.

## Character streams: text through an explicit charset

`Reader` and `Writer` (and their common subclasses, `BufferedReader`/`BufferedWriter`) work with **characters**, not raw bytes — internally handling the encode/decode step Chapter 4 covered, using whatever `Charset` you provide:

```java
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class CharacterStreamDemo {
    public static void main(String[] args) throws Exception {
        Path file = Path.of("/work/notes.txt");

        try (BufferedWriter writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
            writer.write("café con leche");
            writer.newLine();
            writer.write("second line");
        }

        try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            int count = 0;
            while ((line = reader.readLine()) != null) {
                count++;
                System.out.println(count + ": " + line);
            }
            System.out.println("readLine at end of file returns: " + reader.readLine());
        }
    }
}
```

Output:

```text
1: café con leche
2: second line
readLine at end of file returns: null
```

This is exactly the chapter's concept-check question: **`readLine()` returns `null` at end of file**, not an empty string and not a thrown exception. This specific choice is exactly why the standard idiom `while ((line = reader.readLine()) != null) { ... }` works correctly: an empty *line* in the file (a genuinely blank line between two others) reads as `""`, a real, distinct value, while running out of lines entirely reads as `null` — the loop's `!= null` check distinguishes these two cases correctly precisely because they use different sentinel values, the same "distinct value for absence" principle Chapter 4 taught for `Scanner` and Chapter 7 for `Map.get`.

## Buffering: fewer, larger operations instead of many tiny ones

Every unbuffered read or write to a file typically triggers a real, comparatively expensive system call to the operating system. **Buffering** wraps a stream in a decorator that accumulates data in memory and flushes it to the underlying stream in larger batches, dramatically reducing how many of those expensive operations actually occur:

```java
import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

public class BufferingMatters {
    static long time(int n, boolean buffered) throws IOException {
        Path file = Path.of("/work/" + (buffered ? "buffered.txt" : "unbuffered.txt"));
        long start = System.nanoTime();
        try (Writer raw = new FileWriter(file.toFile(), StandardCharsets.UTF_8);
             Writer writer = buffered ? new BufferedWriter(raw) : raw) {
            for (int i = 0; i < n; i++) {
                writer.write("line " + i + "\n");
            }
        }
        return (System.nanoTime() - start) / 1_000_000;
    }

    public static void main(String[] args) throws Exception {
        int n = 50_000;
        long unbufferedMs = time(n, false);
        long bufferedMs = time(n, true);
        System.out.println("writing " + n + " lines one at a time:");
        System.out.println("unbuffered: " + unbufferedMs + " ms");
        System.out.println("buffered:   " + bufferedMs + " ms");
        System.out.println("buffered was faster: " + (bufferedMs < unbufferedMs));
    }
}
```

Output (exact milliseconds vary by machine, but the direction is consistent):

```text
writing 50000 lines one at a time:
unbuffered: 30 ms
buffered:   9 ms
buffered was faster: true
```

The unbuffered version calls `FileWriter.write` 50,000 separate times, and each call can trigger its own underlying system-level write. Wrapping the identical writer in a `BufferedWriter` accumulates those writes into its internal buffer and only flushes to the real file in a handful of much larger operations — over three times faster here, and the gap widens further with more data or slower underlying storage. This is precisely the same "fewer, larger operations beat many small ones" idea behind `StringBuilder` in Chapter 4: an unbuffered stream is, in a real sense, the I/O equivalent of repeated `String` concatenation in a loop.

> **Tip:** `Files.newBufferedReader`/`newBufferedWriter` (used throughout this lesson and Chapter 4) already return a **buffered** reader or writer — you do not need to wrap them again. Buffering matters specifically when you construct a lower-level stream directly, as `BufferingMatters` does to demonstrate the difference explicitly.

`Files.readAllLines` loads an entire file into a `List<String>` in memory before returning — perfectly fine for a small configuration file, but wasteful or outright infeasible for a multi-gigabyte log file. `Files.lines(path, charset)` offers a lazy alternative: it returns a `Stream<String>` that reads and hands you one line at a time as you consume it, never holding the whole file in memory at once. That laziness comes with an obligation the eager `readAllLines` does not have: `Files.lines` opens a real file handle underneath, so its `Stream` must always be used inside a try-with-resources block (`Stream` implements `AutoCloseable` specifically for cases like this one) to guarantee the underlying file gets closed, exactly the same resource-ownership discipline Chapter 11 taught for every other closeable resource.

## Reading text with the wrong charset: real, visible corruption

This lesson closes exactly where Chapter 4's encoding lesson did, but now with real file I/O instead of an in-memory byte array — decoding text with a charset different from the one used to encode it does not throw an exception; it silently produces wrong, garbled text:

```java
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class WrongCharsetCorruption {
    public static void main(String[] args) throws Exception {
        Path file = Path.of("/work/accented.txt");
        String original = "Résumé for naïve café owner";

        Files.writeString(file, original, StandardCharsets.UTF_8);

        String readCorrectly = Files.readString(file, StandardCharsets.UTF_8);
        String readWrong = Files.readString(file, StandardCharsets.ISO_8859_1);

        System.out.println("original:       " + original);
        System.out.println("read as UTF-8:  " + readCorrectly + " (matches: " + original.equals(readCorrectly) + ")");
        System.out.println("read as Latin1: " + readWrong + " (matches: " + original.equals(readWrong) + ")");
    }
}
```

Output:

```text
original:       Résumé for naïve café owner
read as UTF-8:  Résumé for naïve café owner (matches: true)
read as Latin1: RÃ©sumÃ© for naÃ¯ve cafÃ© owner (matches: false)
```

The file on disk never changed between the two reads — only the charset used to *interpret* its bytes differed. Reading with the same UTF-8 charset used to write it reproduces the original text exactly; reading with ISO-8859-1 (Latin-1) instead reinterprets each multi-byte UTF-8 sequence as multiple separate, wrong Latin-1 characters, exactly the corruption pattern Chapter 4 first demonstrated in memory — now shown surviving a real round trip through the filesystem. There is no error, no warning, no exception: just visibly wrong text, discovered only when someone happens to look at the output.

## What happens under the hood

A character stream is, underneath, always built on top of a byte stream — `Reader`/`Writer` classes ultimately read or write bytes through some `InputStream`/`OutputStream`, applying an encoder or decoder for a specific `Charset` in between. This is exactly why every character-stream-creating method that matters accepts (or, better, requires) an explicit charset argument: without one, the JVM's platform-default charset is used, which differs between operating systems and configurations — precisely the same "never rely on a platform default" warning Chapter 4 gave for `getBytes()` and `new String(bytes, ...)`, now shown to apply identically to every text-based file operation in this lesson.

## Common mistakes

**1. Using a byte stream for text, or a character stream for binary data.** Byte streams have no concept of characters at all; character streams always assume — and require you to specify — an encoding.

**2. Checking for an empty string instead of `null` to detect end of file with `readLine()`.** An empty string is a real, valid blank line; `null` is the actual end-of-stream signal.

**3. Constructing a raw `FileWriter`/`FileReader` directly for repeated small writes or reads without wrapping it in a buffered decorator**, paying the cost of many small, expensive underlying I/O operations.

**4. Omitting the charset argument on a text-based file operation.** This silently falls back to the JVM's platform-default charset, which is inconsistent across machines and exactly the kind of hidden dependency Chapter 4 warned against.

**5. Assuming a decoding mismatch will throw an exception.** It almost never does; it silently produces garbled, wrong text instead, exactly as `WrongCharsetCorruption` demonstrates.

**6. Calling `Files.lines()` without a try-with-resources block.** Unlike `readAllLines`, it holds an open file handle backing its `Stream`, and leaving it unclosed leaks that handle exactly like any other unclosed resource.

## Best practices

- Choose byte streams for genuinely binary data and character streams for text; do not mix the two roles.
- Always pass an explicit `Charset` (`StandardCharsets.UTF_8` in almost every modern case) to every text-based I/O method.
- Prefer `Files.newBufferedReader`/`newBufferedWriter` for text I/O; they are already buffered and already require an explicit charset, closing both of this lesson's most common mistakes at once.
- Reach for a buffered wrapper explicitly whenever you construct a lower-level stream directly and expect many small reads or writes.
- Use `readLine() != null` (never an empty-string check) as the loop condition for reading a text file line by line.

## Summary

- Byte streams (`InputStream`/`OutputStream`) handle raw bytes with no interpretation; character streams (`Reader`/`Writer`) handle text through an explicit charset.
- `BufferedReader.readLine()` returns `null` at end of file, distinct from an empty string representing a genuinely blank line.
- Buffering accumulates many small reads or writes into fewer, larger underlying I/O operations, often dramatically improving performance for repeated small operations.
- `Files.newBufferedReader`/`newBufferedWriter` are already buffered; wrapping is needed mainly when constructing lower-level streams directly.
- Reading text with the wrong charset does not throw; it silently produces garbled, wrong text — always specify the charset explicitly, matching whatever encoding actually produced the bytes.

## Practice

Warm-up:

1. Write a few raw bytes to a file with `FileOutputStream`, read them back with `FileInputStream`, and print the raw integer values before interpreting them as text.
2. Write several lines of text to a file with `Files.newBufferedWriter`, then read them back with `Files.newBufferedReader`, printing each line's number.
3. Deliberately read a UTF-8-written file back with `StandardCharsets.US_ASCII` or `ISO_8859_1` for text containing an accented character, and observe the corruption.

Core:

1. Write a method that copies a text file line by line, using buffered reader and writer, and verify the copy is byte-for-byte identical to the original using `Files.readAllBytes`.
2. Reproduce `BufferingMatters`'s timing comparison with your own choice of write count and content, and explain the result using this lesson's vocabulary.
3. Write a method that reads a file's first few raw bytes with a byte stream to detect a simple "magic number" file-type marker, before deciding whether to proceed with character-stream-based text processing.

Challenge:

1. Implement a simple line-counting utility that correctly counts lines in a file regardless of whether the last line ends with a newline character, using `readLine()`'s `null` return specifically to handle the end-of-file boundary correctly.
2. Design a small "safe text file reader" utility that attempts to read a file as UTF-8, and if that fails or produces suspicious replacement characters, logs a clear diagnostic message rather than silently returning corrupted text — researching, if needed, how to detect a UTF-8 decoding failure explicitly rather than always succeeding with wrong output.

## Check your understanding

1. What is the fundamental difference between what a byte stream and a character stream each read or write?
2. What does `BufferedReader.readLine()` return when it reaches the end of the file, and why is that value chosen specifically to be distinguishable from a real blank line?
3. Why does wrapping a stream in a buffered decorator typically improve performance for many small reads or writes?
4. Are `Files.newBufferedReader` and `Files.newBufferedWriter` already buffered, or do they need to be wrapped again?
5. What happens, precisely, when a file written with UTF-8 is read back using a different charset?
6. Why should every text-based file operation specify its charset explicitly rather than relying on the JVM's platform default?
7. Why must a `Stream<String>` returned by `Files.lines()` be used inside a try-with-resources block, unlike the `List<String>` returned by `Files.readAllLines`?
