# Git commits, branches, merges, conflicts, and code review

## History should explain intent
A Git commit records a snapshot and its parents. A branch is a movable reference to a commit. The working tree, staging area, and committed history are different states.
```text
git status
git diff
git add src/main/java/academy/Receipt.java
git diff --staged
git commit -m "Validate receipt quantities before calculating totals"
```
Stage deliberately and review the staged diff. A coherent commit connects a requirement, implementation, and verification; avoid mixing a feature with unrelated formatting.

## Merges and reviews
A merge combines histories. Rebasing replays commits and changes their identities, so rewriting shared history needs agreement. Conflict markers show overlapping edits, not which side is correct. Read both intentions, produce a coherent combined behavior, and rerun relevant tests.

## Practice
In a disposable training repository, create two branches changing different receipt rules, merge them, and resolve one intentional conflict. Review for correctness, tests, failure behavior, and readability. Explain why a clean textual merge can still introduce a semantic bug. Never discard unrelated working changes to make your own branch easier to manage.
