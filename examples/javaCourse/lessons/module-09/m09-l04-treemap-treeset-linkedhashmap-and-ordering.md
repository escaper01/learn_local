# TreeMap, TreeSet, LinkedHashMap, and ordering

Order is a feature that users notice immediately. An audit log that shuffles its entries between runs looks broken. A leaderboard that is not sorted is useless. A test that compares printed output fails randomly on another machine. In the previous lesson you saw that `HashMap` and `HashSet` promise *no* iteration order. This lesson covers the collections that do make ordering promises, what each promise costs, and one subtle trap: a sorted set decides "duplicate" with its comparator, not with `equals`.

What you will learn:

- The four kinds of order in the framework: unspecified, insertion, sorted, and enum declaration order.
- How `LinkedHashMap` and `LinkedHashSet` preserve insertion order, and how access order builds an LRU cache.
- How `TreeMap` and `TreeSet` keep elements sorted with a balanced search tree, and what that costs.
- Natural ordering (`Comparable`) versus supplied ordering (`Comparator`), and how to build comparators with tie-breakers.
- Navigation methods (`floorKey`, `ceilingKey`, `headMap`, `subMap`, ...) and the fact that range views are backed by the original map.
- Why comparator ties make a `TreeSet` silently drop distinct elements.
- `EnumSet` and `EnumMap`, the specialised collections for enum keys.

## Four kinds of order

| Order | Implementations | What iteration shows |
|---|---|---|
| Unspecified | `HashMap`, `HashSet` | Whatever the bucket layout gives; can change as the map grows |
| Insertion | `LinkedHashMap`, `LinkedHashSet` | The order keys were first inserted |
| Access (optional) | `LinkedHashMap` with `accessOrder = true` | Least recently used first, most recently used last |
| Sorted | `TreeMap`, `TreeSet` (also `PriorityQueue` for its head only) | Ascending by natural order or by a `Comparator` |
| Enum declaration | `EnumMap`, `EnumSet` | The order the constants are declared in the enum |

When a requirement says "deterministic", "stable", or "in the order entered", you must pick an implementation whose *contract* promises that order. The fact that a `HashMap` happened to print nicely on your laptop is not a promise.

## LinkedHashMap: hashing plus a remembered order

`LinkedHashMap` is a `HashMap` whose entries are also threaded onto a doubly linked list. Lookups still use the hash table (expected O(1)); iteration walks the linked list, so it follows insertion order. Re-putting an existing key updates its value but does *not* move it. `LinkedHashSet` is the set version.

```java
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

public class ThreeOrders {
    public static void main(String[] args) {
        List<String> arrivals = List.of("pear", "apple", "fig", "banana", "apple");

        Map<String, Integer> byArrival = new LinkedHashMap<>();
        Map<String, Integer> sorted = new TreeMap<>();
        for (String fruit : arrivals) {
            byArrival.merge(fruit, 1, Integer::sum);
            sorted.merge(fruit, 1, Integer::sum);
        }
        System.out.println("LinkedHashMap (insertion order): " + byArrival);
        System.out.println("TreeMap (sorted keys):           " + sorted);

        byArrival.put("pear", 99);  // re-putting an existing key keeps its position
        System.out.println("after put(pear, 99):             " + byArrival);

        Set<String> insertionSet = new LinkedHashSet<>(arrivals);
        Set<String> sortedSet = new TreeSet<>(arrivals);
        Set<String> byLength = new TreeSet<>(
                java.util.Comparator.comparingInt(String::length).thenComparing(s -> s));
        byLength.addAll(arrivals);
        System.out.println("LinkedHashSet: " + insertionSet);
        System.out.println("TreeSet:       " + sortedSet);
        System.out.println("TreeSet by length then text: " + byLength);
    }
}
```

```text
LinkedHashMap (insertion order): {pear=1, apple=2, fig=1, banana=1}
TreeMap (sorted keys):           {apple=2, banana=1, fig=1, pear=1}
after put(pear, 99):             {pear=99, apple=2, fig=1, banana=1}
LinkedHashSet: [pear, apple, fig, banana]
TreeSet:       [apple, banana, fig, pear]
TreeSet by length then text: [fig, pear, apple, banana]
```

