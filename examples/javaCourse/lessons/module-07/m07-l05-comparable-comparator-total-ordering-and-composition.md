# Comparable, Comparator, total ordering, and composition

Sorting looks like a solved problem: call `sort` and move on. In real systems, though, ordering carries business meaning. Which support ticket is handled first? Which version is "newest"? Which invoices appear on page one? Ordering also decides *uniqueness* in sorted collections such as `TreeSet` and `TreeMap`, where a careless comparator can silently delete data.

Java expresses ordering with two interfaces. `Comparable` gives a type one built-in *natural order*. `Comparator` describes any number of *external* orders, and can be composed from small pieces like building blocks.

## What you will learn

- How `compareTo` and `compare` communicate order with negative, zero, and positive results
- How to give a class a natural order by implementing `Comparable<T>`
- How to write a `Comparator` as a class, and how to build one from `comparing`, `thenComparing`, `reversed`, and `nullsLast`
- What makes an ordering *total* and *consistent*, and why subtraction is a broken comparison
- Why a `TreeSet` treats "compares as zero" as "same element", and how that can lose data
- How to choose between natural order and a comparator

## The comparison protocol

Both interfaces use the same convention. For `a.compareTo(b)` or `comparator.compare(a, b)`:

| Result | Meaning |
|---|---|
| negative (any value below 0) | `a` comes **before** `b` |
| zero | `a` and `b` are in the **same position** in this order |
| positive (any value above 0) | `a` comes **after** `b` |

Only the sign matters. Never test `result == -1`; test `result < 0`.

The JDK helpers `Integer.compare(x, y)`, `Long.compare`, `Double.compare`, and `Boolean.compare` return correct signs for primitives. For objects that already have an order, such as `String` or `LocalDate`, call their `compareTo`.

## Comparable: the natural order

A class implements `Comparable<T>` when there is one obvious, universal way to order its instances: numbers by value, dates chronologically, versions by major/minor/patch. Many JDK types already do (`String`, `Integer`, `LocalDate`, `BigDecimal`), which is why `Collections.sort(listOfStrings)` just works.

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TreeSet;

public class NaturalOrder {
    public static void main(String[] args) {
        List<Version> versions = new ArrayList<>(List.of(
                new Version(1, 10, 0), new Version(1, 2, 5), new Version(2, 0, 0), new Version(1, 2, 0)));

        Collections.sort(versions);                 // uses compareTo
        System.out.println("Sorted:  " + versions);
        System.out.println("Newest:  " + Collections.max(versions));
        System.out.println("1.2.0 vs 1.10.0: " + new Version(1, 2, 0).compareTo(new Version(1, 10, 0)));
        System.out.println("2.0.0 vs 1.10.0: " + new Version(2, 0, 0).compareTo(new Version(1, 10, 0)));
        System.out.println("1.2.5 vs 1.2.5:  " + new Version(1, 2, 5).compareTo(new Version(1, 2, 5)));

        TreeSet<Version> releases = new TreeSet<>(versions);
        releases.add(new Version(1, 2, 5));         // equal by compareTo: not added again
        System.out.println("TreeSet: " + releases);

        // Many JDK types already have a natural order:
        List<String> words = new ArrayList<>(List.of("pear", "Apple", "banana"));
        Collections.sort(words);
        System.out.println("Strings: " + words);    // uppercase sorts before lowercase
    }
}

record Version(int major, int minor, int patch) implements Comparable<Version> {
    @Override
    public int compareTo(Version other) {
        int result = Integer.compare(major, other.major);
        if (result != 0) return result;
        result = Integer.compare(minor, other.minor);
        if (result != 0) return result;
        return Integer.compare(patch, other.patch);
    }

