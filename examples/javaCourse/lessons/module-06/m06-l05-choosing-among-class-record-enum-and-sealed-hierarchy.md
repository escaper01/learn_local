# Choosing among class, record, enum, and sealed hierarchy

You now have four distinct tools for modeling a type in Java: an ordinary class, a record, an enum, and a sealed hierarchy. Each of the previous four lessons taught one of them in isolation. The genuinely hard part of object-oriented design is not knowing the syntax for any one of them — it is recognizing, for a specific piece of real-world data, *which* one actually fits, before you write a single line of code. Choose wrong, and you either fight the tool for the rest of the class's life, or you build in a subtle correctness bug that only surfaces once the type is used somewhere its guarantees do not actually hold.

This lesson is deliberately about judgment rather than new syntax: it gives you the questions to ask, shows what goes wrong when a record is used for something that has identity rather than pure value, and closes the chapter by bringing all four tools to bear together on one small, realistic domain.

What you will learn:

- The central question that decides everything else: does this type have *identity* over time, or is it purely defined by its *current values*?
- Why using a record for a mutable entity silently generates the wrong `equals`, treating every field as identity-defining
- How to recognize a fixed, closed set of named choices (an enum) versus a value with meaningfully varying data (a record) versus a closed family of alternatively-shaped variants (a sealed hierarchy)
- How the four tools compose naturally within a single, realistic domain model
- A practical checklist for classifying an unfamiliar type before writing its declaration

## The central question: identity or value?

Before choosing a modeling tool, answer one question: **if this object's contents change over time, is it still "the same one," or is a value with different contents necessarily a different one?**

An **entity** has identity that persists across changes: task 42 remains task 42 after its title is edited, its status is updated, and its due date is postponed — none of those changes make it a different task, they make it *the same task, changed*. A **value** is entirely defined by its current components: two `Position(2, 3)` instances are not "the same position that happens to agree right now" — they simply *are* the same value, full stop, and there is no meaningful sense in which one could later "become" a different position while remaining itself.

```java
public class IdentityVsValue {
    record Position(int row, int column) {}

    static final class Task {
        private final long id;
        private String title;

        Task(long id, String title) {
            this.id = id;
            this.title = title;
        }

        void rename(String newTitle) {
            this.title = newTitle;
        }

        long id() { return id; }
        String title() { return title; }

        @Override
        public String toString() {
            return "Task#" + id + "[" + title + "]";
        }
    }

    public static void main(String[] args) {
        Position p1 = new Position(2, 3);
        Position p2 = new Position(2, 3);
        System.out.println("two positions with equal coordinates, equals: " + p1.equals(p2));

        Task task = new Task(42, "Write chapter");
        Task sameReference = task;
        System.out.println("before rename: " + task);
        task.rename("Write chapter 6");
        System.out.println("after rename, task:          " + task);
        System.out.println("after rename, sameReference: " + sameReference);
        System.out.println("task 42 is still task 42, its title just changed");
    }
}
```

Output:

```text
two positions with equal coordinates, equals: true
before rename: Task#42[Write chapter]
after rename, task:          Task#42[Write chapter 6]
after rename, sameReference: Task#42[Write chapter 6]
task 42 is still task 42, its title just changed
```

`Position` is a **value**: two separately constructed instances with equal coordinates are, and should be, considered equal — this is exactly what a record's generated `equals` gives you automatically, for free, as Lesson 2 showed. `Task` is an **entity**: it has a stable `id` that persists across its whole lifetime, and its `title` is mutable state that can legitimately change without the task becoming "a different task" — `task` and `sameReference` still refer to the identical object after the rename, and printing either one now shows the updated title, which is exactly the reference-sharing behavior from Chapter 4. This is why `Task` is written as an ordinary, mutable `final class`, not a record: a record's entire purpose is to define equality by current component values, which is precisely the wrong notion of equality for something whose defining property is that it persists *despite* its values changing.

## Why a record is the wrong tool for a mutable entity

