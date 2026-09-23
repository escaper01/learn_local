# Collection, List, Set, Map, Queue, and Deque contracts

Almost every real program manages groups of things: the items in a shopping cart, the users logged in right now, the settings loaded from a file, the jobs waiting to run. Plain arrays can hold groups, but they have a fixed size and no built-in behaviour for "is this already here?", "what is stored under this key?", or "what should I process next?". Java answers those needs with the **Collections Framework**, a family of interfaces and classes in `java.util` that every professional Java developer uses daily.

The most important skill in this chapter is not memorising class names. It is learning to ask: *which operations does my program need, and which contract promises them?* Pick the contract first, then the implementation.

What you will learn:

- What a collection is and how the Collections Framework is organised.
- The difference between an abstract data type (a contract) and a concrete data structure (an implementation).
- The promises made by `Collection`, `List`, `Set`, `Map`, `Queue`, and `Deque`, including ordering, duplicates, and nulls.
- Why `Map` is part of the framework but is not a `Collection`.
- How to program against an interface so you can change implementations later.
- The two families of queue methods: ones that throw and ones that return a special value.
- The Java 21 sequenced interfaces: `getFirst`, `getLast`, and `reversed`.

## What is a collection?

A **collection** is an object that groups other objects, called its *elements*, and gives you operations to add, remove, search, and iterate over them. Think of it as a container with rules. A shopping bag lets you put in two identical apples. A guest list refuses to write the same name twice. A coat check hands you a ticket (the key) and gives your coat (the value) back when you return the ticket. A queue at a bakery serves people in arrival order. Each container has different rules, and each rule is useful for a different job.

Compare this with an array:

| Feature | Array `String[]` | Collection such as `ArrayList<String>` |
|---|---|---|
| Size | Fixed when created | Grows and shrinks as needed |
| Element types | Primitives or references | References only (primitives are boxed, e.g. `Integer`) |
| Built-in search | None (write a loop or use `Arrays`) | `contains`, `indexOf`, and more |
| Uniqueness or key lookup | Not available | Available through `Set` and `Map` |
| Printing | `Arrays.toString(arr)` needed | `toString()` prints the contents |

Collections hold only object references. When you write `List<Integer>` and call `add(5)`, Java *autoboxes* the `int` into an `Integer` object. This is convenient, but it costs memory and creates one surprising trap you will see in the Common mistakes section.

## Abstract data types versus concrete data structures

Computer scientists separate two ideas that beginners often blur together.

An **abstract data type (ADT)** describes *what* operations exist and what they promise, without saying how they are stored. "A list is an ordered sequence where I can read the element at position i" is an ADT. "A stack lets me push and pop, and pop returns the most recently pushed element" is an ADT.

A **concrete data structure** is a specific *storage layout* that implements an ADT: a resizable array, a chain of linked nodes, a hash table, a balanced binary tree. The same ADT can be built from different structures with very different performance.

In Java the mapping is direct: **interfaces are the ADTs, and classes are the concrete data structures.**

| Abstract data type (interface) | Concrete implementations (classes) | Storage idea |
|---|---|---|
| `List` | `ArrayList`, `LinkedList` | Resizable array; doubly linked nodes |
| `Set` | `HashSet`, `LinkedHashSet`, `TreeSet`, `EnumSet` | Hash table; hash table plus linked order; red-black tree; bit vector |
| `Map` | `HashMap`, `LinkedHashMap`, `TreeMap`, `EnumMap` | Hash table; hash table plus linked order; red-black tree; array indexed by enum ordinal |
| `Queue` / `Deque` | `ArrayDeque`, `LinkedList`, `PriorityQueue` (Queue only) | Circular array; linked nodes; binary heap |

> **Note:** You will study the storage ideas in the next lessons. For now, notice that choosing `List` answers a *behaviour* question, while choosing `ArrayList` versus `LinkedList` answers a *performance* question.

## The shape of the framework

Here is the core interface hierarchy, simplified. An arrow means "extends".

```text
Iterable<E>
  Collection<E>
    SequencedCollection<E>        (Java 21)
      List<E>                     ordered by position, duplicates allowed
      Deque<E>                    also extends Queue<E>
    Set<E>                        no duplicates
      SortedSet<E> -> NavigableSet<E>
    Queue<E>                      elements waiting to be processed
      Deque<E>                    double-ended queue

Map<K,V>                          NOT a Collection
  SequencedMap<K,V>               (Java 21)
  SortedMap<K,V> -> NavigableMap<K,V>
```

