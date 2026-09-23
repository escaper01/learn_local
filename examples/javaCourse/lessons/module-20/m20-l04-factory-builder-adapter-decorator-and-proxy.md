# Factory, Builder, Adapter, Decorator, and Proxy

## Patterns solve specific structural problems
Factory Method delegates construction of a variant; Abstract Factory creates compatible families. Builder makes complex construction readable while retaining validation. Adapter translates an existing interface. Decorator adds behavior around the same interface. Proxy controls access or defers work.

```java
interface Sender { void send(String body); }
final class MeteredSender implements Sender {
    private final Sender delegate;
    MeteredSender(Sender delegate) { this.delegate = delegate; }
    public void send(String body) {
        delegate.send(body);
        System.out.println("send succeeded");
    }
}
```
This decorator records success after the call. Logging before the call would mean an attempt, not success. Failure semantics are part of the wrapper's contract.

Prototype takes a different approach to construction: instead of building a new instance through a constructor and a sequence of setters, it clones an existing, already-configured instance and adjusts only what differs. This suits objects that are expensive or intricate to assemble from scratch, or whose valid configuration is easier to copy than to reconstruct field by field. A correct clone must still deep-copy any mutable internal state, such as collections or nested objects, so that mutating the copy cannot silently corrupt the original.

## Practice
Wrap a sender with metrics and translate a legacy sender through an adapter. Explain why the two wrappers have different purposes. Design a builder that cannot publish an invalid object even if callers skip optional steps. Avoid global singleton state merely because a pattern catalog names Singleton.
