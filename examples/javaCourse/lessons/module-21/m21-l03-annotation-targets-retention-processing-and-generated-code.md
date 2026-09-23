# Annotation targets, retention, processing, and generated code

## Metadata needs a consumer
```java
@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
@java.lang.annotation.Target(java.lang.annotation.ElementType.METHOD)
@interface Audited {
    String action();
}
```
Target restricts where an annotation may appear. SOURCE retention supports compile-time tooling only; CLASS stores metadata without ordinary runtime reflection visibility; RUNTIME enables reflection. An annotation does not log or validate anything by itself.

## Compile-time versus runtime
An annotation processor can generate source and diagnostics during compilation. A runtime framework can inspect annotations and apply behavior through reflection or proxies. These approaches differ in startup cost, error timing, tooling, and visibility. @Inherited has limited class-annotation inheritance semantics; it does not automatically propagate all method/interface annotations.

## Practice
Annotate two methods and write a narrow inspector listing their action values. Change retention to SOURCE and predict the result. Define a compile-time validation rule that would be preferable to a late runtime failure. Explain the difference between @Override, which helps the compiler, and your custom annotation, which needs its own consumer.
