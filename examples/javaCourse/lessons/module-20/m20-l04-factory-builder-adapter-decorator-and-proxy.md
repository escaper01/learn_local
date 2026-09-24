# Factory, Builder, Adapter, Decorator, and Proxy

Design patterns are named solutions to recurring problems, and this lesson's central discipline — carried over directly from Lesson 2's "justify every abstraction against a concrete pressure" — is to reach for a pattern only when its specific problem is actually present, not because a pattern's name sounds applicable. This lesson covers two creational patterns (Factory, Builder) that manage object construction, and three structural patterns (Adapter, Decorator, Proxy) that all wrap one object with another, distinguished by exactly *why* they wrap it.

What you will learn:

- Factory Method and when constructing an object needs to vary by subtype, not just by parameter
- Builder, and the specific problem of a constructor with many optional parameters
- Adapter: changing what interface an existing object satisfies, without changing its behavior
- Decorator: layering additional behavior around an object while keeping its interface identical
- Proxy: controlling access to an object, transparently to its caller
- Why Adapter, Decorator, and Proxy look structurally similar but solve entirely different problems

## Factory Method: varying construction by subtype

A **Factory Method** is a method whose job is to construct and return an object, chosen based on some input, when a plain constructor call cannot express "construct one of several possible subtypes depending on a condition":

```java
public interface PaymentProcessor {
    void charge(int amountCents);
}

public final class PaymentProcessorFactory {
    public static PaymentProcessor forMethod(PaymentMethod method) {
        return switch (method) {
            case CREDIT_CARD -> new CreditCardProcessor();
            case BANK_TRANSFER -> new BankTransferProcessor();
            case WALLET -> new WalletProcessor();
        };
    }
}
```

The pressure that justifies this is specific: calling code needs a `PaymentProcessor` without needing to know, or care, which concrete class implements the chosen payment method — that decision is centralized in one place, so adding a new payment method later means adding one `case`, not hunting down every place in the codebase that might construct a processor directly. Reaching for a factory when there is only ever one concrete implementation, with no foreseeable second one, adds a layer of indirection with nothing behind it to justify the cost — exactly Lesson 2's "abstraction without a concrete change pressure" over-engineering warning, applied to a specific pattern.

## Builder: many optional parameters, one readable construction

A **Builder** solves the problem of a constructor (or factory method) that would otherwise need many parameters, several of them optional, where positional arguments become error-prone and unreadable:

```java
// Without a builder: which boolean is which? Which null means "use the default"?
new EmailMessage("a@example.com", "b@example.com", null, "Subject", "Body", true, false, null);

// With a builder: each value is named at the call site, optional values can be genuinely omitted,
// and the object is only constructed once all required fields are confirmed present.
EmailMessage message = EmailMessage.builder()
        .from("a@example.com")
        .to("b@example.com")
        .subject("Subject")
        .body("Body")
        .urgent(true)
        .build();
```

```java
public final class EmailMessage {
    private final String from;
    private final String to;
    private final String cc;
    private final String subject;
    private final String body;
    private final boolean urgent;

    private EmailMessage(Builder builder) {
        this.from = Objects.requireNonNull(builder.from, "from is required");
        this.to = Objects.requireNonNull(builder.to, "to is required");
        this.cc = builder.cc; // genuinely optional
        this.subject = Objects.requireNonNull(builder.subject, "subject is required");
        this.body = Objects.requireNonNull(builder.body, "body is required");
        this.urgent = builder.urgent;
    }

    public static Builder builder() { return new Builder(); }

    public static final class Builder {
        private String from;
        private String to;
        private String cc;
        private String subject;
        private String body;
        private boolean urgent = false; // sensible default

        public Builder from(String from) { this.from = from; return this; }
        public Builder to(String to) { this.to = to; return this; }
        public Builder cc(String cc) { this.cc = cc; return this; }
        public Builder subject(String subject) { this.subject = subject; return this; }
        public Builder body(String body) { this.body = body; return this; }
        public Builder urgent(boolean urgent) { this.urgent = urgent; return this; }

        public EmailMessage build() { return new EmailMessage(this); }
    }
}
```

