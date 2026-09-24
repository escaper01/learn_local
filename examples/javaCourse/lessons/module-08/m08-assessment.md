# Chapter 8 assessment and deliberate practice

This chapter's generics rules can feel like a wall of syntax at first: `?`, `extends`, `super`, `&`, all stacked into signatures that look intimidating before you know what each piece is protecting you from. Every rule in this chapter exists to prevent one specific failure — a type mismatch discovered as a runtime `ClassCastException`, far from wherever the actual mistake happened — by catching it at compile time instead. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Generic classes, interfaces, methods, and raw types

A generic class or method declares a type parameter connecting its inputs and outputs, letting the compiler enforce consistency with no casts. Type arguments must be reference types; boxing and unboxing bridge primitives and their wrapper classes automatically, but unboxing a `null` wrapper throws `NullPointerException`. A raw type (a generic type with no type argument) compiles with only a warning but discards every compile-time guarantee, letting corruption happen silently at one point and fail with a `ClassCastException` at a completely different, unrelated point.

### Lesson 2: Invariance, wildcard capture, and PECS

Generics are invariant: `List<Integer>` shares no subtype relationship with `List<Number>`, which prevents inserting an incompatible value through a supertype-typed alias. `List<? extends T>` (a producer) is safe to read as `T` but not write into; `List<? super T>` (a consumer) is safe to write `T` into but only readable as `Object`. PECS — producer extends, consumer super — is the rule for choosing correctly between them, and reversing the directions produces a method the compiler correctly refuses to call the wrong way.

### Lesson 3: Upper, lower, multiple, and recursive bounds

An unbounded type parameter supports only `Object`'s methods; a bound like `T extends Comparable<? super T>` grants access to a more specific type's methods, enabling operations like `compareTo`. `Number` alone does not provide `compareTo`, since `Number` never declares it. Multiple bounds combine with `&`, class bound first. A `Comparator<? super T>` parameter is often the better design over a `Comparable` bound when a type has no single natural ordering.

### Lesson 4: Type erasure, bridge methods, and heap pollution

Type erasure removes a generic type's specific type arguments after compilation, leaving one shared runtime class regardless of parameterization — which is exactly why `new T()`, `T.class`, and `instanceof List<String>` do not compile. Heap pollution occurs when a raw-type write inserts an incompatible value into a generic collection; the write succeeds silently, and the resulting `ClassCastException` surfaces later, at an unrelated read, through the cast erasure inserts there. A bridge method reconciles a generic interface's erased signature with a specific implementation.

### Lesson 5: Designing readable and usable generic APIs

A reusable API should accept the least restrictive useful input and return the most precise, honest result. A wildcarded return type burdens every caller with unknown-type uncertainty the implementation may not actually have; return an exact type whenever the method genuinely always produces one. `Iterable<T>` is often a strictly more flexible, equally correct parameter choice than `List<T>`. A type parameter appearing in only one place in a signature, connecting nothing, is usually decorative; a wildcard is more honest. Generics never express ownership or mutability; document those separately.

## Cheat sheet

### The four traps and their fixes

| Trap | What goes wrong | Fix |
|---|---|---|
| Using `Object` instead of a type parameter | Every read needs a cast; wrong casts fail at run time | Declare a real type parameter, `<T>` |
| `List<Integer>` assigned to `List<Number>` | Compiler rejects it (invariance) | Use `List<? extends Number>` if only reading |
| Writing into a `List<? extends T>` | Compiler rejects it | Use `List<? super T>` for the consumer side (PECS) |
| Raw type (`List` with no argument) | Compiles with a warning; corrupts silently, fails later at an unrelated read | Never use a raw type in new code |

### PECS at a glance

| Role | Bound | Safe to... |
|---|---|---|
| Producer (you read from it) | `? extends T` | read as `T`; cannot safely write (except `null`) |
| Consumer (you write into it) | `? super T` | write `T` values; can only read back as `Object` |

### Bounds

| Need | Bound |
|---|---|
| Comparison | `T extends Comparable<? super T>` |
| Numeric operations | `T extends Number` |
| Both | `T extends Number & Comparable<T>` (class bound first) |
| Multiple orderings for one type | `Comparator<? super T>` parameter instead of a bound |

### API design checklist