`Iterable` is the root that makes the enhanced `for` loop work. `Collection` adds the common operations every group of elements supports. `Map` stands apart because it stores *pairs* (key and value), not single elements. You can still view a map as collections through `keySet()`, `values()`, and `entrySet()`.

## The Collection contract

Every `List`, `Set`, `Queue`, and `Deque` supports these core operations from `Collection<E>`:

| Method | Meaning |
|---|---|
| `add(e)` | Try to add an element; returns `true` if the collection changed |
| `remove(o)` | Remove one matching element; returns `true` if something was removed |
| `contains(o)` | Is an element equal to `o` present? (uses `equals`) |
| `size()` / `isEmpty()` | How many elements / is it zero? |
| `clear()` | Remove everything |
| `addAll`, `removeAll`, `retainAll` | Bulk operations |
| `removeIf(predicate)` | Remove every element matching a condition |
| `iterator()` / `stream()` | Visit the elements |

The `boolean` returned by `add` is part of the contract, and it is where implementations differ. A list always accepts the element and returns `true`. A set returns `false` when an equal element is already present. The following complete program calls the *same method* on three different implementations.

```java
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.TreeSet;

public class ProgramToInterface {
    public static void main(String[] args) {
        Collection<String> list = new ArrayList<>(List.of("pear", "apple", "pear"));
        Collection<String> set = new TreeSet<>(List.of("pear", "apple", "pear"));
        Collection<String> queue = new ArrayDeque<>(List.of("pear", "apple", "pear"));

        describe("ArrayList", list);
        describe("TreeSet", set);
        describe("ArrayDeque", queue);
    }

    // This method only depends on the Collection contract.
    static void describe(String label, Collection<String> items) {
        boolean added = items.add("apple");
        System.out.printf("%-10s size=%d contains(pear)=%b add(apple)=%b -> %s%n",
                label, items.size(), items.contains("pear"), added, items);
    }
}
```

```text
ArrayList  size=4 contains(pear)=true add(apple)=true -> [pear, apple, pear, apple]
TreeSet    size=2 contains(pear)=true add(apple)=false -> [apple, pear]
ArrayDeque size=4 contains(pear)=true add(apple)=true -> [pear, apple, pear, apple]
```

The `describe` method never mentions a concrete class. That is called **programming to the interface**. It lets you swap implementations without touching the code that uses them, and it documents to readers which guarantees you actually rely on.

## List: positional order and duplicates

A `List<E>` is an ordered sequence. Every element has an index starting at 0, duplicates are allowed, and iteration visits elements in index order. Use a list when position matters: steps of a recipe, rows of a report, the lines of a file.

Key additions beyond `Collection`: `get(index)`, `set(index, e)`, `add(index, e)`, `remove(index)`, `indexOf(o)`, `subList(from, to)`, and `sort(comparator)`.

## Set: uniqueness

A `Set<E>` contains no two elements `a` and `b` where `a.equals(b)`. Use a set when the question is "have I seen this before?" or "which distinct values exist?": unique usernames, visited web pages, tags on an article.

Sets differ in *iteration order*: `HashSet` promises no particular order, `LinkedHashSet` keeps insertion order, and `TreeSet` keeps sorted order. Converting a list to a set is a *semantic* change, not only a speed change: duplicates disappear and positional access is lost.

## Map: one value for each unique key

A `Map<K,V>` associates keys with values. Each key appears at most once, and each key maps to exactly one value (which may itself be a collection, such as `Map<String, List<Order>>`). Putting a new value under an existing key *replaces* the old value, and `put` returns the previous value (or `null` if there was none). Values may repeat freely; only keys must be unique.

Think of a dictionary: each word (key) has one entry (value). Use a map for lookups by ID, counting occurrences, caching results, and grouping.

Important map methods:

| Method | Behaviour |
|---|---|
| `put(k, v)` | Store `v` under `k`, returning the previous value or `null` |
| `get(k)` | Value for `k`, or `null` if absent |
| `getOrDefault(k, d)` | Value for `k`, or `d` if absent |
| `containsKey(k)` | Is there a mapping for `k`? |
| `putIfAbsent(k, v)` | Store only when `k` has no mapping |
| `merge(k, v, fn)` | Store `v` if absent, otherwise combine old and new with `fn` |
| `computeIfAbsent(k, fn)` | Create a value on first use, for example a new list for grouping |
| `keySet()`, `values()`, `entrySet()` | Collection views of the map |

