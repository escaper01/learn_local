# Chapter 13 assessment and deliberate practice

This chapter built Java's functional-programming vocabulary from the ground up: what a lambda actually is and what it is allowed to capture, the small set of standard shapes almost every functional interface reduces to, the four kinds of method reference and how to compose functions and predicates, `Optional` as an explicit alternative to returning `null`, and the discipline of purity and injected side effects that makes all of the above genuinely testable. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Lambda target typing and effectively-final capture

A lambda has no type of its own; it is assigned the type of whatever functional interface the context expects, a process called target typing. A lambda body may capture a local variable from its enclosing scope only if that variable is final or effectively final (never reassigned after initialization) — fields and static fields are not subject to this rule at all. Capturing a mutable object through an effectively-final reference is completely legal, and does not make that object's contents immutable or thread-safe: the reference cannot be reassigned, but its target can still be mutated freely, including from multiple lambdas or multiple threads.

### Lesson 2: Predicate, Function, Consumer, Supplier, and primitive variants

Nearly every functional shape in the standard library reduces to one of four core interfaces: `Predicate<T>` (takes a value, returns boolean), `Function<T,R>` (takes a value, returns a transformed value), `Consumer<T>` (takes a value, returns nothing), and `Supplier<T>` (takes nothing, returns a value). Choosing between them is a question of data flow in and out, not of what the lambda body happens to do internally. Primitive specializations (`IntPredicate`, `IntFunction`, `ToIntFunction`, and similar) exist specifically to avoid the cost of autoboxing when a primitive value flows through a functional pipeline.

### Lesson 3: Method references, function composition, and readability

A method reference (`Type::method`, `instance::method`, `Type::new`, or an unbound instance-method reference) is shorthand for a lambda that simply forwards its arguments to an existing method, and is preferred over an equivalent lambda whenever it is at least as readable. `Function.andThen`/`compose` and `Predicate.and`/`or`/`negate` build a new function or predicate out of existing ones without needing a full new lambda body; a bound method reference evaluates its receiver expression immediately, at the point the reference is created, not each time it is later invoked.

### Lesson 4: Optional map, flatMap, fallback, and API design

`Optional<T>` represents "either exactly one non-null value or nothing," created with `of`, `ofNullable`, or `empty`, and lets a method's return type itself say a result might be absent instead of hiding that possibility in documentation or comments. `map`/`flatMap`/`filter` transform, unwrap, and conditionally empty a present value; `orElse` always evaluates its argument eagerly, while `orElseGet` only evaluates its supplier when the `Optional` is actually empty — a difference that matters enormously the moment the fallback has any real cost or side effect.

### Lesson 5: Purity, side effects, higher-order functions, and testability

A pure function's result depends only on its arguments and produces no observable external mutation — this has nothing to do with whether it is written as a lambda or a named method. Referential transparency (a pure call can always be replaced by its result) is exactly what makes memoization safe; applying it to an impure function can silently return stale, wrong results. A higher-order function accepts or returns another function, letting a control-flow pattern like retry logic be written once and reused with any specific operation; injecting a side effect itself (such as a `Consumer<String>` output sink) as a parameter makes otherwise I/O-dependent code trivially testable.

## Cheat sheet

### Lambda capture rules

| Kind of variable | Capture rule |
|---|---|
| Local variable or parameter | Must be final or effectively final (never reassigned) |
| Instance field | No restriction; may be freely read and mutated |
| Static field | No restriction; may be freely read and mutated |
| A mutable object referenced by an effectively-final local | The reference cannot change, but the object's contents still can |

### The four core functional shapes

| Interface | Takes | Returns | Method |
|---|---|---|---|
| `Predicate<T>` | `T` | `boolean` | `test` |
| `Function<T,R>` | `T` | `R` | `apply` |
| `Consumer<T>` | `T` | nothing | `accept` |
| `Supplier<T>` | nothing | `T` | `get` |

### Method references and composition

| Form | Example | Evaluates receiver |
|---|---|---|
| Static | `Integer::parseInt` | n/a |
| Bound instance | `myList::add` | immediately, when the reference is created |
| Unbound instance | `String::toUpperCase` | per call, using the first argument as the receiver |
| Constructor | `ArrayList::new` | n/a |

### Optional and laziness

| Method | Fallback evaluated |
|---|---|
| `orElse(value)` | Always, eagerly, even when the `Optional` is present |
| `orElseGet(supplier)` | Only when the `Optional` is actually empty |
| `orElseThrow(supplier)` | Only when the `Optional` is actually empty |
| `or(supplier)` | Only when the `Optional` is actually empty, returning another `Optional` instead of unwrapping |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does a lambda attempt to capture a local variable that is reassigned somewhere after its initial assignment?
- Is a mutable collection or object captured by a lambda assumed to be safe from concurrent mutation simply because the reference is effectively final?
- Is a functional interface chosen based on what feels natural rather than its actual input/output data flow?
- Is `orElse(expensiveOrSideEffectingCall())` used where `orElseGet(() -> expensiveOrSideEffectingCall())` was actually needed?
- Is a function being memoized or cached without first confirming it is genuinely pure?
- Does a method's side effect (printing, writing, sending) get hard-coded inline rather than accepted as an injectable parameter?