| Question | Preferred answer |
|---|---|
| Does the parameter need full `List` semantics, or just iteration? | `Iterable<T>` if only iterating |
| Does the method always return one exact type? | Return that exact type, not a wildcard |
| Does `<T>` connect more than one place in the signature? | If not, use `?` instead |
| Is the returned collection safe to mutate? | Document it; generics alone do not say |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does any code introduce a raw type, even temporarily, to "make the compiler stop complaining"?
- Is a method parameter that only ever reads values bounded with `super` instead of `extends` (or vice versa for a write-only parameter)?
- Does a generic method attempt `new T()`, `T.class`, or `instanceof SomeGeneric<Specific>`?
- Is a boxed wrapper value unboxed without checking whether it might be `null`?
- Does a return type use a wildcard when the implementation always returns one exact, known type?
- Is a type parameter present in a signature without connecting at least two things?

## The judgment question

The judgment question asks what should guide a parameter's bound when a generic API only needs to *read* values. The answer is PECS, applied to the read-only case specifically: a parameter your algorithm only reads from is a producer, and a producer should be bounded with `extends`, accepting the widest possible range of compatible input types while still guaranteeing every element can be read as at least the type your algorithm needs. Reaching for raw `Object` everywhere discards type safety entirely; adding every available interface as a bound asks for more than a read-only algorithm actually needs. The correct bound reflects exactly the operations the algorithm performs — no more, no less — exactly as Lesson 3 and Lesson 5 both emphasized.

## Approaching the implementation lab

The lab asks for a range-copying method that clamps both bounds into the array before copying.

1. Write the contract first: for a given array length, what are the valid clamped values of `start` and `end`? The task states the rule precisely: clamp each bound to `0..length`, and return an empty array when the clamped end does not exceed the clamped start.
2. Build a boundary table before writing code: a `start` before 0, an `end` beyond `length`, `start` equal to `end`, `start` greater than `end`, and an empty input array.
3. Decide the exact order of operations: clamp first, *then* compare the clamped values to decide whether any range remains to copy. Clamping before comparing is what makes out-of-range inputs safe instead of throwing.
4. This lab does not require a type parameter or wildcard at all, since it operates on a concrete `int[]` — but the same clamp-then-copy discipline you write here is exactly the kind of boundary-first thinking every generic method in this chapter's examples (`first`, `max`, `transform`) also applied before touching any element.
5. Keep the method deterministic and free of side effects, consistent with every function lab in this course.

## Approaching the debug lab

The debug lab's `copy` method declares one invariant type parameter `T` for both its source and destination lists, but the call site passes a `List<Integer>` source and a `List<Number>` destination — two different types that cannot both satisfy one single `T`.

1. Run the program (or reason through the compiler's rejection) and confirm you understand exactly why one shared `T` cannot unify `List<Integer>` and `List<Number>` at the same time — this is precisely `ReverseTransferRejected`'s failure from Lesson 2, in a new arrangement.
2. Identify which parameter is the producer (only ever read from) and which is the consumer (only ever written into) — the method body, `to.addAll(from)`, tells you directly: `from` is read, `to` is written.
3. Apply PECS: bound the producer parameter with `? extends T` and the consumer parameter with `? super T`, exactly as `PecsTransfer.transfer` did in Lesson 2, keeping a single type parameter `T` that both wildcards now relate to instead of constraining directly.
4. Confirm your fix preserves the demonstrated call exactly as written (a `List<Integer>` source, a `List<Number>` destination) and produces the expected `[1, 2]` output, without changing the call site itself.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Write a generic `Pair<L, R>` class (if you have not already, from Lesson 1's practice) and add a method `static <A, B> Pair<A, B> of(A left, B right)`, then use it to build a small list of pairs and print them.
2. Deliberately introduce a raw-type heap-pollution bug into a method of your own design, confirm the resulting `ClassCastException` occurs at a different line than the corrupting write, and then fix it.
3. Design a small generic API (two or three methods) applying every principle from Lesson 5: correct PECS, least-restrictive input, honest return types, no decorative type parameters, and documented mutability.
4. Take a `Comparable`-bound generic method you wrote earlier in this chapter and add an overload accepting an explicit `Comparator<? super T>` instead, and compare when each version is the better choice to call.

## Self-assessment

You are ready for Chapter 9 when you can do all of the following without notes:

- Explain why a generic `Box<T>` needs no casts where an `Object`-based equivalent does, and connect this to a concrete `ClassCastException` scenario.
- Explain why `List<Integer>` cannot be assigned to `List<Number>`, and state the PECS rule for correctly restoring flexibility with wildcards.
- Add a bound to a generic method so it can call `compareTo`, and explain why `Number` alone would not have been enough.
- Explain why `new T()` and `instanceof List<String>` do not compile, referencing type erasure specifically.
- Trace a heap-pollution scenario from its silent corrupting write to its later, unrelated `ClassCastException`, and explain why the two are not adjacent.
- Given a method signature, judge whether its parameter and return types are as unrestrictive and as honest as they could be, and revise it if not.