    @Override
    public String toString() {
        return major + "." + minor + "." + patch;
    }
}
```

```text
Sorted:  [1.2.0, 1.2.5, 1.10.0, 2.0.0]
Newest:  2.0.0
1.2.0 vs 1.10.0: -1
2.0.0 vs 1.10.0: 1
1.2.5 vs 1.2.5:  0
TreeSet: [1.2.0, 1.2.5, 1.10.0, 2.0.0]
Strings: [Apple, banana, pear]
```

Notice two details. Version `1.10.0` correctly sorts after `1.2.5` because we compare numbers, not text (as strings, `"1.10.0"` would sort before `"1.2.5"`). And `String`'s natural order compares character codes, so `"Apple"` sorts before `"banana"` only because uppercase letters have smaller codes; that is not the alphabetical order humans expect.

### What happens if a type has no natural order

`TreeSet` and `Collections.sort` without a comparator assume the elements are `Comparable`. If they are not, the failure happens at run time:

```java
// Fragment: Box does not implement Comparable
TreeSet<Box> boxes = new TreeSet<>();
boxes.add(new Box(3));
```

```text
Exception in thread "main" java.lang.ClassCastException: class Box cannot be cast to class java.lang.Comparable
```

Fix: implement `Comparable<Box>` if there is one obvious order, or pass a `Comparator<Box>` to the `TreeSet` constructor.

## Comparator: orders chosen from the outside

Often there is no single "natural" order. Tasks may be sorted by title in one screen, by deadline in another, by priority in a scheduler. A `Comparator<T>` is a separate object whose `compare(a, b)` method defines one such order, without changing the class being sorted. You can even sort classes you do not own.

The most explicit way is a class that implements `Comparator`:

```java
// Fragment
final class ByTitle implements Comparator<Task> {
    @Override
    public int compare(Task a, Task b) {
        return a.title().compareTo(b.title());
    }
}
```

In modern Java you will more often build comparators with **factory methods**. They take a *key extractor*: a function that pulls the sort key out of an element. The compact notation `Task::priority` is a **method reference** meaning "given a task, call its `priority()` method". Lambdas and method references are covered fully in a later chapter; for now, read `Comparator.comparingInt(Task::priority)` as "compare tasks by their priority".

| Method | Purpose |
|---|---|
| `Comparator.comparing(keyExtractor)` | order by a `Comparable` key (such as a `String` or date) |
| `Comparator.comparingInt / comparingLong / comparingDouble` | order by a primitive key, without boxing |
| `.thenComparing(...)` | tie-breaker used only when the previous comparison returns 0 |
| `.reversed()` | reverse the *entire* comparator built so far |
| `Comparator.naturalOrder() / reverseOrder()` | the natural order of a `Comparable` type, or its reverse |
| `Comparator.nullsFirst(c) / nullsLast(c)` | put `null` values first or last, then use `c` for the rest |

### Composing a real ordering

A task list should show high priority first, then earliest deadline, with tasks that have no deadline at the end, and finally a stable ID tie-breaker so the order is fully deterministic.

```java
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class ComparatorComposition {
    public static void main(String[] args) {
        List<Task> tasks = new ArrayList<>(List.of(
                new Task(3, "Write report", 2, LocalDate.of(2026, 10, 5)),
                new Task(1, "Fix login bug", 5, LocalDate.of(2026, 10, 1)),
                new Task(4, "Refactor tests", 2, null),
                new Task(2, "Deploy", 5, LocalDate.of(2026, 9, 30)),
                new Task(5, "Update docs", 2, LocalDate.of(2026, 10, 5))));

        // 1) A comparator written as an ordinary class
        tasks.sort(new ByTitle());
        print("By title (class)", tasks);

        // 2) Built from factory methods and composed
        Comparator<Task> planning =
                Comparator.comparingInt(Task::priority).reversed()              // high priority first
                        .thenComparing(Task::deadline,
                                Comparator.nullsLast(Comparator.naturalOrder())) // missing deadline last
                        .thenComparingInt(Task::id);                            // final tie-breaker

        tasks.sort(planning);
        print("Planning order", tasks);

        tasks.sort(planning.reversed());
        print("Reversed planning", tasks);
    }

    static void print(String heading, List<Task> tasks) {
        System.out.println(heading + ":");
        for (Task t : tasks) {
            System.out.println("  " + t);
        }
    }
}

