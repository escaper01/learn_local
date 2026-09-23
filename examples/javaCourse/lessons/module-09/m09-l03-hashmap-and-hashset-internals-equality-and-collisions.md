# HashMap and HashSet internals, equality, and collisions

`HashMap` and `HashSet` are probably the most used data structures in production Java. They power caches, indexes by ID, deduplication, counting, and grouping. They feel magical: `contains` on a set of ten million strings answers almost instantly, while `List.contains` would scan all ten million. The magic has a mechanism called **hashing**, and that mechanism depends on your own classes following a contract. When the contract is broken, the bugs are silent: items "disappear" from sets and lookups return `null` for keys you can see in the debugger.

What you will learn:

- What a hash function is and what makes one good or bad, using simplistic examples.
- How a hash table stores entries in buckets and why collisions are unavoidable.
- How a key is found: the hash picks a bucket, then `equals` decides the true match.
- How `java.util.HashMap` works inside: capacity, load factor, resizing, bit spreading, and tree bins.
- The `equals`/`hashCode` contract, why records get it right, and why mutable keys are dangerous.
- Everyday `HashMap` APIs: `merge`, `getOrDefault`, `containsKey`, `computeIfAbsent`.

## The idea: turn a key into a location

Imagine a cloakroom with 100 numbered hooks. If you hung coats in arrival order, finding one coat would mean checking every hook. Instead, the attendant uses a rule: "take the last two digits of the ticket number, and hang the coat on that hook." To find a coat later, apply the same rule to the ticket and walk straight to the hook.

That rule is a **hash function**: a function that turns a key into an integer, called a **hash code**. A **hash table** is an array of slots, usually called **buckets**, and the bucket index is computed from the hash code, for example `hash mod capacity`. Lookup becomes: compute hash, jump to bucket, look only at the few entries there.

A useful hash function must be:

- **Deterministic**: the same key always produces the same hash while stored.
- **Consistent with equality**: keys that are equal must produce the same hash.
- **Well spread**: different keys should usually land in different buckets.
- **Cheap to compute**: otherwise the lookup is no longer fast.

## Simplistic hash functions and why they fail

Two tempting but weak hash functions for strings:

- **First-letter hash**: use the first character's code. Every word starting with `c` collides.
- **Character-sum hash**: add all character codes. Any two anagrams collide, because addition ignores order.

Java's `String.hashCode()` is designed to do better. It computes a polynomial that makes each character's *position* matter:

```text
hash = s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]     (computed in int arithmetic, overflow wraps)
```

The following program compares all three on a few words.

```java
public class SimpleHashes {
    public static void main(String[] args) {
        String[] words = {"cat", "cow", "listen", "silent", "Aa", "BB"};
        System.out.println("word    firstLetter  charSum  String.hashCode  bucket(16)");
        for (String word : words) {
            System.out.printf("%-7s %11d %8d %16d %11d%n",
                    word, firstLetterHash(word), charSumHash(word),
                    word.hashCode(), Math.floorMod(word.hashCode(), 16));
        }
    }

    // Simplistic hash 1: only looks at the first character.
    static int firstLetterHash(String s) {
        return s.isEmpty() ? 0 : s.charAt(0);
    }

    // Simplistic hash 2: adds all characters, so order is ignored.
    static int charSumHash(String s) {
        int sum = 0;
        for (int i = 0; i < s.length(); i++) {
            sum += s.charAt(i);
        }
        return sum;
    }
}
```

```text
word    firstLetter  charSum  String.hashCode  bucket(16)
cat              99      312            98262           6
cow              99      329            98699          11
listen          108      655      -1102508601           7
silent          115      655       -902327211           5
Aa               65      162             2112           0
BB               66      132             2112           0
```

Observations:

- `cat` and `cow` collide under the first-letter hash; `listen` and `silent` collide under the character-sum hash. `String.hashCode()` separates both pairs.
- Hash codes can be negative, so the bucket index uses `Math.floorMod`, which always returns a value in `0..15`. Using `%` directly on a negative number would give a negative index.
- Even a good hash function has collisions: `"Aa"` and `"BB"` have the same `String.hashCode()` (65*31 + 97 = 2112 and 66*31 + 66 = 2112).

