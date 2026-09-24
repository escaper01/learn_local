# Stack frames, heap objects, references, and garbage collection

Every lesson so far has hinted at a memory model without naming it directly: arrays are aliased when you copy a reference, strings are shared through a pool, and a method reassigning its array parameter never affects the caller. This lesson makes that model explicit. Once you can picture where a value actually lives — a small, temporary stack frame, or a longer-lived object on the heap — every one of those earlier behaviors becomes obvious instead of surprising, and you gain the vocabulary to read a stack trace and reason about when an object's memory is finally reclaimed.

What you will learn:

- What a stack frame is, what it stores, and how method calls create and destroy them
- How to read a multi-frame stack trace, from the innermost call outward
- Why primitive values are always copied but object references only copy the reference itself
- Why an object created inside a method can outlive that method's call
- What the heap is and how it differs from the stack
- What makes an object eligible for garbage collection, and why "eligible" does not mean "immediately gone"
- What `StackOverflowError` and `OutOfMemoryError` reveal about the two memory regions

## The stack: one frame per active call

Every time a method is called, the JVM creates a small block of memory called a **stack frame** to hold that call's local variables, its parameters, and the address to return to when it finishes. Frames are stacked on top of each other, most recent on top, exactly like a stack of trays: the frame for the currently executing method is always the one on top, and it is destroyed the moment that method returns.

```java
public class StackTrace {
    static int first(int x) {
        int localA = x + 1;
        return second(localA);
    }

    static int second(int y) {
        int localB = y * 2;
        return third(localB);
    }

    static int third(int z) {
        int localC = z - 3;
        throw new RuntimeException("boom at z=" + z + ", localC=" + localC);
    }

    public static void main(String[] args) {
        try {
            first(5);
        } catch (RuntimeException e) {
            e.printStackTrace();
        }
    }
}
```

Output:

```text
java.lang.RuntimeException: boom at z=12, localC=9
	at StackTrace.third(StackTrace.java:14)
	at StackTrace.second(StackTrace.java:9)
	at StackTrace.first(StackTrace.java:4)
	at StackTrace.main(StackTrace.java:19)
```

At the moment `third` throws, there are four active frames stacked on top of each other: `main`, then `first`, then `second`, then `third`. Each frame has its own independent copy of its parameters and local variables — `first`'s `localA` (6), `second`'s `localB` (12), and `third`'s `z` (12) and `localC` (9) all exist simultaneously in separate frames, with no risk of one method's local variable colliding with another's, even if they happened to share a name.

**Reading a stack trace is a skill you will use constantly.** Read it top to bottom as "where the problem happened" to "who eventually called the code that had the problem": the top line, `StackTrace.third(StackTrace.java:14)`, is exactly where the exception was thrown; each line below shows the caller of the line above it, ending with `main`, the very first frame of the program. To find *your* bug, look for the topmost line that names a class or method you actually wrote — library and framework frames that appear above or below your own code are usually just showing how you reached it.

## Primitives are copied; references are copied too, but they point at shared objects

Java has exactly one parameter-passing rule, always: **arguments are passed by value**. What changes is *what* the value is. For a primitive, the value is the number itself, so the method receives an independent copy. For an object, the value stored in the variable is a **reference** (conceptually, an address), so the method receives a copy of that reference — which still points at the very same object.

```java
public class PrimitiveVsReference {
    static class Point {
        int x, y;
        Point(int x, int y) { this.x = x; this.y = y; }
        public String toString() { return "(" + x + "," + y + ")"; }
    }

    static void tryToChangePrimitive(int value) {
        value = value + 100;
    }

    static void changeFieldThroughReference(Point p) {
        p.x = 999;
    }

    static void reassignReference(Point p) {
        p = new Point(0, 0);
    }

    public static void main(String[] args) {
        int number = 5;
        tryToChangePrimitive(number);
        System.out.println("primitive after call: " + number);

        Point original = new Point(1, 2);
        changeFieldThroughReference(original);
        System.out.println("point after field change: " + original);

        reassignReference(original);
        System.out.println("point after reassign attempt: " + original);

        Point a = new Point(3, 4);
        Point b = a;
        b.x = 30;
        System.out.println("a: " + a + ", b: " + b + ", a == b: " + (a == b));

        Point c = new Point(3, 4);
        System.out.println("a == c (same values, different object): " + (a == c));
    }
}
```

