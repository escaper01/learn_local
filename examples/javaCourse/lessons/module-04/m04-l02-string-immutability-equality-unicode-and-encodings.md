# String immutability, equality, Unicode, and encodings

You have used `String` since your very first program, but you have not yet studied what a `String` actually is: an object, not a primitive, and one with a guarantee that shapes how you write every Java program afterward — once created, a `String`'s characters never change. That single guarantee explains why string methods return new strings instead of modifying the original, why strings are safe to share between threads, and why comparing them needs `equals` instead of `==`.

This lesson also tackles a subject most beginner material skips: `String` does not store "characters" the simple way you might imagine. It stores UTF-16 code units, and human-readable characters beyond the common range need two of them. Understanding this now prevents subtle bugs when your programs handle emoji, accented letters, or any text outside basic English.

What you will learn:

- The core `String` methods for extracting, searching, transforming, and splitting text
- Why `String` is immutable, and what that means for methods that "look like" they modify a string
- The string pool, how literals are shared, and what `intern()` does
- Why `==` on strings is unreliable and `equals` is the only correct comparison
- How Unicode code points differ from `char` values and UTF-16 code units, including supplementary characters
- How `getBytes` and encodings convert text to bytes, and what happens when the wrong encoding is used to decode them

## Core String methods

A `String` is a sequence of characters with a rich set of methods. Here are the ones you will use constantly:

```java
public class StringBasics {
    public static void main(String[] args) {
        String greeting = "Hello";
        String upper = greeting.toUpperCase();
        System.out.println("original: " + greeting + ", upper: " + upper);

        String s = "Java";
        System.out.println("length: " + s.length());
        System.out.println("charAt(0): " + s.charAt(0));
        System.out.println("substring(1,3): " + s.substring(1, 3));
        System.out.println("substring(2): " + s.substring(2));
        System.out.println("indexOf('v'): " + s.indexOf('v'));
        System.out.println("contains(\"av\"): " + s.contains("av"));
        System.out.println("replace('a','o'): " + s.replace('a', 'o'));
        System.out.println("toLowerCase: " + s.toLowerCase());
        System.out.println("concat: " + s.concat(" 21"));
        System.out.println("original s unchanged: " + s);

        String padded = "  spaced out  ";
        System.out.println("[" + padded.strip() + "]");
        System.out.println("[" + padded.trim() + "]");
        System.out.println("isBlank: " + "   ".isBlank() + ", isEmpty: " + "".isEmpty());

        String csv = "one,two,,four";
        String[] parts = csv.split(",");
        System.out.println("split length: " + parts.length);
        for (String part : parts) {
            System.out.println("  [" + part + "]");
        }
        System.out.println("joined: " + String.join("-", "a", "b", "c"));
        System.out.println("repeat: " + "ab".repeat(3));
    }
}
```

Output:

```text
original: Hello, upper: HELLO
length: 4
charAt(0): J
substring(1,3): av
substring(2): va
indexOf('v'): 2
contains("av"): true
replace('a','o'): Jovo
toLowerCase: java
concat: Java 21
original s unchanged: Java
[spaced out]
[spaced out]
isBlank: true, isEmpty: true
split length: 4
  [one]
  [two]
  []
  [four]
joined: a-b-c
repeat: ababab
```

Two indexing details matter. `substring(begin, end)`: `begin` is inclusive and `end` is exclusive, so `substring(1, 3)` on `"Java"` returns the characters at index 1 and 2, giving `"av"`. `split(",")` on a CSV line with an empty field between two commas produces an empty string element, `[two]` followed by `[]`; forgetting this is a common bug when parsing files.

| Reference table | |
|---|---|
| `length()` | number of UTF-16 code units (see the Unicode section) |
| `charAt(i)` | the code unit at index `i` |
| `substring(a, b)` | characters from `a` (inclusive) to `b` (exclusive) |
| `indexOf(x)`, `lastIndexOf(x)` | first or last position of `x`, or -1 |
| `contains`, `startsWith`, `endsWith` | boolean tests |
| `strip()` | removes leading and trailing whitespace (Unicode-aware; prefer over `trim()`) |
| `split(regex)` | splits on a regular expression (Chapter 12) |
| `String.join(sep, ...)` | opposite of split |
| `equals`, `equalsIgnoreCase` | content comparison (Chapter 2) |

