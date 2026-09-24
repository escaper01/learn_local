# Class loaders, delegation, plugins, identity, and loader leaks

Every class in a running JVM was loaded by some specific `ClassLoader`, and that fact — usually invisible — becomes suddenly, confusingly visible the moment two classes with the identical name and identical bytecode fail an `instanceof` check against each other, or a plugin system's classes cannot be garbage collected after the plugin is supposedly unloaded. This lesson makes class loading visible on purpose: the delegation model that keeps ordinary applications from ever noticing it exists, and the two specific failure modes — identity confusion and loader leaks — that appear precisely when that ordinary model is deliberately broken for a plugin architecture.

What you will learn:

- What a `ClassLoader` is, and the three built-in loaders (bootstrap, platform, application)
- Parent delegation: why a class loader asks its parent first, and what that prevents
- What actually forms a class's runtime identity — and why it is not just its name
- Why a plugin architecture needs a custom class loader per plugin, and what that buys you
- What a class loader leak is, and why it is specifically a memory leak, not a crash
- How to reason about `ClassCastException`s that appear impossible from the source code alone

## What a ClassLoader is, and the three built-in loaders

A **`ClassLoader`** is the JVM component responsible for finding a class's bytecode (from a `.jar`, a directory, a network location, or generated dynamically) and defining it as a usable `Class` object. Every JVM starts with a hierarchy of loaders:

| Loader | Loads |
|---|---|
| **Bootstrap** | Core JDK classes (`java.lang.*`, `java.util.*`) — implemented natively, has no `ClassLoader` object representing it in ordinary code (`getClassLoader()` returns `null` for these classes) |
| **Platform** (formerly "extension") | Platform-specific JDK modules not in the bootstrap set |
| **Application** (formerly "system") | Your application's own classes, from the classpath or module path |

```java
public class LoaderHierarchyDemo {
    public static void main(String[] args) {
        System.out.println("String's loader: " + String.class.getClassLoader()); // null: loaded by bootstrap
        System.out.println("This class's loader: " + LoaderHierarchyDemo.class.getClassLoader());
    }
}
```

```text
String's loader: null
This class's loader: jdk.internal.loader.ClassLoaders$AppClassLoader@...
```

Ordinary application code never needs to think about this hierarchy at all — every class you write is loaded by the application class loader, every JDK class by the bootstrap or platform loader, and everything simply works, invisibly, for the entire lifetime of a typical program.

## Parent delegation: ask first, load only if the parent can't

Each class loader (other than the bootstrap loader) has a designated **parent**, and the standard delegation model works by asking the parent to load a class *first*, only attempting to load it itself if every ancestor fails:

```text
Request: load "java.lang.String"
Application loader: "let my parent try first"
  Platform loader: "let my parent try first"
    Bootstrap loader: "I have this" -> loads java.lang.String
```

This delegation model exists specifically to prevent a serious security and correctness problem: without it, application code could define its **own** class named `java.lang.String`, and depending on classpath ordering, that counterfeit class might be used instead of the JDK's real one — silently substituting attacker- or bug-controlled behavior for a foundational, universally-trusted type. Because every loader asks its parent first, the bootstrap loader's genuine `java.lang.String` is always found before any application-defined impostor with the same name ever gets a chance to be loaded, no matter where it appears on the classpath.

## What actually forms a class's runtime identity

This is the fact behind this chapter's concept-check question, and it is genuinely surprising the first time you encounter it: a class's runtime identity is **not** just its fully-qualified name. It is the combination of **binary name plus the specific `ClassLoader` instance that defined it**. Two classes with the identical name and identical bytecode, loaded by two *different* class loader instances, are two entirely distinct types as far as the JVM is concerned:

```java
public class LoaderIdentityDemo {

    public static void main(String[] args) throws Exception {
        // Two SEPARATE class loader instances, each independently loading the same class file.
        URLClassLoader loaderA = new URLClassLoader(new URL[]{pluginJarUrl()});
        URLClassLoader loaderB = new URLClassLoader(new URL[]{pluginJarUrl()});

        Class<?> classFromA = loaderA.loadClass("com.example.plugin.Widget");
        Class<?> classFromB = loaderB.loadClass("com.example.plugin.Widget");

        System.out.println("same Class object? " + (classFromA == classFromB)); // false
        System.out.println("classFromA equals classFromB? " + classFromA.equals(classFromB)); // false

        Object instanceFromA = classFromA.getConstructor().newInstance();
        // instanceFromA is NOT an instance of classFromB, despite identical source and bytecode:
        System.out.println("instanceof check across loaders: " + classFromB.isInstance(instanceFromA)); // false
    }

    static java.net.URL pluginJarUrl() { /* returns a URL to the plugin jar */ return null; }
}
```