Output:

```text
primitive after call: 5
point after field change: (999,2)
point after reassign attempt: (999,2)
a: (30,4), b: (30,4), a == b: true
a == c (same values, different object): false
```

Four results to connect back to the stack-and-heap picture:

- **`tryToChangePrimitive`** received its own private copy of `5` in its own stack frame. Adding 100 to that copy has zero effect on `main`'s `number`.
- **`changeFieldThroughReference`** received a copy of the *reference* to `original`'s `Point` object. That copy still points at the one and only `Point` object on the heap, so writing `p.x = 999` changes the object everyone can see, including `main`'s `original`.
- **`reassignReference`** received another copy of the reference, but this time the method pointed its own local copy `p` at a brand-new object. That only redirected the local variable `p`; `main`'s `original` still points at the original object, unaffected. This is exactly the same behavior you saw with array parameters in Lesson 1, because it is not special to arrays at all — it is how every object reference behaves.
- **`a == b`** is `true` because `b = a` copied the reference, making `a` and `b` two names for the *same* object; changing `x` through `b` is visible through `a`. **`a == c`** is `false` even though their field values are identical, because `c` points at a *different* object created separately. `==` on references always asks "same object?", never "same values?" — for that, a class must define its own `equals` method, which you will learn to write in Chapter 7.

## The heap: where objects live

Every object you create with `new` — including every array, and every `String` not already in the pool — is allocated in a shared memory region called the **heap**. Unlike a stack frame, which is destroyed the instant its method returns, a heap object's lifetime has nothing to do with which method created it. An object survives for as long as **something, somewhere, still holds a reference to it** — a local variable in an active frame, a field of another live object, a static field, or an entry in a collection.

```java
import java.util.ArrayList;
import java.util.List;

public class SurvivingReturn {
    static class Counter {
        private int value;
        void increment() { value++; }
        int get() { return value; }
    }

    static Counter createAndUse() {
        Counter local = new Counter();
        local.increment();
        local.increment();
        local.increment();
        return local;
    }

    static List<Counter> makeMany(int n) {
        List<Counter> list = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Counter c = new Counter();
            c.increment();
            list.add(c);
        }
        return list;
    }

    public static void main(String[] args) {
        Counter surviving = createAndUse();
        System.out.println("value after method returned: " + surviving.get());

        List<Counter> counters = makeMany(3);
        for (Counter c : counters) {
            System.out.println("stored counter value: " + c.get());
        }
        System.out.println("all objects still reachable through the list, count=" + counters.size());
    }
}
```

Output:

```text
value after method returned: 3
stored counter value: 1
stored counter value: 1
stored counter value: 1
all objects still reachable through the list, count=3
```

`createAndUse`'s local variable `local` disappears the moment the method returns — its stack frame is gone. But the `Counter` **object** it pointed to does not disappear, because the `return` statement copied that reference out into `main`'s `surviving` variable before the frame was destroyed. The object was never tied to the frame; only the *variable name* `local` was. `makeMany` demonstrates the same idea at scale: three separate `Counter` objects are created inside a loop whose local variable `c` is reused and discarded every iteration, yet all three objects remain fully alive because each one was added to a list that itself survives the method call.

| | Stack | Heap |
|---|---|---|
| Holds | local variables, parameters, return addresses | objects created with `new` (including arrays and most strings) |
| One per | active method call (a frame) | object, shared across the whole program |
| Lifetime | ends the instant its method returns | continues as long as anything reachable still references it |
| Size | small, fixed per thread, grows and shrinks automatically with calls | large, shared, managed by the garbage collector |
| Typical failure | `StackOverflowError` | `OutOfMemoryError` |

## Garbage collection: reclaiming unreachable objects

Java never requires you to manually free an object's memory. Instead, the JVM's **garbage collector** periodically identifies objects that are no longer **reachable** — meaning no chain of references from any active stack frame, static field, or other live object leads to them anymore — and reclaims their memory automatically. An object becomes eligible for collection the moment the last reference to it disappears, whether because a variable went out of scope, was reassigned, or was explicitly set to `null`.

"Eligible for collection" is not the same as "already collected". The garbage collector runs on its own schedule, not the instant an object becomes unreachable, and `System.gc()` is only a *request*, not a command the JVM is obligated to honor immediately. The cleanest way to actually observe collection happening is `java.lang.ref.WeakReference`, which lets you hold a handle to an object without that handle itself counting as a reason to keep the object alive:

```java
import java.lang.ref.WeakReference;

public class GarbageCollectionDemo {
    static class BigData {
        final int id;
        final int[] payload = new int[100_000];
        BigData(int id) { this.id = id; }
    }

    public static void main(String[] args) throws InterruptedException {
        BigData keep = new BigData(1);
        BigData discard = new BigData(2);
        WeakReference<BigData> watcher = new WeakReference<>(discard);
        System.out.println("both objects created, watcher sees discard: " + (watcher.get() != null));

        discard = null;
        System.out.println("removed the only strong reference to object #2");

        for (int i = 0; i < 5 && watcher.get() != null; i++) {
            System.gc();
            Thread.sleep(50);
        }

        System.out.println("watcher sees object #2 now: " + (watcher.get() != null));
        System.out.println("keep is still reachable: id=" + keep.id);
    }
}
```

Output:

```text
both objects created, watcher sees discard: true
removed the only strong reference to object #2
watcher sees object #2 now: false
keep is still reachable: id=1
```

Setting `discard = null` removed the *only* ordinary ("strong") reference to that particular `BigData` object; the `WeakReference` itself does not count, by design. After that, the object is eligible for collection, and once the JVM actually runs a collection cycle (which is why the loop asks and briefly waits, giving it a chance), `watcher.get()` correctly reports that the object is gone. `keep` was never made unreachable, so it survives throughout. `BigData` deliberately holds a sizable array to give the collector an obvious incentive to reclaim it; in real code you never need to think about triggering collection, since the JVM manages it continuously based on memory pressure, without any action from you.

> **Note:** Garbage collection determines *when memory is freed*, not whether your code has a bug in the first place. A **memory leak** in Java almost always means an object is being kept reachable *unintentionally* — for example, appending to a list forever without ever removing old entries, or a long-lived object holding a reference to something that logically should have been discarded. The fix is never to force garbage collection; it is to stop holding the unnecessary reference in the first place.

## What happens under the hood

Every thread in a running Java program gets its own private stack, which is exactly why local variables in one method call are never visible to another call and never collide, even during recursion where the *same* method calls itself repeatedly, each call getting a brand-new frame stacked on the previous one. This also explains a limit you have not hit yet: the stack has a bounded size, so a method that calls itself without ever stopping eventually exhausts it.

```java
public class StackOverflowDemo {
    static int depth = 0;

    static void recurse() {
        depth++;
        recurse();
    }

    public static void main(String[] args) {
        try {
            recurse();
        } catch (StackOverflowError error) {
            System.out.println("StackOverflowError after approximately " + depth + " calls");
        }
    }
}
```

Output (the exact count varies by machine and JVM settings, but the error is the same):

```text
StackOverflowError after approximately 22224 calls
```

Contrast the two failure modes precisely, because they point to opposite problems:

| Error | Region | Typical real cause |
|---|---|---|
| `StackOverflowError` | stack | recursion with no correct base case, or a base case that is never reached |
| `OutOfMemoryError` | heap | too many objects kept reachable at once — often a genuine memory leak, or simply processing more data than the heap size allows |

Notice that `StackOverflowError` and `OutOfMemoryError` are both spelled `Error`, not `Exception`. That is a deliberate naming distinction the language makes: these represent serious problems with the runtime environment itself (exhausted resources) rather than an anticipated failure condition in your program's logic, and catching them (as the example above does purely to demonstrate the limit) is rarely appropriate in real code. Chapter 11 explains the full `Throwable` hierarchy and when catching is and is not the right response.

## Common mistakes

**1. Assuming a method can change a caller's primitive variable.** It cannot; only the method's private copy changes. If you need a method to produce a numeric result, return it.

**2. Confusing "reassigning a reference parameter" with "mutating the object it points to".** `p = new Point(...)` inside a method only redirects that method's local copy of the reference. `p.x = ...` changes the shared object itself. These look similar but have completely different effects on the caller.

**3. Using `==` to compare objects for equal *content*.** It only ever asks whether two references point at the exact same object in memory. Two logically equal but separately constructed objects will compare `false`.

**4. Believing an object is destroyed the moment its creating method returns.** Only the stack frame is destroyed. The object survives on the heap for as long as anything still references it, however that reference escaped the method (a `return`, a field assignment, adding it to a collection).