Collisions are not a bug. There are about four billion `int` values but infinitely many possible strings, so by the pigeonhole principle different keys *must* sometimes share a hash code. And with only 16 buckets, keys with different hash codes share buckets all the time. Every hash table must handle collisions correctly.

## Buckets, chains, and the role of equality

The most common collision strategy, and the one `HashMap` uses, is **separate chaining**: each bucket holds a small list of entries. To look up a key:

1. Compute the key's hash code.
2. Convert it to a bucket index.
3. Walk the entries in that bucket. For each candidate, first compare stored hash codes (a cheap filter), then call `equals`.
4. If `equals` returns `true`, that entry is the match. If no candidate is equal, the key is absent.

Step 4 is the heart of correctness. **The hash only narrows the search to a handful of candidates; equality checking is what confirms or rejects a real match.** Two different keys with the same hash code are both stored safely, side by side, because `equals` tells them apart. A hash table never assumes that matching hashes mean identical keys, and it never overwrites an entry just because it landed in the same bucket.

Here is a complete teaching hash table with separate chaining and resizing. It is deliberately small so that you can see every bucket.

```java
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class MiniHashTableDemo {
    public static void main(String[] args) {
        MiniHashTable table = new MiniHashTable(4);
        table.put("apple", 3);
        table.put("pear", 8);          // different hash, same bucket as apple
        table.put("Aa", 1);
        table.put("apple", 5);         // existing key: replaces the value
        table.dump();

        System.out.println("get(apple) = " + table.get("apple"));
        System.out.println("get(pear)  = " + table.get("pear"));
        System.out.println("get(BB)    = " + table.get("BB"));

        table.put("BB", 2);            // same hashCode as "Aa"; 4 entries > 4 * 0.75
        table.dump();
        System.out.println("get(Aa) = " + table.get("Aa") + ", get(BB) = " + table.get("BB"));
    }
}

// A teaching hash table with separate chaining. Not thread-safe, no null keys.
class MiniHashTable {
    private static final double LOAD_FACTOR = 0.75;

    private record Entry(String key, int hash, int[] value) { }

    private List<List<Entry>> buckets;
    private int size;

    MiniHashTable(int capacity) {
        buckets = newBuckets(capacity);
    }

    private static List<List<Entry>> newBuckets(int capacity) {
        List<List<Entry>> result = new ArrayList<>();
        for (int i = 0; i < capacity; i++) {
            result.add(new ArrayList<>());
        }
        return result;
    }

    private int indexFor(int hash, int capacity) {
        return Math.floorMod(hash, capacity);
    }

    void put(String key, int value) {
        Objects.requireNonNull(key);
        int hash = key.hashCode();
        List<Entry> bucket = buckets.get(indexFor(hash, buckets.size()));
        for (Entry entry : bucket) {
            // cheap hash comparison first, then the real test: equals
            if (entry.hash() == hash && entry.key().equals(key)) {
                entry.value()[0] = value;
                return;
            }
        }
        bucket.add(new Entry(key, hash, new int[] {value}));
        size++;
        if (size > buckets.size() * LOAD_FACTOR) {
            resize();
        }
    }

    Integer get(String key) {
        int hash = key.hashCode();
        for (Entry entry : buckets.get(indexFor(hash, buckets.size()))) {
            if (entry.hash() == hash && entry.key().equals(key)) {
                return entry.value()[0];
            }
        }
        return null;
    }

    private void resize() {
        List<List<Entry>> old = buckets;
        buckets = newBuckets(old.size() * 2);
        System.out.println("-- resize " + old.size() + " -> " + buckets.size() + " buckets");
        for (List<Entry> bucket : old) {
            for (Entry entry : bucket) {
                buckets.get(indexFor(entry.hash(), buckets.size())).add(entry);
            }
        }
    }

    void dump() {
        for (int i = 0; i < buckets.size(); i++) {
            StringBuilder line = new StringBuilder("bucket " + i + ":");
            for (Entry entry : buckets.get(i)) {
                line.append(" [").append(entry.key()).append('=').append(entry.value()[0])
                    .append(" h=").append(entry.hash()).append(']');
            }
            System.out.println(line);
        }
    }
}
```

