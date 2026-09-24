# StringBuilder and efficient text construction

The previous lesson established that every `String` is immutable: `result = result + piece;` does not grow `result` in place, it discards the old string and builds an entirely new one containing all the old characters plus the new piece. Do that once, and nobody notices. Do it twenty thousand times in a loop, and your program visibly slows down, because each iteration copies everything built so far.

`StringBuilder` solves exactly this problem. It is a genuinely **mutable** sequence of characters, backed by a resizable internal buffer, designed for exactly the situation `String` handles badly: building up text piece by piece.

What you will learn:

- Why repeated `String` concatenation in a loop is slow, demonstrated with a timing comparison
- The core `StringBuilder` operations: `append`, `insert`, `delete`, `replace`, `reverse`, `setCharAt`
- What `capacity` means, how it differs from `length`, and how the internal buffer grows
- How to chain `StringBuilder` calls fluently
- When to reach for `StringBuilder` instead of `String` concatenation, and when not to bother

## Why concatenation in a loop is slow

Every `+` between strings (when at least one operand is a `String`) creates a new `String` object containing a copy of both operands' characters. In a loop, each new object is bigger than the last, and building it means copying **everything accumulated so far**, not just the new piece. This makes a naive loop's total work grow proportionally to the square of the number of iterations, not just the number of iterations.

```java
public class WhyBuilder {
    static String concatLoop(int count) {
        String result = "";
        for (int i = 0; i < count; i++) {
            result = result + i + ",";
        }
        return result;
    }

    static String builderLoop(int count) {
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < count; i++) {
            result.append(i).append(",");
        }
        return result.toString();
    }

    public static void main(String[] args) {
        long start1 = System.nanoTime();
        String a = concatLoop(20000);
        long time1 = System.nanoTime() - start1;

        long start2 = System.nanoTime();
        String b = builderLoop(20000);
        long time2 = System.nanoTime() - start2;

        System.out.println("same result: " + a.equals(b));
        System.out.println("concat loop:   " + (time1 / 1_000_000) + " ms (approx)");
        System.out.println("builder loop:  " + (time2 / 1_000_000) + " ms (approx)");
        System.out.println("builder was faster: " + (time2 < time1));
    }
}
```

Output (exact timings vary by machine, but the pattern is consistent):

```text
same result: true
concat loop:   395 ms (approx)
builder loop:  1 ms (approx)
builder was faster: true
```

Both loops build the identical final string, but the naive concatenation approach took roughly 400 times longer for just 20,000 iterations. Grow the loop count and the gap widens dramatically, because `concatLoop`'s cost grows quadratically while `builderLoop`'s cost grows linearly.

> **Note:** The compiler already optimizes a **single** concatenation expression like `"Total: " + name + " (" + count + ")"` efficiently behind the scenes, roughly as if you had written the `StringBuilder` calls yourself. The problem is specifically **repeated concatenation across loop iterations**, where each iteration is a separate statement the compiler cannot merge with the others.

## Core StringBuilder operations

`StringBuilder` supports the same kind of text-editing operations you would expect from a text editor: appending at the end, inserting in the middle, deleting a range, replacing a range, and reversing.

```java
public class BuilderBasics {
    public static void main(String[] args) {
        StringBuilder sb = new StringBuilder();
        System.out.println("new builder: length=" + sb.length() + " capacity=" + sb.capacity());

        sb.append("Hello");
        sb.append(", ");
        sb.append("World");
        sb.append('!');
        sb.append(' ').append(2024);
        System.out.println("after appends: " + sb + " (length=" + sb.length() + ")");

        sb.insert(5, " there");
        System.out.println("after insert: " + sb);

        sb.replace(0, 5, "Greetings");
        System.out.println("after replace: " + sb);

        sb.delete(0, 10);
        System.out.println("after delete: " + sb);

        sb.reverse();
        System.out.println("reversed: " + sb);
        sb.reverse();

        sb.setCharAt(0, 'w');
        System.out.println("after setCharAt: " + sb);

        System.out.println("charAt(1): " + sb.charAt(1));
        System.out.println("indexOf(\"World\"): " + sb.indexOf("World"));
        System.out.println("substring(0,5): " + sb.substring(0, 5));

        String finalText = sb.toString();
        System.out.println("final String: " + finalText);
    }
}
```

