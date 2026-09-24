# Reading, reviewing, refactoring, and communicating in an existing codebase

Every lesson so far in this course has been about writing new code against a mostly blank slate. The overwhelming majority of a professional developer's actual working life is the opposite: reading code someone else wrote, months or years ago, under constraints and assumptions no longer fully visible, and changing it carefully enough that nothing unrelated breaks. This lesson covers that skill directly — how to read an unfamiliar codebase efficiently, what a refactor actually is (and is not), how a characterization test lets you touch code you do not yet fully understand safely, and how to communicate a change so the next person (quite possibly a future version of you) does not have to redo the same investigation.

What you will learn:

- A deliberate strategy for reading an unfamiliar codebase, rather than reading files in whatever order they appear
- The precise definition of refactoring: preserving observable behavior, never changing it
- Why refactoring and a feature change should never be mixed into the same commit
- Characterization tests: capturing what code *currently* does, before you touch it, as a safety net
- Reading and responding to code review feedback as a genuine part of the engineering process, not an obstacle
- Writing commit messages and PR descriptions that explain *why*, for a reader with none of your current context

## A deliberate strategy for reading unfamiliar code

Opening an unfamiliar codebase and reading files top-to-bottom, in whatever order a file browser happens to present them, is rarely the most efficient path to understanding. A more deliberate approach:

1. **Start from an entry point**, not an arbitrary file: a `main` method, an HTTP controller, a message consumer — wherever external input first enters the system — and trace forward from there, following the actual call chain a real request takes.
2. **Read tests before reading implementation**, where they exist: a well-named test describes intended behavior far more concisely than reverse-engineering it from the implementation alone, and tests often reveal edge cases the implementation handles that are not otherwise obvious from a first read.
3. **Use the version-control history as a source of intent**: `git log` and `git blame` on a confusing piece of code often surface the original commit message (recall Chapter 16's "a good commit message explains why, not just what") explaining a decision that looks arbitrary or even wrong without that context.
4. **Identify the seams** — the boundaries between modules, per Chapter 20's architecture material — before trying to understand every internal detail; knowing *where* a change needs to happen is often more valuable, early on, than fully understanding *how* every surrounding piece works internally.

This is the same discipline Chapter 22's profiling lessons applied to a performance investigation: narrow the question before diving into detail, rather than attempting to understand everything at once.

## What refactoring actually is: behavior preserved, exactly

This chapter's concept-check question states the definition precisely: refactoring is a change that **preserves observable behavior** — not one that must add dependencies, and not one that is barred from changing class structure (a refactor very often *does* change class structure; that is frequently the entire point). The distinguishing property is behavioral: before and after a refactor, the code must do exactly the same thing, for exactly the same inputs, as far as anything outside the changed code can observe.

```java
// BEFORE: works correctly, but the logic is duplicated and hard to extend.
public class DiscountCalculator {
    public int calculate(String customerTier, int amountCents) {
        if (customerTier.equals("GOLD")) {
            return amountCents - (amountCents * 20 / 100);
        } else if (customerTier.equals("SILVER")) {
            return amountCents - (amountCents * 10 / 100);
        }
        return amountCents;
    }
}

// AFTER a refactor: same observable behavior for every input, restructured internally.
public class DiscountCalculator {
    private static final Map<String, Integer> DISCOUNT_PERCENT_BY_TIER = Map.of(
            "GOLD", 20, "SILVER", 10);

    public int calculate(String customerTier, int amountCents) {
        int percent = DISCOUNT_PERCENT_BY_TIER.getOrDefault(customerTier, 0);
        return amountCents - (amountCents * percent / 100);
    }
}
```

For every possible `(customerTier, amountCents)` pair, both versions return the identical result — this is exactly what makes it a refactor rather than a feature change, and it is precisely what a characterization test (below) exists to verify mechanically, rather than relying on a careful human re-reading of both versions side by side to convince themselves nothing changed.

## Why refactoring and a feature change must stay separate

Mixing a structural refactor with an actual behavior change in the same commit — "while I was in there, I also fixed this bug" — makes the change fundamentally harder to review, and harder to revert safely if something goes wrong: a reviewer (or a future `git bisect` trying to find which commit introduced a regression) cannot tell, from the diff alone, which parts of the change were "safe, behavior-preserving restructuring" and which parts were "a genuine behavior change that needs its own scrutiny and its own test." Chapter 16's own commit-discipline guidance — small, focused commits, one logical change each — applies here with particular force: a refactor commit and a feature-change commit, kept separate, let a reviewer evaluate each on its own appropriate terms, and let a later revert target exactly the change that turned out to be wrong, without also reverting an unrelated structural improvement that was fine all along.

## Characterization tests: a safety net for code you do not yet fully understand

A **characterization test** captures what a piece of code *currently* does — correct or not, intended or not — as a concrete, runnable specification, before you attempt to change it. This is distinct from an ordinary unit test written *with* the code, which asserts what the code *should* do based on a requirement; a characterization test instead asserts what the *existing* code actually, currently does, discovered by running it and observing its outputs, specifically so that a refactor can be verified against it afterward.

```java
// A characterization test, written by RUNNING the existing (unfamiliar, possibly poorly
// understood) DiscountCalculator and recording its actual outputs — not by reasoning about
// what it "should" do from a specification, which may not even exist or may be stale.
@Test
void characterization_goldTier_twentyPercentOff() {
    assertEquals(80, new DiscountCalculator().calculate("GOLD", 100));
}

@Test
void characterization_unknownTier_noDiscount() {
    assertEquals(100, new DiscountCalculator().calculate("PLATINUM", 100));
    // Note: this might be a BUG (perhaps PLATINUM should get a discount too),
    // but a characterization test's job is capturing CURRENT behavior first,
    // not judging whether it is correct — that judgment is a separate, deliberate
    // decision to make afterward, as an intentional feature change with its own review.
}
```

This is exactly the discipline the debug labs throughout this course have applied at a smaller scale: run the existing (broken or unfamiliar) code first, observe what it actually does, *then* reason about the fix — never assume you already know the current behavior well enough to skip verifying it directly. With a characterization test suite in place, a refactor can proceed with a concrete, automated check that observable behavior genuinely has not changed, rather than relying on careful manual re-reading alone — precisely the safety net that makes it reasonable to refactor code you do not yet fully understand, one small, test-verified step at a time.

## Responding to code review as part of the engineering process

Chapter 16's Git lesson already established what a good code review checks (design fit, edge cases, test quality — not just "does it compile"). The communication half of that process, from the author's side, deserves its own attention: a reviewer's comment is an attempt to catch a problem cheaply, at the point it is cheapest to fix, exactly like a test — treating it as an attack to be defended against, or dismissing it silently without a response, both squander that opportunity. A response that either makes the requested change or clearly explains the reasoning for not making it (with the reviewer's specific concern addressed directly, not sidestepped) keeps the review functioning as the collaborative safety net it is meant to be, rather than degrading into a box-checking formality on one side or a source of friction on the other.

