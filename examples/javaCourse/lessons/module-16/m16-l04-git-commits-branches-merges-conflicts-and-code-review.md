# Git commits, branches, merges, conflicts, and code review

Git is often taught as a set of commands to memorize (`add`, `commit`, `push`, `merge`) without ever explaining the model those commands manipulate. This lesson goes the other way: understand what a commit, a branch, and a merge actually *are*, and the commands become predictable instead of magical — and the moments Git needs your judgment, like a conflict, stop being frightening.

What you will learn:

- What a commit actually contains, and why history is a graph, not a line
- What a branch really is (a movable pointer, nothing more)
- How a merge combines two histories, and how a merge commit differs from a fast-forward
- Why a conflict-free merge can still be behaviorally wrong
- How to write a commit that documents *why*, and why that discipline pays off during code review
- What a healthy code review actually checks for, beyond "does it work"

## A commit is a snapshot, and history is a graph

A Git **commit** is a snapshot of the entire tracked tree at that point, plus metadata: an author, a timestamp, a message, and a pointer to its parent commit (or parents, for a merge). Commits form a **directed acyclic graph**, not a straight line, because branches let history diverge and merges let it reconverge:

```text
A---B---C  (main)
     \
      D---E  (feature/discount)
```

`C` and `E` share history through `B`; they are two different snapshots that both descend from the same starting point. Git identifies each commit by the SHA-1 hash of its content plus metadata, which is why changing anything about a commit — even just its message — produces a different hash and, technically, a different commit, not an edited version of the old one.

## A branch is a pointer, nothing more

A **branch** is a label that points at one commit — specifically, the most recent commit reached by committing on that branch. Creating a branch does not copy any files; it creates a new pointer at the current commit:

```text
git switch -c feature/discount
```

now has both `main` and `feature/discount` pointing at the same commit `B`. As you commit on `feature/discount`, only that pointer moves forward; `main` stays where it was until something explicitly moves it (a commit on `main`, or a merge). This is why branching in Git is fast and cheap regardless of repository size: it is one pointer, not a copy of the working tree.

`HEAD` is a special pointer to "the branch you currently have checked out" (or, in a **detached HEAD** state, directly to a commit with no branch). Committing moves whatever `HEAD` points to forward by one commit.

## Fast-forward versus merge commit

When you merge branch `B` into branch `A`, Git does one of two things depending on the graph shape:

- **Fast-forward**: if `A` has not moved since `B` branched from it, `A`'s pointer simply advances to `B`'s tip. No new commit is created; the history stays linear.
- **Merge commit**: if both branches have new commits since they diverged, Git creates a new commit with *two* parents, combining both histories.

```text
Before merge:              After merge (non-fast-forward):
A---B---C  (main)          A---B---C-------M  (main)
     \                          \         /
      D---E  (feature)           D-------E  (feature)
```

`M` is a merge commit: its content is the result of combining `C`'s and `E`'s changes, and it has two parents, so both lines of history remain visible. A fast-forward merge, by contrast, leaves no trace that a branch ever existed separately — which is a legitimate choice for a short-lived branch, but loses the grouping information a merge commit preserves for a feature that took real, structured work.

## What a merge conflict actually is

Git merges automatically wherever it can tell, line by line, that only one side changed a region of a file. A **conflict** happens when both sides changed the *same lines* (or one side deleted a file the other modified) and Git cannot determine which change should win:

```text
<<<<<<< HEAD
public int discountPercent() {
    return 15;
}
=======
public int discountPercent() {
    return 10;
}
>>>>>>> feature/discount
```

This is not Git failing; it is Git correctly refusing to guess. Resolving a conflict means editing the file to the intended combined result, removing the conflict markers, and staging the resolution:

```text
git add PricingPolicy.java
git commit
```

Resolving a conflict textually is necessary but not sufficient. Consider two branches that both compile cleanly and produce no textual conflict at all:

```java
// main: added a null check
public int discountPercent(Customer customer) {
    if (customer == null) {
        return 0;
    }
    return customer.isPremium() ? 15 : 10;
}
```

```java
// feature: changed the premium threshold elsewhere in the same method, on a different line
public int discountPercent(Customer customer) {
    if (customer == null) {
        return 0;
    }
    return customer.isPremium() ? 20 : 10;
}
```

If these changes happen to touch different lines of a larger method, Git may merge them with no conflict marker at all — and the combined result is exactly what both authors intended here. But a **semantic conflict** is the case where two non-overlapping textual changes combine into behavior neither author intended: one branch changes a method's return type's unit from cents to dollars, another branch (touching different lines) adds a new caller that still assumes cents. Git merges both changes without complaint, and the bug only appears at runtime. This is why a merge, however clean, deserves running the test suite before it is trusted, and why a reviewer reading the combined diff — not just each side separately — is part of the safety net, not a formality.

## Rebasing versus merging: two ways to combine history

**Merging** preserves both lines of history and creates a merge commit. **Rebasing** replays one branch's commits, one at a time, on top of another branch's current tip, producing new commits with new hashes and a linear history:

```text
Before rebase:              After `git rebase main` (on feature):
A---B---C  (main)           A---B---C  (main)
     \                                \
      D---E  (feature)                 D'---E'  (feature)
```

`D'` and `E'` are new commits with the same changes as `D` and `E`, but different parents and different hashes. Rebasing produces cleaner, linear history, which is why many teams rebase feature branches before merging them. The rule that matters more than the choice itself: **never rebase commits that have already been pushed and that someone else may have based work on**. Rebasing rewrites history; anyone who already has the old commits will have a diverging, hard-to-reconcile view once you force-push the rewritten ones. A merge is always safe on shared history; a rebase is only safe on history that is still exclusively yours.

## Writing a commit that documents *why*

A commit message's first line is a summary; everything after a blank line is the body, and the discipline that pays off during review and months later during a `git blame` is explaining the reasoning a diff alone cannot show:

```text
Reject withdrawals that would overdraw the account

Withdraw previously allowed the balance to go negative when the
requested amount exactly equaled a pending hold. Add the hold amount
to the comparison instead of just the current balance.

Fixes the discrepancy reported in support ticket #4821.
```

The diff shows *what* changed; the message explains *why* it needed to change and what would have gone wrong otherwise. A message like `fix bug` or `updates` gives a future reader (including yourself, in six months) nothing to work with when `git log` or `git blame` is the only context available. Small, focused commits — one logical change each — make this discipline easier: a commit that mixes a bug fix with an unrelated formatting pass forces the message to describe two unrelated things, and forces a reviewer to untangle them.

## What a code review actually checks

A review that only asks "does this compile and pass tests" duplicates what CI already verifies. A useful review checks what CI cannot:

- **Correctness beyond the tested cases**: does the change handle the edge case the tests do not cover?
- **Design fit**: does this change belong here, or does it duplicate logic that already exists elsewhere?
- **Readability for the next person**: will someone unfamiliar with this change understand it from the diff and its commit message?
- **Risk and blast radius**: what happens if this is wrong — a cosmetic bug, or a data-corrupting one?
- **Test quality**: do the added tests actually assert the behavior the change claims to add, or do they merely execute the new code (recall the coverage-versus-correctness distinction from testing)?

A reviewer requesting changes is not a judgment on the author; it is the same activity as writing a test — an attempt to find a problem before a user does, at the cheapest possible point to fix it. Responding to review feedback by explaining reasoning, or by making the requested change, both move the work forward; silently dismissing a comment or arguing without addressing the substance does not.

## What happens under the hood: from `git merge` to a working tree

