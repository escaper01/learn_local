# Collectors, grouping, partitioning, mapping, and merge policies

`collect` is the terminal operation for turning a stream back into a concrete data structure — a `List`, a `Set`, a `Map`, a joined `String`, or something far more elaborate — and `Collectors` is the standard library's toolbox of ready-made collecting strategies for doing so. This lesson covers the everyday collectors (`toList`, `toSet`, `toMap`, `joining`), the two workhorse operations for organizing elements into categories (`groupingBy` and `partitioningBy`), and the specific rule `Collectors.toMap` enforces the moment two elements produce the same key.

What you will learn:

- `Collectors.toList`, `toSet`, `toMap`, and `joining`: the everyday building blocks
- Why `Collectors.toMap` throws when two elements map to the same key, and how a merge function resolves that collision
- `groupingBy`: classifying elements into a `Map` of buckets, optionally with a downstream collector like `counting` or `summingInt`
- `partitioningBy`: a specialized two-bucket grouping by a `boolean` condition, which always produces both buckets even when one is empty
- Combining `mapping` with `groupingBy` to transform elements on their way into each bucket

## The everyday collectors

`Collectors.toList()`/`toSet()` collect a stream's elements into a `List`/`Set`; `Collectors.joining(delimiter, prefix, suffix)` builds a single `String`; `Collectors.toMap(keyFn, valueFn)` builds a `Map` from a key-extracting and a value-extracting function applied to each element.

```java
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

public class BasicCollectors {
    public static void main(String[] args) {
        List<String> words = List.of("apple", "banana", "apple", "cherry");

        List<String> asList = words.stream().collect(Collectors.toList());
        System.out.println("toList: " + asList);

        Set<String> asSet = words.stream().collect(Collectors.toSet());
        System.out.println("toSet size (duplicates removed): " + asSet.size());

        String joined = words.stream().distinct().collect(Collectors.joining(", ", "[", "]"));
        System.out.println("joined: " + joined);

        Map<String, Integer> nameToLength = words.stream().distinct()
                .collect(Collectors.toMap(w -> w, String::length));
        System.out.println("name to length: " + nameToLength);
    }
}
```

Output:

```text
toList: [apple, banana, apple, cherry]
toSet size (duplicates removed): 3
joined: [apple, banana, cherry]
name to length: {banana=6, apple=5, cherry=6}
```

`toList()` preserves every element, including duplicates and order, exactly as encountered; `toSet()` naturally collapses duplicates, since a `Set` cannot hold two equal elements at all. `Collectors.joining(", ", "[", "]")` produces a single formatted `String` with the given delimiter between elements and the given prefix/suffix around the whole thing — a common, readable alternative to manually looping and building a `StringBuilder`. The resulting `Map`'s printed order (`banana`, `apple`, `cherry`) reflects `HashMap`'s internal bucket layout, not insertion order — never rely on a plain `Collectors.toMap` result's iteration order unless you specifically request a different `Map` implementation.

## toMap and duplicate keys: why a merge policy is required

`Collectors.toMap(keyFn, valueFn)` (the two-argument form) has no idea what to do if two different elements produce the *same* key — and rather than silently picking one arbitrarily and discarding data, it throws `IllegalStateException` the moment a collision occurs. The three-argument overload adds a merge function specifying exactly how to combine two colliding values.

```java
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class ToMapCollisions {
    record Employee(String department, String name, int salary) {}

    public static void main(String[] args) {
        List<Employee> employees = List.of(
                new Employee("eng", "Ada", 100),
                new Employee("eng", "Linus", 120),
                new Employee("sales", "Grace", 90)
        );

        try {
            Map<String, String> departmentToName = employees.stream()
                    .collect(Collectors.toMap(Employee::department, Employee::name));
            System.out.println("this line should not print: " + departmentToName);
        } catch (IllegalStateException e) {
            System.out.println("duplicate department key without a merge policy: " + e.getMessage());
        }

        Map<String, String> departmentToNames = employees.stream()
                .collect(Collectors.toMap(Employee::department, Employee::name, (a, b) -> a + " & " + b));
        System.out.println("with a merge policy: " + departmentToNames);
    }
}
```