`classFromA` and `classFromB` are two genuinely distinct `Class` objects, and an object created by one is not an `instanceof` the other's type, even though a human reading the two `.class` files byte-for-byte would find them identical. This is not a bug — it is a deliberate, load-bearing part of the JVM's design, and it is exactly what a plugin architecture that loads each plugin with its own class loader relies on: two different versions of the same plugin, or two entirely different plugins that happen to define a class with the same name, can coexist in one JVM without colliding, because each one's classes carry a distinct identity tied to the loader that defined them.

## Plugin architectures: why a custom loader per plugin

A plugin system that wants to load, isolate, and potentially unload plugins independently typically gives each plugin its own `ClassLoader` instance, with the application's own class loader as its parent (preserving delegation for shared JDK and API classes, while isolating the plugin's own internal classes):

```java
import java.net.URL;
import java.net.URLClassLoader;

public class PluginLoader {

    public static Object loadPlugin(URL pluginJarUrl, String mainClassName, ClassLoader parent) throws Exception {
        URLClassLoader pluginLoader = new URLClassLoader(new URL[]{pluginJarUrl}, parent);
        Class<?> pluginClass = pluginLoader.loadClass(mainClassName);
        return pluginClass.getConstructor().newInstance();
    }
}
```

This gives two independently loaded plugins their own separate namespace for internal classes — Plugin A's internal `com.plugin.Helper` and Plugin B's entirely unrelated internal `com.plugin.Helper` never collide, because each is defined by a different loader and therefore carries a different runtime identity, even though their fully-qualified names are identical. The cost is exactly the surprising behavior demonstrated above: code holding a reference typed as the *shared* API interface (loaded once by the parent loader) can interact with either plugin correctly, but code that somehow ends up with two objects from *different* plugin loaders, expecting them to be interchangeable by name alone, hits the `instanceof`/`ClassCastException` surprise directly.

## Class loader leaks: a specific, insidious memory leak

A **class loader leak** happens when a plugin's class loader — along with every class it loaded, and every static field any of those classes hold — cannot be garbage collected even after the plugin is supposedly "unloaded," because something *outside* the plugin still holds a reference reaching back into it.

```java
// A common source of a class loader leak: a long-lived, application-wide collection
// (a cache, a listener registry, a ThreadLocal recall from the concurrency chapter)
// retaining a reference to an object whose class was loaded by the plugin's class loader.
public class GlobalEventBus {
    // If a plugin registers a listener here and the application forgets to remove it
    // when the plugin is "unloaded," this list keeps the listener object alive —
    // and through it, the listener's Class, and through THAT, the entire plugin
    // ClassLoader and every class it ever loaded.
    static final List<Object> listeners = new ArrayList<>();
}
```

The mechanism is exactly the garbage-collection reachability rule from the memory-model foundations of this course, applied at the granularity of an entire class loader: a `ClassLoader` (and every `Class` it defined, and every static field those classes hold) is only eligible for garbage collection once **nothing** anywhere in the JVM still holds a live reference to it, directly or transitively. A single forgotten listener registration, a single entry left in a static cache, or a single thread that was started by plugin code and never stopped, is enough to keep the *entire* plugin's class loader — and every class and static field it ever loaded — permanently resident in memory, even though the application believes the plugin has been unloaded. Repeated plugin reload cycles (load, "unload," reload) under this kind of leak accumulate an ever-growing set of orphaned class loaders, each one representing a genuine, unrecoverable chunk of leaked memory, exactly the kind of slow, silent memory growth that eventually manifests as an `OutOfMemoryError` far removed in time and stack trace from wherever the actual leak originated.

## Diagnosing an "impossible" ClassCastException

The identity rule from earlier in this lesson explains a specific, genuinely confusing failure mode: a `ClassCastException` (or a failed `instanceof` check) between what appears, from reading the source code, to be the exact same class. This happens when two objects were loaded by two different class loaders — commonly, one loaded by the application's normal classpath and another loaded by a plugin's isolated loader, both defining a class with the same fully-qualified name from what might even be the identical `.jar` file included in two different places.

```text
java.lang.ClassCastException: class com.example.Widget cannot be cast to class com.example.Widget
  (com.example.Widget is in unnamed module of loader 'app'; com.example.Widget is in unnamed
   module of loader com.example.PluginLoader @1a2b3c4d)
```

Notice the JDK's own error message, in recent Java versions, deliberately spells out *which loader* each side came from — this is precisely because "cannot be cast to" between two classes with the identical printed name is otherwise inexplicable without knowing to look for a class loader mismatch. Recognizing this message format is the fast path to diagnosing the actual cause: somewhere, the same class was loaded twice by two different loaders, and an object from one side is being used where the other side's type was expected.

## What happens under the hood: from a class-load request to a defined type

