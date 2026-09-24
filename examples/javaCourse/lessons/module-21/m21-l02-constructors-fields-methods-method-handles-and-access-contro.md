# Constructors, fields, methods, method handles, and access control

The previous lesson covered reading a type's *shape* — its methods, fields, and modifiers. This lesson covers actually **using** that shape: constructing objects, reading and writing fields, and invoking methods, all reflectively — plus the exception-handling subtlety that trips up nearly everyone the first time (a reflectively invoked method's own exception is wrapped, not thrown directly), the access-control rules reflection must still respect (and how `setAccessible` deliberately bypasses them), and `MethodHandle`, the faster, more type-safe alternative modern frameworks increasingly prefer.

What you will learn:

- How to construct objects reflectively with `Constructor.newInstance`, and how it differs from `Class.newInstance` (removed for good reason)
- How to read and write fields reflectively, and the type-safety you give up doing so
- How to invoke methods reflectively with `Method.invoke`, and exactly what `InvocationTargetException` wraps
- Java's access control as reflection sees it, and what `setAccessible(true)` actually does
- What `MethodHandle` is, and why it can be faster and safer than `Method.invoke`
- Why untrusted input must never select a reflection target without a validated allow-list

## Constructing objects reflectively

`Constructor.newInstance` is the reflective equivalent of `new`, used by any framework that must instantiate a class it only knows by name at runtime — a dependency-injection container building a bean, a JSON library materializing a deserialized object, a test runner constructing a test class instance:

```java
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;

public class ReflectiveConstruction {

    public static void main(String[] args) throws Exception {
        Class<?> clazz = Class.forName("java.util.ArrayList");
        Constructor<?> noArgConstructor = clazz.getConstructor();
        Object instance = noArgConstructor.newInstance();
        System.out.println("constructed: " + instance.getClass().getSimpleName());

        Constructor<?> withCapacity = clazz.getConstructor(int.class);
        Object sized = withCapacity.newInstance(100);
        System.out.println("constructed with capacity arg: " + sized);
    }
}
```

```text
constructed: ArrayList
constructed with capacity arg: []
```

Note the parameter type is specified as `int.class`, not `Integer.class` — reflection matches constructors and methods against their **declared** parameter types exactly, and Java's primitive types have their own distinct `Class` objects (`int.class`, `long.class`, and so on) separate from their boxed wrapper classes. This is precisely the mismatch behind a common reflection bug: looking up a method declared with a primitive `int` parameter using `Integer.class` fails to find it at all, because those are two different `Class` objects as far as reflective lookup is concerned.

## Reading and writing fields reflectively

`Field.get`/`Field.set` read and write a field's value on a specific object instance, bypassing the type safety the compiler would normally enforce for direct field access:

```java
import java.lang.reflect.Field;

public class ReflectiveFieldAccess {

    static class Config {
        private String environment = "development";
    }

    public static void main(String[] args) throws Exception {
        Config config = new Config();
        Field environmentField = Config.class.getDeclaredField("environment");
        environmentField.setAccessible(true); // required: the field is private

        String before = (String) environmentField.get(config);
        System.out.println("before: " + before);

        environmentField.set(config, "production");
        String after = (String) environmentField.get(config);
        System.out.println("after: " + after);
    }
}
```

```text
before: development
after: production
```

Every value returned by `Field.get` is typed as `Object` and must be cast by the caller, and `Field.set` accepts any `Object` at compile time — the compiler cannot catch an attempt to assign a `String` to what is actually an `int` field the way it would for ordinary field assignment; that mismatch only surfaces at runtime, as an `IllegalArgumentException`. This is the type-safety cost every reflective API in this lesson shares: the compiler's checks are traded for runtime flexibility, which is exactly why reflection should be reserved for the specific cases (frameworks, plugin systems) that genuinely need to operate on types unknown at compile time, not used as a substitute for an ordinary typed API call.

## Invoking methods reflectively, and what InvocationTargetException wraps

`Method.invoke` calls a method reflectively, and its exception-handling behavior is the single most commonly misunderstood part of the reflection API:

```java
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

public class ReflectiveInvocation {

    static class Divider {
        int divide(int a, int b) { return a / b; } // throws ArithmeticException for b == 0
    }

    public static void main(String[] args) throws Exception {
        Method divideMethod = Divider.class.getMethod("divide", int.class, int.class);
        Divider divider = new Divider();

        Object result = divideMethod.invoke(divider, 10, 2);
        System.out.println("result: " + result);

        try {
            divideMethod.invoke(divider, 10, 0);
        } catch (InvocationTargetException e) {
            // The ArithmeticException thrown INSIDE divide() is wrapped as this exception's cause.
            System.out.println("wrapper: " + e.getClass().getSimpleName());
            System.out.println("actual cause: " + e.getCause().getClass().getSimpleName());
        }
    }
}
```

```text
result: 5
wrapper: InvocationTargetException
actual cause: ArithmeticException
```

`Method.invoke` **never** lets an exception thrown inside the invoked method propagate directly — it always wraps it in `InvocationTargetException`, whose `getCause()` holds the actual exception the target method threw. This is structurally identical to `ExecutionException` wrapping a `Future`'s task failure from the concurrency chapter: a distinct failure category (a transport-level or invocation-level problem, like a security manager violation or an illegal argument) is kept separate from the target's own business-logic exception. A `catch (InvocationTargetException e)` block that logs the wrapper's message instead of `e.getCause()` produces exactly the same "useless generic error" problem this course has warned against for every other wrapper exception type covered so far — the caller sees "InvocationTargetException" instead of the actually useful "ArithmeticException: / by zero."

By contrast, failing to even **locate** the method at all — a typo'd name, a wrong parameter type — throws `NoSuchMethodException` at the `getMethod` call itself, before `invoke` is ever reached; these are two entirely separate failure points, and conflating "the method doesn't exist" with "the method exists but threw" produces confusing diagnostics.

## Access control: what reflection respects, and what setAccessible bypasses

Reflection, by default, still respects Java's ordinary access control: `getDeclaredMethod` can *find* a private method, but calling `invoke` on it without further action throws `IllegalAccessException`, exactly as calling it directly from outside the class would fail to compile:

```java
import java.lang.reflect.Method;

public class AccessControlDemo {

    static class Secretive {
        private String secret() { return "classified"; }
    }

    public static void main(String[] args) throws Exception {
        Method secretMethod = Secretive.class.getDeclaredMethod("secret");
        try {
            secretMethod.invoke(new Secretive());
        } catch (IllegalAccessException e) {
            System.out.println("blocked: " + e.getMessage());
        }

        secretMethod.setAccessible(true); // deliberately bypasses the access check
        Object result = secretMethod.invoke(new Secretive());
        System.out.println("after setAccessible: " + result);
    }
}
```

`setAccessible(true)` is a deliberate, explicit override of the language's own access control, and it is exactly the mechanism frameworks use to, for example, inject a value into a `private` field annotated `@Autowired`, or invoke a `private` test method. It is also exactly the mechanism the module system (covered two lessons ahead) restricts by default for code outside your own module — a deliberate limitation, since `setAccessible` bypassing encapsulation entirely is precisely the kind of "reflection defeats your own access-control boundaries" risk that a module boundary is meant to contain. Calling `setAccessible(true)` should always be a conscious decision made by code that has a specific, legitimate reason to reach past encapsulation, never a reflexive fix applied whenever an `IllegalAccessException` is encountered.

## MethodHandle: a faster, more type-safe alternative

`java.lang.invoke.MethodHandle` (introduced alongside `invokedynamic` in Java 7) offers similar capability to `Method.invoke` — calling a method or constructor found only at runtime — but resolved and type-checked once, up front, rather than on every call:

