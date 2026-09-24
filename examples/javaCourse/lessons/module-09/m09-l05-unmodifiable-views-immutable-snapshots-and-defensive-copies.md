# Unmodifiable views, immutable snapshots, and defensive copies

A method that returns a `List` field looks harmless — until a caller mutates that list and silently corrupts your object's internal state, exactly as Chapter 4's `LeakyRoster` demonstrated for a plain array. Collections raise the stakes: a `List`, `Set`, or `Map` field is mutated through a rich API of `add`, `remove`, `put`, and `clear` methods, all of which a returned reference exposes just as directly as a setter would. This lesson finishes the defensive-design story Chapter 4 began, applied specifically to Java's collection types, and draws a critical distinction most developers blur together: an **unmodifiable view** and an **immutable snapshot** are not the same protection at all.

What you will learn:

- The difference between an unmodifiable view (still reflects changes to its backing collection) and an immutable snapshot (frozen at the moment of copying)
- Why both are still only shallowly immutable — the same caveat Chapter 6 taught for records
- Why `List.of` and `List.copyOf` reject `null` elements, and what that means for your own data
- The `Arrays.asList` trap: a fixed-size list backed by an array, where `set` works but `add`/`remove` do not
- How returning a repository's internal mutable list lets callers bypass validation entirely, and how a snapshot closes that hole

## View versus snapshot: two different protections

`Collections.unmodifiableList` wraps an existing list in a **view** — a thin wrapper that blocks mutation through *its own* API, but still reads through to whatever the underlying list currently contains. `List.copyOf` instead creates a **snapshot** — a completely separate, independent copy, frozen at the exact moment you called it.

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class ViewVersusSnapshot {
    public static void main(String[] args) {
        var source = new ArrayList<>(List.of("A"));
        var view = Collections.unmodifiableList(source);
        var snapshot = List.copyOf(source);

        source.add("B");
        System.out.println("view:     " + view);
        System.out.println("snapshot: " + snapshot);

        try {
            view.add("C");
        } catch (UnsupportedOperationException e) {
            System.out.println("view rejects direct mutation: " + e.getClass().getSimpleName());
        }

        try {
            snapshot.add("C");
        } catch (UnsupportedOperationException e) {
            System.out.println("snapshot rejects direct mutation: " + e.getClass().getSimpleName());
        }
    }
}
```

Output:

```text
view:     [A, B]
snapshot: [A]
view rejects direct mutation: UnsupportedOperationException
snapshot rejects direct mutation: UnsupportedOperationException
```

This is exactly the chapter's concept-check distinction: after `source.add("B")`, the **view** shows `[A, B]` — it has no data of its own, it is simply a permission-restricted window onto `source`, and it always reflects whatever `source` currently holds. The **snapshot** shows `[A]` — it copied the elements present at the moment `List.copyOf` ran, and nothing that happens to `source` afterward can ever reach it. Both refuse direct mutation through their own `add` method identically; the difference is entirely about whether they stay connected to a *different*, still-mutable collection elsewhere.

| | `Collections.unmodifiableList(source)` | `List.copyOf(source)` |
|---|---|---|
| Own storage? | No — wraps `source` | Yes — independent copy |
| Reflects later changes to `source`? | Yes | No |
| Rejects direct mutation via its own API? | Yes | Yes |
| Typical use | Exposing a still-changing collection read-only | Freezing a result at a specific point in time |

## Still only shallow: the element caveat

Just as Chapter 6 showed for records, both of these protections only freeze the **collection structure** — which references it holds, in which positions — not the objects those references point to. A collection of genuinely mutable elements is still only shallowly protected:

```java
import java.util.List;

public class ShallowImmutabilityCollections {
    static final class MutablePoint {
        int x;
        MutablePoint(int x) { this.x = x; }
        public String toString() { return "P(" + x + ")"; }
    }

