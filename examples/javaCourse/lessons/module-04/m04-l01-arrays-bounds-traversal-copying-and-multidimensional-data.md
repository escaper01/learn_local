# Arrays, bounds, traversal, copying, and multidimensional data

Programs rarely deal with a single value. A class has thirty students, a sensor produces a reading every second, a spreadsheet has rows and columns, and a command line carries several arguments. An **array** is Java's most fundamental way to store many values of the same type under one name. Arrays are fast, compact, and used underneath almost every collection you will meet in Chapter 9.

Arrays also introduce the single most important idea of this chapter: an array variable holds a **reference** to an array object, not the values themselves. Two variables can refer to the same array, and changing it through one is visible through the other. Understanding that behavior now will save you from a whole family of bugs later.

What you will learn:

- How to declare, create, initialize, read, and update arrays
- How indexes and bounds work, and what `ArrayIndexOutOfBoundsException` tells you
- The standard traversal patterns: index loops, enhanced `for`, reverse loops, and accumulators
- Why assigning one array variable to another creates an alias, not a copy
- How to copy arrays with `Arrays.copyOf`, `clone`, `Arrays.copyOfRange`, and `System.arraycopy`
- How arrays behave as method parameters and return values
- How to read command-line arguments through `main(String[] args)`
- The `java.util.Arrays` toolkit: `toString`, `sort`, `binarySearch`, `fill`, `equals`
- Two-dimensional and jagged arrays

## Creating arrays

An array has a fixed **length** and an element type. The type is written with square brackets: `int[]` means "array of `int`". Creating an array is a two-part idea: declare a variable, then create an array object with `new` or with an initializer.

```java
int[] scores = new int[5];            // fragment: five ints, all 0
String[] names = new String[3];       // three references, all null
double[] prices = {4.5, 12.0, 7.25};  // initializer: length 3
```

Rules to remember:

- The length is chosen when the array is created and **never changes**. To "grow" an array you create a new, larger one and copy the elements (you will do this below).
- Elements receive default values, exactly like fields: `0` for numbers, `false` for booleans, `'\u0000'` for `char`, and `null` for references.
- Indexes start at **0**. An array of length 5 has indexes 0, 1, 2, 3, 4. The last index is always `length - 1`.
- `length` is a field, not a method: `scores.length`, not `scores.length()` (that is for `String`).

This program creates arrays in several ways and uses the common traversal patterns:

```java
import java.util.Arrays;

public class ArrayBasics {
    public static void main(String[] args) {
        int[] scores = new int[5];
        String[] names = new String[3];
        boolean[] flags = new boolean[2];
        System.out.println("defaults: " + Arrays.toString(scores) + " " + Arrays.toString(names) + " " + Arrays.toString(flags));

        scores[0] = 72;
        scores[1] = 95;
        scores[2] = 88;
        scores[3] = 61;
        scores[4] = 79;
        System.out.println("length " + scores.length + ", first " + scores[0] + ", last " + scores[scores.length - 1]);

        double[] prices = {4.5, 12.0, 7.25};
        String[] days = {"Mon", "Tue", "Wed"};
        System.out.println(Arrays.toString(prices) + " " + Arrays.toString(days));

        for (int i = 0; i < days.length; i++) {
            System.out.println("index " + i + " -> " + days[i]);
        }

        int total = 0;
        int best = scores[0];
        for (int score : scores) {
            total += score;
            if (score > best) {
                best = score;
            }
        }
        System.out.printf("total %d, best %d, average %.2f%n", total, best, (double) total / scores.length);

        for (int i = scores.length - 1; i >= 0; i--) {
            System.out.print(scores[i] + " ");
        }
        System.out.println("(backwards)");
    }
}
```

Output:

```text
defaults: [0, 0, 0, 0, 0] [null, null, null] [false, false]
length 5, first 72, last 79
[4.5, 12.0, 7.25] [Mon, Tue, Wed]
index 0 -> Mon
index 1 -> Tue
index 2 -> Wed
total 395, best 95, average 79.00
79 61 88 95 72 (backwards)
```