## Queue and Deque: processing order

A `Queue<E>` holds elements waiting to be processed. The usual queue is **FIFO** (first in, first out), like people in a line. `PriorityQueue` is also a `Queue`, but it hands out the smallest element (by its ordering) first instead of the oldest.

A `Deque<E>` ("deck", double-ended queue) allows adding and removing at both ends. That makes it a single tool for two classic ADTs:

- As a **queue** (FIFO): `offerLast` / `addLast` to join the back, `pollFirst` / `removeFirst` to leave from the front.
- As a **stack** (LIFO, last in, first out): `push` to put on top, `pop` to take from the top, `peek` to look without removing.

## A complete tour

This program uses each contract for the job it was designed for. `TreeMap` and `LinkedHashSet` are chosen so that printed order is guaranteed.

```java
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.TreeMap;

public class CollectionTour {
    public static void main(String[] args) {
        // List: positional order, duplicates allowed
        List<String> visits = new ArrayList<>();
        visits.add("home");
        visits.add("cart");
        visits.add("home");
        System.out.println("List:  " + visits + " size=" + visits.size());
        System.out.println("visits.get(1) = " + visits.get(1));

        // Set: uniqueness (LinkedHashSet also remembers insertion order)
        Set<String> pages = new LinkedHashSet<>(visits);
        System.out.println("Set:   " + pages + " size=" + pages.size());
        System.out.println("add(\"cart\") again -> " + pages.add("cart"));

        // Map: one value per unique key (TreeMap keeps keys sorted)
        Map<String, Integer> counts = new TreeMap<>();
        for (String page : visits) {
            counts.merge(page, 1, Integer::sum);
        }
        System.out.println("Map:   " + counts);
        System.out.println("put(\"cart\", 10) returned " + counts.put("cart", 10));
        System.out.println("Map:   " + counts);

        // Queue: first in, first out
        Queue<String> printJobs = new ArrayDeque<>();
        printJobs.offer("report.pdf");
        printJobs.offer("invoice.pdf");
        System.out.println("Queue: next=" + printJobs.poll() + " remaining=" + printJobs);

        // Deque used as a stack: last in, first out
        Deque<String> undo = new ArrayDeque<>();
        undo.push("type A");
        undo.push("type B");
        System.out.println("Deque: undo " + undo.pop() + ", remaining=" + undo);
    }
}
```

```text
List:  [home, cart, home] size=3
visits.get(1) = cart
Set:   [home, cart] size=2
add("cart") again -> false
Map:   {cart=1, home=2}
put("cart", 10) returned 1
Map:   {cart=10, home=2}
Queue: next=report.pdf remaining=[invoice.pdf]
Deque: undo type B, remaining=[type A]
```

Read the output line by line. The list kept both `home` entries. The set kept one. The map stored exactly one value per key, and the second `put` on `cart` replaced the value while returning the old one. The queue served the oldest job; the stack served the newest action.

## Two families of queue methods

`Queue` offers each operation twice. One version throws an exception when it cannot proceed; the other returns a special value (`false` or `null`).

| Operation | Throws on failure | Returns special value |
|---|---|---|
| Insert | `add(e)` | `offer(e)` returns `false` |
| Remove head | `remove()` throws `NoSuchElementException` | `poll()` returns `null` |
| Examine head | `element()` throws `NoSuchElementException` | `peek()` returns `null` |

```java
import java.util.ArrayDeque;
import java.util.NoSuchElementException;
import java.util.Queue;

public class QueueMethods {
    public static void main(String[] args) {
        Queue<String> queue = new ArrayDeque<>();

        System.out.println("peek on empty: " + queue.peek());
        System.out.println("poll on empty: " + queue.poll());
        try {
            queue.remove();
        } catch (NoSuchElementException e) {
            System.out.println("remove on empty threw NoSuchElementException");
        }
        try {
            queue.element();
        } catch (NoSuchElementException e) {
            System.out.println("element on empty threw NoSuchElementException");
        }

        queue.offer("a");
        queue.offer("b");
        System.out.println("peek=" + queue.peek() + " size=" + queue.size());
        System.out.println("poll=" + queue.poll() + " size=" + queue.size());
    }
}
```

```text
peek on empty: null
poll on empty: null
remove on empty threw NoSuchElementException
element on empty threw NoSuchElementException
peek=a size=2
poll=a size=1
```