```java
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;

public class MethodHandleDemo {

    static class Greeter {
        String greet(String name) { return "Hello, " + name + "!"; }
    }

    public static void main(String[] args) throws Throwable {
        MethodHandles.Lookup lookup = MethodHandles.lookup();
        MethodType methodType = MethodType.methodType(String.class, String.class);
        MethodHandle greetHandle = lookup.findVirtual(Greeter.class, "greet", methodType);

        // invokeExact requires the EXACT static types declared in methodType; no autoboxing/widening happens.
        String result = (String) greetHandle.invokeExact(new Greeter(), "Ada");
        System.out.println(result);
    }
}
```

```text
Hello, Ada!
```

The trade-off runs in the opposite direction from `Method.invoke`: `MethodHandle` pushes more type-checking to compile time (`invokeExact` requires exactly the static types declared in the `MethodType`, with no implicit boxing or widening at all, failing loudly with a `WrongMethodTypeException` if you get it wrong) and, because the JVM can inline and optimize a resolved `MethodHandle` much like an ordinary method call, it is typically significantly faster under repeated invocation than `Method.invoke`, which re-checks access and re-resolves overload matching on every single call. Modern frameworks (recent versions of many serialization and dependency-injection libraries) increasingly prefer `MethodHandle` for exactly this performance reason, while `Method`/`Field`/`Constructor` remain simpler and more common for straightforward, less performance-sensitive reflective use.

## Never let untrusted input select a reflection target

This lesson's most important security point, restated directly: reflection lets code construct arbitrary objects and invoke arbitrary methods **by name**, which means a class name, method name, or field name sourced from untrusted input (a URL parameter, a deserialized JSON field, a user-supplied configuration value) used directly as a reflection target is a serious vulnerability — it can let an attacker construct classes, invoke methods, or read/write fields never intended to be reachable at all, entirely bypassing whatever access-control boundary the application's actual public API was designed to enforce.

```java
// NEVER: untrusted input directly selects what gets constructed and invoked.
Class<?> clazz = Class.forName(untrustedClassName);       // could be ANY class on the classpath
Object instance = clazz.getConstructor().newInstance();
Method method = clazz.getMethod(untrustedMethodName);      // could be ANY public method
method.invoke(instance);

// CORRECT: validate against a narrow, explicit allow-list before any reflective call happens.
static final Map<String, Class<?>> ALLOWED_HANDLERS = Map.of(
        "email", EmailNotificationHandler.class,
        "sms", SmsNotificationHandler.class
);

Class<?> clazz = ALLOWED_HANDLERS.get(requestedHandlerName);
if (clazz == null) {
    throw new IllegalArgumentException("unknown handler: " + requestedHandlerName);
}
Object handler = clazz.getConstructor().newInstance(); // only ever one of the two known, reviewed classes
```

The allow-list check happens entirely in trusted, developer-controlled Java code, exactly the same discipline Chapter 19 applied to a user-supplied sort column name in a SQL query — untrusted input is checked against a small, fixed, reviewed set of permitted values *before* it is ever used to select anything, rather than trusted to name a safe target on its own.

## What happens under the hood: from Method.invoke to a wrapped exception

1. `Class.getMethod`/`getDeclaredMethod` searches the class's metadata for a method matching the given name and exact parameter types, throwing `NoSuchMethodException` if none matches — this search happens once, at lookup time, independent of ever actually calling the method.
2. `Method.invoke` first checks whether the caller is permitted to access this method (respecting `private`/`protected`/package-private visibility) unless `setAccessible(true)` was called first, throwing `IllegalAccessException` if not.
3. It then checks the supplied arguments against the method's declared parameter types, applying autoboxing and widening where applicable, throwing `IllegalArgumentException` for a genuine mismatch.
4. It dispatches to the actual method body via the JVM's normal method-invocation machinery, exactly as a direct call would, just reached through an extra layer of reflective bookkeeping.
5. If the method body itself throws, `invoke` catches that exception and wraps it in a new `InvocationTargetException`, setting the original as its cause, rather than letting it propagate directly — this wrapping happens every single time, unconditionally.
6. `MethodHandle.invokeExact` skips most of this per-call bookkeeping: type-checking happens once when the handle is obtained (`findVirtual`, etc.), and the JVM can treat the resulting call much closer to an ordinary, optimizable method call.