`Arrays.toString` produces readable text such as `[72, 95, 88]`. Printing an array variable directly with `System.out.println(scores)` does **not** show the elements; it prints something like `[I@1b6d3586`, a type code plus a hash that varies between runs. Always use `Arrays.toString` (or `Arrays.deepToString` for nested arrays).

## Traversal patterns

There are two loop styles for walking through an array, and each fits different jobs:

| Pattern | Syntax | Use when |
|---|---|---|
| Index loop | `for (int i = 0; i < a.length; i++)` | you need the index, want to modify elements, walk backwards, skip, or compare neighbors |
| Enhanced for | `for (int value : a)` | you only need each value, in order, read-only |
| Reverse index loop | `for (int i = a.length - 1; i >= 0; i--)` | processing from the end |

The enhanced `for` loop (also called for-each) is shorter and cannot go out of bounds, but its loop variable is a *copy* of each element: assigning to `value` inside the loop does not change the array. To modify elements, use an index loop and write `a[i] = ...`.

Most array algorithms are built from a few **accumulator** patterns you already used above:

- **Sum or count:** start at 0, add in the loop.
- **Maximum or minimum:** start with the first element (not with 0, which fails for all-negative arrays), and replace it when you find a better one.
- **Search:** loop until you find a match, remember its index, then `break`.

## Bounds and ArrayIndexOutOfBoundsException

Every array access is checked at run time. Reading or writing an index below 0 or at or above `length` throws `ArrayIndexOutOfBoundsException`. The most common cause is the off-by-one error of writing `<=` instead of `<`:

```java
public class OffByOne {
    public static void main(String[] args) {
        int[] values = {10, 20, 30};
        int sum = 0;
        for (int i = 0; i <= values.length; i++) {
            sum += values[i];
        }
        System.out.println(sum);
    }
}
```

```text
Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3
	at OffByOne.main(OffByOne.java:6)
```

The message tells you everything: the invalid index (3), the actual length (3), and the line (6). The fix is `i < values.length`. Bounds checking is a safety feature: in languages without it, an out-of-range write silently corrupts other memory, which is a classic source of security vulnerabilities.

## References and aliasing

This is the core idea of the chapter. An array is an **object** that lives in a memory area called the heap. The variable `a` does not contain the numbers; it contains a **reference** that points to the array object. So what does `int[] b = a;` do? It copies the *reference*, not the array. Now two variables point to one array. Two names for one object are called **aliases**.

```java
import java.util.Arrays;

public class Aliasing {
    public static void main(String[] args) {
        int[] a = {1, 2, 3};
        int[] b = a;
        b[0] = 9;
        System.out.println("after b[0] = 9: a = " + Arrays.toString(a) + ", b = " + Arrays.toString(b));
        System.out.println("a == b: " + (a == b));

        int[] copy = Arrays.copyOf(a, a.length);
        int[] cloned = a.clone();
        copy[1] = 100;
        cloned[2] = 300;
        System.out.println("a      = " + Arrays.toString(a));
        System.out.println("copy   = " + Arrays.toString(copy));
        System.out.println("cloned = " + Arrays.toString(cloned));

        int[] grown = Arrays.copyOf(a, 5);
        int[] middle = Arrays.copyOfRange(a, 1, 3);
        System.out.println("grown  = " + Arrays.toString(grown) + ", middle = " + Arrays.toString(middle));

        int[] target = new int[6];
        System.arraycopy(a, 0, target, 2, 3);
        System.out.println("arraycopy into target at 2: " + Arrays.toString(target));

        int[] sameContent = {9, 2, 3};
        System.out.println("a == sameContent: " + (a == sameContent) + ", Arrays.equals: " + Arrays.equals(a, sameContent));
    }
}
```

Output:

```text
after b[0] = 9: a = [9, 2, 3], b = [9, 2, 3]
a == b: true
a      = [9, 2, 3]
copy   = [9, 100, 3]
cloned = [9, 2, 300]
grown  = [9, 2, 3, 0, 0], middle = [2, 3]
arraycopy into target at 2: [0, 0, 9, 2, 3, 0]
a == sameContent: false, Arrays.equals: true
```

## What happens under the hood

Picture the memory after each step:

| Step | Variables | Heap objects |
|---|---|---|
| `int[] a = {1, 2, 3};` | `a` points to array #1 | array #1: `[1, 2, 3]` |
| `int[] b = a;` | `a` and `b` both point to array #1 | array #1: `[1, 2, 3]` |
| `b[0] = 9;` | unchanged | array #1: `[9, 2, 3]`, visible through both names |
| `int[] copy = Arrays.copyOf(a, a.length);` | `copy` points to array #2 | array #2: `[9, 2, 3]`, an independent object |
| `copy[1] = 100;` | unchanged | only array #2 changes |

`b[0] = 9` did not "change `b`"; it changed the one array that both `a` and `b` refer to. That is why reading `a[0]` afterwards gives 9. This behavior is not a quirk of arrays: it applies to every object in Java, including the objects you will design in Chapter 5.

The copying tools differ in how much control they give:

| Tool | Creates a new array? | Typical use |
|---|---|---|
| `int[] b = a;` | No, only a second reference | deliberately sharing one array |
| `a.clone()` | Yes, same length | quick full copy |
| `Arrays.copyOf(a, newLength)` | Yes, truncated or padded with defaults | copying, or growing an array |
| `Arrays.copyOfRange(a, from, to)` | Yes, `from` inclusive, `to` exclusive | extracting a slice |
| `System.arraycopy(src, srcPos, dest, destPos, length)` | No, copies into an existing array | fast bulk copies, shifting elements |

Two notes about copies:

- These are **shallow** copies. Copying an `int[]` copies the numbers, which is a full independent copy. Copying a `String[]` or an array of your own objects copies the *references*, so both arrays point at the same element objects. For immutable elements such as `String` that is harmless; Lesson 5 covers what to do with mutable elements.
- `==` on arrays compares references. `Arrays.equals(a, b)` compares length and elements.

## Arrays as method parameters and return values

Java always passes arguments **by value**. For an array argument, the value that is copied into the parameter is the *reference*. So the method and the caller share the same array object, but they have separate reference variables:

```java
import java.util.Arrays;

public class ArrayParameters {
    static void doubleEach(int[] values) {
        for (int i = 0; i < values.length; i++) {
            values[i] *= 2;
        }
    }

    static void replace(int[] values) {
        values = new int[] {0, 0, 0};
        System.out.println("  inside replace: " + Arrays.toString(values));
    }

    static int[] doubled(int[] values) {
        int[] result = new int[values.length];
        for (int i = 0; i < values.length; i++) {
            result[i] = values[i] * 2;
        }
        return result;
    }

    static int max(int[] values) {
        if (values.length == 0) {
            throw new IllegalArgumentException("values must not be empty");
        }
        int best = values[0];
        for (int value : values) {
            best = Math.max(best, value);
        }
        return best;
    }

    public static void main(String[] args) {
        int[] numbers = {1, 2, 3};
        doubleEach(numbers);
        System.out.println("after doubleEach: " + Arrays.toString(numbers));

        replace(numbers);
        System.out.println("after replace:    " + Arrays.toString(numbers));

        int[] fresh = doubled(numbers);
        System.out.println("doubled returns a new array: " + Arrays.toString(fresh) + ", original " + Arrays.toString(numbers));
        System.out.println("max = " + max(fresh));
    }
}
```

Output:

```text
after doubleEach: [2, 4, 6]
  inside replace: [0, 0, 0]
after replace:    [2, 4, 6]
doubled returns a new array: [4, 8, 12], original [2, 4, 6]
max = 12
```