Output:

```text
duplicate department key without a merge policy: Duplicate key eng (attempted merging values Ada and Linus)
with a merge policy: {sales=Grace, eng=Ada & Linus}
```

This is exactly the chapter's concept-check question: **a `toMap` collector must specify a merge policy** the moment duplicate keys are possible — not a custom `hashCode` on the key type (irrelevant here; `eng` collides with itself, not because of a bad hash implementation) and not any kind of random ordering. The two-argument overload's exception message is genuinely informative — it names the exact colliding key and both values that could not be reconciled — but the *fix* is always to supply a third-argument merge function describing what should happen: keep the first value, keep the last, combine them (as shown here, joining both names with `&`), or sum them if the values are numeric.

## groupingBy: classifying elements into buckets

`Collectors.groupingBy(classifier)` produces a `Map<K, List<T>>`, grouping every element under the key its classifier function returns. Supplying a second, **downstream** collector changes what ends up in each bucket — a count, a sum, a transformed list — instead of always defaulting to a plain `List` of the original elements.

```java
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class GroupingByDemo {
    record Employee(String department, String name, int salary) {}

    public static void main(String[] args) {
        List<Employee> employees = List.of(
                new Employee("eng", "Ada", 100),
                new Employee("eng", "Linus", 120),
                new Employee("sales", "Grace", 90),
                new Employee("sales", "Hedy", 95)
        );

        Map<String, List<String>> byDepartment = employees.stream()
                .collect(Collectors.groupingBy(Employee::department, Collectors.mapping(Employee::name, Collectors.toList())));
        System.out.println("names by department: " + byDepartment);

        Map<String, Long> countByDepartment = employees.stream()
                .collect(Collectors.groupingBy(Employee::department, Collectors.counting()));
        System.out.println("count by department: " + countByDepartment);

        Map<String, Integer> totalSalaryByDepartment = employees.stream()
                .collect(Collectors.groupingBy(Employee::department, Collectors.summingInt(Employee::salary)));
        System.out.println("total salary by department: " + totalSalaryByDepartment);
    }
}
```

Output:

```text
names by department: {sales=[Grace, Hedy], eng=[Ada, Linus]}
count by department: {sales=2, eng=2}
total salary by department: {sales=185, eng=220}
```

`Collectors.mapping(Employee::name, Collectors.toList())` is itself a downstream collector: it transforms each `Employee` into just its `name` *before* collecting the group into a `List`, so each department maps to a `List<String>` of names rather than a `List<Employee>` of full records. `Collectors.counting()` and `Collectors.summingInt(...)` are similarly composable downstream collectors — `groupingBy`'s real power comes from this composition: one classifier deciding *which* bucket an element belongs to, paired with any downstream collector deciding *what shape* each bucket's contents should take.

## partitioningBy: exactly two buckets, both always present

`Collectors.partitioningBy(predicate)` is a specialized form of grouping restricted to a `boolean` classifier, always producing a `Map<Boolean, List<T>>` with **exactly** two keys, `true` and `false` — even when every single element falls into just one of them, the other key is still present, mapped to an empty list.

```java
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class PartitioningByDemo {
    public static void main(String[] args) {
        List<Integer> numbers = List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

        Map<Boolean, List<Integer>> partitioned = numbers.stream()
                .collect(Collectors.partitioningBy(n -> n % 2 == 0));
        System.out.println("evens: " + partitioned.get(true));
        System.out.println("odds: " + partitioned.get(false));

        Map<Boolean, List<Integer>> allOdd = List.of(1, 3, 5).stream()
                .collect(Collectors.partitioningBy(n -> n % 2 == 0));
        System.out.println("no evens at all, but the true key still exists: " + allOdd.containsKey(true));
        System.out.println("true bucket is simply empty: " + allOdd.get(true));
    }
}
```

