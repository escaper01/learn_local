# Constructors, fields, methods, method handles, and access control

## Lookup and invocation fail at runtime
```java
var method = String.class.getMethod("substring", int.class);
Object result = method.invoke("Java", 1);
System.out.println(result); // ava
```
This fragment requires handling reflective checked exceptions. Method lookup uses exact parameter types, so int.class differs from Integer.class. Invocation can fail because the receiver, arguments, accessibility, or called method is wrong. InvocationTargetException wraps a failure thrown by the target; inspect its cause.

## Access boundaries
setAccessible is not universal permission to bypass modules. Strong encapsulation can reject deep access. Opening a package for reflection is a deployment/API decision, not a routine fix for every diagnostic.

MethodHandle represents a typed executable reference with lookup-based access checking. It can support dynamic runtime machinery, but its invocation typing and adaptation rules require care.

## Beyond invoking existing members
Testing and mocking frameworks such as Mockito usually do not rely on reflective invocation alone to fabricate a mock. They use bytecode-generation libraries (ByteBuddy, or the older cglib and ASM) to synthesize a new proxy subclass at runtime, override its methods, and define that generated class into the JVM. The mock then behaves like ordinary compiled code rather than paying reflective dispatch overhead on every call.

## Practice
Invoke a valid method, request a nonexistent signature, and invoke a method that throws. Report these as different failures. Compare reflective invocation with an interface call and justify why reflection is necessary before using it in application logic.
