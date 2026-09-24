# Chapter 7 assessment and deliberate practice

This chapter is where object-oriented programming stops being about single classes and starts being about how classes relate to each other and honor shared contracts: substitutability under inheritance, the equality and hashing rules every collection depends on, and the ordering rules sorted structures rely on. Every rule here compiles fine when broken — the failures show up later, in code that trusted the contract. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Inheritance and the Liskov substitution principle

`extends` creates an IS-A relationship; a class has exactly one direct superclass, and `Object` is the ultimate root. Constructors are not inherited; `super(...)` runs the parent constructor first. A superclass variable can hold a subclass object — the declared type controls what you may call, the runtime type controls which override runs. The Liskov substitution principle says subtypes must be behavioral substitutes: no stricter input requirements, no weaker guarantees, no broken invariants, no surprise failures. LSP violations compile fine and fail in innocent client code, far from their cause. Composition (HAS-A plus delegation) is frequently the safer way to reuse behavior.

### Lesson 2: Interfaces, abstract classes, and default methods

An interface declares functionality as a role; a class implements any number of them and must supply public bodies for their abstract methods. Interfaces may hold abstract, default, static, and private methods plus constants, but no constructors and no instance fields. Default methods share behavior but cannot store per-object state; conflicting defaults from unrelated interfaces must be resolved explicitly. An abstract class cannot be instantiated but can have constructors, instance fields, and both concrete and abstract methods. Prefer interfaces for types others depend on; add an abstract class when implementations share real state or construction logic.

### Lesson 3: Overriding, dynamic dispatch, super, and final

An override has the same name and parameter types as an inherited instance method; it may widen access and narrow the return type, never the reverse. Dynamic dispatch chooses an overridden instance method from the object's runtime class; overload selection, static methods, and fields are resolved at compile time from declared types instead. `@Override` turns silent signature mistakes into compile errors. `super.method()` calls the parent body directly without dispatch, while calls on `this` inside parent code still dispatch to the subclass. `final` methods cannot be overridden and `final` classes cannot be extended. An overridable call made from a constructor observes uninitialized subclass fields.

### Lesson 4: equals, hashCode, identity, and immutable keys

`Object` provides default `equals` (identity) and `hashCode` (identity-based) for every object; `==` tests identity, `equals` tests logical equality as a class defines it. `equals` must be reflexive, symmetric, transitive, consistent, and false for `null`. Equal objects must have equal hash codes, though equal hash codes never prove equality. Hash collections use `hashCode` to choose a bucket and `equals` to confirm a match, so the two methods must agree — a key whose hash-relevant state changes after insertion becomes unreachable, which is why keys must be immutable. Records generate consistent `equals`/`hashCode`/`toString`, but compare array components by identity.

### Lesson 5: Comparable, Comparator, total ordering, and composition

`compareTo` and `compare` return a negative, zero, or positive number; only the sign matters. `Comparable<T>` gives a class one natural order used automatically by sorting and sorted collections; `Comparator<T>` defines external orders and composes with `comparing`, `thenComparing`, and `reversed`. A valid comparator must be a total order — sign-antisymmetric, transitive, consistent in its zeros — and subtraction breaks this through overflow. `TreeSet` and `TreeMap` use only the comparison, where zero means "same position," regardless of what `equals` says; a sorted set can silently drop elements when the comparator ignores distinguishing fields.

## Cheat sheet

### Inheritance and dispatch

| Question | Answer |
|---|---|
| What decides which override runs? | the object's runtime type, always |
| What decides which overload, static method, or field is used? | the reference's declared type, at compile time |
| Does `super.method()` dispatch? | no, it calls the parent's body directly |
| Can a constructor safely call an overridable method? | no — subclass fields are not yet initialized |

### Interface vs abstract class

| Need | Use |
|---|---|
| A role many unrelated classes can fulfill | interface |
| Shared instance state or constructor logic | abstract class |
| A fixed algorithm with pluggable steps | abstract class + template method (`final` outer method) |

### equals/hashCode contract

| Rule | Meaning |
|---|---|
| Reflexive, symmetric, transitive, consistent | `equals` must behave like real equality |
| `x.equals(null)` | always `false` |
| `a.equals(b)` implies... | `a.hashCode() == b.hashCode()` |
| Equal hash codes imply... | nothing — collisions are legal |
| Keys in hash collections | must be immutable in every field `equals`/`hashCode` use |