```text
bucket 0: [Aa=1 h=2112]
bucket 1:
bucket 2: [apple=5 h=93029210] [pear=8 h=3436774]
bucket 3:
get(apple) = 5
get(pear)  = 8
get(BB)    = null
-- resize 4 -> 8 buckets
bucket 0: [Aa=1 h=2112] [BB=2 h=2112]
bucket 1:
bucket 2: [apple=5 h=93029210]
bucket 3:
bucket 4:
bucket 5:
bucket 6: [pear=8 h=3436774]
bucket 7:
get(Aa) = 1, get(BB) = 2
```

### Step-by-step trace

| Step | Operation | Hash | Bucket (capacity) | What happens |
|---|---|---|---|---|
| 1 | `put("apple", 3)` | 93029210 | 2 (4) | Bucket empty: append new entry, size 1 |
| 2 | `put("pear", 8)` | 3436774 | 2 (4) | Candidate `apple` has a different hash: append, size 2 |
| 3 | `put("Aa", 1)` | 2112 | 0 (4) | Bucket empty: append, size 3 (threshold is 3, not exceeded) |
| 4 | `put("apple", 5)` | 93029210 | 2 (4) | Hash matches and `equals` is true: replace value, size stays 3 |
| 5 | `get("BB")` | 2112 | 0 (4) | Candidate `Aa` has the same hash, but `equals` is false: absent |
| 6 | `put("BB", 2)` | 2112 | 0 (4) | Same hash as `Aa`, `equals` false: append, size 4 > 3, resize |
| 7 | resize | all | 8 buckets | Each entry moves to `hash mod 8`: `pear` moves to 6 |

Notice two different kinds of collision. `apple` and `pear` had *different* hash codes that happened to land in the same bucket; resizing separated them. `Aa` and `BB` have *identical* hash codes, so no amount of resizing separates them; only `equals` distinguishes them.

## How java.util.HashMap really works

The real class follows the same design with production refinements. The following are OpenJDK implementation details, useful for understanding performance, not promises you may code against:

- The table starts with 16 buckets by default and is created lazily on the first `put`.
- Capacity is always a power of two, so the bucket index is computed with a fast bit mask: `index = hash & (capacity - 1)`.
- Before masking, `HashMap` *spreads* the hash with `h ^ (h >>> 16)`, mixing high bits into low bits so that keys differing only in high bits do not all collide.
- The default **load factor** is 0.75. When `size` exceeds `capacity * 0.75`, the table doubles and entries are redistributed.
- A bucket normally holds a linked chain of nodes. If one bucket grows to 8 entries and the table has at least 64 buckets, that bucket becomes a small red-black tree ("treeified"), so even a flood of colliding keys costs O(log n) per lookup instead of O(n).
- `HashMap` permits one `null` key and any number of `null` values.
- `HashSet` is implemented with a `HashMap` internally: each element is stored as a key, with a shared dummy object as the value. Everything in this lesson applies to `HashSet` too.

> **Note:** Because resizing and bucket layout depend on capacity and content, the iteration order of a `HashMap` or `HashSet` is unspecified and can change as the map grows. Never build a report or a test expectation on it.

### Costs

| Operation | Expected (good hash) | Worst case (all keys collide) |
|---|---|---|
| `put`, `get`, `containsKey`, `remove` | O(1) | O(log n) with tree bins, O(n) for chains |
| `containsValue` | O(n) | O(n) |
| Iterate all entries | O(capacity + size) | O(capacity + size) |
| Resize | O(n), but amortized over many puts | O(n) |

Expected O(1) relies on the hash function spreading keys well. With a deliberately terrible `hashCode()` such as `return 42;`, every key shares one bucket.

## The equals and hashCode contract

Because lookup uses the hash first and `equals` second, every key type must obey these rules from `Object`:

1. If `a.equals(b)` is true, then `a.hashCode() == b.hashCode()` must be true.
2. If hash codes are equal, the objects may or may not be equal (collisions are allowed).
3. `equals` must be reflexive, symmetric, transitive, and consistent, and `x.equals(null)` must be false.
4. While an object is used as a key or set element, the fields used by `equals` and `hashCode` must not change.

`Object`'s default `equals` is identity (`==`), and its default `hashCode` is usually different for every object. If you override `equals` to compare content but forget `hashCode`, two "equal" objects will almost always hash to different buckets, and the map never gets far enough to call your `equals`.