## Writing for a reader with none of your current context

The single practical skill this lesson closes on, tying directly back to Chapter 16's commit-message discipline: whatever you write about a change — a commit message, a PR description, a code comment explaining a non-obvious workaround — should be written for a reader who was not in your head while you made the decision, and who is very possibly *you*, reading this same code again in eight months with every bit of your current context already forgotten.

```text
# Weak: describes the diff, which the diff itself already shows.
Update DiscountCalculator

# Strong: explains the reasoning the diff cannot show on its own.
Extract discount percentages into a lookup map

The if/else chain duplicated the "amount minus amount times percent" formula
per tier, making it easy to add a new tier with a copy-pasted branch that
forgets to update the formula consistently. A map keyed by tier makes adding
a tier a one-line addition with no risk of the formula itself drifting
between branches. Behavior is unchanged for every existing tier; verified
against the existing characterization tests before and after.
```

The second version tells a future reader (including a reviewer right now) *why* the change was made, what problem it solves, and — critically for a refactor specifically — states explicitly that behavior was verified unchanged, which is exactly the information a reader cannot recover from the diff alone, and exactly the discipline that turns "trust me, I refactored this carefully" into something a reader can actually verify was true.

## What happens under the hood: from an unfamiliar file to a safely merged refactor

1. Reading begins from a genuine entry point and follows the real call chain, rather than an arbitrary file-by-file pass, prioritizing existing tests and version-control history as concentrated sources of intent over re-deriving everything from the implementation alone.
2. Before any structural change, a characterization test suite is written (or an existing test suite is confirmed to already cover the behavior in question) by running the current code and recording its actual, current outputs across a representative set of inputs.
3. The refactor is applied in small, individually verifiable steps, running the characterization tests after each step to confirm observable behavior has genuinely not changed at any point along the way.
4. The refactor is committed separately from any genuine feature or bug-fix change, with a commit message explaining the structural reasoning and explicitly noting that behavior was verified unchanged.
5. A reviewer evaluates the refactor commit on its own terms (does the restructuring genuinely improve the code, do the characterization tests genuinely cover the behavior claimed to be preserved) separately from any subsequent feature-change commit, which gets its own, differently-scoped review focused on whether the new behavior is correct.