### Ordering

| Tool | Use when |
|---|---|
| `Comparable<T>` | the class has one obvious natural order |
| `Comparator<T>` | you need an order chosen from outside, or several orders |
| `Integer.compare(a, b)` | never `a - b` (overflows) |
| `TreeSet`/`TreeMap` | zero from the comparator means "same slot," even if `equals` disagrees |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does any override narrow visibility, widen a checked exception, or change the return type incompatibly?
- Does any constructor call an overridable instance method?
- Does `equals` compare only some of the fields that `hashCode` also uses, or vice versa?
- Is any mutable field part of an object used as a hash-based collection key?
- Does any comparator use subtraction (`a - b`) instead of `Integer.compare`/`compareTo`?
- Does a subtype's method throw or reject input in cases its supertype's contract promises to handle?

## The judgment question

The judgment question describes a subtype that throws on every operation its interface promises to support. This is a direct Liskov substitution violation from Lesson 1: implementing an interface is a promise that instances are interchangeable with any other implementation wherever that interface is expected, and a type that cannot actually perform the promised operations breaks every caller who reasonably trusted the abstraction. The fix is never to catch and hide the exception at the call site — that treats the symptom. The real question is whether the abstraction itself is wrong (this type should not implement that interface at all) or whether the type is missing a genuine implementation it needs to provide.

## Approaching the implementation lab

The lab asks for a case-sensitive equality check between two strings after trimming both.

1. Write the contract first: what should `sameKey` return for two identical strings, two strings differing only by surrounding whitespace, two strings differing only by case, and two completely different strings?
2. Build a boundary table: empty strings, strings that become equal only after trimming, strings that are already equal, and strings that differ by case (which must **not** be treated as equal, since the task specifies case-sensitive comparison).
3. This lab is really about the concept from Lesson 4 applied practically: an equality check must be built from an actual, deliberate definition of "equal," not an accidental one. Trimming first normalizes the input exactly the way Chapter 4's console-input lessons taught; the comparison itself must remain case-sensitive.
4. Keep the method deterministic and free of side effects, consistent with every function lab in this course.

## Approaching the debug lab

The debug lab's `Key` class overrides `equals` to compare by `id`, but leaves `hashCode` returning the JVM's default identity-based hash — breaking the exact `equals`/`hashCode` agreement Lesson 4 built its entire hash-collection discussion around.

1. Run the program and confirm `set.contains(new Key(7))` returns `false` even though a `Key(7)` with an equal `id` was already added.
2. Recall exactly why: `HashSet` first uses `hashCode()` to choose which bucket to search, and only then uses `equals()` to confirm a match within that bucket. Two `Key` objects with the same `id` are `equals`, but their **identity**-based hash codes differ, so `contains` looks in the wrong bucket entirely and never even calls `equals` on the right object.
3. Rewrite `hashCode()` so it is computed from the exact same field `equals` uses — `id` — restoring the required consistency between the two methods.
4. Confirm your fix preserves the demonstrated construction and lookup calls exactly as written, and produces `true`.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Design a small class hierarchy (two or three levels) and deliberately write one method that violates the Liskov substitution principle, then write client code that breaks because of it, then fix the hierarchy.
2. Write a class with a full, correct `equals`/`hashCode` pair, add instances to a `HashSet`, and write a test proving lookups work correctly before and after the object's non-key fields change (if any are mutable).
3. Give a class a natural `Comparable` order and also write two different `Comparator` instances for it representing different orderings; sort a list three different ways and confirm each produces the expected order.
4. Take an existing class of yours that implements an interface, and write a short paragraph checking whether every implemented method can genuinely honor the interface's full contract for every valid input, per this chapter's judgment question.

## Self-assessment

You are ready for Chapter 8 when you can do all of the following without notes:

- Explain the difference between what a reference's declared type controls and what an object's runtime type controls, for both method calls and field access.
- State the Liskov substitution principle in your own words and give an example of a method override that violates it while still compiling.
- Explain when to reach for an interface versus an abstract class for a given design need.
- Write a correct `equals`/`hashCode` pair for a class, and explain why the two methods must be kept consistent for hash-based collections to work.
- Explain why a mutable field must never be used as (or to compute) a hash-based collection key.
- Choose correctly between `Comparable` and `Comparator` for a given ordering need, and explain why `Integer.compare` is preferred over subtraction.