record Task(int id, String title, int priority, LocalDate deadline) {
    @Override
    public String toString() {
        return "#" + id + " p" + priority + " " + (deadline == null ? "no-date" : deadline) + " " + title;
    }
}

final class ByTitle implements Comparator<Task> {
    @Override
    public int compare(Task a, Task b) {
        return a.title().compareTo(b.title());
    }
}
```

```text
By title (class):
  #2 p5 2026-09-30 Deploy
  #1 p5 2026-10-01 Fix login bug
  #4 p2 no-date Refactor tests
  #5 p2 2026-10-05 Update docs
  #3 p2 2026-10-05 Write report
Planning order:
  #2 p5 2026-09-30 Deploy
  #1 p5 2026-10-01 Fix login bug
  #3 p2 2026-10-05 Write report
  #5 p2 2026-10-05 Update docs
  #4 p2 no-date Refactor tests
Reversed planning:
  #4 p2 no-date Refactor tests
  #5 p2 2026-10-05 Update docs
  #3 p2 2026-10-05 Write report
  #1 p5 2026-10-01 Fix login bug
  #2 p5 2026-09-30 Deploy
```

### Trace: how the composed comparator decides between #3 and #5

1. Priority: both are 2, so `comparingInt(...).reversed()` returns 0. Undecided.
2. Deadline: both are 2026-10-05. Neither is null, so natural date order returns 0. Still undecided.
3. ID: `Integer.compare(3, 5)` is negative, so #3 comes first.

Each `thenComparing` is consulted **only** when everything before it returned zero. That is also why the position of `.reversed()` matters: calling it right after `comparingInt(...)` reverses only the priority; calling it at the end (as in `planning.reversed()`) reverses the whole chain, including the null handling and the ID tie-breaker.

## Total ordering: the comparator contract

A sort algorithm or a `TreeMap` trusts the comparator completely. For all `a`, `b`, `c`, a valid comparator must be:

1. **Antisymmetric in sign:** `sgn(compare(a, b)) == -sgn(compare(b, a))`.
2. **Transitive:** if `a` is before `b` and `b` is before `c`, then `a` is before `c`.
3. **Consistent with its own zeros:** if `compare(a, b) == 0`, then `a` and `b` compare the same way against every other element.

An ordering in which every pair is comparable and these rules hold is a **total order**. When the rules are broken, results are unpredictable: lists sort in strange orders, `TreeMap` lookups miss keys, and `List.sort` may even throw `IllegalArgumentException: Comparison method violates its general contract!`.

### The subtraction trap

Returning `a - b` looks like a neat shortcut, but `int` subtraction overflows. The lambda `(a, b) -> a - b` below is a compact way to write a comparator inline.

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class SubtractionOverflow {
    public static void main(String[] args) {
        Comparator<Integer> subtraction = (a, b) -> a - b;        // looks clever, is broken
        Comparator<Integer> safe = Integer::compare;

        int low = Integer.MIN_VALUE;
        int high = 1;
        System.out.println("subtraction.compare(MIN_VALUE, 1) = " + subtraction.compare(low, high));
        System.out.println("safe.compare(MIN_VALUE, 1)        = " + safe.compare(low, high));

        List<Integer> values = new ArrayList<>(List.of(5, Integer.MIN_VALUE, 1, Integer.MAX_VALUE, -3));
        values.sort(subtraction);
        System.out.println("Sorted with subtraction: " + values);
        values.sort(safe);
        System.out.println("Sorted with compare:     " + values);
    }
}
```

```text
subtraction.compare(MIN_VALUE, 1) = 2147483647
safe.compare(MIN_VALUE, 1)        = -1
Sorted with subtraction: [1, 5, 2147483647, -2147483648, -3]
Sorted with compare:     [-2147483648, -3, 1, 5, 2147483647]
```