```java
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class EqualityContract {
    public static void main(String[] args) {
        Set<BrokenPoint> broken = new HashSet<>();
        broken.add(new BrokenPoint(1, 2));
        System.out.println("equals says equal:      " + new BrokenPoint(1, 2).equals(new BrokenPoint(1, 2)));
        System.out.println("BrokenPoint found?      " + broken.contains(new BrokenPoint(1, 2)));

        Set<Point> fixed = new HashSet<>();
        fixed.add(new Point(1, 2));
        System.out.println("record Point found?     " + fixed.contains(new Point(1, 2)));
        System.out.println("equal records, same hash: " + (new Point(1, 2).hashCode() == new Point(1, 2).hashCode()));

        Map<MutableKey, String> owners = new HashMap<>();
        MutableKey key = new MutableKey("alice");
        owners.put(key, "laptop");
        key.name = "bob";   // mutating a key while it is stored
        System.out.println("size after mutation:    " + owners.size());
        System.out.println("get(bob):               " + owners.get(new MutableKey("bob")));
        System.out.println("get(alice):             " + owners.get(new MutableKey("alice")));
    }
}

// Overrides equals but forgets hashCode: breaks hash-based collections.
class BrokenPoint {
    private final int x;
    private final int y;

    BrokenPoint(int x, int y) {
        this.x = x;
        this.y = y;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof BrokenPoint p && p.x == x && p.y == y;
    }
}

// Records generate consistent equals and hashCode from their components.
record Point(int x, int y) { }

// Correct equals/hashCode, but the field that feeds them can change.
class MutableKey {
    String name;

    MutableKey(String name) {
        this.name = name;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MutableKey k && k.name.equals(name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name);
    }
}
```

```text
equals says equal:      true
BrokenPoint found?      false
record Point found?     true
equal records, same hash: true
size after mutation:    1
get(bob):               null
get(alice):             null
```

The mutable-key case is the nastiest. The entry was filed in the bucket for `"alice"`. After the rename, a lookup for `"bob"` goes to the `"bob"` bucket and finds nothing; a lookup for `"alice"` goes to the right bucket, but `equals` now fails because the stored key says `"bob"`. The entry is still counted in `size()` but is effectively lost.

## Everyday HashMap patterns

```java
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class WordFrequency {
    public static void main(String[] args) {
        String text = "the cat saw The dog and the Cat ran";
        Map<String, Integer> counts = new HashMap<>();
        for (String raw : text.split(" ")) {
            String word = raw.toLowerCase();       // explicit normalization policy
            counts.merge(word, 1, Integer::sum);
        }

        System.out.println("distinct words: " + counts.size());
        System.out.println("the -> " + counts.get("the"));
        System.out.println("cat -> " + counts.getOrDefault("cat", 0));
        System.out.println("fox -> " + counts.getOrDefault("fox", 0));

        // Deterministic report: sort entries by count descending, then word.
        List<Map.Entry<String, Integer>> entries = new ArrayList<>(counts.entrySet());
        entries.sort(Map.Entry.<String, Integer>comparingByValue().reversed()
                .thenComparing(Map.Entry.comparingByKey()));
        for (Map.Entry<String, Integer> entry : entries) {
            System.out.println("  " + entry.getKey() + "=" + entry.getValue());
        }

        Map<String, String> nicknames = new HashMap<>();
        nicknames.put("robert", null);
        System.out.println("get(robert)=" + nicknames.get("robert")
                + " containsKey(robert)=" + nicknames.containsKey("robert")
                + " containsKey(ann)=" + nicknames.containsKey("ann"));

        Map<Integer, List<String>> byLength = new HashMap<>();
        for (String word : List.of("ox", "cat", "dog", "bee", "horse")) {
            byLength.computeIfAbsent(word.length(), len -> new ArrayList<>()).add(word);
        }
        System.out.println("length 3 -> " + byLength.get(3));
    }
}
```

```text
distinct words: 6
the -> 3
cat -> 2
fox -> 0
  the=3
  cat=2
  and=1
  dog=1
  ran=1
  saw=1
get(robert)=null containsKey(robert)=true containsKey(ann)=false
length 3 -> [cat, dog, bee]
```

- `merge(key, 1, Integer::sum)` stores 1 for a new key and adds 1 to an existing count, in one lookup.
- `getOrDefault` avoids a `NullPointerException` when unboxing a missing count.
- `get` returning `null` is ambiguous in a map that allows `null` values: it means either "absent" or "present with null". `containsKey` tells them apart.
- `computeIfAbsent` creates a group container on first use. Keep the callback simple; it must not modify the same map.
- The report sorts entries explicitly instead of trusting the map's iteration order.

