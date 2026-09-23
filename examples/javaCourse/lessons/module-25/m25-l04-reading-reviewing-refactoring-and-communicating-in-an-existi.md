# Reading, reviewing, refactoring, and communicating in an existing codebase

## Read before changing
Start with build instructions, tests, entry points, and one real use-case path. Search callers and domain terms before renaming or extracting code. When behavior is unclear, write a characterization test that records current behavior, then determine whether that behavior is intended.

```text
Change note:
Requirement: reject duplicate task IDs.
Evidence: duplicate insert currently overwrites an existing task.
Repair: reject before mutation and keep the previous record.
Regression: duplicate create leaves original content unchanged.
```
A useful review explains the trigger, old behavior, new behavior, and evidence. Distinguish correctness requirements from stylistic preferences.

## Refactoring
Refactoring preserves observable behavior while changing structure. Extract methods, move behavior toward its data, or introduce a parameter object in small runnable steps. Mixing a semantic change with a broad refactor makes defects harder to locate.

## Practice
Review an unfamiliar repository method, trace its callers, and add one characterization test. Make a focused behavior change, then a separate structural improvement. Explain one rejected alternative and one remaining limitation in language a teammate can assess.
