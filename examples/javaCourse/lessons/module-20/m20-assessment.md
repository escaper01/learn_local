# Chapter 20 assessment and deliberate practice

This chapter reframed architecture and design patterns as answers to concrete, named pressures rather than vocabulary to apply reflexively: cohesion and coupling as the actual forces that make a codebase easy or hard to change, SOLID as review questions weighed against a real change pressure rather than slogans, hexagonal/Clean/modular-monolith architecture as structural enforcement of "policy depends on nothing it shouldn't," and creational, structural, and behavioral patterns each solving one specific, recognizable problem. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Cohesion, coupling, dependency direction, and boundaries

Software architecture is mostly about managing change: how many files a change touches, how much context it requires, and how likely it is to break something unrelated. High cohesion means a class or package's contents belong together; low coupling means classes depend on as little of each other's detail as possible. The direction of a runtime call and the direction of a source-code dependency can point opposite ways — a port interface defined by the domain lets policy code depend on the behavior it needs rather than on storage or transport details, even though the runtime call still eventually reaches a concrete adapter.

### Lesson 2: SOLID principles as tradeoffs rather than slogans

SRP ("one reason to change"), OCP (add behavior by adding code, not editing stable code), LSP (a subtype must keep its parent's promises), ISP (role-shaped interfaces, not one bloated one), and DIP (policy depends on abstractions it owns) are each review questions to weigh against a concrete, present change pressure — not automatic virtues to apply everywhere. A new abstraction is justified when a concrete change or ownership pressure earns its cost, not whenever a principle's name could technically apply.

### Lesson 3: Layered, hexagonal, clean, and modular-monolith architecture

Hexagonal architecture puts the domain at the center, depending on nothing outside itself; ports are interfaces the domain defines in its own terms, and adapters (implementing those ports) depend on the domain, not the reverse. Clean Architecture generalizes this into concentric rings under one rule: dependencies point inward only. A modular monolith enforces strong internal module boundaries within one deployable unit, deferring microservices' operational cost until it is actually justified. The concrete, checkable proof a use case is well-separated: it can be unit-tested with an in-memory adapter and zero real infrastructure.

### Lesson 4: Factory, Builder, Adapter, Decorator, and Proxy

Factory Method centralizes construction that genuinely varies by subtype; Builder solves many optional or ambiguous constructor parameters, validating required fields at one `build()` call. Adapter, Decorator, and Proxy share the same wrapping shape but solve different problems: Adapter changes what interface an object satisfies without changing its behavior; Decorator keeps the interface identical while layering composable added behavior; Proxy keeps the interface identical while controlling whether, when, or how the real call happens.

### Lesson 5: Strategy, Command, State, Template Method, Observer, and events

Strategy injects a swappable algorithm — but the injected behavior must actually be used on every relevant code path, or the pattern's purpose is silently defeated. Command represents an action as an object, enabling queuing, logging, and undo, but idempotency is a separate, deliberately designed contract the Command interface does not provide automatically. State replaces status-field conditional sprawl with one class per state; Template Method fixes an algorithm's shape (enforced by making the template method `final`) while leaving specific steps to subclasses; Observer decouples a source of change from the code that reacts to it.

## Cheat sheet

### Structural patterns at a glance

| Pattern | Interface changes? | Purpose |
|---|---|---|
| Adapter | Yes | Make an incompatible interface usable, same behavior |
| Decorator | No | Add composable behavior around calls |
| Proxy | No | Control whether/when/how the real call happens |

### Behavioral patterns at a glance

| Pattern | Solves |
|---|---|
| Strategy | An algorithm that must vary at runtime, injected rather than hard-coded |
| Command | An action that must be represented as an object (queued, logged, undone) |
| State | Behavior that changes based on an internal state, without conditional sprawl |
| Template Method | A fixed algorithm skeleton with specific, overridable steps |
| Observer/events | Decoupling a source of change from the code reacting to it |

### SOLID as review questions

| Principle | Ask |
|---|---|
| SRP | Does this class have more than one reason to change? |
| OCP | Can new behavior be added without editing this stable code? |
| LSP | Does every subtype keep its parent's promises? |
| ISP | Does this interface force implementers to support methods they don't need? |
| DIP | Does policy code depend on an abstraction it owns, rather than a concrete detail? |

### The concrete test for architectural separation

A use case is well-separated exactly when it can be unit-tested with an in-memory adapter and zero real infrastructure (no database, no container, no network).

## Common mistakes checklist

Before submitting the labs, check your code against this list:

- Is an abstraction (interface, factory, builder) introduced with no concrete, present change pressure to justify it?
- Does a domain or use-case class import a specific storage or framework technology directly, rather than depending on a port it owns?
- Is a Strategy accepted as a parameter but not actually used to compute the result?
- Is a Command assumed to be safe to execute twice without an explicit idempotency mechanism?
- Does a "Proxy" or "Decorator" blur the line between controlling access and adding unrelated behavior?
- For the project lab: is any event ID recorded (or its total mutated) before every validation check has passed?

## The judgment question

The judgment question describes a pattern that adds five interfaces without an identified change pressure, and asks what should happen — the correct answer is **reassess whether its complexity is justified**, not keep it because patterns always help and not add another factory. This is Lesson 2's central discipline, restated at the chapter level: every one of this chapter's patterns (Factory, Builder, Adapter, Decorator, Proxy, Strategy, Command, State, Template Method, Observer) solves one specific, recognizable problem, and none of them are free — each adds indirection, more files to navigate, and more names a future reader must learn before understanding the code. Five interfaces added with no identified concrete pressure is a direct symptom of over-engineering, and "add another factory" would only compound the same mistake rather than address it.

## Approaching the implementation lab

The lab asks for `discount(price, percent)`: clamp `percent` to `0..100` and subtract that integer percentage from `price`.

1. Write the precondition and boundary table first: `percent` already in range (`20` on `100` → `80`), `percent` above 100 (clamped to 100, full discount), `percent` negative (clamped to 0, no discount), and `price = 0` (any percent still yields `0`).
2. Clamp `percent` into `[0, 100]` first, using `Math.max(0, Math.min(100, percent))` or equivalent, exactly as the instructions specify — this must happen before any arithmetic uses the raw, unclamped value.
3. Compute the discount amount as `price * clampedPercent / 100` using integer arithmetic, relying on truncation toward zero, and subtract it from `price` — matching the case `(75, 10)` expecting `68` (`75 * 10 / 100 = 7`, truncated, so `75 - 7 = 68`).
4. Confirm every boundary case from the JSON: full clamp-to-100 (`(90, 120)` → `0`), clamp-to-0 (`(100, -1)` → `100`), and the zero-price case (`(0, 90)` → `0`).

## Approaching the debug lab

The debug lab's starter code accepts an injected `Pricing` strategy parameter but ignores it entirely, returning the raw input unchanged — exactly the "Strategy accepted but not used" mistake this chapter's fifth lesson names explicitly.

1. Run the program and confirm it currently prints `100` instead of the required `50`.
2. Recall Lesson 5's exact point: accepting a strategy parameter does nothing by itself; the method's logic must actually route its computation through it.
3. Change `quote` to call `p.apply(n)` and return that result, instead of returning `n` directly, preserving the method's existing signature.
4. Confirm your fix now prints `50` (since the injected strategy halves its input: `100 / 2`), and be ready to explain why an unused injection point is a defect functionally identical to hard-coding the "wrong" pricing rule directly into `quote`.

## Approaching the project lab: Idempotent event application

`EventLedger.run` implements the **pure decision core** of an idempotent event consumer: given a sequence of `eventId|amount` lines, it must apply each new event exactly once, recognize an exact repeat as a harmless duplicate, flag a repeat with a *different* amount as a conflict, and reject malformed input — all without ever letting a rejected or duplicate event silently corrupt the running total.

1. **Parse and validate before mutating anything.** For each line: split on `|`, trim both tokens, validate the ID against `[A-Za-z0-9_-]{1,40}` and the amount as a positive `long` that parses cleanly (no leading zeros ambiguity issues — note `01` and `1` both parse to the same `long` value `1`, which is why case 6 expects the second `ok|1` line to register as `DUPLICATE`, not `CONFLICT`, against the first `ok|01` line's already-recorded amount of `1`). Any failure at this stage emits `ERROR` and must **not** record the event ID at all — an ID that failed validation was never applied, so a later, valid line with that same ID should not consider it already-seen.
2. **Look up the ID before deciding an outcome.** If the ID has not been seen, this is `APPLIED`: add the amount to the total and record the ID with this amount. If the ID has been seen with the *same* amount, this is `DUPLICATE`: emit it, but do not touch the total again. If the ID has been seen with a *different* amount, this is `CONFLICT`: emit it, and do not touch the total.
3. **Guard against overflow explicitly**, exactly as case 5 tests: adding a new event's amount to the running total must not silently wrap past `Long.MAX_VALUE`. Check before adding (e.g., `Long.MAX_VALUE - total < amount` implies overflow) and emit `ERROR` without recording the ID or changing the total if it would overflow — notice that once the total already equals `Long.MAX_VALUE` from a first `APPLIED` event, every subsequent *new* ID's amount overflows and must emit `ERROR`, not `APPLIED`.
4. **Blank lines are skipped entirely** — case 2's empty input produces only `TOTAL=0`, with no lines emitted for input that contains nothing to process.
5. **Build every output line first, then join with `\n`, with no trailing newline**, exactly matching the exact-comparison tests — an extra trailing newline or a different line separator will fail every case despite otherwise-correct logic.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Take a class from an earlier project with several `if`/`else` branches on a status field, and refactor it using the State pattern, confirming the same behavior with tests written before and after the refactor.
2. Build a small hexagonal-style use case (a port interface, one real adapter, one in-memory adapter), and write a unit test that only ever touches the in-memory adapter.
3. Implement a Command interface with at least one naturally idempotent command and one that requires an explicit deduplication key to be safe against redelivery, and write tests demonstrating both.
4. Identify a class in a personal or course project with more than five constructor parameters and refactor it to use a Builder, documenting in a comment which specific problem the refactor solved.
5. Design (in prose or a diagram) an ArchUnit-style rule that would have caught a real or hypothetical boundary violation in one of your own projects, and describe exactly what it would flag.

## Self-assessment

You are ready for Chapter 21 when you can do all of the following without notes:

- Explain the difference between the direction of a runtime call and the direction of a source-code dependency, using a port/adapter example.
- Apply each SOLID principle as a review question against a concrete change pressure, and recognize when a principle is not worth its cost.
- Explain the concrete, checkable test that proves a use case is well-separated from its infrastructure.
- Distinguish Adapter, Decorator, and Proxy by what each one changes (or does not change) about the wrapped object's interface and behavior.
- Explain why accepting an injected Strategy does not guarantee it is actually used, and why a Command interface does not guarantee idempotency.
- Explain what problem State solves compared to conditional sprawl on a status field, and why marking a Template Method `final` matters.
- Explain what an Observer's subject remains unaware of, and why that unawareness is the pattern's entire point.