    public static void main(String[] args) {
        MutablePoint p = new MutablePoint(1);
        List<MutablePoint> snapshot = List.copyOf(List.of(p));

        p.x = 99;
        System.out.println("snapshot after mutating the shared element: " + snapshot);
        System.out.println("the list of references is frozen; the element itself is not");

        try {
            List.of("a", null, "c");
        } catch (NullPointerException e) {
            System.out.println("List.of rejects null: " + e.getClass().getSimpleName());
        }
    }
}
```

Output:

```text
snapshot after mutating the shared element: [P(99)]
the list of references is frozen; the element itself is not
List.of rejects null: NullPointerException
```

Even though `snapshot` is a genuine `List.copyOf` snapshot — no later `add` or `remove` can ever affect it — mutating the `MutablePoint` object it holds a reference to is completely unaffected by any of that structural protection, and shows up immediately. This is the exact same lesson Chapter 6 taught about a record's `List` component: freezing *which objects* a collection holds says nothing about whether those objects themselves can still change.

The second half of this example demonstrates a separate, equally important guarantee: `List.of` (and `List.copyOf`) reject `null` elements outright, throwing `NullPointerException` rather than silently accepting one. If your own data can legitimately contain `null`, these factory methods are the wrong tool; if it cannot, this rejection catches a real bug immediately instead of letting a `null` travel silently into a collection where it might cause a much more confusing failure later, exactly the "fail fast" principle Chapter 4 taught for null contracts generally.

## The Arrays.asList trap

`Arrays.asList` looks like a convenient way to turn an array into a `List`, and it is — but the `List` it returns is neither a full mutable list nor a fully unmodifiable one. It is a **fixed-size list backed directly by the array**, which produces a genuinely confusing middle ground:

```java
import java.util.Arrays;
import java.util.List;

public class ArraysAsListTrap {
    public static void main(String[] args) {
        String[] backing = {"a", "b", "c"};
        List<String> fixedSize = Arrays.asList(backing);

        fixedSize.set(0, "A");
        System.out.println("set worked: " + fixedSize + ", backing array: " + Arrays.toString(backing));

        backing[1] = "CHANGED";
        System.out.println("changing the array is visible through the list: " + fixedSize);

        try {
            fixedSize.add("d");
        } catch (UnsupportedOperationException e) {
            System.out.println("add rejected: " + e.getClass().getSimpleName());
        }
    }
}
```

Output:

```text
set worked: [A, b, c], backing array: [A, b, c]
changing the array is visible through the list: [A, CHANGED, c]
add rejected: UnsupportedOperationException
```

Three behaviors, each easy to get wrong from memory: **`set` succeeds**, and it writes straight through to the underlying array (`fixedSize.set(0, "A")` changed `backing[0]` too — this is a *view*, exactly like `Collections.unmodifiableList`, except this one still permits element replacement). **Mutating the array directly is visible through the list**, for the identical reason. **`add` and `remove` are rejected**, because the list's size is fixed to the array's length — there is nowhere to grow or shrink it. `Arrays.asList` is genuinely useful for quickly constructing a list from an array literal for reading and in-place replacement, but treating it as either "a normal mutable `ArrayList`" or "a fully protected unmodifiable list" is a mistake in either direction.

## Why returning an internal list bypasses validation

Return an internal mutable field directly, and every validation rule your class enforces in its own methods becomes entirely optional for any caller who reaches in through the returned reference instead — the exact aliasing danger Chapter 4 introduced with a plain array, now shown with a collection field:

```java
import java.util.ArrayList;
import java.util.List;

public class RepositoryLeak {
    static final class TaskRepository {
        private final List<String> tasks = new ArrayList<>();

        void add(String task) {
            if (task == null || task.isBlank()) {
                throw new IllegalArgumentException("task must not be blank");
            }
            tasks.add(task);
        }

        List<String> allTasks() {
            return tasks;
        }
    }