Use `poll` when "empty" is a normal situation you want to test for, such as a worker loop `while ((job = queue.poll()) != null)`. Use `remove` when an empty queue would be a bug that should fail loudly. `ArrayDeque` rejects `null` elements precisely so that a `null` from `poll` can only mean "empty".

## Java 21 sequenced collections

Java 21 added `SequencedCollection` and `SequencedMap` for collections with a defined encounter order. They give uniform methods that previously differed between classes: `getFirst()`, `getLast()`, `addFirst`, `addLast`, `removeFirst`, `removeLast`, and `reversed()`. `List`, `Deque`, `LinkedHashSet`, and `SortedSet` are sequenced; `LinkedHashMap` and `SortedMap` are sequenced maps. `HashSet` and `HashMap` are *not*, because they have no defined order.

```java
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.SequencedMap;

public class SequencedDemo {
    public static void main(String[] args) {
        List<String> steps = new ArrayList<>(List.of("plan", "code", "test"));
        System.out.println("first=" + steps.getFirst() + " last=" + steps.getLast());
        System.out.println("reversed view: " + steps.reversed());

        SequencedMap<String, Integer> stock = new LinkedHashMap<>();
        stock.put("pens", 4);
        stock.put("ink", 9);
        stock.putFirst("paper", 2);
        System.out.println("map=" + stock + " firstEntry=" + stock.firstEntry());
    }
}
```

```text
first=plan last=test
reversed view: [test, code, plan]
map={paper=2, pens=4, ink=9} firstEntry=paper=2
```

`reversed()` returns a *view*, not a copy: changes to the original list show up in the reversed view. Lesson 5 explores views in depth.

## What the contracts do not promise

Interfaces promise behaviour, but several important properties vary by implementation. Always check them explicitly:

| Property | Varies how |
|---|---|
| Iteration order | `HashSet`/`HashMap`: unspecified; `LinkedHash*`: insertion; `Tree*`: sorted |
| Null elements or keys | `ArrayList` and `HashMap` allow `null`; `ArrayDeque`, `TreeMap` (natural order), and `List.of` reject it |
| Mutability | `new ArrayList<>()` is mutable; `List.of(...)` is unmodifiable |
| Thread safety | The general-purpose classes are not thread-safe |
| Cost of each operation | Depends entirely on the data structure |

A starter cost model (details come in later lessons): `ArrayList.get(i)` is O(1), `List.contains` is O(n) because it scans, `HashSet.contains` and `HashMap.get` are expected O(1) with good hashing, and `TreeSet`/`TreeMap` operations are O(log n). Big-O describes growth, not exact time; allocation and memory layout still matter.

## Choosing by required operations

| If you need... | Choose the contract | Typical implementation |
|---|---|---|
| Order by position, duplicates allowed | `List` | `ArrayList` |
| "Have I seen it?" with no duplicates | `Set` | `HashSet` (or `LinkedHashSet` for stable order) |
| Look up a value by a key | `Map` | `HashMap` (or `LinkedHashMap` / `TreeMap` for order) |
| Process in arrival order | `Queue` | `ArrayDeque` |
| Undo, backtracking, "most recent first" | `Deque` used as a stack | `ArrayDeque` |
| Always process the smallest or most urgent next | `Queue` | `PriorityQueue` |
| Sorted keys and range queries | `NavigableMap` / `NavigableSet` | `TreeMap` / `TreeSet` |

## Common mistakes

### Treating a Map as a Collection

```java
Collection<String> names = new HashMap<String, Integer>(); // fragment: does not compile
```

```text
error: incompatible types: HashMap<String,Integer> cannot be converted to Collection<String>
```

`Map` does not extend `Collection`. If you need the keys as a collection, use `map.keySet()`; for values, `map.values()`.

### Calling remove(int) when you meant remove(Object)

`List<Integer>` has two `remove` methods. A plain `int` argument picks `remove(int index)`.

```java
import java.util.ArrayList;
import java.util.List;

public class RemoveTrap {
    public static void main(String[] args) {
        List<Integer> scores = new ArrayList<>(List.of(10, 20, 1, 30));
        scores.remove(1);                       // remove(int index)
        System.out.println("after remove(1):                  " + scores);

        List<Integer> again = new ArrayList<>(List.of(10, 20, 1, 30));
        again.remove(Integer.valueOf(1));       // remove(Object o)
        System.out.println("after remove(Integer.valueOf(1)): " + again);

        List<String> fixed = List.of("a", "b");
        try {
            fixed.add("c");
        } catch (UnsupportedOperationException e) {
            System.out.println("List.of(...).add threw UnsupportedOperationException");
        }
    }
}
```

