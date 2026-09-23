# Class loaders, delegation, plugins, identity, and loader leaks

## A name alone is not runtime identity
The defining class loader and binary name together identify a runtime class. Two loaders can define classes with identical names and bytes that are not assignment-compatible. This matters for plugins and redeployed applications.

```java
System.out.println(String.class.getClassLoader()); // bootstrap represented as null
System.out.println(Main.class.getClassLoader());
```
The bootstrap loader supplies foundational classes. Other loaders commonly delegate to parents before defining their own classes, though custom policies exist. Class loading, linking, and initialization are related stages; initialization can trigger static code.

## Retention
A long-lived thread, listener, cache, or ThreadLocal referencing a plugin object can retain its defining loader and associated classes after apparent unloading. Clearing one application field is insufficient if another route remains.

## Practice
Inspect loaders for platform and application classes. Sketch two plugins sharing an API loader but owning implementation loaders. Explain why placing duplicate API classes in both child loaders breaks interoperability. Design explicit plugin shutdown that unregisters listeners and closes resources before releasing loader references.