`MIN_VALUE - 1` wraps around to `MAX_VALUE`, so the smallest possible number claims to be larger than 1. Always use `Integer.compare` or `comparingInt`.

## Sorted collections: zero means "same position"

`TreeSet` and `TreeMap` do not use `equals` or `hashCode` at all. They keep elements in a sorted tree and use **only** `compare` (or `compareTo`) to decide where an element goes. If the comparison returns zero, the tree concludes the new element occupies the same position as an existing one, so `TreeSet.add` rejects it and `TreeMap.put` replaces that entry's value.

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.TreeSet;

public class TreeSetCollapse {
    public static void main(String[] args) {
        List<Person> people = List.of(
                new Person("Lin", 30), new Person("Ada", 30), new Person("Sam", 25), new Person("Ada", 30));

        Comparator<Person> byAge = Comparator.comparingInt(Person::age);
        TreeSet<Person> byAgeOnly = new TreeSet<>(byAge);
        byAgeOnly.addAll(people);
        System.out.println("TreeSet by age only:     " + byAgeOnly);

        Comparator<Person> byAgeThenName = byAge.thenComparing(Person::name);
        TreeSet<Person> fullOrder = new TreeSet<>(byAgeThenName);
        fullOrder.addAll(people);
        System.out.println("TreeSet by age then name:" + " " + fullOrder);

        // A List keeps every element; sorting never removes anything.
        List<Person> sorted = new ArrayList<>(people);
        sorted.sort(byAge);
        System.out.println("List sorted by age:      " + sorted);

        Person lin = new Person("Lin", 30);
        Person ada = new Person("Ada", 30);
        System.out.println("byAge.compare(lin, ada) = " + byAge.compare(lin, ada)
                + ", lin.equals(ada) = " + lin.equals(ada));
    }
}