## Common mistakes

**Mistake 1: looking up a method's primitive parameter type using its boxed wrapper class.** `getMethod("substring", Integer.class)` never matches a method declared as `substring(int)`, since `int.class` and `Integer.class` are distinct `Class` objects. Fix: use the primitive type's own `Class` literal (`int.class`) when the declared parameter is primitive.

**Mistake 2: catching `InvocationTargetException` and logging the wrapper instead of its cause.** This produces the same "useless generic error" problem as any other unwrapped wrapper exception. Fix: always read and report `getCause()`.

**Mistake 3: calling `setAccessible(true)` reflexively whenever `IllegalAccessException` appears, without considering whether reaching past encapsulation is actually appropriate here.** This defeats the class's own designed access boundary as a matter of habit rather than deliberate necessity. Fix: treat `setAccessible(true)` as a conscious decision reserved for legitimate framework-style needs.

**Mistake 4: letting untrusted input directly select a class, method, or field name for reflective use.** This can let an attacker reach code paths never intended to be externally reachable. Fix: validate any externally sourced name against a narrow, explicit allow-list before it is used reflectively.

## Best practices

- Match reflective parameter-type lookups exactly against the target's declared signature, including primitive versus boxed distinctions.
- Always unwrap and report `InvocationTargetException.getCause()`, never the wrapper itself.
- Reserve `setAccessible(true)` for legitimate, deliberate framework-style needs, not as a reflexive fix for an access exception.
- Prefer `MethodHandle` over `Method.invoke` for performance-sensitive, repeatedly-invoked reflective call sites.
- Never let untrusted input select a reflection target directly; validate against a fixed allow-list first.

## Summary

- `Constructor.newInstance`, `Field.get`/`set`, and `Method.invoke` let code construct objects, access fields, and call methods known only at runtime, trading compile-time type safety for that flexibility.
- Reflective lookups match declared parameter types exactly, including the distinction between a primitive type and its boxed wrapper.
- `Method.invoke` always wraps a target method's own thrown exception in `InvocationTargetException`; the real failure is in `getCause()`.
- Reflection respects ordinary Java access control by default; `setAccessible(true)` is a deliberate, explicit bypass of that boundary.
- `MethodHandle` resolves and type-checks once up front, trading `Method.invoke`'s per-call flexibility for better performance and stricter static typing via `invokeExact`.
- Untrusted input must never directly select a class, method, or field name for reflective use; validate against a fixed allow-list first.

## Practice

1. **Warm-up:** Explain why `String.class.getMethod("substring", Integer.class)` fails to find `substring(int)`, and correct the lookup.
2. **Warm-up:** A reflectively invoked method throws `NullPointerException`. What exception type does the caller actually catch, and how do they access the real `NullPointerException`?
3. **Core:** Write a small plugin loader that reads a class name from a fixed, small configuration list (not raw user input), reflectively constructs an instance, and invokes one of its methods, correctly unwrapping any `InvocationTargetException`.
4. **Core:** Reflectively access a `private` field on a class you did not write (an existing JDK class is fine), demonstrating both the `IllegalAccessException` without `setAccessible` and successful access with it.
5. **Challenge:** Rewrite a `Method.invoke`-based call site using `MethodHandle` and `invokeExact`, and measure (with a simple timing loop across many repeated calls) the performance difference between the two approaches.

## Check your understanding

1. Why does a reflective method lookup using `Integer.class` fail to match a method declared with a primitive `int` parameter?
2. What does `InvocationTargetException` wrap, and why should a caller always read its `getCause()` rather than its own message?
3. What is the difference between reflection failing to *locate* a method and reflection failing to *invoke* it due to access control?
4. What does `setAccessible(true)` actually do, and why should it never be used reflexively?
5. What is the key difference in when type-checking happens between `Method.invoke` and `MethodHandle.invokeExact`?
6. Why is it dangerous to let untrusted input directly choose a class or method name for reflective use, and what mitigates that risk?
