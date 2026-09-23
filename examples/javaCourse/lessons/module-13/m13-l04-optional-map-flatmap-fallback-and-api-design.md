# Optional map, flatMap, fallback, and API design

Tony Hoare, who introduced null references, later called them his "billion-dollar mistake". A method that returns `null` for "not found" hides that possibility in its documentation, if anywhere, and the first caller who forgets to check gets a `NullPointerException`, often far from the real cause. Java 8 introduced `java.util.Optional<T>` so that a method can say in its *type* that a result might be missing.

`Optional` is not a general replacement for `null`, and using it everywhere causes new problems. This lesson teaches how to create and consume Optionals fluently, how `map` and `flatMap` chain lookups, why the choice between `orElse` and `orElseGet` matters, and where Optional belongs in an API.

What you will learn:

- What `Optional` represents and how to create one with `of`, `ofNullable`, and `empty`
- How to transform and filter a possible value with `map`, `flatMap`, and `filter`
- The fallback methods `orElse`, `orElseGet`, `orElseThrow`, and `or`, and when each is evaluated
- How to act on presence with `ifPresent` and `ifPresentOrElse`
- Primitive Optionals such as `OptionalInt`
- API design rules: where Optional helps, where it hurts, and why absence is not failure

## What Optional represents

An `Optional<T>` is a small immutable container that holds **either exactly one non-null value or nothing**. Think of it as a box delivered to your door: you must open the box to find out whether the item is inside, and the box itself reminds you that it might be empty. A `null` return is like a delivery that may or may not have happened, with no box to tell you.

There are three factory methods:

| Factory | Use when | If given `null` |
|---|---|---|
| `Optional.of(value)` | You know the value is not null | Throws `NullPointerException` immediately |
| `Optional.ofNullable(value)` | The value comes from code that may return null | Returns an empty Optional |
| `Optional.empty()` | You want to express absence | Not applicable |

`Optional.ofNullable` is the bridge from older null-returning APIs such as `Map.get` to Optional-based code.

## Transforming, filtering, and falling back

The following program shows the core toolkit in one place.

```java
import java.util.List;
import java.util.Optional;

public class OptionalBasics {
    static Optional<String> findNickname(String user) {
        return switch (user) {
            case "ada" -> Optional.of("  Countess  ");
            case "bob" -> Optional.of("   ");          // present but blank
            default -> Optional.empty();              // no nickname at all
        };
    }

    static String display(String user) {
        return findNickname(user)
                .map(String::trim)                    // transform if present
                .filter(name -> !name.isEmpty())      // may turn present into empty
                .orElse("Anonymous");                 // unwrap with a fallback
    }

    public static void main(String[] args) {
        // Creating
        Optional<String> some = Optional.of("value");
        Optional<String> none = Optional.empty();
        Optional<String> maybe = Optional.ofNullable(System.getenv("SURELY_NOT_SET_12345"));
        System.out.println(some + " " + none + " " + maybe);

        // Asking
        System.out.println(some.isPresent() + " " + none.isEmpty());

        // Transform, filter, fall back
        for (String user : List.of("ada", "bob", "cy")) {
            System.out.println(user + " -> " + display(user));
        }

        // map with a function that returns null gives an empty Optional
        Optional<String> mappedToNull = some.map(v -> null);
        System.out.println("map to null: " + mappedToNull);

        // Acting on presence
        some.ifPresent(v -> System.out.println("ifPresent saw " + v));
        none.ifPresentOrElse(
                v -> System.out.println("never"),
                () -> System.out.println("ifPresentOrElse ran the empty branch"));

        // or(): try another Optional-producing source (Java 9+)
        Optional<String> nick = findNickname("cy").or(() -> findNickname("ada"));
        System.out.println("or: " + nick);

        // stream(): zero or one element (Java 9+)
        System.out.println("stream counts: " + some.stream().count() + " " + none.stream().count());

        // orElseThrow with a domain-specific exception
        try {
            findNickname("cy").orElseThrow(() -> new IllegalArgumentException("no nickname for cy"));
        } catch (IllegalArgumentException e) {
            System.out.println("orElseThrow: " + e.getMessage());
        }
    }
}
```

```text
Optional[value] Optional.empty Optional.empty
true true
ada -> Countess
bob -> Anonymous
cy -> Anonymous
map to null: Optional.empty
ifPresent saw value
ifPresentOrElse ran the empty branch
or: Optional[  Countess  ]
stream counts: 1 0
orElseThrow: no nickname for cy
```

Trace `display("bob")` step by step:

1. `findNickname("bob")` returns `Optional["   "]`: a value is present.
2. `map(String::trim)` applies `trim` to the value, giving `Optional[""]`.
3. `filter(name -> !name.isEmpty())` tests `""`, gets `false`, and returns `Optional.empty`.
4. `orElse("Anonymous")` sees an empty Optional and returns the fallback.

For `display("cy")`, step 1 already yields an empty Optional, so `map` and `filter` do nothing: they skip their function entirely and pass the emptiness along. This "skip when empty" behavior is what makes chains safe without explicit `if` statements.

## `map` versus `flatMap`

`map(f)` applies `f` to the value and wraps the result in a new Optional. That is right when `f` returns a plain value. But if `f` itself returns an `Optional`, `map` would wrap it again, producing an `Optional<Optional<User>>`. `flatMap(f)` expects a function that already returns an Optional and does **not** add another layer.

A realistic lookup chain: find a task, find its owner, read the owner's email. Any step may produce nothing.

```java
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class OptionalChaining {
    record Task(String id, String title, String ownerId) {}   // ownerId may be null
    record User(String id, String name, String email) {}     // email may be null

    static final Map<String, Task> TASKS = Map.of(
            "T1", new Task("T1", "Write docs", "U1"),
            "T2", new Task("T2", "Fix bug", null),
            "T3", new Task("T3", "Review", "U2"));
    static final Map<String, User> USERS = Map.of(
            "U1", new User("U1", "Ada", "ada@example.org"),
            "U2", new User("U2", "Bo", null));

    static Optional<Task> findTask(String id) {
        return Optional.ofNullable(TASKS.get(id));
    }

    static Optional<User> findUser(String id) {
        return Optional.ofNullable(USERS.get(id));
    }

    // Null-check version: every level needs an if
    static String ownerEmailWithNulls(String taskId) {
        Task task = TASKS.get(taskId);
        if (task != null && task.ownerId() != null) {
            User owner = USERS.get(task.ownerId());
            if (owner != null && owner.email() != null) {
                return owner.email();
            }
        }
        return "no contact";
    }

    // Optional version: each step may produce absence
    static String ownerEmail(String taskId) {
        return findTask(taskId)                  // Optional<Task>
                .map(Task::ownerId)              // Optional<String>  (empty if ownerId null)
                .flatMap(OptionalChaining::findUser) // Optional<User>, NOT Optional<Optional<User>>
                .map(User::email)                // Optional<String>  (empty if email null)
                .orElse("no contact");
    }

    public static void main(String[] args) {
        for (String id : List.of("T1", "T2", "T3", "T9")) {
            System.out.println(id + ": " + ownerEmailWithNulls(id) + " | " + ownerEmail(id));
        }

        // What map would have produced instead of flatMap
        Optional<Optional<User>> nested = findTask("T1").map(Task::ownerId).map(OptionalChaining::findUser);
        System.out.println("nested: " + nested);
    }
}
```

```text
T1: ada@example.org | ada@example.org
T2: no contact | no contact
T3: no contact | no contact
T9: no contact | no contact
nested: Optional[Optional[User[id=U1, name=Ada, email=ada@example.org]]]
```

The rule of thumb: if the function you pass returns a plain value, use `map`; if it returns an `Optional`, use `flatMap`. The same distinction appears with streams in the next chapter.

## Fallbacks: eager `orElse` versus lazy `orElseGet`

Both methods return the contained value if present and a fallback otherwise. The difference is **when the fallback is computed**.

- `orElse(T other)` takes a *value*. Java evaluates method arguments before calling a method, so the expression you write inside `orElse(...)` is **always** evaluated, even when the Optional has a value and the result is thrown away.
- `orElseGet(Supplier<? extends T> supplier)` takes a *recipe for* a value. The Optional calls the supplier **only when it is empty**.

```java
import java.util.Optional;

public class EagerVersusLazy {
    static int themeLoads = 0;

    static String loadDefaultTheme() {
        themeLoads++;
        System.out.println("    (loading default theme from disk...)");
        return "light";
    }

    public static void main(String[] args) {
        Optional<String> saved = Optional.of("dark");
        Optional<String> notSaved = Optional.empty();

        System.out.println("orElse, value present:");
        String a = saved.orElse(loadDefaultTheme());
        System.out.println("  theme=" + a + ", loads so far=" + themeLoads);

        System.out.println("orElseGet, value present:");
        String b = saved.orElseGet(() -> loadDefaultTheme());
        System.out.println("  theme=" + b + ", loads so far=" + themeLoads);

        System.out.println("orElseGet, value absent:");
        String c = notSaved.orElseGet(EagerVersusLazy::loadDefaultTheme);
        System.out.println("  theme=" + c + ", loads so far=" + themeLoads);

        System.out.println("orElse with a constant is fine:");
        String d = notSaved.orElse("light");
        System.out.println("  theme=" + d + ", loads so far=" + themeLoads);
    }
}
```

