# Type erasure, bridge methods, and heap pollution

Every generic type check you have written so far — `List<Integer>` versus `List<Number>`, `Box<String>` versus `Box<Integer>` — is enforced entirely by the **compiler**, at compile time. Once compilation finishes, almost none of that type information survives into the actual `.class` file the JVM runs. This is called **type erasure**, and it is the single fact that explains an entire category of behavior generics beginners find surprising: why `new T()` does not compile, why `instanceof List<String>` does not compile, why two differently-parameterized lists report the identical runtime class, and how a raw-type mistake can corrupt data that only fails, with no warning, much later at a completely unrelated read.

What you will learn:

- What type erasure actually does to a generic class or method after compilation
- Why `new T()`, `T.class`, and `instanceof List<String>` do not compile, and what `instanceof List<?>` can and cannot tell you instead
- **Heap pollution**: how an unchecked raw-type write corrupts a generic collection silently, with the failure surfacing later, at an unrelated read
- What a bridge method is and why the compiler generates one automatically to preserve correct overriding after erasure
- Why `@SafeVarargs` is a promise you make, backed by your own review, not a mechanism that makes unsafe code safe

## Type erasure: what survives compilation

The compiler uses a generic type's type arguments purely to check your code; the compiled bytecode itself mostly forgets them, replacing every type parameter with its bound (`Object`, if unbounded) and inserting the casts needed to make the erased code still behave correctly:

```java
import java.util.ArrayList;

public class ErasureDemo {
    public static void main(String[] args) {
        var strings = new ArrayList<String>();
        var integers = new ArrayList<Integer>();
        System.out.println(strings.getClass() == integers.getClass());
        System.out.println("both report: " + strings.getClass().getName());
    }
}
```

Output:

```text
true
both report: java.util.ArrayList
```

At compile time, `ArrayList<String>` and `ArrayList<Integer>` are two distinctly different, incompatible types — you could never assign one to a variable of the other's type, exactly as the previous lesson's invariance rule established. But at run time, **there is only one `ArrayList` class**, and both variables' `getClass()` returns that exact same `Class` object. The type argument `<String>` or `<Integer>` genuinely does not exist anywhere in the running program's memory; it existed only in the source code and in the compiler's own bookkeeping while it verified your code was consistent.

## Three things you cannot do because of erasure

Because a type parameter like `T` genuinely does not exist as an actual class at run time, several operations that would otherwise seem reasonable simply have nothing to operate on, and the compiler rejects them outright.

**You cannot write `new T()`:**

```java
public class NewTRejected {
    static <T> T create() {
        return new T();
    }

    public static void main(String[] args) {
        System.out.println("compiling this file should fail");
    }
}
```

```text
NewTRejected.java:3: error: unexpected type
        return new T();
                   ^
  required: class
  found:    type parameter T
  where T is a type-variable:
    T extends Object declared in method <T>create()
1 error
```