- `doubleEach` **mutates** the shared array, so the caller sees the change. Its name and documentation must say so, because callers may not expect their data to change.
- `replace` reassigns its own parameter to a new array. The caller's variable still points to the original array, so nothing changes outside the method.
- `doubled` leaves the input alone and **returns a new array**. This style is usually safer and easier to test, because the caller's data never changes unexpectedly.
- `max` states its precondition by rejecting an empty array instead of returning a misleading value.

## Command-line arguments

The parameter of `main` is an array: `String[] args`. When you start a program, the words after the class or file name are placed in this array, split on spaces unless quoted:

```java
public class Greet {
    public static void main(String[] args) {
        System.out.println("received " + args.length + " argument(s)");
        for (int i = 0; i < args.length; i++) {
            System.out.println("  args[" + i + "] = \"" + args[i] + "\"");
        }
        if (args.length < 2) {
            System.err.println("Usage: java Greet.java <name> <times>");
            return;
        }
        String name = args[0];
        int times;
        try {
            times = Integer.parseInt(args[1]);
        } catch (NumberFormatException error) {
            System.err.println("times must be a whole number, got: " + args[1]);
            return;
        }
        for (int i = 1; i <= times; i++) {
            System.out.println(i + ". Hello, " + name + "!");
        }
    }
}
```

Three runs:

```bash
java Greet.java Amina 3
java Greet.java
java Greet.java "Ali Hassan" three
```

```text
received 2 argument(s)
  args[0] = "Amina"
  args[1] = "3"
1. Hello, Amina!
2. Hello, Amina!
3. Hello, Amina!
```

```text
received 0 argument(s)
Usage: java Greet.java <name> <times>
```

```text
received 2 argument(s)
  args[0] = "Ali Hassan"
  args[1] = "three"
times must be a whole number, got: three
```

Key points: `args` is never `null`; with no arguments it is an empty array, so **check `args.length` before reading `args[0]`**, or the program crashes with `ArrayIndexOutOfBoundsException`. Every argument is a `String`, so numbers must be parsed and validated exactly like console input. Quotes group words into one argument. In an IDE, you set arguments in the run configuration.

## The java.util.Arrays toolkit

The `Arrays` class contains static helper methods for common array tasks:

```java
import java.util.Arrays;

public class ArraysToolkit {
    public static void main(String[] args) {
        int[] numbers = {42, 7, 19, 3, 25};
        System.out.println("original:      " + Arrays.toString(numbers));

        int[] sorted = numbers.clone();
        Arrays.sort(sorted);
        System.out.println("sorted copy:   " + Arrays.toString(sorted));
        System.out.println("index of 19:   " + Arrays.binarySearch(sorted, 19));

        String[] words = {"pear", "Apple", "banana"};
        Arrays.sort(words);
        System.out.println("sorted words:  " + Arrays.toString(words));

        char[] line = new char[10];
        Arrays.fill(line, '-');
        System.out.println("filled chars:  " + new String(line));

        int[] zeros = new int[4];
        Arrays.fill(zeros, 1, 3, 7);
        System.out.println("partial fill:  " + Arrays.toString(zeros));

        int[] other = {42, 7, 19, 3, 25};
        System.out.println("equal content: " + Arrays.equals(numbers, other));
        System.out.println("sum via stream: " + Arrays.stream(numbers).sum());
    }
}
```

Output:

```text
original:      [42, 7, 19, 3, 25]
sorted copy:   [3, 7, 19, 25, 42]
index of 19:   2
sorted words:  [Apple, banana, pear]
filled chars:  ----------
partial fill:  [0, 7, 7, 0]
equal content: true
sum via stream: 96
```