## Immutability: strings never change

Every method that appears to "modify" a string actually returns a **brand-new** `String` object, leaving the original untouched. `String` objects, once created, cannot be altered by any method. This is called **immutability**.

```java
public class Immutability {
    static void shout(String text) {
        text = text.toUpperCase();
        System.out.println("  inside shout: " + text);
    }

    public static void main(String[] args) {
        String original = "hello";
        String upper = original.toUpperCase();
        System.out.println("original: " + original);
        System.out.println("upper:    " + upper);
        System.out.println("same object? " + (original == upper));

        shout(original);
        System.out.println("after shout, original is still: " + original);

        StringBuilder mutable = new StringBuilder("hello");
        mutable.append("!");
        System.out.println("StringBuilder after append: " + mutable);

        String a = "cat";
        String b = a;
        a = a + "s";
        System.out.println("a = " + a + ", b = " + b);
    }
}
```

Output:

```text
original: hello
upper:    HELLO
same object? false
  inside shout: HELLO
after shout, original is still: hello
StringBuilder after append: hello!
a = cats, b = cat
```

`toUpperCase()` builds and returns a new `String`; `original` itself is not touched, so `original.toUpperCase();` alone (with the result discarded) does nothing useful — a bug beginners make constantly. Passing a string into `shout` and reassigning the local parameter inside the method has no effect on the caller's variable, for the same reason covered with arrays in Lesson 1: the parameter is a separate reference variable. And `a = a + "s"` does not change the string `"cat"`; it creates `"cats"` and points `a` at it, leaving `b` pointing at the original `"cat"`.

Contrast this with `StringBuilder` (fully covered in the next lesson), whose `append` genuinely mutates the same object. Immutability is a deliberate design choice, not a limitation: an immutable `String` can be freely shared between methods, threads, and objects without anyone worrying that another piece of code will change it underneath them. It is also why strings are safe to use as keys in the hash-based collections you will meet in Chapter 9 — their content, and therefore their hash code, can never change after construction.

## The string pool and interning

Because strings are immutable and extremely common, the JVM keeps a special memory area called the **string pool** (or intern pool) to reuse identical string literals instead of creating a new object for each one.

```java
public class Pool {
    public static void main(String[] args) {
        String a = "java";
        String b = "java";
        String c = new String("java");
        String d = new String("java").intern();
        String e = "ja" + "va";
        String prefix = "ja";
        String f = prefix + "va";

        System.out.println("a == b (two literals):        " + (a == b));
        System.out.println("a == c (new String):          " + (a == c));
        System.out.println("a.equals(c):                  " + a.equals(c));
        System.out.println("a == d (new String).intern(): " + (a == d));
        System.out.println("a == e (compile-time concat): " + (a == e));
        System.out.println("a == f (runtime concat):      " + (a == f));
        System.out.println("a == f.intern():               " + (a == f.intern()));

        Integer smallX = 100, smallY = 100;
        Integer bigX = 200, bigY = 200;
        System.out.println("Integer 100==100: " + (smallX == smallY) + ", equals: " + smallX.equals(smallY));
        System.out.println("Integer 200==200: " + (bigX == bigY) + ", equals: " + bigX.equals(bigY));
    }
}
```

Output:

```text
a == b (two literals):        true
a == c (new String):          false
a.equals(c):                  true
a == d (new String).intern(): true
a == e (compile-time concat): true
a == f (runtime concat):      false
a == f.intern():               true
Integer 100==100: true, equals: true
Integer 200==200: false, equals: true
```