**5. Calling `System.gc()` expecting an immediate, guaranteed collection.** It is only a request; do not write code whose correctness depends on exactly when collection happens.

**6. Treating unlimited recursion as free.** Every recursive call consumes another stack frame; a recursive method needs a base case that is actually reachable for every valid input, or it will eventually throw `StackOverflowError`.

## Best practices

- When a caller needs a computed value back, return it; do not rely on a method mutating a primitive parameter, because that is impossible.
- Be deliberate about which methods intentionally mutate objects passed to them versus which intentionally leave them untouched, and make that contract clear (in the name, in comments, or in the type) since both are common and both are legitimate.
- Read stack traces from the top down to locate where a problem occurred, then scan for the first frame that names your own code.
- Reserve `==` for primitives and for the rare case where you deliberately want identity comparison; use `equals` (once you define it, in Chapter 7) for logical equality between objects.
- Let go of references you no longer need — setting a field to `null` or removing an entry from a collection — when you specifically want to allow large objects to be collected sooner, particularly for long-lived programs.
- Give every recursive method a correct, reachable base case, and consider an iterative rewrite for algorithms that could recurse arbitrarily deep on realistic input sizes.

## Summary

- A stack frame holds one method call's local variables and parameters and is destroyed the instant that call returns; each thread has its own stack of frames.
- Reading a stack trace top-to-bottom shows the exact point of failure first, followed by each caller in turn, ending at `main`.
- Arguments are always passed by value; for objects, the value passed is a reference, so the method can mutate the shared object through it but cannot make the caller's variable point somewhere else.
- Objects live on the heap and survive for as long as they remain reachable from any active frame, static field, or other live object — regardless of which method originally created them.
- Garbage collection automatically reclaims unreachable heap objects on its own schedule; `System.gc()` only requests collection and does not guarantee it.
- `StackOverflowError` signals unbounded recursion exhausting the stack; `OutOfMemoryError` signals the heap running out of room for objects still considered reachable.

## Practice

Warm-up:

1. Write three methods `a()`, `b()`, and `c()` where `a` calls `b` and `b` calls `c`, and `c` throws a `RuntimeException`. Catch it in `main` and read the printed stack trace aloud, naming which method each line refers to.
2. Write a method that takes an `int` parameter, multiplies it by 10, and returns the result. Show, with a short program, why the method cannot instead just modify the caller's variable directly.
3. Create two separate objects of a simple class with identical field values, and demonstrate with `==` that they are not the same object, contrasted with two variables that do refer to the same object.

Core:

1. Write a method that receives an array of custom objects (not primitives) and updates one field on each object. Confirm the caller sees the changes, and explain in a comment exactly why, referencing what is actually copied when the array is passed.
2. Write a small "object factory" method that creates and configures an object entirely inside the method, then returns it. Trace, in writing, what happens to the method's stack frame versus what happens to the object after the method returns.
3. Write a deliberately unbounded recursive method and catch the `StackOverflowError` it produces, printing how deep the recursion got. Then fix the method by adding a correct base case, and demonstrate it now terminates normally for a range of inputs.

Challenge:

1. Build a small linked structure (a class with a field pointing to another instance of the same class, forming a chain of three or four objects). Show that removing the reference to the *first* object in the chain, when nothing else points to it, makes the entire remaining chain unreachable and thus eligible for collection together — reasoning about reachability, not about individual objects in isolation.
2. Using `WeakReference` as in this lesson's example, write a small cache class that stores values so they can be reclaimed under memory pressure, and write a test that confirms an entry becomes unreachable after all strong references to its value are dropped.

## Check your understanding

1. When a method returns, what specifically is destroyed, and what, if anything, might still exist afterward?
2. A method parameter is an object reference. Explain the difference between changing a field through that parameter and reassigning the parameter itself, in terms of what happens to the caller's variable.
3. Two variables refer to two separate objects that happen to have identical field values. What does `==` return when comparing them, and why?
4. What makes a heap object eligible for garbage collection, and does becoming eligible mean it is collected immediately?
5. Which memory region is exhausted by unbounded recursion, and which error does that produce? Which region and error correspond to holding too many objects reachable at once?
6. Why is calling `System.gc()` not a reliable way to guarantee that a specific object's memory has been reclaimed?