The memory cost of `LinkedHashMap` is two extra references per entry. In exchange you get a deterministic, human-meaningful order, which is exactly what reports, exports, configuration files, and JSON output usually need. In Java 21 `LinkedHashMap` is also a `SequencedMap`, adding `firstEntry()`, `lastEntry()`, `putFirst`, `putLast`, and `reversed()`.

### Access order and a simple LRU cache

A special constructor `new LinkedHashMap<>(initialCapacity, loadFactor, true)` switches to *access order*: every `get` or `put` moves that entry to the end. Combined with the protected hook `removeEldestEntry`, this gives a least-recently-used (LRU) cache in a few lines.

```java
import java.util.LinkedHashMap;
import java.util.Map;

public class LruCacheDemo {
    public static void main(String[] args) {
        LruCache<String, String> cache = new LruCache<>(3);
        cache.put("a", "alpha");
        cache.put("b", "beta");
        cache.put("c", "gamma");
        System.out.println("start:        " + cache.keySet());
        cache.get("a");                       // touching "a" makes it most recent
        System.out.println("after get(a): " + cache.keySet());
        cache.put("d", "delta");              // over capacity: evict least recent ("b")
        System.out.println("after put(d): " + cache.keySet());
    }
}

// accessOrder = true moves an entry to the end whenever it is read or written.
class LruCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;

    LruCache(int capacity) {
        super(16, 0.75f, true);
        this.capacity = capacity;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > capacity;
    }
}
```

```text
start:        [a, b, c]
after get(a): [b, c, a]
after put(d): [c, a, d]
```

> **Warning:** In access-order mode even `get` changes the structure, so iterating while reading can throw `ConcurrentModificationException`, and sharing the cache between threads needs external synchronization. Production caches usually use a dedicated library, but this pattern is fine for single-threaded tools.

## TreeMap and TreeSet: always sorted

`TreeMap` stores entries in a **red-black tree**, a kind of self-balancing binary search tree. In a binary search tree every node's left subtree holds smaller keys and its right subtree holds larger keys, so a lookup starts at the root and goes left or right at each step, like looking up a word in a paper dictionary by opening it in the middle. "Self-balancing" means the tree rearranges itself after inserts and removes so that its height stays proportional to log n. `TreeSet` is backed by a `TreeMap`.

```text
keys 10, 3, 7, 15 inserted; after rebalancing the tree looks like:

            [7]
           /   \
        [3]     [10]
                   \
                   [15]
lookup 15: 7 -> go right -> 10 -> go right -> 15 found (3 comparisons)
```

Consequences:

- `put`, `get`, `remove`, `containsKey` cost O(log n) comparisons instead of expected O(1) hashing. For a million keys that is about 20 comparisons.
- Iteration is always in ascending key order.
- Keys are compared, never hashed. `hashCode` is irrelevant to a `TreeMap`.
- Keys must be comparable: either the key type implements `Comparable` (natural ordering, like `String`, `Integer`, `LocalDate`), or you pass a `Comparator` to the constructor.
- With natural ordering, `null` keys are rejected with `NullPointerException`.

### Navigation and range views

`TreeMap` implements `NavigableMap`, which adds questions a hash map cannot answer efficiently: "what is the next deadline after day 8?" or "which entries fall in this week?".

```java
import java.util.NavigableMap;
import java.util.SortedMap;
import java.util.TreeMap;

public class DeadlineIndex {
    public static void main(String[] args) {
        NavigableMap<Integer, String> deadlines = new TreeMap<>();
        deadlines.put(10, "review");
        deadlines.put(3, "build");
        deadlines.put(7, "test");
        deadlines.put(15, "release");

        System.out.println("all:            " + deadlines);
        System.out.println("firstKey:       " + deadlines.firstKey() + ", lastKey: " + deadlines.lastKey());
        System.out.println("floorKey(8):    " + deadlines.floorKey(8) + "   (largest <= 8)");
        System.out.println("ceilingKey(8):  " + deadlines.ceilingKey(8) + "  (smallest >= 8)");
        System.out.println("lowerKey(7):    " + deadlines.lowerKey(7) + "   (largest < 7)");
        System.out.println("higherKey(7):   " + deadlines.higherKey(7) + "  (smallest > 7)");
        System.out.println("ceilingKey(16): " + deadlines.ceilingKey(16));

        SortedMap<Integer, String> thisWeek = deadlines.subMap(1, 8);   // [1, 8)
        System.out.println("subMap(1, 8):   " + thisWeek);
        System.out.println("headMap(10):    " + deadlines.headMap(10));
        System.out.println("tailMap(10):    " + deadlines.tailMap(10));

        deadlines.put(5, "docs");                  // change the source...
        System.out.println("view after source put(5): " + thisWeek);  // ...the view sees it
        try {
            thisWeek.put(20, "late");
        } catch (IllegalArgumentException e) {
            System.out.println("view.put(20): IllegalArgumentException: " + e.getMessage());
        }
        System.out.println("pollFirstEntry: " + deadlines.pollFirstEntry() + ", remaining " + deadlines);
        System.out.println("descending:     " + deadlines.descendingMap());
    }
}
```