record Person(String name, int age) {
    @Override
    public String toString() {
        return name + "(" + age + ")";
    }
}
```

```text
TreeSet by age only:     [Sam(25), Lin(30)]
TreeSet by age then name: [Sam(25), Ada(30), Lin(30)]
List sorted by age:      [Sam(25), Lin(30), Ada(30), Ada(30)]
byAge.compare(lin, ada) = 0, lin.equals(ada) = false
```

The age-only set lost Ada: her comparison with Lin returned zero, so the tree saw her as a duplicate even though `equals` says they are different people. The second set keeps both, and correctly keeps only one of the two identical `Ada(30)` records. The sorted `List` kept all four elements: sorting reorders, it never removes. Also note that `List.sort` is **stable**: elements that compare equal keep their original relative order (Lin stayed before Ada).

### Consistent with equals

An ordering is *consistent with equals* when `compare(a, b) == 0` exactly when `a.equals(b)`. Sorted sets and maps behave like normal sets and maps only for such orderings. A famous JDK exception: `new BigDecimal("2.0").compareTo(new BigDecimal("2.00"))` is 0, but `equals` is false because the scales differ. So a `HashSet` keeps both values while a `TreeSet` keeps one.

> **Tip:** Before putting objects into a `TreeSet` or using them as `TreeMap` keys, ask: "Would I ever consider two elements with comparison zero to be different things?" If yes, add tie-breakers until the comparator distinguishes everything your uniqueness policy distinguishes.

## Comparable or Comparator?

| Question | Comparable (`compareTo`) | Comparator (`compare`) |
|---|---|---|
| Where is it defined? | inside the class itself | in a separate object |
| How many orders? | exactly one natural order | as many as you need |
| Can you use it on classes you do not own? | no | yes |
| Used automatically by | `Collections.sort(list)`, `TreeSet<>()`, `Collections.max` | passed explicitly: `list.sort(c)`, `new TreeSet<>(c)` |
| Typical examples | numbers, dates, versions, money in one currency | "by title", "by priority then deadline", screen-specific sorts |

Implement `Comparable` only when the order is obvious and would surprise nobody. Everything else belongs in named comparators, often as constants such as `static final Comparator<Task> BY_DEADLINE`.

## Common mistakes

### 1. Subtraction-based comparison

```java
// Wrong
Comparator<Integer> c = (a, b) -> a - b;
```

Wrong result for extreme values, as shown above. Fix: `Integer::compare` or `Comparator.comparingInt(...)`.

### 2. No tie-breaker in a sorted set or map

A `TreeSet` ordered only by age keeps just one person per age. Fix: `thenComparing` by further fields until the comparator matches your uniqueness rules, typically ending with a unique ID.

### 3. Misplaced reversed()

`comparing(Task::priority).thenComparing(Task::title).reversed()` reverses the title order too. If you only wanted descending priority, reverse just that part: `comparing(Task::priority, Comparator.reverseOrder()).thenComparing(Task::title)`.

### 4. Ignoring nulls

`Comparator.comparing(Task::deadline)` throws `NullPointerException` when a deadline is `null`. Fix: decide the policy explicitly with `nullsFirst` or `nullsLast`, or model "no deadline" without null.

### 5. Checking for exactly -1 or 1

`if (a.compareTo(b) == -1)` fails for implementations that return -7. Fix: compare with `< 0`, `> 0`, `== 0`.

## Best practices

- Use `Integer.compare` and the `comparingX` factories; never subtract.
- End every business ordering with a unique tie-breaker so that output is deterministic and sorted collections keep distinct elements.
- Make the null policy explicit and document it.
- Keep `compareTo` consistent with `equals` whenever possible, and document it when it is not.
- Name reusable comparators as constants, which makes intent readable at call sites.
- Test comparators with at least three values (for transitivity), equal values, `null` where allowed, and extreme values such as `Integer.MIN_VALUE`.

## Summary

- `compareTo` and `compare` return a negative, zero, or positive number; only the sign matters.
- `Comparable<T>` gives a class one natural order used automatically by sorting and sorted collections.
- `Comparator<T>` defines external orders and composes with `comparing`, `thenComparing`, `reversed`, and `nullsFirst`/`nullsLast`.
- A valid comparator is a total order: sign-antisymmetric, transitive, and consistent in its zeros. Subtraction breaks it through overflow.
- `TreeSet` and `TreeMap` use only the comparison: a zero result means the same position, regardless of what `equals` says.
- Sorting a list never removes elements and is stable; a sorted set can silently drop elements when the comparator ignores distinguishing fields.

## Practice

### Warm-up

1. Implement `Comparable<Temperature>` for a record holding degrees Celsius as a `double`, using `Double.compare`. Sort a list and find the maximum.
2. Sort a list of strings case-insensitively using `String.CASE_INSENSITIVE_ORDER`, and compare the result with natural order.

### Core

1. Sort tasks by descending priority, ascending deadline, then ID. Define how missing deadlines are ordered with `nullsFirst` or `nullsLast` and justify the choice.
2. Construct three values `a`, `b`, `c` and write checks that your comparator is transitive. Include `Integer.MIN_VALUE` and `Integer.MAX_VALUE` among your test values.
3. Put students into a `TreeSet` ordered only by grade. Show which students disappear, then fix the comparator.

### Challenge

1. Write a `Version` comparator that also handles an optional pre-release label (`1.2.0-beta` sorts before `1.2.0`). Test at least eight versions and check that the order is total.
2. Explain in writing the difference between the stable sorting of a `List` and uniqueness in a `TreeSet`, using one example where both are given the same comparator.

## Check your understanding

1. What do negative, zero, and positive results from `compare` mean, and why should you never test for exactly -1?
2. When should a class implement `Comparable`, and when should you write a `Comparator` instead?
3. How does `thenComparing` decide whether to run at all?
4. Why can a `TreeSet` that is sorted only by one field lose elements that `equals` considers different?
5. Why is `(a, b) -> a - b` an incorrect comparator for `int` values?
6. What does it mean for an ordering to be consistent with equals, and what happens in a sorted set when it is not?
