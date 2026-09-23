# JPMS descriptors, requires, exports, opens, services, and jlink

## Modules declare reliable boundaries
```java
module academy.app {
    requires java.net.http;
    exports academy.api;
}
```
This belongs in module-info.java. requires expresses module dependencies; exports makes public types in a package available to other modules. opens permits reflective access and can be restricted to selected modules. Exporting a package does not automatically open private internals.

## Services and runtime images
uses declares consumption of a service interface; provides ... with ... declares providers. ServiceLoader discovers implementations without application code constructing each provider directly. jlink creates a runtime image from a resolved module graph; it is not a general replacement for packaging arbitrary nonmodular dependencies.

Classpath code belongs to unnamed modules and differs from explicit module-path code. Split packages and automatic modules complicate migration; inspect the actual dependency graph.

## Practice
Create a tiny API module and implementation module, compile them on a module path, and attempt access to an unexported package. Add a ServiceLoader provider. Explain whether a serializer truly requires opens and limit it to the relevant package and module.