`build()` is the single point where required-field validation happens, which is exactly why the constructor itself is `private` — the only way to obtain an `EmailMessage` is through a `Builder` that has been given every required value. For a small number of parameters (two or three, none of them ambiguous booleans), a builder is unnecessary ceremony; the pattern earns its cost specifically when the parameter list is long enough, or ambiguous enough, that positional construction becomes genuinely error-prone.

## Adapter: translating an interface, without changing behavior

An **Adapter** makes an existing object usable through an interface it was not originally written to satisfy — the classic use case is integrating a legacy class or a third-party library whose interface does not match what your code expects, without modifying that class's own source:

```java
// Existing, unchangeable legacy class with an incompatible interface.
public final class LegacySmsGateway {
    public void sendTextMessage(String phoneNumber, String messageBody) { /* ... */ }
}

// Target interface your application actually depends on.
public interface Sender {
    void send(String recipient, String message);
}

// Adapter: translates calls from the target interface to the legacy class's own interface,
// changing nothing about how LegacySmsGateway actually behaves.
public final class LegacySmsAdapter implements Sender {
    private final LegacySmsGateway legacyGateway;

    public LegacySmsAdapter(LegacySmsGateway legacyGateway) {
        this.legacyGateway = legacyGateway;
    }

    @Override
    public void send(String recipient, String message) {
        legacyGateway.sendTextMessage(recipient, message); // pure translation, no added behavior
    }
}
```