1. A request to load a class (via `Class.forName`, an explicit `loadClass` call, or the JVM resolving a reference during normal execution) starts at some specific `ClassLoader` instance.
2. Under the standard delegation model, that loader first asks its parent to attempt the load, recursively up to the bootstrap loader; only if every ancestor reports it cannot find the class does the original loader attempt to locate and define it itself.
3. "Defining" a class means the loader reads the raw bytecode (from wherever it is configured to look — a classpath directory, a jar, a URL) and hands it to the JVM to become an actual, usable `Class` object, tagged internally with a reference to the defining loader.
4. Every subsequent reference to "the class named X" from code running under that same loader resolves to that same `Class` object; code running under a *different* loader that also loaded a class named X resolves to a *different* `Class` object, even if the bytecode was byte-for-byte identical.
5. A `Class` object (and everything reachable from its static fields) remains reachable, and therefore ineligible for garbage collection, for as long as anything — another object, a thread, a static field elsewhere in the JVM — holds a live reference into it, directly or transitively, regardless of whether the surrounding application considers the class loader that defined it "unloaded."

## Common mistakes

**Mistake 1: assuming two classes with the same fully-qualified name and identical bytecode are always the same type.** Loaded by two different class loaders, they are genuinely distinct types, and `instanceof`/casts between them fail. Fix: recognize the "same-looking class, failed cast" symptom as a class-loader-identity issue, and check which loader each side actually came from.

**Mistake 2: registering a plugin's listener, callback, or thread in a long-lived, application-wide structure without a corresponding removal on unload.** This keeps the plugin's entire class loader (and everything it loaded) reachable indefinitely, leaking memory on every reload cycle. Fix: track every reference a plugin's objects are given to outside code, and explicitly remove it when the plugin is unloaded.

**Mistake 3: not reading a `ClassCastException`'s full message, which in modern JDKs names the specific class loader on each side.** The message contains the exact diagnostic information needed; skimming past it wastes time re-deriving what it already states. Fix: read the full exception message, including the loader identifiers, before speculating about the cause.

## Best practices

- Trust the standard delegation model for ordinary application code; only override it (with a custom class loader) when a plugin architecture genuinely needs per-plugin isolation.
- Give each isolated plugin its own class loader with the application's loader as its parent, to preserve delegation for shared API and JDK classes while isolating the plugin's own internals.
- Track every reference a plugin hands to code outside its own loader (listeners, callbacks, started threads) and remove it explicitly on unload, to avoid a class loader leak.
- When encountering a `ClassCastException` between apparently identical classes, immediately suspect a class-loader-identity mismatch and check the exception message for the specific loaders involved.

## Summary

- A `ClassLoader` finds and defines classes; the standard hierarchy (bootstrap, platform, application) uses parent delegation to prevent counterfeit classes from shadowing trusted JDK types.
- A class's runtime identity is its binary name **plus** the specific `ClassLoader` instance that defined it — two identically-named, byte-for-byte identical classes loaded by different loaders are distinct types.
- A plugin architecture uses a custom loader per plugin specifically to exploit this identity rule for isolation, at the cost of surprising `instanceof`/cast failures if objects cross loader boundaries unexpectedly.
- A class loader leak keeps an entire plugin's class loader (and everything it loaded) reachable, and therefore un-garbage-collectible, because something outside the plugin still holds a reference into it — commonly a forgotten listener registration or an un-stopped thread.
- A `ClassCastException` between apparently identical classes is the signature symptom of a class-loader-identity mismatch, and modern JDK error messages name the specific loaders involved.

## Practice

1. **Warm-up:** Explain why the standard parent-delegation model prevents application code from successfully substituting a counterfeit `java.lang.String` class.
2. **Warm-up:** Two objects, both apparently instances of `com.example.Widget`, fail an `instanceof` check against each other. What is the most likely cause, and how would you confirm it?
3. **Core:** Write a small plugin loader using `URLClassLoader` with a custom parent, load the same class twice through two separate loader instances, and demonstrate the resulting `Class` objects are unequal and objects from one fail `instanceof` against the other.
4. **Core:** Construct a deliberate class loader leak (register a plugin-loaded object's reference in a static, application-wide list and never remove it), and reason about why the plugin's class loader remains reachable even after you drop your own direct reference to the loader itself.
5. **Challenge:** Fix the leak from the previous exercise by explicitly removing the registered reference on "unload," and describe what evidence (a profiler's retained-object graph, a heap dump) would confirm the class loader is now actually eligible for garbage collection.

## Check your understanding

1. What problem does parent delegation specifically prevent, and how does asking the parent first accomplish that?
2. What two things together actually form a class's runtime identity in the JVM?
3. Why would a plugin architecture deliberately want two structurally identical classes to be treated as distinct types by the JVM?
4. What specifically keeps a class loader leak's memory from being reclaimed, in terms of garbage-collection reachability?
5. Why is a class loader leak a slow, cumulative problem across multiple plugin reload cycles rather than an immediate failure?
6. What information does a modern JDK's `ClassCastException` message include that helps diagnose a class-loader-identity mismatch specifically?