What is happening: `"java"` written twice as a literal refers to the **same pooled object** both times, so `a == b` is true. `new String("java")` explicitly asks for a fresh, non-pooled object, so `a == c` is false even though the content is identical — always use `equals` to compare content. Calling `.intern()` looks up (or adds) the equivalent pooled string and returns that shared reference, which is why `a == d` is true. The compiler can fold `"ja" + "va"` into a single literal at compile time, so `e` is pooled too — but concatenation involving a *variable* (`prefix + "va"`) must happen at run time and produces a new, non-pooled object, so `a == f` is false. This variable-versus-literal distinction is exactly why relying on `==` for strings is fragile: whether two equal-looking strings share an object depends on details of how they were constructed, which a reader cannot see at the call site.

The last two lines are a related trap with the `Integer` wrapper class (studied fully in Chapter 8): Java caches small boxed integers from -128 to 127, so `==` happens to work for `100` but silently breaks for `200`. The lesson is the same as for strings: **never rely on `==` for object content comparison; always use `equals`.**

## Unicode: code points, char, and UTF-16

A `char` in Java is a 16-bit value. Unicode assigns every character a **code point**, a number identifying it. For most characters used in practice — basic Latin, accented letters, and thousands of others in the *Basic Multilingual Plane* — one code point fits in one 16-bit `char`, so `length()` (which counts `char` values, called **code units**) equals the number of visible characters.

But Unicode defines over a million code points, far more than 16 bits can hold. Characters outside the Basic Multilingual Plane — most emoji, some rare CJK ideographs, historic scripts — are **supplementary characters**, and Java represents each one as a **pair** of `char` values called a **surrogate pair**. This is exactly the mechanism the chapter's concept-check question is about.

```java
public class Unicode {
    public static void main(String[] args) {
        String simple = "Java";
        System.out.println(simple + " length=" + simple.length() + " codePointCount=" + simple.codePointCount(0, simple.length()));

        String accented = "café";
        System.out.println(accented + " length=" + accented.length());

        String emoji = "A💡B";
        System.out.println(emoji + " length=" + emoji.length()
                + " codePointCount=" + emoji.codePointCount(0, emoji.length()));
        System.out.println("char at index 1: \\u" + Integer.toHexString(emoji.charAt(1)));
        System.out.println("char at index 2: \\u" + Integer.toHexString(emoji.charAt(2)));
        System.out.println("codePointAt(1): " + Integer.toHexString(emoji.codePointAt(1)));

        System.out.print("iterate by code point: ");
        emoji.codePoints().forEach(cp -> System.out.print(Integer.toHexString(cp) + " "));
        System.out.println();

        try {
            String broken = emoji.substring(0, 2);
            System.out.println("substring(0,2) mid-surrogate: length=" + broken.length());
        } catch (Exception error) {
            System.out.println("substring threw: " + error);
        }
    }
}
```

Output:

```text
Java length=4 codePointCount=4
café length=4
A💡B length=4 codePointCount=3
char at index 1: \ud83d
char at index 2: \udca1
codePointAt(1): 1f4a1
iterate by code point: 41 1f4a1 42 
substring(0,2) mid-surrogate: length=2
```

`"café"` has 4 visible characters and `length()` is 4 — the accented `é` is a single code point that fits in one `char`. But `"A💡B"` also reports `length()` 4, even though a human sees only 3 characters, because the light bulb emoji occupies **two** `char` values (`\uD83D` and `\uDCA1`, a high surrogate followed by a low surrogate) that together represent one code point (`0x1F4A1`). `codePointCount` correctly reports 3.

This has real consequences: `charAt(1)` on the emoji string returns half of a broken character, not something meaningful on its own. Worse, `substring(0, 2)` happily cuts the string **between** the two surrogates, producing a string that contains a lone high surrogate — an invalid, unpaired code unit. Java does not throw an exception for this; it silently produces malformed text that can render as a replacement character (a black diamond with a question mark) or worse when printed or transmitted. If you must slice text that could contain supplementary characters, use `codePointCount`, `offsetByCodePoints`, and `codePoints()` instead of raw `char` indexes.