```text
orElse, value present:
    (loading default theme from disk...)
  theme=dark, loads so far=1
orElseGet, value present:
  theme=dark, loads so far=1
orElseGet, value absent:
    (loading default theme from disk...)
  theme=light, loads so far=2
orElse with a constant is fine:
  theme=light, loads so far=2
```

In the first case the theme was loaded from disk for nothing: the result `"dark"` came from the Optional, but the side effect (and its cost) still happened. Now imagine the fallback is a database query, a network call, or something that creates a record. Wasted work becomes wrong behavior.

### What happens under the hood

`saved.orElse(loadDefaultTheme())` compiles to roughly:

1. Evaluate the argument: call `loadDefaultTheme()`, producing `"light"` (side effects happen now).
2. Call `orElse("light")` on `saved`.
3. Inside, `orElse` checks whether a value is present; it is, so it returns `"dark"` and ignores `"light"`.

`saved.orElseGet(() -> loadDefaultTheme())` compiles to:

1. Evaluate the argument: create a Supplier object. Creating a lambda does not run its body.
2. Call `orElseGet(supplier)` on `saved`.
3. Inside, a value is present, so the supplier is never called.

The same eager-versus-lazy reasoning applies to `orElseThrow(Supplier)` (the exception is only built when needed) and to `or(Supplier<Optional>)`.

| Method | Argument | Evaluated when | Use for |
|---|---|---|---|
| `orElse(value)` | a value | always, before the call | constants and already-computed values |
| `orElseGet(supplier)` | a Supplier | only if empty | computed, expensive, or side-effecting fallbacks |
| `orElseThrow()` | none | only if empty | "absence is a bug here"; throws `NoSuchElementException` |
| `orElseThrow(supplier)` | exception Supplier | only if empty | domain-specific exceptions |
| `or(supplier)` | Supplier of Optional | only if empty | trying another source that may also be empty |

## Acting on presence without unwrapping

When you want to *do* something rather than *compute* something, use:

- `ifPresent(Consumer)`: runs the consumer only when a value exists.
- `ifPresentOrElse(Consumer, Runnable)`: runs one or the other (Java 9+).

Avoid the pattern `if (opt.isPresent()) { use(opt.get()); }`. It works, but it reintroduces the manual checking that Optional was meant to remove, and it invites someone to later delete the `if`.

## Primitive Optionals

`OptionalInt`, `OptionalLong`, and `OptionalDouble` hold a primitive or nothing, avoiding boxing. You will meet them as results of primitive stream operations: the maximum of an empty `IntStream` is `OptionalInt.empty`, because an empty set of numbers has no maximum. Their accessors are named `getAsInt()`, `getAsLong()`, and `getAsDouble()`, and they offer `orElse`, `orElseGet`, `orElseThrow`, and `ifPresent`, but not `map`, `flatMap`, or `filter`.

## API design: where Optional belongs

Optional was designed primarily as a **return type for methods that may legitimately have no result**. Guidelines followed by experienced Java teams:

- **Do** return `Optional<T>` from lookups such as `findById`, `findFirstMatching`, or `parseIfValid` where "nothing" is a normal outcome.
- **Do not** return `null` from a method whose return type is `Optional`. Return `Optional.empty()`. A null Optional breaks every caller's chain.
- **Do not** return `Optional<List<T>>` to mean "no results". Return an empty list. Only use an Optional collection if "no list at all" means something different from "an empty list".
- **Avoid** Optional fields, method parameters, and elements in collections. Fields make serialization and persistence frameworks awkward (Optional is not `Serializable`), parameters force callers to wrap arguments, and `List<Optional<T>>` usually means you should filter the empties out.
- **Avoid** `get()` unless presence was just proven. `get()` on an empty Optional throws `NoSuchElementException: No value present`, which simply moves the NullPointerException problem elsewhere. When presence is required, prefer `orElseThrow()` with a clear exception, which states the intent.
- **Do not** use Optional just to chain calls in place of a simple `if` on a local variable. `Optional.ofNullable(x).ifPresent(...)` is not clearer than `if (x != null)`.

### Absence is not failure

`Optional.empty()` means "the answer is: there is nothing". It must not be used to mean "I could not find out". If a database connection fails while looking up a customer, the correct outcome is an exception, not an empty Optional. Otherwise a caller may conclude "this customer does not exist" and create a duplicate, or tell a user their account was deleted. Keep the two situations distinct:

```java
// Fragment: absence versus failure
Optional<Customer> findById(CustomerId id) {
    try {
        return Optional.ofNullable(queryCustomer(id));   // null row -> empty: normal absence
    } catch (SQLException e) {
        throw new DataAccessException("lookup failed for " + id, e); // failure stays loud
    }
}
```

## Common mistakes

### Mistake 1: calling `get()` without knowing a value is present

```java
// Wrong
String name = findNickname("cy").get();
```

```text
java.util.NoSuchElementException: No value present
```

Fix: use `orElse`, `orElseGet`, or `orElseThrow(() -> new SomeDomainException(...))`, or restructure with `map` and `ifPresent`.

### Mistake 2: `Optional.of` with a possibly null value

`Optional.of(map.get(key))` throws `NullPointerException` when the key is missing, which is exactly the case you were trying to handle. Use `Optional.ofNullable`.

### Mistake 3: an expensive or side-effecting call inside `orElse`

```java
// Wrong: queries the database even when the cache already has the value
User user = cache.find(id).orElse(database.load(id));
```

The argument of `orElse` is evaluated before `orElse` runs. Pass a Supplier to `orElseGet` instead, so the fallback only runs when the Optional is empty.

### Mistake 4: `map` with a function that returns an Optional

`findTask(id).map(t -> findUser(t.ownerId()))` produces `Optional<Optional<User>>`, which is awkward to use. Use `flatMap`.

### Mistake 5: returning null from an Optional-returning method

```java
// Wrong
Optional<User> findUser(String id) {
    if (id == null) return null;   // callers will get NullPointerException on .map(...)
    return Optional.ofNullable(USERS.get(id));
}
```

Return `Optional.empty()` instead, or reject a null id with an exception if null is not a valid argument.

## Best practices

- Use Optional for return values that may be legitimately absent; keep fields, parameters, and collections Optional-free.
- Chain with `map`, `flatMap`, and `filter`; unwrap once, at the end.
- Use `orElse` only for constants or values that already exist; use `orElseGet` for anything that computes, allocates significantly, or has side effects.
- Use `orElseThrow` when absence means a bug or a violated precondition, with a meaningful exception.
- Return empty collections instead of Optional collections.
- Never let infrastructure failures turn into `Optional.empty()`.
- Prefer `OptionalInt` and friends in numeric code, and remember they lack `map`.

## Summary

- `Optional<T>` holds exactly one non-null value or nothing, and makes possible absence visible in a method's type.
- Create with `of` (non-null), `ofNullable` (may be null), or `empty`.
- `map` transforms a present value; `flatMap` is for functions that already return Optional; `filter` can turn presence into absence. All of them skip their function when the Optional is empty.
- `orElse` evaluates its argument eagerly, every time; `orElseGet` runs its Supplier only when the Optional is empty.
- `get()` without a guarantee just relocates the failure; prefer `orElseThrow` with intent.
- Optional is for return values; absence must never disguise a failure.

## Practice

### Warm-up

1. Write `Optional<Integer> parsePort(String text)` that returns an empty Optional for non-numeric text or ports outside 1 to 65535.
2. Rewrite `String city = user != null && user.address() != null ? user.address().city() : "unknown";` using Optional, assuming `address()` may return null.

### Core

1. Implement `findTask(String id)` and `findOwner(Task task)` returning Optionals, and compose them to get an owner's display name, with `"unassigned"` as the fallback.
2. Write a small program with a counter that proves how many times a fallback method runs with `orElse` and with `orElseGet`, for both a present and an empty Optional. Predict the four counts before running it.
3. Design a `CustomerRepository` interface with three methods and decide, for each, whether it should return `Optional<Customer>`, `List<Customer>`, or throw. Justify each decision in one sentence.

### Challenge

1. Take a method that returns `Optional.empty()` both when a record is missing and when the database is unreachable. Redesign it so callers can tell the difference, and write down how each caller's behavior should change.

## Check your understanding

1. What is the difference between `Optional.of(x)` and `Optional.ofNullable(x)` when `x` is null?
2. When should you choose `flatMap` over `map` on an Optional?
3. When exactly is the argument of `orElse` evaluated, and how does `orElseGet` change that? Why does it matter when the fallback is expensive or has side effects?
4. Why is calling `get()` on an Optional usually a code smell, and what would you use instead?
5. Why is returning an empty list usually better than returning `Optional<List<T>>`?
6. Why must a failed database query not be reported as `Optional.empty()`?