| Method | Purpose | Watch out for |
|---|---|---|
| `Arrays.toString(a)` | readable text of a one-dimensional array | use `deepToString` for nested arrays |
| `Arrays.sort(a)` | sorts in place, ascending | modifies the array; sort a copy to keep the original |
| `Arrays.binarySearch(a, key)` | fast search in a **sorted** array | result is meaningless on unsorted data (Chapter 10) |
| `Arrays.fill(a, value)` / `fill(a, from, to, value)` | sets elements | `to` is exclusive |
| `Arrays.equals(a, b)` | compares elements | `a == b` compares references |
| `Arrays.copyOf`, `copyOfRange` | copies | shallow copy for object arrays |
| `Arrays.stream(a)` | turns the array into a stream | Chapter 14 covers streams |

Notice that `"Apple"` sorted before `"banana"` and `"pear"`: strings sort by character codes, and uppercase letters have smaller codes than lowercase ones. Case-insensitive sorting needs a comparator, covered in Chapter 7.

## Two-dimensional and jagged arrays

A two-dimensional array is an **array of arrays**. `int[][] sales` is an array whose elements are `int[]` rows. `sales[1][2]` means "row 1, then element 2 of that row". Because each row is its own array object, rows can even have different lengths; such arrays are called **jagged**.

```java
import java.util.Arrays;

public class Grid {
    public static void main(String[] args) {
        int[][] sales = {
            {12, 15, 9},
            {7, 22, 14},
            {18, 11, 20}
        };
        System.out.println("rows " + sales.length + ", columns " + sales[0].length);
        System.out.println("store 1, day 2: " + sales[1][2]);
        System.out.println(Arrays.deepToString(sales));

        System.out.println("         Day0 Day1 Day2  Total");
        for (int row = 0; row < sales.length; row++) {
            int rowTotal = 0;
            System.out.printf("Store %d ", row);
            for (int col = 0; col < sales[row].length; col++) {
                System.out.printf("%5d", sales[row][col]);
                rowTotal += sales[row][col];
            }
            System.out.printf("%7d%n", rowTotal);
        }

        int[] columnTotals = new int[sales[0].length];
        for (int[] row : sales) {
            for (int col = 0; col < row.length; col++) {
                columnTotals[col] += row[col];
            }
        }
        System.out.println("column totals: " + Arrays.toString(columnTotals));

        int[][] triangle = new int[4][];
        for (int row = 0; row < triangle.length; row++) {
            triangle[row] = new int[row + 1];
            triangle[row][0] = 1;
            triangle[row][row] = 1;
            for (int col = 1; col < row; col++) {
                triangle[row][col] = triangle[row - 1][col - 1] + triangle[row - 1][col];
            }
        }
        for (int[] row : triangle) {
            System.out.println(Arrays.toString(row));
        }
    }
}
```

Output:

```text
rows 3, columns 3
store 1, day 2: 14
[[12, 15, 9], [7, 22, 14], [18, 11, 20]]
         Day0 Day1 Day2  Total
Store 0    12   15    9     36
Store 1     7   22   14     43
Store 2    18   11   20     49
column totals: [37, 48, 43]
[1]
[1, 1]
[1, 2, 1]
[1, 3, 3, 1]
```

- `sales.length` is the number of rows; `sales[row].length` is the length of one row. Use `sales[row].length` in the inner loop so the code also works for jagged arrays.
- Row totals come from summing across the inner loop; column totals need an accumulator array indexed by column.
- `new int[4][]` creates the outer array with four `null` rows; each row is created separately with its own length, forming Pascal's triangle.

## Common mistakes

**1. Using `<=` with `length`.** `for (int i = 0; i <= a.length; i++)` reads one element too many. Use `<`.

**2. Assuming assignment copies an array.** `int[] backup = data;` is not a backup; it is a second name for the same array. Use `data.clone()` or `Arrays.copyOf`.

**3. Sorting the caller's array by accident.** `Arrays.sort(input)` inside a method reorders the caller's data. Sort a copy unless the method's contract says it sorts in place.