The defining property: `LegacySmsAdapter` adds no new behavior at all — it exists purely so that code depending on the `Sender` interface (perhaps a hexagonal architecture's port, from the previous lesson) can use `LegacySmsGateway` without either side needing to change. This is exactly the pattern the concept-check question in this chapter's JSON describes: wrapping a legacy sender so it satisfies a new interface, with no behavior change.

## Decorator: layering behavior around the same interface

A **Decorator** wraps an object that implements a given interface, itself implementing the *same* interface, adding behavior before or after delegating to the wrapped object — unlike Adapter, the interface does not change; unlike simply modifying the original class, the added behavior is composable and layerable:

```java
public interface Sender {
    void send(String recipient, String message);
}

// Base implementation: no metrics, no logging, just the core behavior.
public final class SimpleSender implements Sender {
    @Override
    public void send(String recipient, String message) { /* actually sends it */ }
}

// Decorator: implements the SAME interface, wraps another Sender, adds behavior around the call.
public final class MetricsRecordingSender implements Sender {
    private final Sender delegate;
    private final AtomicInteger sentCount = new AtomicInteger();

    public MetricsRecordingSender(Sender delegate) {
        this.delegate = delegate;
    }

    @Override
    public void send(String recipient, String message) {
        delegate.send(recipient, message); // core behavior, unchanged
        sentCount.incrementAndGet();       // added behavior, layered around it
    }

    public int sentCount() { return sentCount.get(); }
}
```

```java
// Decorators compose: each layer adds one concern, stacked around the same interface.
Sender sender = new MetricsRecordingSender(new LoggingSender(new SimpleSender()));
sender.send("+1-555-0100", "hello"); // logs, then sends, then records a metric — or in whatever order each layer wraps
```

Calling code holds a `Sender` reference and has no idea, or need to know, how many decorators are stacked underneath — each decorator's added behavior composes with every other one, which is exactly the difference from Adapter: Decorator's whole point is adding behavior while keeping the interface identical, where Adapter's whole point is changing the interface while keeping the behavior identical. This is exactly the pattern the concept-check question describes for the metrics-adding half of its scenario.

## Proxy: controlling access, transparently

A **Proxy** also implements the same interface as the object it wraps, but its purpose is neither translation (Adapter) nor adding stacked behavior (Decorator) — it is **controlling access** to the real object, often making a decision about whether, when, or how the real call should happen at all, transparently to the caller:

```java
public interface Sender {
    void send(String recipient, String message);
}

// Proxy: controls access — here, lazily constructing an expensive real Sender only when first needed.
public final class LazySenderProxy implements Sender {
    private final Supplier<Sender> realSenderFactory;
    private Sender realSender; // not constructed until actually needed

    public LazySenderProxy(Supplier<Sender> realSenderFactory) {
        this.realSenderFactory = realSenderFactory;
    }

    @Override
    public void send(String recipient, String message) {
        if (realSender == null) {
            realSender = realSenderFactory.get(); // expensive construction, deferred
        }
        realSender.send(recipient, message);
    }
}
```

```java
// Proxy: controls access by rejecting calls once a rate limit is exceeded, without SimpleSender
// itself needing any rate-limiting logic at all.
public final class RateLimitingSenderProxy implements Sender {
    private final Sender realSender;
    private final Semaphore permitsPerMinute;

    public RateLimitingSenderProxy(Sender realSender, int maxPerMinute) {
        this.realSender = realSender;
        this.permitsPerMinute = new Semaphore(maxPerMinute);
    }

    @Override
    public void send(String recipient, String message) {
        if (!permitsPerMinute.tryAcquire()) {
            throw new RateLimitExceededException();
        }
        realSender.send(recipient, message);
    }
}
```

Both examples control *whether or when* the real object's work happens — deferring expensive construction, or refusing a call outright — rather than adding to what happens on every successful call the way a Decorator does. This distinction (control over access versus additive behavior) is genuinely fine in practice, and some real codebases use "Proxy" informally to describe what is structurally a Decorator; the useful discipline is naming, in your own design, *why* you are wrapping the object, since that reason is what should drive the wrapper's actual logic.

## Why these three look alike but solve different problems

Adapter, Decorator, and Proxy all share the same structural shape — a class implementing an interface, holding a reference to another object, delegating calls to it — which is precisely why confusing them is common. The distinguishing question is always **why** the wrapping exists:

| Pattern | Interface changes? | Purpose |
|---|---|---|
| Adapter | Yes (wrapped object satisfies a *different* interface than it originally did) | Make an incompatible interface usable, with no behavior change |
| Decorator | No (same interface, stacked) | Add behavior around calls, composably |
| Proxy | No (same interface) | Control whether/when/how the real call happens |

Asking "does this wrapper change what interface is satisfied, add stacked behavior, or control access to the underlying call" before writing a wrapper class clarifies which pattern actually fits — and, per this chapter's opening discipline, whether a plain, unwrapped implementation would serve just as well if none of these three specific pressures is actually present yet.

## What happens under the hood: from a factory call to a decorated proxy chain

1. `PaymentProcessorFactory.forMethod(...)` executes its `switch` at the moment it is called, constructing and returning exactly one concrete subtype based on the runtime value of `method` — no object exists before this call decides which class to instantiate.
2. A `Builder`'s fluent methods each return `this`, accumulating field values on the builder instance itself; only `build()` constructs the actual immutable target object, validating required fields at that single point.
3. An `Adapter`, `Decorator`, or `Proxy` object, once constructed, is indistinguishable at the interface level from any other implementation of the same interface — calling code invokes the interface method exactly as it would on any implementation, unaware of which concrete wrapper (or chain of wrappers) actually receives the call.
4. For a stacked Decorator chain, each layer's method body runs some of its own logic and then explicitly calls the same method on its wrapped delegate, so the call passes through every layer in the order they were nested, each contributing its own behavior around the innermost, real implementation's actual work.
5. For a Proxy, the wrapped real object may not even exist yet (lazy construction) or the call may never reach it at all (an access-control decision like a rate limit) — from the caller's perspective, both outcomes look like an ordinary method call on the shared interface.

## Common mistakes

**Mistake 1: using a Factory Method where a plain constructor would do.** If there is exactly one concrete implementation with no foreseeable second one, the factory adds indirection with no corresponding benefit. Fix: only introduce a factory when construction genuinely needs to vary by input.

**Mistake 2: using a Builder for a class with two or three unambiguous parameters.** The added ceremony outweighs the readability benefit for a short, clear parameter list. Fix: reserve Builder for genuinely long or ambiguous parameter lists, especially ones with several optional values.

**Mistake 3: confusing Adapter with Decorator.** Reaching for "Adapter" when the actual need is to add behavior (not translate an interface) produces a class that does not actually solve the interface-incompatibility problem Adapter exists for. Fix: ask whether the interface itself needs to change (Adapter) or stay the same while gaining new behavior (Decorator).

**Mistake 4: building a Proxy that quietly does more than control access.** A "proxy" that also adds unrelated business logic on every call has actually become a Decorator wearing the wrong name, which confuses anyone reading the code later expecting access-control semantics. Fix: keep a Proxy's logic scoped to controlling whether/when/how the real call happens; move additive behavior into an explicit Decorator instead.

## Best practices

- Introduce Factory Method only when construction genuinely needs to vary by a runtime condition, not for a single, unchanging concrete type.
- Reserve Builder for constructors with several optional or easily-confused parameters; a short, clear parameter list needs no builder.
- Choose Adapter when an interface needs to change without behavior changing; choose Decorator when behavior needs to be added without the interface changing; choose Proxy when access to the real call needs to be controlled.
- Keep each pattern's implementation scoped to its own single purpose — a Decorator that also controls access, or a Proxy that also adds unrelated behavior, has blurred the two patterns together.
- Name your wrapper classes according to which of the three purposes they actually serve, so a future reader's expectations match the code.

## Summary

- Factory Method centralizes construction that varies by subtype; it is unjustified overhead when only one concrete type will ever exist.
- Builder solves the specific problem of many optional or ambiguous constructor parameters, validating required fields at a single `build()` call.
- Adapter changes what interface an existing object satisfies, without altering its behavior.
- Decorator keeps the interface identical while layering additional, composable behavior around calls to the wrapped object.
- Proxy keeps the interface identical while controlling whether, when, or how the real call actually happens.
- All three structural patterns share the same "wraps another object behind the same interface" shape; the purpose behind the wrapping is what distinguishes them.

## Practice

1. **Warm-up:** For a legacy `FaxSender` class with an incompatible method signature that a new `Sender` interface needs to use unmodified, name the pattern that fits and sketch its shape.
2. **Warm-up:** Explain why a Builder would be unnecessary ceremony for a class with exactly two required, unambiguous `int` parameters.
3. **Core:** Implement a `Sender` interface, a base implementation, and two stacked Decorators (one logging, one recording metrics), and demonstrate that both layers' behavior runs when the composed chain is invoked.
4. **Core:** Implement a caching Proxy in front of an expensive lookup interface, and demonstrate (by counting real calls) that a second identical lookup does not reach the real implementation.
5. **Challenge:** Take a class you have written elsewhere with more than five constructor parameters, several of them optional or boolean, and refactor it to use a Builder, then justify in a comment why the refactor was worth the added ceremony.

## Check your understanding

1. What concrete pressure justifies introducing a Factory Method instead of calling a constructor directly?
2. What specific problem does a Builder solve that a long, plain constructor parameter list does not?
3. What is the key difference between what Adapter changes and what Decorator changes?
4. Why can a Proxy legitimately avoid ever calling the real object it wraps for a given invocation, while a Decorator generally cannot?
5. Why do Adapter, Decorator, and Proxy share the same basic class shape, and what question distinguishes which one you are actually looking at?
6. Give one concrete symptom that a "Proxy" class has actually drifted into being a Decorator instead.