Output:

```text
evens: [2, 4, 6, 8, 10]
odds: [1, 3, 5, 7, 9]
no evens at all, but the true key still exists: true
true bucket is simply empty: []
```

This is `partitioningBy`'s defining guarantee, and the specific reason to reach for it instead of `groupingBy` with a boolean classifier: the resulting `Map` always has both `Boolean.TRUE` and `Boolean.FALSE` as keys, regardless of whether any elements actually satisfied the predicate — `allOdd.get(true)` returns an empty `List`, not `null`, because the key genuinely exists in the map with an empty list as its value. Code that calls `.get(true)` or `.get(false)` on a `partitioningBy` result never needs a null check for the bucket itself, only (as always) for handling an empty list of results.

> **Tip:** `Collectors` also includes `averagingInt`/`averagingDouble`, `minBy`/`maxBy`, and `summarizingInt` (a `groupingBy`-compatible cousin of `IntStream.summaryStatistics()` from Lesson 3) as further downstream collectors — reach for the one matching what each bucket should actually compute before writing a custom collector by hand.

## What happens under the hood

A `Collector` is defined by four components: a supplier (creates the initial, empty container — a fresh `ArrayList`, `HashMap`, or similar), an accumulator (folds one element into that container), a combiner (merges two partially-filled containers, used for parallel collection, mirroring Lesson 3's three-argument `reduce`), and a finisher (an optional final transformation, used by collectors like `Collectors.toUnmodifiableList()` to freeze the result). `groupingBy` and `partitioningBy` build on exactly this same machinery: the classifier decides which "sub-container" (bucket) an element's accumulation is routed to, and the downstream collector defines that sub-container's own supplier/accumulator/combiner/finisher independently.

> **Note:** `Collectors.toList()` does not guarantee an unmodifiable result (though the JDK's actual implementation happens to return a mutable `ArrayList`); `Collectors.toUnmodifiableList()` (and its `toUnmodifiableSet`/`toUnmodifiableMap` counterparts) make that guarantee explicit and enforced, throwing `UnsupportedOperationException` on any attempted mutation. Prefer the unmodifiable variants whenever the collected result is meant to be read-only from that point on.

## Common mistakes

**1. Using the two-argument `Collectors.toMap` when the key extractor can plausibly produce duplicates.** It throws `IllegalStateException` on the first collision rather than silently dropping data; supply a merge function whenever duplicates are possible.

**2. Using `groupingBy` with a boolean classifier when `partitioningBy` more precisely expresses the intent** of "exactly two known buckets," losing the guarantee that both keys are always present.

**3. Forgetting that `groupingBy`'s default (with no downstream collector) produces a `Map<K, List<T>>` of the *original* elements**, not a transformed or reduced value, unless a downstream collector like `mapping` or `summingInt` is supplied.

**4. Relying on a plain `Collectors.toMap`/`groupingBy` result's iteration order.** It reflects the underlying `HashMap`'s bucket layout by default, not insertion order or any other meaningful sequence.

**5. Assuming `Collectors.joining` handles `null` elements gracefully.** It calls each element's `toString()` internally and will throw a `NullPointerException` for a `null` element, exactly like ordinary string concatenation would.

**6. Writing a custom, hand-rolled downstream collector for a computation `Collectors` already provides.** `averagingInt`, `minBy`, `maxBy`, and `summarizingInt` cover most everyday numeric bucket computations.

**7. Assuming `Collectors.toList()`'s result is guaranteed unmodifiable.** Use `Collectors.toUnmodifiableList()` when that guarantee is actually required.

## Best practices

- Always supply a merge function to `Collectors.toMap` unless you can prove, by the nature of the data, that the key extractor can never produce a duplicate.
- Reach for `partitioningBy` specifically when a classification is naturally boolean and you want both outcome buckets guaranteed present, even when empty.
- Compose `groupingBy` with a downstream collector (`counting`, `summingInt`, `mapping`, or another `groupingBy` for multi-level grouping) rather than always collecting full elements into a bucket and post-processing separately.
- Use `Collectors.joining` in place of manual `StringBuilder` loops for straightforward, delimiter-based string construction.
- Treat a plain `Collectors.toMap`/`groupingBy` result's iteration order as unspecified; sort explicitly (or use a `TreeMap`-producing collector) whenever order actually matters.
- Prefer a `Collectors`-provided numeric downstream collector (`averagingInt`, `summarizingInt`, `minBy`, `maxBy`) over writing an equivalent computation by hand with `reduce`.
- Reach for `Collectors.toUnmodifiableList()`/`toUnmodifiableSet()`/`toUnmodifiableMap()` when the collected result must be genuinely read-only from that point forward.

## Summary

- `Collectors.toList`/`toSet`/`toMap`/`joining` are the everyday building blocks for turning a stream back into a concrete collection or a formatted string, and `averagingInt`/`minBy`/`maxBy`/`summarizingInt` cover the most common numeric downstream computations.
- `Collectors.toMap` throws `IllegalStateException` on a duplicate key unless a merge function is supplied, specifying exactly how colliding values should be combined.
- `groupingBy` classifies elements into a `Map` of buckets, and composes with downstream collectors (`counting`, `summingInt`, `mapping`, and similar) to control what each bucket actually contains.
- `partitioningBy` is a boolean-specialized form of grouping guaranteeing exactly two keys, `true` and `false`, are always present, even when one bucket is empty.
- A `Collector` is built from a supplier, accumulator, combiner, and optional finisher — the same conceptual pieces `reduce`'s three-argument overload uses, generalized into a reusable, composable strategy object.

## Practice

Warm-up:

1. Collect a list of strings into a `List`, a `Set`, and a single joined `String` with a comma-and-space delimiter, printing all three results.
2. Build a `Map<String, Integer>` from a list of distinct words to their lengths using `Collectors.toMap`.
3. Deliberately collect a list containing a key collision into a `Map` with the two-argument `Collectors.toMap`, and confirm it throws `IllegalStateException`.

Core:

1. Group a list of records by one field into a `Map<K, List<Record>>`, then rewrite it using `Collectors.mapping` to collect only a single field from each record into each bucket instead.
2. Use `groupingBy` combined with `Collectors.counting()` and, separately, `Collectors.summingInt(...)`, over the same data, comparing the two results.
3. Use `groupingBy` combined with `Collectors.averagingInt(...)` to compute a per-bucket average, and separately with `Collectors.maxBy(...)` to find each bucket's largest element.
4. Partition a list of numbers by a predicate of your choosing using `partitioningBy`, and confirm both the `true` and `false` keys are present even when you construct an input where one bucket is empty.

Challenge:

1. Design a small "word frequency" utility that takes a `List<String>` of text (already split into words) and produces a `Map<String, Long>` of word to occurrence count, using `groupingBy` and `counting()` in a single pipeline.
2. Research (and briefly document, in a comment) `Collectors.groupingBy`'s three-argument overload, which accepts a `Map`-supplying function (for example, to produce a `TreeMap` with sorted keys instead of a `HashMap`), and demonstrate it producing a naturally ordered result.

## Check your understanding

1. What must a `Collectors.toMap` call specify when the key extractor could plausibly produce duplicate keys for two different elements?
2. What happens, precisely, when the two-argument `Collectors.toMap` encounters a duplicate key with no merge function supplied?
3. What does a downstream collector like `Collectors.counting()` or `Collectors.mapping(...)` change about what `groupingBy` produces for each bucket?
4. Why does `partitioningBy` guarantee both a `true` and a `false` key in its result, even when every element satisfies (or fails) the predicate?
5. What four components define a `Collector`, and how do they parallel `reduce`'s three-argument overload from Lesson 3?
6. Why should you never rely on the iteration order of a plain `Collectors.toMap` or `groupingBy` result?
7. Which built-in `Collectors` method would you reach for to compute each group's average value directly, without writing a custom `reduce`?