This is not merely a theoretical concern — using a record for something with identity produces genuinely, silently wrong behavior the moment any component changes, because the compiler-generated `equals` treats *every* component as identity-defining, with no way to tell it otherwise.

```java
public class MisusedRecordEquality {
    record AccountRecord(String owner, long balanceCents) {}

    public static void main(String[] args) {
        AccountRecord original = new AccountRecord("Amina", 10_000);
        AccountRecord afterWithdrawal = new AccountRecord("Amina", 9_000);

        System.out.println("same account, after a withdrawal, equals? " + original.equals(afterWithdrawal));
        System.out.println("this is wrong: it is the SAME account, just with a new balance");

        AccountRecord differentPersonSameNameAndBalance = new AccountRecord("Amina", 10_000);
        System.out.println("a totally different account that happens to share name and balance, equals? "
                + original.equals(differentPersonSameNameAndBalance));
        System.out.println("this is also wrong: two distinct accounts should never be treated as the same one");
    }
}
```

Output:

```text
same account, after a withdrawal, equals? false
this is wrong: it is the SAME account, just with a new balance
a totally different account that happens to share name and balance, equals? true
this is also wrong: two distinct accounts should never be treated as the same one
```

Both results are exactly backwards from what a real bank account needs. An account's balance changing after a withdrawal should never make code that compares "is this the same account?" suddenly report `false` — yet that is exactly what happens, because the record's `equals` treats `balanceCents` as part of the account's defining identity, on equal footing with `owner`. And two *distinct* accounts that happen to share an owner's name and an initial balance are reported `true` — equal — purely by coincidence of their current field values, when they should never be considered the same account at all. This is `MisusedRecordEquality`'s entire lesson in two lines: `AccountRecord` was modeled as a value when it needed to be an entity, and the record's automatically-generated, component-wise `equals` is precisely the wrong contract for anything whose identity must survive its own state changing. An ordinary class with an explicit account number field and its own `equals` overridden to compare *only* that field (a technique Chapter 7 covers in full) is the correct model here — not because records are flawed, but because this particular type needed identity semantics, not value semantics.

## Recognizing an enum versus a sealed hierarchy

Both an enum and a sealed hierarchy represent a **closed, fixed set of possibilities** — the difference is whether every possibility shares the exact same shape of data, or each one carries genuinely different data.