Output:

```text
new builder: length=0 capacity=16
after appends: Hello, World! 2024 (length=18)
after insert: Hello there, World! 2024
after replace: Greetings there, World! 2024
after delete: there, World! 2024
reversed: 4202 !dlroW ,ereht
after setCharAt: where, World! 2024
charAt(1): h
indexOf("World"): 7
substring(0,5): where
final String: where, World! 2024
```

| Method | Effect |
|---|---|
| `append(x)` | adds `x` (of almost any type) to the end, returns `this` |
| `insert(index, x)` | inserts `x` starting at `index`, shifting the rest right |
| `delete(start, end)` | removes characters from `start` (inclusive) to `end` (exclusive) |
| `replace(start, end, text)` | removes that range and inserts `text` in its place |
| `reverse()` | reverses the character order in place |
| `setCharAt(index, ch)` | overwrites one character |
| `charAt(index)`, `indexOf(text)`, `substring(a, b)` | read operations, just like `String` |
| `length()` | the number of characters currently stored |
| `toString()` | produces an ordinary, immutable `String` snapshot of the current content |

Every mutating method here changes the **same object**; unlike `String`, no new object is created for `append` or `insert`. This is exactly why `StringBuilder` is not appropriate wherever you need the safety of immutability (for example, as a `Map` key, covered in Chapter 9) — its content, and therefore its identity as a value, can shift underneath you.

## Capacity: the hidden buffer

`StringBuilder` stores characters in an internal `char` array called its buffer. The **capacity** is the buffer's current allocated size; the **length** is how many characters are actually stored in it right now. Capacity is always greater than or equal to length, and it exists purely as a performance optimization: as long as the buffer has spare room, `append` just writes into the existing array. Only when the buffer is full does `StringBuilder` need to allocate a bigger array and copy everything over — a relatively expensive operation it tries to do rarely by growing generously each time.

```java
public class Capacity {
    public static void main(String[] args) {
        StringBuilder sb = new StringBuilder();
        System.out.println("default capacity: " + sb.capacity() + ", length: " + sb.length());

        for (int i = 0; i < 20; i++) {
            sb.append("xx");
        }
        System.out.println("after 20 appends of 2 chars: length=" + sb.length() + " capacity=" + sb.capacity());

        StringBuilder sized = new StringBuilder(100);
        System.out.println("presized: length=" + sized.length() + " capacity=" + sized.capacity());
        sized.append("short");
        System.out.println("after one append: length=" + sized.length() + " capacity=" + sized.capacity());

        StringBuilder fromText = new StringBuilder("hello");
        System.out.println("from text: length=" + fromText.length() + " capacity=" + fromText.capacity());

        StringBuilder grower = new StringBuilder();
        int previousCapacity = grower.capacity();
        for (int i = 0; i < 20; i++) {
            grower.append("0123456789");
            if (grower.capacity() != previousCapacity) {
                System.out.println("length=" + grower.length() + " triggered capacity growth to " + grower.capacity());
                previousCapacity = grower.capacity();
            }
        }
    }
}
```

Output:

```text
default capacity: 16, length: 0
after 20 appends of 2 chars: length=40 capacity=70
presized: length=0 capacity=100
after one append: length=5 capacity=100
from text: length=5 capacity=21
length=20 triggered capacity growth to 34
length=40 triggered capacity growth to 70
length=80 triggered capacity growth to 142
length=150 triggered capacity growth to 286
```

Reading this carefully:

- **The no-argument constructor starts with capacity 16**, regardless of how much text you plan to add.
- **`new StringBuilder(100)`** pre-allocates a buffer for 100 characters, so appending a short string does not need to grow it at all — `capacity` stays 100.
- **`new StringBuilder("hello")`** starts with a capacity of the initial text's length plus 16 (`5 + 16 = 21`), giving a little headroom immediately.
- **Growth roughly doubles the capacity** each time the buffer fills up (16 to 34, to 70, to 142, to 286), so the number of expensive reallocations stays small (logarithmic) even as you append a great deal of text.

> **Tip:** If you know approximately how large the final text will be — say, building a report row for every one of ten thousand database records — pass that estimate to the constructor: `new StringBuilder(estimatedLength)`. This avoids several buffer reallocations and is a cheap, easy performance win. When you have no idea, the default is perfectly fine; the automatic growth strategy handles it well.

## Method chaining

Every mutating method on `StringBuilder` returns `this` (the same builder), which lets you **chain** calls in one fluent expression instead of repeating the variable name on every line:

```java
public class ChainingAndChars {
    static String buildCsvRow(String[] fields) {
        StringBuilder row = new StringBuilder();
        for (int i = 0; i < fields.length; i++) {
            if (i > 0) {
                row.append(',');
            }
            row.append(fields[i]);
        }
        return row.toString();
    }

    static String repeatPattern(String pattern, int times) {
        StringBuilder result = new StringBuilder(pattern.length() * times);
        for (int i = 0; i < times; i++) {
            result.append(pattern);
        }
        return result.toString();
    }

    public static void main(String[] args) {
        String row = buildCsvRow(new String[] {"Amina", "34", "Cairo"});
        System.out.println("csv row: " + row);

        System.out.println("repeated: " + repeatPattern("ab-", 4));

        String chained = new StringBuilder()
                .append("Order #")
                .append(1024)
                .append(": ")
                .append(3)
                .append(" items, total $")
                .append(59.97)
                .toString();
        System.out.println(chained);

        StringBuilder palindromeCheck = new StringBuilder("racecar");
        boolean isPalindrome = palindromeCheck.toString().equals(palindromeCheck.reverse().toString());
        System.out.println("racecar is palindrome: " + isPalindrome);
    }
}
```

Output:

```text
csv row: Amina,34,Cairo
repeated: ab-ab-ab-ab-
Order #1024: 3 items, total $59.97
racecar is palindrome: true
```

`buildCsvRow` shows a very common pattern: appending a separator **before** every field except the first, which correctly avoids a trailing comma. `append` is overloaded for every primitive type and for `Object` (which calls `toString()` on it), so you can mix strings, numbers, and characters freely without manual conversion. The chained expression at the end builds an entire message in one statement — readable once you know that each `.append(...)` returns the same builder for the next call to act on.

The palindrome check reuses the `reverse()` method from `BuilderBasics` for a genuinely useful purpose: comparing a word to its own reversal is the simplest way to test whether it reads the same backwards.

## What happens under the hood

A `String` object is, conceptually, a fixed-size array of characters plus a promise that the array will never be modified after construction — that promise is what makes sharing and pooling safe (Lesson 2). A `StringBuilder` is, conceptually, a resizable array plus a count of how many slots are currently used (the `length`); the array's total size is the `capacity`. `append` writes new characters into the unused tail of the array and increments the length, which is a fast, constant-time operation **as long as there is room**. Only when the array is full does `append` need to allocate a new, larger array and copy every existing character into it — an operation whose cost grows with how much text has already been built. Because the growth strategy roughly doubles the size each time, these expensive copies happen only a logarithmic number of times relative to the final length, which is why the total cost of building even a very long string with `StringBuilder` stays proportional to the final length, not to its square.

This is the mechanical reason behind the timing difference you saw in the first example: `concatLoop` allocates a brand new, ever-larger array on **every single iteration**, copying all previously accumulated characters each time, while `builderLoop` mostly just writes into existing free space and only occasionally needs to grow.

## Common mistakes

**1. Concatenating strings with `+` inside a loop that runs many times.** Each iteration silently creates and discards an intermediate `String`. Use a `StringBuilder` declared before the loop and `append` inside it.

