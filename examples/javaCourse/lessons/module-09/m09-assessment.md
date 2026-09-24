# Chapter 9 assessment and deliberate practice

This chapter replaced "just use an `ArrayList` for everything" with real judgment: which contract does your data actually need (positional, unique, key-value, both-ends), which concrete implementation gives you that contract efficiently, and which protection (view or snapshot) keeps a returned collection safe. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Collection, List, Set, Map, Queue, and Deque contracts

A collection groups elements and provides behavior an array does not: growth, uniqueness, key lookup. Interfaces (`List`, `Set`, `Map`, `Queue`, `Deque`) are abstract contracts; classes (`ArrayList`, `HashMap`, and so on) are concrete implementations of them. `List` is positional and allows duplicates; `Set` forbids duplicates; `Map` holds exactly one value per unique key, and `put` on an existing key replaces its value; `Queue` models processing order, usually FIFO; `Deque` supports both ends, so it can act as a queue or a stack. `Map` belongs to the collections framework but does not itself extend `Collection`. Order, null handling, mutability, and thread safety all depend on the specific implementation, not the interface.

### Lesson 2: ArrayList, LinkedList, ArrayDeque, and memory locality

Arrays are contiguous, giving O(1) indexing; a dynamic array like `ArrayList` grows by allocating a larger array and copying, with multiplicative growth making appends amortized O(1). `LinkedList` stores separate nodes, so index-based access must walk links — an index-based loop over it can cost O(n squared); iterate sequentially instead. Contiguous storage is cache-friendly; scattered linked nodes cause more cache misses. `ArrayDeque` is a ring buffer with O(1) operations at both ends and is generally preferred over the legacy, synchronized `Stack` class. Removing elements during iteration requires `Iterator.remove` or `removeIf` to avoid `ConcurrentModificationException`.

### Lesson 3: HashMap and HashSet internals, equality, and collisions

A hash function turns a key into an integer; a hash table uses it to pick a bucket so a lookup inspects only a few candidates instead of every element. Collisions are unavoidable even with a good hash function; hashing narrows the search, and `equals` decides the actual match among candidates in a bucket. `HashMap` uses power-of-two capacity, hash spreading, and a 0.75 load factor that triggers resizing; `HashSet` is backed internally by a `HashMap`. Equal objects must have equal hash codes (Chapter 7), and a key's hash-relevant fields must never change while it remains stored. Expected O(1) performance depends on good hash distribution, and iteration order is unspecified.

### Lesson 4: TreeMap, TreeSet, LinkedHashMap, and ordering

`HashMap`/`HashSet` promise no particular order; `LinkedHashMap`/`LinkedHashSet` preserve insertion order; `TreeMap`/`TreeSet` maintain sorted order in a red-black tree; `EnumMap`/`EnumSet` use enum declaration order. Tree operations run in O(log n) and support navigation methods like `floor`, `ceiling`, `higher`, and `lower`. Sorted collections detect duplicates using the comparator, not `equals` — a comparator that ties on the fields it compares silently collapses distinct elements into one position unless a tie-breaker is added.

### Lesson 5: Unmodifiable views, immutable snapshots, and defensive copies

An unmodifiable view blocks mutation through its own API but still reflects later changes to whatever collection it wraps; an immutable snapshot (`List.copyOf`) is a completely independent, frozen-at-copy-time copy. Both are shallow: they freeze which object references a collection holds, not the internal state of the objects themselves. `List.of`/`List.copyOf` reject `null` elements immediately. `Arrays.asList` returns a fixed-size, array-backed list where `set` works but `add`/`remove` do not. Returning an internal mutable collection field directly lets callers bypass every validation rule a class enforces elsewhere; returning a snapshot instead closes that hole.

## Cheat sheet

### Choosing a collection

| Need | Choice |
|---|---|
| Positional access, duplicates allowed | `ArrayList` (random access) or `LinkedList` (sequential insert/remove) |
| No duplicates, no order guarantee needed | `HashSet` |
| No duplicates, insertion order matters | `LinkedHashSet` |
| No duplicates, sorted order | `TreeSet` |
| Key to value, no order guarantee needed | `HashMap` |
| Key to value, insertion order matters | `LinkedHashMap` |
| Key to value, sorted by key | `TreeMap` |
| Stack or queue behavior | `ArrayDeque` (not the legacy `Stack`) |
| Set/map keyed entirely by one enum type | `EnumSet`/`EnumMap` |

### Performance ballpark

| Structure | Get by index | Contains/get by key | Insert at end | Insert at front |
|---|---|---|---|---|
| `ArrayList` | O(1) | O(n) | amortized O(1) | O(n) |
| `LinkedList` | O(n) | O(n) | O(1) | O(1) |
| `ArrayDeque` | not supported | not applicable | O(1) | O(1) |
| `HashMap`/`HashSet` | not applicable | expected O(1) | — | — |
| `TreeMap`/`TreeSet` | not applicable | O(log n) | — | — |