**4. Printing an array directly.** `System.out.println(a)` prints `[I@...`. Use `Arrays.toString(a)`.

**5. Comparing arrays with `==`.** It checks whether two references point to the same array. Use `Arrays.equals` (or `Arrays.deepEquals` for nested arrays).

**6. Starting a maximum search at 0.** For `{-5, -2, -9}`, a maximum initialized to 0 returns 0, which is not even in the array. Start from the first element.

**7. Reading `args[0]` without checking `args.length`.** A program run without arguments crashes.

**8. Modifying the loop variable of an enhanced for.** `for (int v : a) { v = 0; }` changes only the local copy; the array is untouched.

## Best practices

- Prefer the enhanced `for` loop for read-only traversal and an index loop when you need positions or updates.
- Write loop bounds as `i < array.length`, never with a hard-coded number.
- Decide explicitly whether a method mutates its array argument or returns a new array, and name and document it accordingly. Returning a new array is the safer default.
- Copy arrays when you need an independent snapshot; remember that copies of object arrays are shallow.
- Validate array arguments: reject empty arrays when a result would be meaningless, and check `args.length` before using command-line arguments.
- Use `Arrays.toString`, `Arrays.equals`, and `Arrays.sort` instead of reinventing them.
- When you need a collection that grows and shrinks, use `ArrayList` (Chapter 9) instead of manually resizing arrays.

## Summary

- An array stores a fixed number of elements of one type, indexed from 0 to `length - 1`, with default values for new elements.
- Accessing an index outside that range throws `ArrayIndexOutOfBoundsException`; `<` versus `<=` in loops is the classic cause.
- An array variable holds a reference. `int[] b = a;` creates an alias, so after `b[0] = 9`, reading `a[0]` gives 9.
- `clone`, `Arrays.copyOf`, `Arrays.copyOfRange`, and `System.arraycopy` create or fill independent (shallow) copies.
- Arrays passed to methods share the same object: element changes are visible to the caller, but reassigning the parameter is not.
- `main(String[] args)` receives command-line arguments as strings; check `args.length` first.
- Two-dimensional arrays are arrays of arrays, and rows can have different lengths.

## Practice

Warm-up:

1. Create an array of the seven day names and print them with an index loop, with an enhanced for loop, and backwards.
2. Given `int[] temps = {18, 21, 19, 25, 17};`, print the minimum, maximum, and average temperature.
3. Predict the output, then run it: `int[] x = {1, 2}; int[] y = x; y[1] = 5; x = new int[] {7, 8}; System.out.println(Arrays.toString(y));`

Core:

1. Write `static int indexOf(int[] values, int target)` that returns the first index of `target` or -1. Test it with an empty array, a missing value, and a value that appears twice.
2. Write `static int[] append(int[] values, int extra)` that returns a new array one element longer, without changing the original. Prove non-mutation by printing the original after the call.
3. Write a program that takes numbers as command-line arguments, rejects any argument that is not an integer with a clear message, and prints their sum and average.

Challenge:

1. Write `static int[][] transpose(int[][] matrix)` that turns rows into columns for a rectangular matrix. Test it with a 2 by 3 matrix and print the result with `Arrays.deepToString`.
2. Write `static void rotateRight(int[] values, int steps)` that shifts elements to the right in place, wrapping around, for any `steps` including values larger than the length and negative values. (Hint: `Math.floorMod` from Chapter 2.)

## Check your understanding

1. An array of length 8 is created with `new double[8]`. What are its valid indexes, and what value does each element hold initially?
2. After `int[] backup = scores; scores[2] = 0;`, does `backup[2]` still hold the old value? Why?
3. What is the difference between `a == b` and `Arrays.equals(a, b)` for two arrays?
4. A method receives an `int[]` and assigns `values = new int[10];` inside. Does the caller's array change? What would change it?
5. What does `Arrays.copyOf(new int[] {4, 5}, 4)` return?
6. Why should a program check `args.length` before reading `args[0]`?