## Common mistakes

### Overriding equals without hashCode

Shown above: `contains` returns `false` for an object that `equals` a stored one. Fix: override both together (your IDE can generate them), use `Objects.hash(...)`, or make the type a `record`.

### Using mutable fields in keys

Changing a key's `equals`-relevant fields after insertion strands the entry. Fix: use immutable keys (`String`, `Integer`, records with immutable components). If an object must change, remove it, change it, and re-insert it.

### Assuming a matching hash means a matching key

```java
// fragment: WRONG lookup logic in a hand-written table
if (entry.hash() == hash) {
    return entry.value();          // returns BB's value when asked for Aa
}
```

Fix: always confirm with `equals` after the hash check, as `MiniHashTable.get` does.

### Unboxing a missing value

```java
int total = counts.get("fox");     // fragment: throws NullPointerException if "fox" is absent
```

Fix: `counts.getOrDefault("fox", 0)`, or check `containsKey` first.

### Printing a HashMap as a report

The printed order is an accident of the current capacity and hash codes. Fix: sort entries, or use `LinkedHashMap` or `TreeMap` (next lesson).

### Using a negative hash as an index

`hash % capacity` is negative for negative hash codes and throws `ArrayIndexOutOfBoundsException`. Fix: `Math.floorMod(hash, capacity)` or a power-of-two mask.

## Best practices

- Prefer immutable key types; records are ideal because they generate matching `equals` and `hashCode`.
- Define an explicit normalization policy (trim, lower-case, locale) before using user text as a key, and document it.
- Pre-size a map for a known large workload with `HashMap.newHashMap(expectedSize)` (Java 19+), which accounts for the load factor for you; avoid speculative huge allocations.
- Use `merge`, `computeIfAbsent`, and `getOrDefault` to express intent in a single lookup.
- `HashMap` is not thread-safe. For shared concurrent updates, use `ConcurrentHashMap` or confine the map to one thread.
- Never depend on hash iteration order in output, tests, or file formats.

## Summary

- A hash function turns a key into an integer; a hash table uses it to pick a bucket so lookups inspect only a few candidates.
- Simplistic hash functions (first letter, character sum) collide often; `String.hashCode()` weights characters by position, yet collisions still exist and are unavoidable.
- Hashing narrows the search; `equals` decides the actual match among the candidates in a bucket.
- `HashMap` uses power-of-two capacity, hash spreading, a 0.75 load factor with doubling, and tree bins for heavily collided buckets. `HashSet` is backed by a `HashMap`.
- Equal objects must have equal hash codes, and key fields must not change while stored.
- Expected O(1) operations depend on good hash distribution; iteration order is unspecified.

## Practice

### Warm-up

1. Compute by hand the `String.hashCode()` of `"Ab"` and `"BC"`, then check with a program. Do they collide?
2. Add three `record Book(String isbn, String title)` objects to a `HashSet`, including two equal ones, and predict the size.

### Core

1. Extend `MiniHashTable` with `remove(String key)` and `containsKey(String key)`. Test removing a key that shares a bucket with another key.
2. Write a word-frequency method with a documented normalization policy (trim, lower-case, skip blanks). Test empty input, repeated words, and case differences, and print the result in a deterministic order.
3. Write a class with a constant `hashCode()` of 42 and correct `equals`. Show that the set still works correctly, then explain what happened to its performance.

### Challenge

1. Implement open addressing (linear probing) instead of chaining in a teaching table: on collision, try the next index. Handle wrap-around and resizing, then explain why deletion is harder with probing than with chains.

## Check your understanding

1. Why are hash collisions unavoidable for a type like `String`?
2. When two candidate keys land in the same bucket, what step decides whether a lookup has found its key?
3. Why do `"Aa"` and `"BB"` stay in the same bucket even after the table resizes, while other colliding keys separate?
4. What goes wrong if a class overrides `equals` but not `hashCode`?
5. Why might `map.get(key)` return `null` for a key that is present, and how do you tell the cases apart?
6. What happens to a `HashMap` entry if you mutate its key's fields after inserting it?