```text
after remove(1):                  [10, 1, 30]
after remove(Integer.valueOf(1)): [10, 20, 30]
List.of(...).add threw UnsupportedOperationException
```

The first call removed the element at index 1 (the value 20), not the value 1. Fix it by passing an object: `remove(Integer.valueOf(1))`.

### Adding to an unmodifiable list

The same program shows that `List.of` creates a list that cannot change size. If you need to add later, copy it: `new ArrayList<>(List.of("a", "b"))`.

### Relying on hash iteration order

Printing a `HashMap` or `HashSet` shows *some* order, and it may look sorted for small inputs. That order is not part of the contract and can change with capacity, content, or Java version. If a report needs a stable order, choose `LinkedHashMap` (insertion order) or `TreeMap` (sorted order), or sort the entries explicitly.

### Using a List for membership checks in a loop

```java
// fragment: O(n) contains inside an O(n) loop = O(n squared)
List<String> banned = loadBannedWords();
for (String word : words) {
    if (banned.contains(word)) { count++; }
}
```

For large inputs, copy `banned` into a `HashSet` once, then each `contains` is expected O(1).

## Best practices

- Declare variables, parameters, and return types with the interface (`List<String> names`), and choose the class only at the `new` expression.
- Accept the most general type you need (`Collection<String>` or `Iterable<String>` for "any group I only read"), and return a specific enough type that callers know the promises.
- Document ordering, duplicate, and null policies in method comments whenever you return a collection.
- Prefer `poll`/`peek`/`offer` when absence is normal and the throwing methods when absence is a bug.
- Use `ArrayDeque` for both stacks and FIFO queues in single-threaded code.
- Prefer returning an empty collection over returning `null`; callers can loop over an empty list safely.
- Use `var` only when the right-hand side makes the type obvious; for fields and APIs, spell out the interface type.

## Summary

- A collection is an object that groups elements and provides operations; unlike an array it can grow and has behaviour such as uniqueness or key lookup.
- Interfaces (`List`, `Set`, `Map`, `Queue`, `Deque`) are abstract data types; classes (`ArrayList`, `HashMap`, ...) are concrete data structures.
- `List`: positional, duplicates allowed. `Set`: no duplicates. `Map`: exactly one value per unique key; `put` on an existing key replaces the value. `Queue`: processing order, usually FIFO. `Deque`: both ends, so it can be a queue or a stack.
- `Map` belongs to the framework but does not extend `Collection`.
- Order, null handling, mutability, and thread safety depend on the implementation, so state them explicitly.
- Java 21 sequenced collections add `getFirst`, `getLast`, and `reversed` to ordered collections.

## Practice

### Warm-up

1. For each of these, name the interface you would choose and say whether duplicates are allowed: ordered receipt lines, unique usernames, task lookup by numeric ID, customers waiting for support.
2. Create a `List<String>`, a `Set<String>`, and a `Map<String, Integer>` from the words `red blue red green blue red`, and print the size of each.

### Core

1. Write `static Map<Character, Integer> letterCounts(String text)` using `merge`, returning a `TreeMap` so the output is sorted. Test an empty string and a string with uppercase and lowercase versions of the same letter, and document your case policy.
2. Write a method that takes a `Collection<Integer>` and returns the sum. Call it with an `ArrayList`, a `TreeSet`, and an `ArrayDeque`, and explain why the set gives a different total for the same input values.
3. Simulate a print queue with `offer` and `poll`, then an undo history with `push` and `pop`, and print the order in which items are processed.

### Challenge

1. Build a small "library" program: a `Map<String, List<String>>` from author to titles using `computeIfAbsent`, a `Set<String>` of all distinct genres, and a `Deque<String>` of recently viewed titles capped at five entries. State the ordering promise of every collection you expose.

## Check your understanding

1. What is the difference between an abstract data type and a concrete data structure, and how does Java express each one?
2. Which contract lets you store a value and later retrieve it by a unique identifier, and what happens when you store a second value under the same identifier?
3. Why does `set.add(x)` sometimes return `false` while `list.add(x)` returns `true` for the same `x`?
4. When should you prefer `poll()` over `remove()` on a queue?
5. Why is converting a `List` to a `Set` more than a performance decision?
6. Which of these have a defined iteration order: `HashSet`, `LinkedHashSet`, `TreeSet`?