| Concept | What it counts | Method |
|---|---|---|
| Code unit | one 16-bit `char` slot | `length()`, `charAt(i)` |
| Code point | one Unicode character, 1 or 2 code units | `codePointCount(...)`, `codePointAt(i)`, `codePoints()` |
| Visible character (grapheme) | what a human perceives as one symbol, can be more than one code point (accents, flags) | not directly supported; needs `java.text.BreakIterator` |

For everyday business text (names, addresses, English and most European-language content) code units and visible characters coincide, so you rarely need to think about this. The moment your program handles emoji, rare scripts, or arbitrary user-generated text from the web, treat `length()` and `charAt` as counting code units, not "characters" in the everyday sense.

## Encodings: turning text into bytes

A `String` in memory is a sequence of `char` values (UTF-16 code units). Files, network connections, and databases store and transmit **bytes**, not characters, so text must be **encoded** into bytes to leave the program and **decoded** back into a `String` to be read. The encoding is a specific mapping between characters and byte sequences, and using the wrong one when decoding produces garbled text (sometimes called "mojibake").

```java
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public class Encodings {
    public static void main(String[] args) {
        String text = "café";
        byte[] utf8 = text.getBytes(StandardCharsets.UTF_8);
        byte[] utf16 = text.getBytes(StandardCharsets.UTF_16);
        byte[] iso = text.getBytes(StandardCharsets.ISO_8859_1);

        System.out.println("text: " + text + ", chars: " + text.length());
        System.out.println("UTF-8 bytes:     " + utf8.length + " -> " + Arrays.toString(utf8));
        System.out.println("UTF-16 bytes:    " + utf16.length);
        System.out.println("ISO-8859-1 bytes: " + iso.length + " -> " + Arrays.toString(iso));

        String roundTrip = new String(utf8, StandardCharsets.UTF_8);
        System.out.println("round-trip UTF-8 equal? " + text.equals(roundTrip));

        String misread = new String(utf8, StandardCharsets.ISO_8859_1);
        System.out.println("UTF-8 bytes misread as ISO-8859-1: " + misread);

        String ascii = "Hello";
        System.out.println("ASCII text UTF-8 bytes == char count? " + (ascii.getBytes(StandardCharsets.UTF_8).length == ascii.length()));
    }
}
```

Output:

```text
text: café, chars: 4
UTF-8 bytes:     5 -> [99, 97, 102, -61, -87]
UTF-16 bytes:    10
ISO-8859-1 bytes: 4 -> [99, 97, 102, -23]
round-trip UTF-8 equal? true
UTF-8 bytes misread as ISO-8859-1: cafÃ©
ASCII text UTF-8 bytes == char count? true
```

`"café"` has 4 characters but its UTF-8 encoding takes **5 bytes**: the plain ASCII letters `c`, `a`, `f` take one byte each, but `é` needs two bytes in UTF-8 (`-61, -87`, shown as signed bytes). UTF-16 always uses at least 2 bytes per code unit plus a 2-byte marker, giving 10 bytes for 4 characters here. ISO-8859-1 (Latin-1) is a single-byte encoding, so it always produces exactly one byte per character — but only for the roughly 256 characters it supports; it cannot represent most of the world's scripts at all.

The misread line is the important lesson: bytes carry no built-in label saying which encoding produced them. If you encode as UTF-8 but decode as ISO-8859-1, each multi-byte UTF-8 sequence is reinterpreted as multiple separate wrong characters — `é` (2 UTF-8 bytes) becomes `Ã©` (2 wrong Latin-1 characters). This is precisely why file formats, HTTP headers, and database columns must declare their encoding explicitly, and why `UTF-8` is the overwhelmingly preferred default for new systems: it can represent every Unicode character and is backward-compatible with plain ASCII text (an all-ASCII string always has exactly as many UTF-8 bytes as characters, as the last line confirms).

## Common mistakes

**1. Ignoring the return value of a "modifying" method.** `name.trim();` alone does nothing; you must write `name = name.trim();`.