```text
all:            {3=build, 7=test, 10=review, 15=release}
firstKey:       3, lastKey: 15
floorKey(8):    7   (largest <= 8)
ceilingKey(8):  10  (smallest >= 8)
lowerKey(7):    3   (largest < 7)
higherKey(7):   10  (smallest > 7)
ceilingKey(16): null
subMap(1, 8):   {3=build, 7=test}
headMap(10):    {3=build, 7=test}
tailMap(10):    {10=review, 15=release}
view after source put(5): {3=build, 5=docs, 7=test}
view.put(20): IllegalArgumentException: key out of range
pollFirstEntry: 3=build, remaining {5=docs, 7=test, 10=review, 15=release}
descending:     {15=release, 10=review, 7=test, 5=docs}
```

Key points:

- `floor` and `ceiling` include the key itself; `lower` and `higher` are strict. All return `null` when nothing qualifies.
- `subMap(from, to)` and `headMap(to)` are half-open by default: `from` is included and `to` is excluded. Overloads such as `subMap(from, true, to, true)` let you choose.
- Range views are **backed** by the original map. Later changes to the source appear in the view, and writes through the view are range-checked.

## Comparable and Comparator

A sorted collection needs one question answered: "does `a` come before, after, or at the same position as `b`?". The answer is an `int`: negative, positive, or zero.

- **Natural ordering**: the element class implements `Comparable<T>` and its `compareTo` method. Use it when a type has one obvious order (numbers, dates, strings).
- **Supplied ordering**: pass a `Comparator<T>` when you need a different or additional order, or when the class is not yours.

Java's `Comparator` factory methods build readable comparators:

```java
// fragment
Comparator<Employee> order = Comparator
        .comparing(Employee::department)          // primary key
        .thenComparing(Employee::salary, Comparator.reverseOrder()) // secondary, descending
        .thenComparingInt(Employee::id);          // final tie-breaker: unique
```

Use `Integer.compare(a, b)` or `comparingInt` instead of subtracting (`a - b`), which can overflow for large values of opposite sign.

## The comparator decides what counts as a duplicate

A `TreeSet` does not call `equals` to detect duplicates. It walks the tree using the comparator, and **if `compare(a, b)` returns 0, the set treats `b` as already present**. `add` returns `false` and the new element is discarded. A `TreeMap` treats a comparator tie as the same key and replaces the value.

This is harmless when the comparator is *consistent with equals* (zero exactly when `equals` is true). It becomes a silent data-loss bug when the comparator looks at only part of an object.

```java
import java.util.Comparator;
import java.util.List;
import java.util.TreeSet;

public class ComparatorTies {
    record Task(int id, int priority) { }

    public static void main(String[] args) {
        List<Task> tasks = List.of(new Task(7, 2), new Task(3, 1), new Task(5, 2), new Task(1, 1));

        TreeSet<Task> byPriorityOnly = new TreeSet<>(Comparator.comparingInt(Task::priority));
        for (Task task : tasks) {
            boolean added = byPriorityOnly.add(task);
            System.out.println("add " + task + " -> " + added);
        }
        System.out.println("priority only: size=" + byPriorityOnly.size() + " " + byPriorityOnly);

        TreeSet<Task> withTieBreaker = new TreeSet<>(
                Comparator.comparingInt(Task::priority).thenComparingInt(Task::id));
        withTieBreaker.addAll(tasks);
        System.out.println("with tie-breaker: size=" + withTieBreaker.size() + " " + withTieBreaker);

        TreeSet<String> caseless = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        caseless.add("Java");
        caseless.add("JAVA");
        caseless.add("java");
        System.out.println("case-insensitive set: " + caseless + " contains(\"jAvA\")=" + caseless.contains("jAvA"));
    }
}
```