    public static void main(String[] args) {
        TaskRepository repo = new TaskRepository();
        repo.add("Write chapter");

        List<String> leaked = repo.allTasks();
        leaked.add("");
        leaked.add(null);

        System.out.println("repository now contains invalid tasks it never validated: " + repo.allTasks());
    }
}
```

Output:

```text
repository now contains invalid tasks it never validated: [Write chapter, , null]
```

`add(String task)` carefully rejects blank and would reject a genuinely invalid task — but `allTasks()` hands back the exact same `List` object the field itself points to, with its full mutable API completely intact. A blank string and an outright `null` both end up inside `tasks`, having gone through **none** of `add`'s validation, because the caller never called `add` at all — they called `.add(...)` directly on the leaked list. The `private` keyword on the `tasks` field did nothing to prevent this, exactly as Chapter 4 showed for a private array field: `private` only controls who can reference the field *by name*; it says nothing about what a reference obtained through a public method can still do.

The fix, unsurprisingly, is the same snapshot tool this lesson opened with:

```java
import java.util.ArrayList;
import java.util.List;

public class RepositoryFixed {
    static final class TaskRepository {
        private final List<String> tasks = new ArrayList<>();

        void add(String task) {
            if (task == null || task.isBlank()) {
                throw new IllegalArgumentException("task must not be blank");
            }
            tasks.add(task);
        }

        List<String> allTasks() {
            return List.copyOf(tasks);
        }
    }