`new` needs a real, concrete class to instantiate, and after erasure, `T` is not one — there is no runtime artifact called "`T`" for `new` to construct. (If you genuinely need to create instances of a generic method's type parameter, the standard workaround is to require the caller to pass in a `Supplier<T>` or a `Class<T>` object explicitly — a technique Chapter 13 covers once you have met functional interfaces.)

**You cannot write `instanceof List<String>`:**

```java
import java.util.List;

public class InstanceofParameterizedRejected {
    static boolean isStringList(Object value) {
        return value instanceof List<String>;
    }

    public static void main(String[] args) {
        System.out.println("compiling this file should fail");
    }
}
```

```text
InstanceofParameterizedRejected.java:5: error: Object cannot be safely cast to List<String>
        return value instanceof List<String>;
               ^
1 error
```

This directly answers the chapter's concept-check question: at run time, there is no way to check "is this list's element type specifically `String`?", because the element type was erased away when the class file was produced — a `List` at run time is just a `List`, full stop, regardless of what it held at the type level in source code. What **is** legal, and is exactly what the previous two lessons' wildcard already gave you a vocabulary for, is checking the raw shape without claiming to know the element type:

```java
import java.util.List;

public class InstanceofWildcardOk {
    static boolean describeList(Object value) {
        if (value instanceof List<?> list) {
            if (list.isEmpty()) {
                return true;
            }
            Object firstElement = list.get(0);
            System.out.println("first element's runtime type: " + firstElement.getClass().getSimpleName());
            return true;
        }
        return false;
    }

    public static void main(String[] args) {
        System.out.println(describeList(List.of("a", "b")));
        System.out.println(describeList(List.of(1, 2)));
        System.out.println(describeList("not a list"));
    }
}
```

Output:

```text
first element's runtime type: String
true
first element's runtime type: Integer
true
false
```

`value instanceof List<?> list` correctly confirms "this is some kind of `List`" (a check that genuinely can be performed at run time, since `List`-ness itself is not erased, only its type argument is) and, having confirmed that much, you can inspect individual elements' own real runtime classes directly with `getClass()`, exactly as this example does. What you cannot do is ask the list itself, as a whole, "what element type were you declared with?" — that information is simply gone.

**You cannot write `T.class`,** for the identical underlying reason: `T` is not a real class at run time, so there is no `Class` object to refer to.

## Heap pollution: corruption now, failure later

**Heap pollution** is exactly what happens when an unchecked, raw-type operation inserts a value into a generic collection that its declared, erased-away type should have forbidden — and it is precisely why the previous two lessons kept returning to the theme of "the mistake and the failure happen at different lines." Here it is traced explicitly, step by step:

```java
import java.util.ArrayList;
import java.util.List;

public class HeapPollution {
    @SuppressWarnings({"unchecked", "rawtypes"})
    static void corrupt(List<String> list) {
        List raw = list;
        raw.add(99);
    }

    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        names.add("Amina");

        corrupt(names);
        System.out.println("list after corrupt(): size=" + names.size());
        System.out.println("write completed with no visible error");

        for (int i = 0; i < names.size(); i++) {
            System.out.println("reading index " + i + "...");
            String name = names.get(i);
            System.out.println("  got: " + name);
        }
    }
}
```

Output:

```text
list after corrupt(): size=2
write completed with no visible error
reading index 0...
  got: Amina
reading index 1...
Exception in thread "main" java.lang.ClassCastException: class java.lang.Integer cannot be cast to class java.lang.String (java.lang.Integer and java.lang.String are in module java.base of loader 'bootstrap')
	at HeapPollution.main(HeapPollution.java:21)
```

Follow exactly what happened. `corrupt` received a perfectly legitimate `List<String>`, aliased it through a raw `List` variable (with the unchecked warning suppressed here so the example compiles cleanly, exactly as in the previous lessons' raw-type demonstrations), and inserted an `Integer` — an operation the raw type permits with only a warning, even though the underlying object is, at the type level, supposed to hold only `String` values. `corrupt` then returned with **no error of any kind**: the pollution is now sitting silently inside `names`, and `names.size()` even correctly reports 2, because the list genuinely does contain two elements at the erased, runtime level — erasure means the list itself has no idea it is "supposed to" hold only strings; that promise existed only in the compiler's bookkeeping for code that respected the declared type.

The failure surfaces only later, at `names.get(1)` inside the `for` loop — a completely ordinary-looking read, in code that never itself did anything wrong. Every `List.get` call implicitly inserts a cast to the list's declared element type (this is part of what erasure requires: since the runtime `List` itself no longer remembers its element type, the *calling code* carries an inserted cast to enforce it locally), and that inserted cast is exactly what throws `ClassCastException` when it hits the polluted `Integer`. This is heap pollution's defining, dangerous shape: **the write that caused the problem and the read that reveals it can be arbitrarily far apart** — different methods, different files, sometimes committed to a codebase months apart — which is exactly why raw types are worth eliminating from new code entirely, not merely warned about.

## Bridge methods: preserving correct overriding after erasure

Erasure creates a subtler problem for **overriding**: if a generic interface's method signature changes shape after erasure, how does the JVM still correctly recognize an implementing class's method as overriding it? The compiler solves this by silently generating an extra, synthetic **bridge method**.

```java
import java.lang.reflect.Method;

public class BridgeMethodDemo {
    interface Box<T> {
        void put(T value);
    }

    static class StringBox implements Box<String> {
        private String value;
        public void put(String value) { this.value = value; }
        public String toString() { return "StringBox[" + value + "]"; }
    }

    public static void main(String[] args) {
        Box<String> box = new StringBox();
        box.put("hello");
        System.out.println(box);

        System.out.println("declared methods on StringBox:");
        for (Method m : StringBox.class.getDeclaredMethods()) {
            System.out.println("  " + m + (m.isBridge() ? "  <-- bridge method" : ""));
        }
    }
}
```

Output:

```text
StringBox[hello]
declared methods on StringBox:
  public void BridgeMethodDemo$StringBox.put(java.lang.Object)  <-- bridge method
  public void BridgeMethodDemo$StringBox.put(java.lang.String)
  public java.lang.String BridgeMethodDemo$StringBox.toString()
```

You wrote exactly one `put` method, accepting a `String`. But after erasure, the interface `Box<T>`'s method signature becomes `put(Object)` — `T` erased to its bound, `Object`. For `StringBox` to genuinely satisfy that erased interface contract at the bytecode level, the compiler generates a **second**, hidden `put(Object)` method you never wrote, whose entire body simply casts its argument to `String` and forwards the call to your real `put(String)`. This bridge method is exactly why calling `box.put("hello")` through the `Box<String>`-typed variable works correctly: the JVM invokes the interface's erased `put(Object)` slot, which lands on the compiler-generated bridge, which safely delegates to your actual implementation. You never call a bridge method directly or write one yourself — it exists purely so that erasure at the interface level and your specific, correctly-typed implementation remain connected correctly underneath the surface.

## @SafeVarargs: a promise, not a guarantee

Generic varargs parameters (`T... values`) can expose a version of heap pollution through arrays specifically, because arrays (unlike generic collections) *do* check their element type at run time — a combination that creates its own compiler warning. `@SafeVarargs` is the annotation you place on a method to suppress that warning, but it is critical to understand exactly what it does and does not do: **it is a promise you are making to the compiler, backed by your own review of the method's body, not a runtime safety mechanism.** Annotating a genuinely unsafe varargs method with `@SafeVarargs` does not make it safe — it only silences the warning that was correctly telling you to check. Only add it after you have personally verified the method never stores into the varargs array in a way that could leak an incompatible element back out to the caller.

## What happens under the hood

Type erasure exists for a genuinely practical reason: generics were introduced in Java 5, years after the language and its enormous existing ecosystem of compiled libraries already existed, and erasure let old, non-generic bytecode and new, generic source code interoperate at the bytecode level without every existing class needing to be recompiled or reissued. The price of that compatibility is exactly everything this lesson covered: no runtime type arguments to check with `instanceof` or to instantiate with `new T()`, an inserted cast at every read site (which is what turns silent heap pollution into a `ClassCastException` later rather than immediately), and bridge methods needed to keep overriding correctly connected once an interface's erased signature no longer matches its generic source-level one exactly.

## Common mistakes

**1. Trying to write `new T()`, `T.class`, or `instanceof SomeGeneric<SpecificType>`.** None of these compile, because the specific type argument does not exist at run time to instantiate, reference, or test against.

**2. Believing two lists with different type arguments are different classes at run time.** `ArrayList<String>` and `ArrayList<Integer>` share the exact same runtime class; only the compiler distinguished them.

**3. Assuming a raw-type write that compiles (with a warning) is therefore safe.** It genuinely corrupts the collection at that exact point; the corruption simply has not been *discovered* yet, because nothing has tried to read the polluted element through its declared type.

**4. Suppressing an unchecked-operation warning without actually verifying the code is safe.** The warning exists precisely because the compiler cannot prove safety on its own; suppressing it removes the warning, not the risk.

**5. Treating `@SafeVarargs` as something that makes an unsafe method safe.** It is a statement that *you* have already verified safety; applying it to an actually-unsafe method just hides the compiler's warning about a real problem.

## Best practices

- Remember that type arguments are a compile-time-only concept; design your code around what erasure permits at run time (`instanceof List<?>`, not `instanceof List<String>`) rather than fighting it.
- Treat any raw-type usage as an immediate signal to isolate and eliminate it, not merely to suppress its warning, given how far heap pollution's eventual failure can land from its actual cause.
- Only add `@SafeVarargs` after personally reviewing that the annotated method never lets an incompatible element escape through its varargs array.
- When you need to construct instances of a generic method's type parameter, pass in a factory (a `Supplier<T>` or similar) explicitly, rather than attempting `new T()`.
- Read `getClass()` output and `ClassCastException` messages carefully when debugging generic code; they will confirm the erased, single-runtime-class reality this lesson describes, which often points straight back to a raw-type boundary somewhere upstream.

## Summary

- Type erasure removes a generic type's specific type arguments after compilation, leaving one shared runtime class per generic class regardless of how it was parameterized at the source level.
- `new T()`, `T.class`, and `instanceof List<String>` do not compile, because none of them have anything real to operate on after erasure; `instanceof List<?>` is the legal alternative for checking raw shape.
- Heap pollution occurs when a raw-type write inserts an incompatible value into a generic collection; the write itself succeeds silently, and the resulting `ClassCastException` surfaces later, at an unrelated read, via the cast erasure inserts there.
- A bridge method is a compiler-generated, synthetic method that reconciles a generic interface's erased method signature with a specific implementing class's correctly-typed override.
- `@SafeVarargs` suppresses a genuine warning about generic varargs but provides no actual safety on its own; it only documents that you have personally verified the method is safe.

## Practice

Warm-up:

1. Create `ArrayList<String>` and `ArrayList<Double>` instances and confirm with `getClass()` that they report the identical runtime class.
2. Attempt to write `T.class` inside a generic method and read the resulting compiler error.
3. Write a method using `instanceof List<?>` to check whether an `Object` is a list, then separately inspect one element's real runtime type with `getClass()`.

Core:

1. Reproduce `HeapPollution`'s scenario with a `List<Integer>` instead of `List<String>`, corrupting it with a `String` through a raw-type alias, and confirm the `ClassCastException` occurs at a read, not at the corrupting write.
2. Write a small generic interface with one generic method, implement it with a class that fixes the type parameter to a specific type (as `StringBox` did for `Box<String>`), and use reflection (as `BridgeMethodDemo` did) to find and print the compiler-generated bridge method.
3. Write a short paragraph explaining, in your own words and using this lesson's vocabulary, why `List<String>` and `List<Integer>` are different types to the compiler but the same class at run time.

Challenge:

1. Design a small generic `TypedRegistry<T>` class that stores values of type `T` in an internal `List<T>`. Deliberately introduce a raw-type-based heap pollution bug into one of its methods, write a test that demonstrates the resulting delayed `ClassCastException`, and then fix the bug by removing the raw type entirely.
2. Write a varargs method `static <T> List<T> listOf(T... values)` (similar in spirit to `List.of`), determine whether it is actually safe to annotate with `@SafeVarargs` by reviewing whether it ever stores into the `values` array in a way that could leak an incompatible element, and justify your conclusion in a comment before adding (or deliberately not adding) the annotation.

## Check your understanding

1. What does type erasure actually remove from a generic class's compiled bytecode, and what does it leave behind?
2. Why does `strings.getClass() == integers.getClass()` return `true` for an `ArrayList<String>` and an `ArrayList<Integer>`?
3. Why can't `instanceof List<String>` be checked at run time, and what can `instanceof List<?>` check instead?
4. In the heap pollution example, at which exact line does the corrupting write happen, and at which exact line does the resulting exception actually get thrown? Why are they different?
5. What problem does a compiler-generated bridge method solve, and why does erasure make it necessary?
6. What, precisely, does adding `@SafeVarargs` to a method actually guarantee about that method's safety?