**2. Forgetting to call `toString()` at the end.** `StringBuilder.equals` compares object identity (inherited from `Object`, not overridden), not text content, so comparing two builders directly with `equals` almost never does what you want. Convert to `String` first, or compare with `sb1.toString().equals(sb2.toString())`.

**3. Confusing `length()` with `capacity()`.** `length()` is how much text is actually there; `capacity()` is how much room is currently allocated. Printing an uninitialized builder's `capacity()` (16 by default) and expecting it to be 0 is a common surprise.

**4. Sharing one `StringBuilder` across unrelated pieces of logic.** Because it is mutable, one part of the code appending to it can affect another part that expected a stable snapshot. Build a fresh `StringBuilder`, or copy `toString()` into a `String` variable, per logical unit of work.

**5. Using `StringBuilder` for a single, simple concatenation.** `String result = a + b + c;` is already efficient (Java compiles it well) and far more readable than manually constructing and chaining a builder for something that short.

## Best practices

- Reach for `StringBuilder` specifically when you are appending text repeatedly inside a loop or building output incrementally across several steps.
- For a single expression combining a handful of values, plain `+` concatenation is clearer and just as efficient.
- Pre-size the builder with an estimated capacity when you know roughly how large the final text will be and performance matters.
- Always finish with `toString()` before storing, returning, comparing, or printing the result as text long-term, since the builder itself keeps mutating.
- Never use a `StringBuilder`'s mutability as a substitute for proper immutable value design in your own classes (Chapter 5); it is a tool for text construction, not a general mutable-object pattern.

## Summary

- `String` concatenation in a loop is slow because immutability forces a new copy on every iteration; the cost grows quadratically with the number of iterations.
- `StringBuilder` is a mutable, resizable character buffer with `append`, `insert`, `delete`, `replace`, `reverse`, and `setCharAt`, all of which modify the same object in place.
- `capacity()` is the buffer's allocated size; `length()` is how much of it is used. The buffer roughly doubles in size whenever it fills up, keeping the number of expensive reallocations small.
- Chaining works because every mutating method returns `this`, letting you write fluent, single-expression construction.
- Use `StringBuilder` for repeated or incremental text building; use plain `String` concatenation for one-off combinations of a few values.

## Practice

Warm-up:

1. Build the string `"1-2-3-4-5"` using a `StringBuilder` and a loop, taking care not to leave a trailing dash.
2. Create a `StringBuilder` from the text `"Programming"`, then use `reverse()` to print it backwards, and confirm the original variable now holds the reversed text too.
3. Compare `new StringBuilder("abc").capacity()` with `new StringBuilder().capacity()` and explain the difference you observe.

Core:

1. Write `static String removeVowels(String text)` using a `StringBuilder`, appending each character only if it is not a vowel (upper or lower case).
2. Write a method that takes an array of `int` and returns a comma-separated `String` of their squares, using a `StringBuilder` and no trailing comma.
3. Write a small benchmark, similar to the one in this lesson, that compares building a 5,000-character string with `+=` versus `StringBuilder.append`, and print how many times faster the builder was on your machine.

Challenge:

1. Write `static String toTitleCase(String sentence)` that capitalizes the first letter of every word and lowercases the rest, handling multiple spaces between words correctly, using only a `StringBuilder` (no `split`).
2. Implement a simple "run-length" text compressor: `static String compress(String text)` should turn `"aaabbbccd"` into `"a3b3c2d1"` using a `StringBuilder`, and write the matching `static String decompress(String compressed)`.

## Check your understanding

1. Why does building a very long string with repeated `+=` inside a loop become dramatically slower as the loop count grows, while `StringBuilder.append` does not?
2. What is the difference between `StringBuilder.length()` and `StringBuilder.capacity()`?
3. Why does `sb1.equals(sb2)` almost never correctly tell you whether two builders contain the same text?
4. What does `new StringBuilder(50)` do differently from `new StringBuilder("50")`?
5. Why can every mutating `StringBuilder` method be chained together in one expression?
6. When is it better to use plain `String` concatenation with `+` instead of a `StringBuilder`?