```text
add Task[id=7, priority=2] -> true
add Task[id=3, priority=1] -> true
add Task[id=5, priority=2] -> false
add Task[id=1, priority=1] -> false
priority only: size=2 [Task[id=3, priority=1], Task[id=7, priority=2]]
with tie-breaker: size=4 [Task[id=1, priority=1], Task[id=3, priority=1], Task[id=5, priority=2], Task[id=7, priority=2]]
case-insensitive set: [Java] contains("jAvA")=true
```

### Trace: why the first set lost two tasks

| Insert | Compared with | `compare` result | Outcome |
|---|---|---|---|
| Task 7 (priority 2) | tree empty | none | becomes root, added |
| Task 3 (priority 1) | Task 7: 1 vs 2 | negative | goes left, added |
| Task 5 (priority 2) | Task 7: 2 vs 2 | 0 | "already present", rejected |
| Task 1 (priority 1) | Task 7 then Task 3: 1 vs 1 | 0 | "already present", rejected |

A tie-breaker on a field that is unique (like an ID) makes the comparator return 0 only for truly identical records, so every distinct task keeps its own position. Sometimes collapsing *is* intended: the case-insensitive set deliberately treats "Java" and "JAVA" as one entry. The point is to make that a conscious decision.

## EnumSet and EnumMap

When every element or key is a constant of one enum type, use the specialised collections:

- `EnumSet` stores membership as bits, one bit per constant (a single `long` for enums of up to 64 constants). `contains`, `add`, and `remove` are simple bit operations; set operations like complement are extremely fast.
- `EnumMap` stores values in an array indexed by each constant's `ordinal()`. No hashing and no collisions.
- Both iterate in declaration order, not insertion order, and both reject `null` keys or elements.

```java
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class EnumCollections {
    enum Day { MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY }

    public static void main(String[] args) {
        Set<Day> weekend = EnumSet.of(Day.SUNDAY, Day.SATURDAY);
        Set<Day> workdays = EnumSet.range(Day.MONDAY, Day.FRIDAY);
        Set<Day> notWeekend = EnumSet.complementOf(EnumSet.of(Day.SATURDAY, Day.SUNDAY));
        Set<Day> none = EnumSet.noneOf(Day.class);

        System.out.println("weekend:    " + weekend);
        System.out.println("workdays:   " + workdays);
        System.out.println("same set?   " + workdays.equals(notWeekend));
        System.out.println("all:        " + EnumSet.allOf(Day.class).size() + " days, none: " + none);

        Map<Day, Integer> meetings = new EnumMap<>(Day.class);
        for (Day day : List.of(Day.FRIDAY, Day.MONDAY, Day.FRIDAY, Day.WEDNESDAY)) {
            meetings.merge(day, 1, Integer::sum);
        }
        System.out.println("meetings:   " + meetings);
    }
}
```

```text
weekend:    [SATURDAY, SUNDAY]
workdays:   [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY]
same set?   true
all:        7 days, none: []
meetings:   {MONDAY=1, WEDNESDAY=1, FRIDAY=2}
```

`weekend` was created with `SUNDAY` first, yet it prints `SATURDAY` first, because declaration order wins. `EnumSet` is also the idiomatic replacement for old-style bit flags such as `int FLAG_BOLD = 1, FLAG_ITALIC = 2`.

## Comparison of map implementations

| Property | `HashMap` | `LinkedHashMap` | `TreeMap` | `EnumMap` |
|---|---|---|---|---|
| Iteration order | unspecified | insertion (or access) | sorted by key | enum declaration |
| `get` / `put` | expected O(1) | expected O(1) | O(log n) | O(1) |
| Uses | `hashCode` + `equals` | `hashCode` + `equals` | `compareTo` / `Comparator` | enum ordinal |
| `null` keys | one allowed | one allowed | not with natural order | no |
| Range and nearest-key queries | no | no | yes (`NavigableMap`) | no |
| Extra memory | baseline | two links per entry | tree node per entry | one array slot per constant |

The matching sets (`HashSet`, `LinkedHashSet`, `TreeSet`, `EnumSet`) share the same properties.

## Common mistakes