1. Git identifies the merge base: the most recent commit reachable from both branches' histories.
2. It computes the diff from the merge base to each branch's tip.
3. For each file, it applies both diffs; where the diffs touch disjoint regions, the result is combined automatically.
4. Where both diffs touch the same region, Git inserts conflict markers into the working tree file and leaves the merge unfinished (a fast-forward skips this entirely, since there is only one diff to apply).
5. If there were no conflicts, Git creates a new commit with both branch tips as parents (unless it was a fast-forward, which just moves the pointer) and the merge is complete.
6. If there were conflicts, the merge stays pending until every conflicted file is edited to a resolved state, staged, and the merge commit is completed manually.

## Common mistakes

**Mistake 1: force-pushing a rewritten branch others have already pulled.** Anyone who based new commits on the old history now has a branch that looks diverged, and reconciling it is confusing and risky. Fix: only rebase (and force-push) commits that are still exclusively yours; use a merge on shared branches.

**Mistake 2: resolving a conflict by picking one side without reading the other.** This silently discards the other author's intended change instead of combining both. Fix: read what *both* sides were trying to accomplish before writing the resolution.

**Mistake 3: trusting a conflict-free merge as proof of correctness.** As shown above, two non-overlapping changes can combine into a semantic bug that no conflict marker reveals. Fix: run the test suite after every merge, especially a large one, before treating it as done.

**Mistake 4: commit messages that describe the diff instead of the reasoning.** `changed PricingPolicy.java` tells a future reader nothing the diff itself does not already show. Fix: state the problem the change solves and why the chosen approach was chosen.

**Mistake 5: reviewing only for "does it work" and skipping design and test quality.** This misses exactly the kind of problem CI cannot catch. Fix: read the tests as carefully as the production code, and ask whether the change belongs where it was placed.

## Best practices

- Make small, focused commits — one logical change per commit — so both the diff and the message stay easy to reason about.
- Write commit messages that explain *why*, not just restate *what* the diff shows.
- Merge shared/pushed history; only rebase commits that are still exclusively local.
- Run the full test suite after resolving a merge or rebase, not only before starting it.
- Read both sides of a conflict before resolving it, not just the side you understand.
- Review tests as carefully as production code; a change without a test that would fail without it is not verified.
- Treat review comments as an attempt to catch a problem cheaply, and respond to the substance, not the tone.

## Summary

- A commit is an immutable snapshot with parent pointers; history is a graph, not a line.
- A branch is a movable pointer to a commit; creating one is cheap because it copies nothing.
- A fast-forward moves a pointer with no new commit; a merge commit has two parents and preserves both lines of history.
- A conflict means Git found overlapping changes it cannot resolve automatically; a *clean* merge can still be a semantic conflict that only tests reveal.
- Rebasing rewrites history into a linear form and is only safe on commits nobody else has built on; merging is always safe on shared history.
- A good commit message documents reasoning a diff cannot show; a good review checks design, edge cases, and test quality, not just whether CI is green.

## Practice

1. **Warm-up:** Explain, using the pointer model, why creating a new branch in a repository with a million commits is just as fast as in a repository with ten.
2. **Warm-up:** A merge completes with no conflict markers at all. Explain why that alone does not prove the combined behavior is correct.
3. **Core:** Create two branches from the same commit, make non-overlapping textual changes to the same method that combine into an unintended behavior, merge them, and write a test that catches the resulting bug.
4. **Core:** Deliberately create a textual merge conflict, resolve it by reading both sides' intent (not just picking one), and write a commit message explaining the resolution you chose and why.
5. **Challenge:** Rebase a local, unpushed feature branch onto an updated `main`, and explain, commit by commit, why each replayed commit has a new hash even though its diff content is unchanged.

## Check your understanding

1. What does creating a branch actually change in the repository's data, and why does that make branching cheap?
2. What is the structural difference between a fast-forward merge and a merge commit, and what information does the fast-forward discard?
3. Why can two changes that produce no conflict markers still introduce a bug that neither author intended?
4. Under what condition is rebasing safe, and what goes wrong if that condition is violated?
5. What does a good commit message explain that the diff itself cannot?
6. Name two things a code review should check that automated CI checks do not.