### Protecting a returned collection

| Situation | Return |
|---|---|
| Callers should see current, still-changing state | `Collections.unmodifiableList(field)` (a view) |
| Callers need a stable, frozen result | `List.copyOf(field)` (a snapshot) |
| Never | the mutable field itself |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does any code rely on `HashMap`/`HashSet` iteration order for anything that must be deterministic?
- Is a `TreeSet`/`TreeMap` comparator missing a tie-breaker, risking silently dropped elements that are `equals`-distinct but comparator-equal?
- Does an index-based loop walk a `LinkedList`, risking quadratic performance?
- Does any method return a mutable collection field directly instead of a view or a snapshot?
- Are equal objects (per `equals`) guaranteed to also produce equal `hashCode()` values, especially for anything used as a hash-based key?
- Is the legacy `Stack` class used where `ArrayDeque` would be the better, unsynchronized choice?

## The judgment question

The judgment question asks what is appropriate when a report needs deterministic insertion order. The answer connects directly to Lesson 3 and Lesson 4: `HashMap`/`HashSet` make no ordering promise at all, and their apparent order can change between JVM versions, between runs, or after any operation that triggers internal resizing — relying on it, even if it happens to "look" stable in testing, is not a guarantee, it is an accident waiting to break. The correct fix is to reach for a structure that explicitly documents the ordering you need: `LinkedHashMap`/`LinkedHashSet` for insertion order, or `TreeMap`/`TreeSet` for sorted order. Sorting by identity hash is not a fix at all — identity hashes are themselves unspecified and arbitrary, no more meaningful for producing a deterministic report than the `HashMap`'s own internal order.

## Approaching the implementation lab

The lab asks for a case-sensitive count of how many elements of a `String[]` equal a target string.

1. Write the contract first: what should `frequency` return for an array with no matches, every element matching, and a mix?
2. Build a boundary table: an empty array, a target that never appears, a target that appears once, and a target that appears multiple times including consecutively and non-consecutively.
3. Notice this lab needs no collection at all beyond the input array itself — it is testing the same case-sensitive equality discipline from Chapter 7's `equals` contract, applied as a simple counting loop.
4. Keep the method deterministic and free of side effects, consistent with every function lab in this course.

## Approaching the debug lab

The debug lab's `TreeSet` is ordered by a comparator that compares only `age`, so two different people who happen to share an age collide at the same sorted position and the second insert is silently dropped.

1. Run the program and confirm the set's size is `1` instead of the expected `2`, even though two genuinely different `Person` records were added.
2. Recall Lesson 4's core warning: a sorted collection uses **only the comparator's result** to decide whether two elements occupy the same position — zero means "same slot," regardless of what `equals` would say about the same two objects. A comparator by `age` alone genuinely cannot distinguish "Ada, 30" from "Lin, 30".
3. Add a tie-breaker to the comparator — comparing by name (or any other field that reliably distinguishes them) whenever the primary comparison (age) ties — so no two distinct people the comparator should treat as different can compare as zero.
4. Confirm your fix preserves the demonstrated construction and insert calls exactly as written, and produces a size of `2`.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Benchmark, informally, inserting 10,000 elements at the front of an `ArrayList` versus a `LinkedList`, and explain the result using this chapter's memory-locality and Big-O vocabulary.
2. Deliberately trigger a `ConcurrentModificationException` by removing from a list with a plain enhanced `for` loop, then fix it with `Iterator.remove` or `removeIf`.
3. Build a small `LinkedHashMap`-based LRU cache using access order and `removeEldestEntry`, as Lesson 4 described, and demonstrate it evicting the correct entry under a small capacity.
4. Take a method from an earlier chapter that returns a mutable collection field, and fix it using this chapter's view/snapshot distinction, documenting which one you chose and why.

## Self-assessment

You are ready for Chapter 10 when you can do all of the following without notes:

- Choose the right collection interface (`List`, `Set`, `Map`, `Queue`, `Deque`) for a described requirement, and justify the choice by its contract, not habit.
- Explain why an index-based loop over a `LinkedList` can be far slower than the same loop over an `ArrayList`.
- Explain how a `HashMap` uses `hashCode` and `equals` together to locate a key, and why both methods must be consistent.
- Choose between `HashMap`, `LinkedHashMap`, and `TreeMap` for a described ordering requirement.
- Explain why a sorted collection can silently drop a distinct element when its comparator ties, and how a tie-breaker fixes it.
- Decide, for a method returning a collection, whether a live view or a frozen snapshot is correct, and implement whichever is needed without leaking the internal mutable field.