## Common mistakes

**Mistake 1: reading an unfamiliar codebase file-by-file in arbitrary order instead of starting from an entry point and following the real call chain.** This wastes time understanding code that may never actually run on the path relevant to the task at hand. Fix: start from where external input enters the system, and read tests and version-control history as concentrated sources of intent.

**Mistake 2: mixing a structural refactor with a genuine behavior change in the same commit.** This makes the change harder to review and harder to safely revert if something turns out wrong. Fix: keep refactor commits and feature-change commits strictly separate.

**Mistake 3: refactoring unfamiliar code with no characterization test verifying current behavior first.** This relies on careful manual re-reading alone to confirm nothing changed, which is exactly the kind of error-prone verification this course has warned against throughout. Fix: write characterization tests capturing current behavior before restructuring anything.

**Mistake 4: treating code review feedback as an obstacle to get past rather than a genuine, cheap opportunity to catch a problem.** Silently dismissing a comment, or defending against it rather than engaging with its substance, degrades the review process for everyone. Fix: either make the requested change or clearly explain the reasoning for not making it, addressing the reviewer's specific concern directly.

**Mistake 5: writing a commit message or PR description that only restates what the diff already shows.** This gives a future reader no information the diff itself does not already contain. Fix: explain the reasoning behind the change — why it was needed, and, for a refactor specifically, how behavior was verified to be unchanged.

## Best practices

- Read unfamiliar code starting from a genuine entry point, prioritizing existing tests and version-control history over re-deriving intent from implementation alone.
- Write characterization tests capturing current behavior before refactoring code you do not yet fully understand.
- Keep refactor commits and feature-change commits strictly separate, each reviewable and revertible on its own terms.
- Engage with code review feedback as a genuine, cheap opportunity to catch a problem — respond with either a change or a clear, substantive explanation.
- Write commit messages and PR descriptions for a reader with none of your current context, explaining reasoning the diff itself cannot show.

## Summary

- Reading an unfamiliar codebase efficiently means starting from an entry point and following the real call chain, using tests and version-control history as concentrated sources of intent.
- Refactoring is precisely defined as preserving observable behavior — it may freely change class structure, and does not require adding dependencies; the defining property is behavioral, not structural.
- Refactoring and genuine feature changes must stay in separate commits, so each can be reviewed and reverted independently on its own appropriate terms.
- A characterization test captures what existing code currently does, discovered by running it, providing a safety net that lets a refactor proceed on code not yet fully understood.
- Responding substantively to code review feedback, and writing commit messages that explain reasoning rather than restating the diff, are both communication skills as central to professional engineering as writing the code itself.

## Practice

1. **Warm-up:** For an unfamiliar codebase, describe the specific order in which you would start reading it, and why that order is more efficient than reading files alphabetically.
2. **Warm-up:** A commit both extracts a duplicated formula into a shared method and fixes a bug in that formula, in the same commit. Explain the specific problem this creates for review and for a later revert.
3. **Core:** Take an unfamiliar or poorly documented piece of code (your own from an earlier chapter, deliberately revisited without notes, works well for this), write characterization tests capturing its current behavior, then refactor its internal structure while keeping those tests passing throughout.
4. **Core:** Write two commit messages for the same code change: one that only restates the diff, and one that explains the reasoning behind it — compare what a future reader would learn from each.
5. **Challenge:** Simulate a code review: have a peer (or review your own change after a delay) leave at least three comments of varying substance, and practice responding to each — either with a change or with a clear, respectful explanation of why not.

## Check your understanding

1. What is the most efficient way to begin reading an unfamiliar codebase, and why is starting from an arbitrary file usually less effective?
2. What precisely defines a refactor, and what is explicitly not part of that definition (what may or may not accompany one)?
3. Why must a refactor and a genuine feature change be kept in separate commits?
4. What is a characterization test, and how does it differ from an ordinary unit test written alongside new code?
5. Why should code review feedback be treated as a genuine engineering opportunity rather than an obstacle?
6. What information should a commit message provide that the diff itself cannot show on its own?