    public static void main(String[] args) {
        TaskRepository repo = new TaskRepository();
        repo.add("Write chapter");

        List<String> returned = repo.allTasks();
        try {
            returned.add("sneaky");
        } catch (UnsupportedOperationException e) {
            System.out.println("returned snapshot rejects mutation: " + e.getClass().getSimpleName());
        }

        try {
            repo.add(null);
        } catch (IllegalArgumentException e) {
            System.out.println("repository still validates every insertion: " + e.getMessage());
        }

        System.out.println("repository contents remain valid: " + repo.allTasks());
    }
}
```

Output:

```text
returned snapshot rejects mutation: UnsupportedOperationException
repository still validates every insertion: task must not be blank
repository contents remain valid: [Write chapter]
```

`allTasks()` now returns `List.copyOf(tasks)` — a snapshot, not the live field. Every attempted mutation through the returned list is rejected outright, and the **only** way to add a task is still through `add(String)`, which still enforces its validation rule every single time. The repository's internal invariant — "every stored task is non-null and non-blank" — is now genuinely, structurally guaranteed, not merely hoped for.

## What happens under the hood

A view and a snapshot solve two different problems, and choosing between them is a real design decision, not a style preference: return a **view** when callers should always see the collection's *current* state as it evolves (a live dashboard, a collection you intentionally want callers to observe changing over time), and return a **snapshot** when callers need a stable, unchanging picture as of one specific moment — which, for anything resembling a repository's stored data, is almost always the safer and more predictable choice, precisely because it also closes the validation-bypass hole `RepositoryLeak` demonstrated. Neither one, by itself, protects the *elements* inside the collection from their own internal mutation — that still requires the individual elements themselves to be immutable, exactly as Chapter 6 taught for record components, or defensively copied at the same two boundaries Chapter 4 first introduced.

## Common mistakes

**1. Returning a mutable collection field directly from a getter.** This is `LeakyRoster` and `RepositoryLeak`'s exact mistake: every validation rule the class enforces becomes optional for any caller who mutates the returned reference instead of calling a proper method.

**2. Confusing an unmodifiable view with an immutable snapshot.** A view still reflects later changes to whatever it wraps; only a snapshot is genuinely frozen at copy time. Choosing the wrong one produces confusing "why did this change on its own?" or "why doesn't this reflect the update?" bugs.

**3. Assuming a snapshot's elements are also frozen.** `List.copyOf` freezes which objects the list holds, not those objects' own internal state; mutable elements still need their own protection.

**4. Treating `Arrays.asList`'s result as a normal, fully mutable `ArrayList`.** `add` and `remove` throw, because the list's size is permanently fixed to the backing array's length.

**5. Passing data that might contain `null` to `List.of` or `List.copyOf`.** Both throw `NullPointerException` immediately; if `null` is a legitimate value in your domain, choose a different collection construction approach.

## Best practices

- Decide explicitly, for every method returning a collection, whether callers should see a live view or a frozen snapshot — and document that decision, since the return type alone cannot express it (this is exactly Chapter 8's "document ownership and mutability separately from the signature" advice, applied to collections).
- Default to returning `List.copyOf(...)` (or the equivalent for `Set`/`Map`) from any method exposing a repository's or an object's internal collection, unless you have a specific, deliberate reason for callers to observe live changes.
- Remember that both views and snapshots are shallow; protect mutable elements separately if their internal state must also stay frozen.
- Use `Arrays.asList` only when you specifically want a fixed-size, array-backed list for reading and element replacement — never as a substitute for a genuinely growable or genuinely immutable list.
- Treat `List.of`/`List.copyOf`'s rejection of `null` as a feature that catches bugs early, and choose a different construction path only when `null` is a value your domain genuinely needs to represent.

## Summary

- An unmodifiable view (`Collections.unmodifiableList`) blocks mutation through its own API but still reflects later changes to the collection it wraps; an immutable snapshot (`List.copyOf`) is a completely independent, frozen-at-copy-time copy.
- Both protections are shallow: they freeze which object references a collection holds, not the internal state of the objects those references point to.
- `List.of` and `List.copyOf` reject `null` elements immediately, catching a class of bug early rather than letting `null` travel silently into your data.
- `Arrays.asList` returns a fixed-size list backed directly by its array: `set` writes through to the array (and vice versa), but `add`/`remove` are rejected because its size cannot change.
- Returning an internal mutable collection field directly lets callers bypass every validation rule a class enforces in its own methods; returning `List.copyOf(...)` instead closes that hole completely.

## Practice

Warm-up:

1. Wrap an `ArrayList` in `Collections.unmodifiableList`, mutate the original list, and confirm the view reflects the change.
2. Create a `List.copyOf` snapshot of the same original list, mutate the original again, and confirm the snapshot does not reflect it.
3. Attempt to pass a `null` element to `List.of` and read the resulting exception.

Core:

1. Design a small `Inventory` class holding a `private final Map<String, Integer>` of item counts, with an `add(String item, int count)` method that validates `count > 0`, and an `itemCounts()` method returning a safe, non-leaking view of the data. Justify, in a comment, whether you chose a view or a snapshot.
2. Reproduce `ArraysAsListTrap`'s three behaviors with an array and list type of your own choosing, and write a short paragraph explaining, in your own words, why `Arrays.asList` is neither fully mutable nor fully unmodifiable.
3. Take a class from an earlier chapter that returns a mutable collection field directly, and fix it using the technique from `RepositoryFixed`, then write a test proving external mutation attempts on the returned collection no longer succeed.

Challenge:

1. Design a repository class where callers genuinely need to observe live updates (choose a believable scenario — a monitoring dashboard, a live queue length), and implement its "read" method as a deliberate unmodifiable *view* rather than a snapshot, documenting explicitly why a view is the correct choice here, in contrast with `RepositoryFixed`'s snapshot choice.
2. Design a small immutable wrapper class around a `List<T>` of mutable elements, where the wrapper itself uses `List.copyOf` to freeze its structure, but also document (in a comment, since Java's type system cannot enforce this) exactly which element-mutation risks remain, and write a short program demonstrating one of them concretely.

## Check your understanding

1. After `source.add("new item")`, does `Collections.unmodifiableList(source)` show the new item? Does `List.copyOf(source)` (taken before the `add`)?
2. Why does `List.copyOf` freezing "which objects a list holds" not protect against a mutable element inside that list changing?
3. Why does `List.of("a", null, "c")` throw, and what does that protect you from?
4. What can you do with a list returned by `Arrays.asList` that you cannot, and what can you do that you also cannot?
5. In `RepositoryLeak`, which specific line lets an invalid task bypass `add`'s validation entirely, and why does `private` not prevent it?
6. What is the one-line fix that turns `RepositoryLeak` into `RepositoryFixed`, and why does it also prevent future validation bypasses, not just the ones demonstrated?