## The judgment question

The judgment question describes a lambda that captures a mutable collection through an effectively-final local variable, and asks what remains possible — the correct answer is that **mutation and races despite effectively-final capture** remain entirely possible. The effectively-final rule governs only the *reference itself*: once a local variable is assigned, a lambda capturing it can rely on that reference never pointing somewhere else. It says nothing whatsoever about the mutability of the object the reference points to. `CaptureRules`'s own `log` example from Lesson 1 demonstrated this directly: the `List<String> log` reference is effectively final and satisfies the capture rule, yet the list itself is freely mutated by every invocation of the lambda that captured it. If that same lambda were invoked from multiple threads, those mutations would be exactly as unsynchronized and race-prone as any other shared mutable state — effectively-final capture is a compile-time rule about variable reassignment, not a runtime guarantee about thread safety or immutability.

## Approaching the implementation lab

The lab asks for `normalize`: return trimmed, lowercased text, or the literal string `UNKNOWN` when the trimmed result is empty.

1. Write the precondition and boundary table first: a normal word with surrounding whitespace, an all-whitespace string, a single character, and an already-empty string.
2. Recall Lesson 4's `Optional`-adjacent discipline even though this task returns a plain `String`: decide the "absent" case (empty after trimming) explicitly and early, rather than letting it fall through by accident.
3. Trim before lowercasing, and lowercase with `Locale.ROOT` specifically — this course's earlier lessons on locale-sensitive text established why relying on the platform default locale for case conversion is unsafe, and that same rule applies here.
4. Keep the method deterministic and side-effect-free, exactly as every function lab in this course requires: no printing, no shared mutable state, purely a function of its one input.

## Approaching the debug lab

The debug lab's fallback call uses `Optional.of("ready").orElse(fallback())`, which evaluates `fallback()` immediately and unconditionally — incrementing `calls` even though the `Optional` is already present — so the program incorrectly prints `ready:1` instead of the required `ready:0`.

1. Run the program and confirm it currently prints `ready:1` instead of the expected `ready:0`.
2. Recall Lesson 4's exact distinction: `orElse` evaluates its argument eagerly, as a plain value expression, before `Optional` ever checks whether it is present or empty; `orElseGet` accepts a `Supplier` and only invokes it when the `Optional` is genuinely empty.
3. Change `.orElse(fallback())` to `.orElseGet(Main::fallback)` (or an equivalent lambda), keeping the same `calls` counter and the same `fallback` method body unchanged.
4. Confirm your fix now prints `ready:0`, and be ready to explain, without consulting the answer, why `orElse`'s eager evaluation caused the extra call even though its result was never actually used.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Write a small program demonstrating the difference between capturing an effectively-final primitive local variable and capturing an effectively-final reference to a mutable collection, and explain in your own words why only the second case still allows observable mutation after capture.
2. Design a method that accepts a `Predicate<T>`, a `Function<T,R>`, or a `Consumer<T>` (your choice) as a parameter, and write two different call sites passing two different lambdas or method references to it.
3. Build a small validation pipeline using `Predicate.and`/`or`/`negate` on at least three predicates, and test it against inputs that should pass, fail on the first predicate, and fail on a later one.
4. Write a method returning `Optional<T>`, and demonstrate the difference in behavior between `orElse` and `orElseGet` when the fallback has an observable side effect (such as incrementing a counter or printing).
5. Take a method that mixes a pure calculation with a hard-coded side effect, and refactor it into a pure function plus an injected `Consumer` or similar parameter, following Lesson 5's pattern.
6. Write your own small higher-order function (a timing wrapper, a retry policy, or similar) and reuse it across at least two genuinely different operations, confirming the control-flow logic itself was written only once.

## Self-assessment

You are ready for Chapter 14 when you can do all of the following without notes:

- Explain what target typing means for a lambda, and state the exact rule governing which local variables a lambda may capture.
- Explain why capturing a mutable object through an effectively-final reference does not make that object immutable or thread-safe.
- Choose correctly among `Predicate`, `Function`, `Consumer`, and `Supplier` based on a method's actual input/output data flow.
- Explain the difference between a bound and an unbound method reference, and when each evaluates its receiver.
- Explain the difference between `orElse` and `orElseGet`, and describe a concrete scenario where using the wrong one causes an unwanted side effect.
- Explain why memoizing an impure function can produce incorrect results, and how injecting a side effect as a parameter improves testability.
- Explain, in one sentence each, what a higher-order function is and why writing one instead of several near-duplicate methods reduces real duplication rather than merely hiding it.
