# Chapter 6 assessment and deliberate practice

This chapter gave you three modern, closely related language features — enums, records, and sealed hierarchies with pattern matching — that together let the compiler enforce far more of your domain's structure than plain classes and interfaces alone ever could. The real skill this chapter builds is not any one feature's syntax; it is the judgment to recognize which shape a piece of data actually has, and to let the compiler prove your code handles every case correctly. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Enums as type-safe objects with state and behavior

An `enum` declares a fixed, compiler-checked set of singleton constants, each a full object that can carry its own fields, constructor-assigned state, and methods, including per-constant method overrides. `==` is correct and idiomatic for comparing enum constants, since each one is the single shared instance for that name. `ordinal()` is fragile as a durable identifier because inserting or reordering constants silently reassigns what every previously stored ordinal means; store an explicit code instead. `EnumSet` and `EnumMap` are compact, enum-specific alternatives to general-purpose collections.

### Lesson 2: Records, canonical constructors, and shallow immutability

A `record` generates a private final field, an accessor named exactly like each component, a canonical constructor, and correct `equals`/`hashCode`/`toString` from one line of code. A compact constructor validates and normalizes; any reassignment inside it becomes the value actually stored. Record immutability is shallow: a `final` reference to a mutable component (a `List`, an array) does not prevent that object's own contents from changing. Defensively copying a mutable component with something like `List.copyOf` inside the compact constructor closes that hole for both construction and every accessor.

### Lesson 3: Sealed classes and controlled extension

`sealed` restricts which types may be direct subtypes of an interface or class, listed explicitly in a `permits` clause; every permitted subtype must itself be `final`, `sealed`, or `non-sealed`. Records are implicitly `final`, making them a natural fit as sealed leaves. `non-sealed` deliberately reopens extension from a specific branch. Modeling alternatives as separate sealed variants, each carrying only its own relevant data, makes contradictory states unconstructible, unlike one class with flags and optional fields.

### Lesson 4: Pattern matching with instanceof and switch

`instanceof` pattern matching folds a type check and a cast into one expression; the bound variable is usable only where the compiler can prove the match held. A pattern `switch` covering every permitted subtype of a sealed type is exhaustive with no `default` needed, and adding a new variant later breaks that exhaustiveness everywhere, forcing a compile error at each site needing an update. Exhaustiveness over subtypes never automatically covers `null`; a `null` selector throws unless you add an explicit `case null`.

### Lesson 5: Choosing among class, record, enum, and sealed hierarchy

The central question is whether a type has identity that persists across changes (an entity, modeled as an ordinary mutable class) or is entirely defined by its current values (a value, modeled as a record). A record's generated `equals` is exactly wrong for a mutable entity, since it treats every component as identity-defining. An enum fits a small, uniformly-shaped, fixed set of choices; a sealed hierarchy fits a closed set of alternatives whose data genuinely differs. Fields that only apply to some enum constants signal that a sealed hierarchy is the better fit.

## Cheat sheet

### Enum essentials

| Feature | Example |
|---|---|
| Declare | `enum Status { NEW, ACTIVE, DONE }` |
| All constants, declared order | `Status.values()` |
| Exact-name lookup, throws if unmatched | `Status.valueOf("NEW")` |
| Correct comparison | `status == Status.DONE` |
| Stable storable identifier | an explicit field, never `ordinal()` |
| Per-constant behavior | `NEW { ... }` overriding an interface/abstract method |

### Record essentials

| Feature | Example |
|---|---|
| Declare with components | `record Point(int x, int y) {}` |
| Accessor name | `p.x()`, not `p.getX()` |
| Validate/normalize | compact constructor: `Point { if (...) throw ...; }` |
| Snapshot a mutable component | `members = List.copyOf(members);` |
| Avoid | array components (identity-based `equals`) |

### Sealed and pattern matching essentials

| Feature | Example |
|---|---|
| Declare closed family | `sealed interface Result permits Success, Failure {}` |
| Every permitted subtype needs | `final`, `sealed`, or `non-sealed` |
| Decompose in a case label | `case Success(String text) -> ...` |
| Guard a pattern | `case Integer i when i < 0 -> ...` |
| Handle missing input | `case null -> ...` (never automatic) |

### Choosing a model