**2. Comparing strings with `==`.** Two strings with identical content are not guaranteed to be the same object unless both are compile-time literals. Always use `equals` or `equalsIgnoreCase`.

**3. Assuming `length()` counts visible characters.** For emoji and other supplementary characters, it counts UTF-16 code units instead, which can be up to double the visible character count.

**4. Slicing a string at an arbitrary `char` index without checking for surrogate pairs.** This can split a supplementary character in half, producing invalid text with no exception raised.

**5. Decoding bytes with the wrong charset.** Always specify the encoding explicitly on both `getBytes` and `new String(bytes, charset)`, and make sure they match; never rely on the platform default, which differs between operating systems.

**6. Building large strings with repeated `+` in a loop.** Each concatenation creates a new `String` object because of immutability, which is wasteful for many iterations. The next lesson introduces `StringBuilder` for exactly this case.

## Best practices

- Reassign the result of every "modifying" `String` method; never assume the original changed.
- Compare string content with `equals`/`equalsIgnoreCase`, and reserve `==` for the rare case where you deliberately want identity comparison (for example, comparing against a known interned constant).
- Prefer `strip()` over `trim()`; it correctly handles the full Unicode definition of whitespace.
- Treat text as UTF-8 by default for storage and transmission unless a format specifically requires something else, and always name the encoding explicitly in code rather than relying on a platform default.
- When processing arbitrary user text that might include emoji or rare scripts, use code-point-aware methods (`codePoints()`, `codePointCount`) instead of raw `char` indexing.

## Summary

- `String` methods such as `toUpperCase`, `substring`, and `trim` never modify the original string; they return a new one, because `String` is immutable.
- Immutability makes strings safe to share, and is why identical literals can be pooled and reused by the JVM.
- `==` compares object identity, and whether two equal-content strings share an object depends on how they were built (literal versus `new String` versus runtime concatenation); always use `equals` for content comparison.
- `length()` and `charAt` count UTF-16 code units, not Unicode code points; supplementary characters (many emoji) use two code units, so use `codePointCount` and `codePoints()` for genuinely Unicode-aware code.
- Text becomes bytes through an encoding; UTF-8 is the standard default, and decoding with the wrong encoding silently produces corrupted text rather than an error.

## Practice

Warm-up:

1. Given `String s = "  Hello, World!  ";`, print its stripped form, its length before and after stripping, and its uppercase version.
2. Predict, then verify: does `"abc" == "abc"` print `true`? Does `"abc" == new String("abc")`?
3. Print the UTF-8 byte length and the `char` length of `"naïve"` and explain the difference.

Core:

1. Write `static String initials(String fullName)` that takes a name like `"Ada Lovelace"` and returns `"AL"`, working correctly however many space-separated words the name has.
2. Write a method that counts how many times a given `char` appears in a string without using `split` or a library method, using only `charAt` and a loop.
3. Write a program that reads a string possibly containing emoji, and prints both its `length()` and its true character count using `codePointCount`, clearly labeling which is which.

Challenge:

1. Write `static boolean isPalindrome(String text)` that ignores case, spaces, and punctuation (for example, `"A man, a plan, a canal: Panama"` should return true).
2. Write a small program that encodes a string containing at least one accented letter to UTF-8 bytes, then decodes those same bytes first as UTF-8 (correct) and then as ISO-8859-1 (wrong), printing both results so the corruption is visible, and explain in a comment exactly why the wrong decoding produces what it does.

## Check your understanding

1. Why does calling `text.trim();` on its own line have no visible effect, and what is the correct way to write it?
2. Two variables hold strings with identical text. Under what circumstances is `==` guaranteed to be `true` for them, and when is it not?
3. What is the difference between a UTF-16 code unit and a Unicode code point, and which one does `String.length()` count?
4. Why can a supplementary character make `String.length()` report a number larger than what a person would count as "characters"?
5. What happens, exactly, if you call `substring` at an index that falls between the two halves of a surrogate pair?
6. If you encode text as UTF-8 and then decode those bytes using ISO-8859-1, what happens to any non-ASCII characters, and why?