### Putting non-comparable objects into a TreeSet

```java
TreeSet<Invoice> invoices = new TreeSet<>();   // fragment: Invoice has no compareTo
invoices.add(new Invoice(1));
```

```text
ClassCastException: class NotComparable$Invoice cannot be cast to class java.lang.Comparable (...)
```

It compiles, then fails at runtime on the first `add`. Fix: implement `Comparable<Invoice>` or pass a `Comparator` to the constructor.

### Null keys in a naturally ordered TreeMap

`new TreeMap<String, Integer>().put(null, 1)` throws `NullPointerException`. Fix: validate keys, or use `Comparator.nullsFirst(Comparator.naturalOrder())` if `null` genuinely needs a place.

### A comparator that ignores identity

Ordering by a non-unique field alone merges distinct records, as the trace above shows. Fix: add tie-breakers until the comparator returns 0 only when the objects should truly be treated as one.

### Expecting HashMap to keep insertion order

It may appear to for small inputs and then change. Fix: `LinkedHashMap` when order of entry matters, `TreeMap` when sorted order matters.

### Forgetting that range views are live

Storing `headMap(...)` in a field and assuming it is a frozen snapshot leads to surprises when the source changes. Fix: copy it (`new TreeMap<>(view)`) if you need a snapshot.

## Best practices

- Decide which order a caller needs, then choose the implementation that *promises* it, and document the promise in the method's Javadoc.
- Use `TreeMap`/`TreeSet` when you need sorted iteration *plus* ongoing inserts or nearest-key queries. If you sort once and then only read, collecting into an `ArrayList` and sorting it is often simpler and faster.
- Make comparators total: end the chain with a unique field.
- Keep comparators consistent with `equals` for sorted sets and maps unless you deliberately want merging, and write a comment when you do.
- Prefer `EnumSet`/`EnumMap` whenever the keys are enum constants.
- Use `LinkedHashMap` for reports, exports, and anything a human or a test reads.

## Summary

- `HashMap`/`HashSet` promise no order; `LinkedHashMap`/`LinkedHashSet` preserve insertion order with a linked list over the hash table; `TreeMap`/`TreeSet` keep sorted order in a red-black tree; `EnumMap`/`EnumSet` use enum declaration order.
- Access-order `LinkedHashMap` plus `removeEldestEntry` implements a simple LRU cache.
- Tree operations are O(log n) and support navigation (`floor`, `ceiling`, `higher`, `lower`) and backed range views.
- Sorted collections use the comparator, not `equals`, to detect duplicates; a comparator tie collapses elements unless you add a tie-breaker.
- `EnumSet` is a compact bit set and `EnumMap` is an ordinal-indexed array; both are faster and smaller than hash-based alternatives for enum keys.

## Practice

### Warm-up

1. Insert `"delta", "alpha", "charlie", "bravo"` into a `LinkedHashSet` and a `TreeSet`, and predict both printed orders before running.
2. Given `TreeMap` keys `2, 4, 6, 8`, predict `floorKey(5)`, `ceilingKey(5)`, `higherKey(8)`, and `headMap(6)`.

### Core

1. Build an insertion-ordered audit report with `LinkedHashMap<String, List<String>>` (user to actions) and a deadline-indexed task query with `TreeMap<LocalDate, List<String>>`. Explain why each needs a different structure.
2. Create a `record Player(String name, int score)` leaderboard in a `TreeSet` sorted by score descending. Add two players with the same score and make sure both survive. Print the top three with an iterator.
3. Extend `LruCache` with a hit and miss counter, and test the eviction order after a mix of `get` and `put` calls.

### Challenge

1. Implement a small appointment book using `TreeMap<LocalTime, String>` that rejects overlapping 30-minute appointments by checking `floorKey` and `ceilingKey` of the requested start time. Test boundaries where one appointment ends exactly as another starts.

## Check your understanding

1. Which map implementation should you choose when a report must list keys in the order they were first added, and what does it add on top of hashing?
2. Why is relying on a `HashMap`'s printed order a bug waiting to happen?
3. What is the difference between `floorKey` and `lowerKey`?
4. How does a `TreeSet` decide that an element is a duplicate, and how can that lose data?
5. Why does an `EnumSet` print its elements in declaration order regardless of the order you added them?
6. When is a sorted `ArrayList` a better choice than a `TreeSet`?