| This type... | ...is modeled as |
|---|---|
| Has identity that survives its fields changing | class |
| Is fully defined by its current values | record |
| Is a small, fixed, uniformly-shaped set of choices | enum |
| Is a closed set of alternatives with different data shapes | sealed hierarchy (usually of records) |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does any code store or compare an enum's `ordinal()` as if it were a stable identifier?
- Does a record hold a mutable component (a `List`, a `Map`, an array) without defensively copying it in a compact constructor?
- Is an array used as a record component where content-based equality is actually needed?
- Does every permitted subtype of a sealed type declare `final`, `sealed`, or `non-sealed`?
- Does any pattern `switch` over a reference type risk a `null` selector without an explicit `case null` or a prior null check?
- Is a mutable, identity-bearing type ever modeled as a record, or a fixed set of differently-shaped alternatives ever modeled as an enum with unused fields?

## The judgment question

The judgment question describes a record holding a mutable `List` and asks what additional decision is required. The answer is always the same shape of decision this chapter kept returning to: deciding whether, and how, to defensively copy that list so the record's shallow immutability guarantee becomes a genuine one, both where the list enters the record (the compact constructor) and where it can leave again (every accessor that returns it). Recognize this pattern whenever a record, or any class, holds a reference to something mutable.

## Approaching the implementation lab

The lab asks for a `status` mapping method: `NEW` maps to `queued`, `DONE` maps to `completed`, and every other input, including a real but unmapped value like `ACTIVE`, returns `unknown`.

1. Write the contract first: what should the method return for `"NEW"`, `"DONE"`, `"ACTIVE"`, and completely unrelated text? The task statement already answers this for you — use it to build your boundary table before writing any code.
2. Notice the phrase "return unknown for every other case" — this is exactly the kind of explicit, deliberate default this chapter has emphasized throughout (recall Lesson 1's stable-code lookup, and Lesson 4's `null`-handling policy): a fallback that is stated and tested, not an accident of whatever a `switch` happens to do when nothing else matches.
3. Decide how you will represent "does not match any known mapping" without throwing, since the contract calls for a returned value, not an exception, for unrecognized input.
4. Keep the method deterministic and free of side effects, consistent with every function lab in this course.

## Approaching the debug lab

The debug lab's `Team` record stores the caller's mutable list reference directly instead of snapshotting it, so clearing the caller's list after construction empties the record's own view too.

1. Run the program and compare the actual printed size to the expected `1`.
2. Identify exactly where the record's canonical (or compact) constructor currently assigns the incoming list to the component, and recognize this as the same aliasing pattern from this chapter's Lesson 2 `ShallowImmutability` example.
3. Decide which snapshotting technique restores independence between the caller's list and the record's own stored list, without changing the demonstrated construction call itself.
4. Confirm your fix preserves the intended behavior (the record still reflects whatever members it was constructed with) while no longer being affected by any later mutation of the original list the caller passed in.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Design a sealed `Shape` hierarchy of at least three record variants and write an exhaustive pattern `switch` (with record patterns) that computes each one's area, then add a fourth variant and fix every resulting compile error.
2. Take a class from an earlier chapter that used `int` or `String` constants to represent a fixed set of states, and refactor it to use a proper enum with an explicit, stable stored code instead of relying on `ordinal()` or raw strings.
3. Write a record with at least one mutable component, deliberately leave out the defensive copy, write a short program that demonstrates the resulting bug precisely as this chapter's examples did, and then fix it.
4. For a domain of your choosing, classify every type you would need using the checklist from Lesson 5, and justify each choice in writing before implementing any of them.

## Self-assessment

You are ready for Chapter 7 when you can do all of the following without notes:

- Explain why persisting an enum's `ordinal()` is fragile, and what to store instead.
- Explain what a one-line record declaration generates, and what it does not automatically guarantee for a mutable component.
- Fix a record so a mutable component can no longer be mutated through either the constructor's input or an accessor's output.
- Explain what a sealed type's `permits` clause restricts, and what modifier every permitted subtype must declare.
- Write an exhaustive pattern `switch` over a sealed hierarchy with no `default`, and explain why it still needs an explicit policy for `null`.
- Given an unfamiliar piece of data, decide whether it is best modeled as a class, a record, an enum, or a sealed hierarchy, and justify the choice in terms of identity, mutation, and data shape.