- If every alternative is simply a **name** with no distinguishing data beyond what you might attach uniformly (as `Planet`'s mass and radius were attached identically to every constant in Lesson 1) — `LOW`, `NORMAL`, `HIGH` priority; `MONDAY` through `SUNDAY` — that is an **enum**.
- If the alternatives carry **different data shapes** from each other — a successful result carries a value, a failed result carries a reason, a pending result carries a reference number — that is a **sealed hierarchy** of records, as Lessons 3 and 4 built.

A common design mistake is reaching for an enum when the alternatives actually need different data, then bolting on extra fields that only make sense for some constants (an `ERROR` constant with a `message` field that every non-error constant leaves unused, echoing the exact `FlagResult` contradiction problem from Lesson 3) — that is precisely the signal to switch from an enum to a sealed hierarchy instead.

## Bringing all four tools together

Real domains rarely need only one of these tools; they need each one for the specific part of the model it fits best. Here, a single small task-tracking domain uses all four together:

```java
import java.util.List;

public class FourShapesTogether {
    record Position(int row, int column) {}

    enum Priority { LOW, NORMAL, HIGH }

    sealed interface Outcome permits Done, Blocked {}
    record Done(String summary) implements Outcome {}
    record Blocked(String reason) implements Outcome {}

    static final class Task {
        private final long id;
        private String title;
        private Priority priority;
        private Outcome outcome;

        Task(long id, String title, Priority priority) {
            this.id = id;
            this.title = title;
            this.priority = priority;
        }

        void complete(String summary) { this.outcome = new Done(summary); }
        void block(String reason) { this.outcome = new Blocked(reason); }

        String status() {
            return switch (outcome) {
                case null -> "in progress (" + priority + ")";
                case Done(String summary) -> "done: " + summary;
                case Blocked(String reason) -> "blocked: " + reason;
            };
        }
    }

    public static void main(String[] args) {
        Task task = new Task(1, "Deploy release", Priority.HIGH);
        System.out.println(task.status());

        task.block("waiting for approval");
        System.out.println(task.status());

        task.complete("shipped to production");
        System.out.println(task.status());

        List<Position> path = List.of(new Position(0, 0), new Position(0, 1), new Position(1, 1));
        System.out.println("path: " + path);
    }
}
```

Output:

```text
in progress (HIGH)
blocked: waiting for approval
done: shipped to production
path: [Position[row=0, column=0], Position[row=0, column=1], Position[row=1, column=1]]
```

Each type here was chosen for a specific reason: `Position` is a pure value (a record). `Priority` is a small, fixed, uniformly-shaped set of choices (an enum). `Outcome` is a closed family of alternatives with genuinely different data — a completion summary versus a blocking reason — modeled as a sealed hierarchy of records, exactly as Lessons 3 and 4 taught, and its `status()` method uses `case null` (from Lesson 4) to represent "no outcome has been recorded yet" as a deliberate, explicit branch rather than an accidental crash. `Task` itself is the one piece with genuine identity and mutable state over its lifetime — its `id` never changes, but its `title`, `priority`, and `outcome` all can — so it remains an ordinary, mutable class, exactly as `IdentityVsValue`'s `Task` did. No single tool could have modeled this whole domain well by itself; each part uses the tool whose guarantees actually match what that part of the domain needs.

## A practical classification checklist

When you meet an unfamiliar piece of data to model, work through these questions in order:

| Question | If the answer is yes |
|---|---|
| Does it need identity that survives its own fields changing over time? | Ordinary mutable class, with `equals` based on identity or a stable identifier field, not on every field |
| Is it entirely defined by its current values, with no independent identity? | Record (validate and, if any component is mutable, defensively copy in a compact constructor) |
| Is it a small, fixed, named set of choices, all sharing the same shape of data (if any)? | Enum |
| Is it a closed set of alternatives that carry genuinely *different* data from each other? | Sealed hierarchy, typically of records |
| Does an "alternative" need data that only makes sense for *some* of the possible cases? | That is a strong signal you actually need a sealed hierarchy, not an enum with unused fields bolted on |

Two further judgment calls come up constantly and rarely have one universally correct answer, which is exactly why they are worth pausing on rather than defaulting to a reflex choice:

- **Text normalization as part of value construction.** For a `PostalAddress` record, should the compact constructor trim whitespace, standardize capitalization, or expand abbreviations before storing the components? Doing so inside the constructor guarantees every constructed instance is already normalized, but it also means the record can no longer faithfully represent "exactly what the user typed" if that is ever separately needed.
- **Whether a value type's *past* states matter.** A `PostalAddress` a customer used two years ago normally should not retroactively change just because the customer moved — which suggests old orders should reference an immutable snapshot of the address as it was, not a shared, mutable "current address" object. This is fundamentally an identity-versus-value question again, applied to a *historical record* of a value rather than the value's present state.

There is often more than one defensible design; what matters is that you can articulate *why* you chose the one you did, in terms of identity, mutation, extension, and lifecycle — the same four criteria this whole lesson has been asking about.

## Common mistakes

**1. Modeling identity-bearing data as a record because the syntax is shorter.** The moment any component can meaningfully change while the object should still be considered "the same one," a record's generated `equals` becomes actively wrong, not merely unnecessary.

**2. Bolting fields onto an enum constant that only apply to some constants.** This is the `FlagResult` problem from Lesson 3 in enum form, and is a clear signal the data actually needs a sealed hierarchy instead.

**3. Reaching for a sealed hierarchy when the real need is simple, uniform enumeration.** A sealed hierarchy of near-identical single-field records, where an enum with a field would have done, adds ceremony without adding any real safety benefit.

**4. Treating "is this class small" as the deciding factor**, rather than identity-versus-value. Both entities and values can be small; size tells you nothing about which semantics are correct.

**5. Never revisiting a modeling choice as requirements evolve.** A type that started as a pure value can genuinely grow the need for identity and independent lifecycle later (a `Position` might need to become a `Piece` that persists across moves on a chessboard); recognizing that shift and remodeling deliberately is a normal, healthy part of software design, not a sign the first choice was a mistake.

## Best practices

- Ask the identity-versus-value question first, before considering any other property of the type.
- Default to a record for anything that is a value, applying every guarantee from Lesson 2 (validation, and defensive copying for any mutable component).
- Default to an ordinary class for anything with identity or a mutable lifecycle, and give it an explicit `equals` based on that identity, not on every field, once you learn to override `equals` in Chapter 7.
- Use an enum for a small, closed, uniformly-shaped set of named choices; switch to a sealed hierarchy the moment the alternatives need genuinely different data.
- When a design choice is genuinely ambiguous (normalization timing, historical snapshots), make the tradeoff explicit in your own reasoning rather than picking arbitrarily, and be ready to explain it.

## Summary

- The central modeling question is whether a type has identity that persists across changes (an entity) or is entirely defined by its current values (a value).
- A record's generated `equals` treats every component as identity-defining, which is exactly wrong for a mutable entity: identical current values does not mean identical identity, and identity should not change just because one field did.
- An enum fits a small, fixed, uniformly-shaped set of named choices; a sealed hierarchy fits a closed set of alternatives whose data shapes genuinely differ from each other.
- Fields that only make sense for some values of an enum are a strong signal that a sealed hierarchy, not an enum, is the right tool.
- Real domains typically use several of these tools together, each for the specific part of the model whose guarantees it actually matches, as the combined task-tracking example demonstrated.

## Practice

Warm-up:

1. Classify each of the following as identity-bearing or pure value, with a one-sentence justification: a shopping cart, a currency amount, a user session, an RGB color.
2. Write a record `RgbColor(int red, int green, int blue)` with a compact constructor rejecting any component outside 0 to 255, and confirm two instances with equal components are `equals`.
3. Explain, in your own words, why a `ShoppingCart` (which gains and loses items over its lifetime while remaining "the same cart") should not be written as a record.

Core:

1. Classify invoice, currency code, postal address, command result, and application service, each with a one-paragraph justification covering equality, mutation, extension, and lifecycle needs, as this lesson's introduction described. There can be more than one defensible answer; the goal is a reasoned justification, not a single "correct" table.
2. Design a small domain of your choosing (a library catalog, a game's inventory, a chat application) using at least three of the four tools from this chapter together, similar to `FourShapesTogether`, and write one paragraph explaining why each part uses the tool it does.
3. Take an existing enum from earlier in this chapter (or one of your own) and identify whether any constant would benefit from data that does not apply to the others. If so, redesign it as a sealed hierarchy and compare the two versions.

Challenge:

1. Design a `Money` value type as a record with `currency` and `amountMinorUnits` components (an entity-versus-value exercise from a different angle: is `Money` itself always a pure value, or could a specific application reasonably want identity for a Money object, such as tracking one particular payment through a system? Justify your answer either way).
2. Revisit the `AccountRecord` bug from this lesson and design the correct fix: a `BankAccount` class with an explicit account number, identity-based `equals` overridden appropriately (a preview of Chapter 7), and a `balanceCents` field that can change through deposit and withdrawal methods without the account's identity ever being questioned.

## Check your understanding

1. What is the single question this lesson says you should ask before choosing between a class and a record for a new type?
2. Why does a record's automatically-generated `equals` become actively incorrect, rather than merely inconvenient, once a component of an entity-like object changes over time?
3. What is the difference between an enum and a sealed hierarchy, in terms of the *data* each alternative carries?
4. What is the warning sign that an enum should actually be redesigned as a sealed hierarchy?
5. In the combined `FourShapesTogether` example, why is `Task` an ordinary mutable class rather than a record, while `Position` is a record?
6. Give an example of a modeling decision (from this lesson or your own experience) where more than one design is defensible, and explain what factor would tip you toward one choice over the other.
