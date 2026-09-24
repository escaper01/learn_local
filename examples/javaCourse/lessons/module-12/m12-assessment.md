# Chapter 12 assessment and deliberate practice

This chapter crossed four different boundaries that every real application eventually has to cross explicitly: the filesystem, raw bytes versus human text, the difference between a global instant and a local calendar reading, and the byte-level contract of persisted or transmitted objects. In every case, the lesson was the same one this course keeps returning to: a boundary that looks safe from the inside can be quietly wrong or genuinely exploitable unless you check what actually happens on the other side of it. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Path, Files, traversal defense, metadata, and atomic moves

`Path` represents a filesystem location purely in memory, with no disk interaction; `Files` performs the actual I/O. The standard path-traversal defense resolves untrusted input against a fixed root, normalizes it, and checks the result still starts with that root — but that lexical check alone misses a symbolic link pointing outside the root, since `normalize()` never inspects the real filesystem. Closing that gap requires resolving to the real path with `toRealPath()` and checking against the root's real path too. Writing to a temporary file and moving it atomically into place avoids ever exposing a partially-written file to a concurrent reader.

### Lesson 2: Byte versus character streams, buffering, and UTF-8

Byte streams (`InputStream`/`OutputStream`) handle raw bytes with no interpretation; character streams (`Reader`/`Writer`) handle text through an explicit, always-specified charset. `BufferedReader.readLine()` returns `null` at end of file, distinct from an empty string representing a genuinely blank line. Wrapping a stream in a buffered decorator accumulates many small operations into fewer, larger ones, often dramatically improving performance. Reading text back with the wrong charset never throws — it silently produces garbled, wrong output, discovered only when someone looks.

### Lesson 3: Instant, local types, zones, duration, period, and Clock

`Instant` represents a single, unambiguous global moment; `LocalDate`/`LocalTime`/`LocalDateTime` represent calendar-facing values with no time zone at all; `ZonedDateTime` combines a local reading with an explicit zone, letting it convert to and from a real `Instant`. `Duration` measures exact, machine-precise spans; `Period` measures calendar-based spans; they are not interchangeable. Injecting a `Clock` makes "the current time" an explicit, testable dependency instead of a hidden call to the real system clock. `DateTimeFormatter` parsing rejects an impossible calendar date outright rather than silently correcting it.

### Lesson 4: Pattern, Matcher, groups, escaping, and regex safety

`matches()` requires the entire input to match; `find()` searches for a match anywhere within it — confusing the two is one of the most common real-world regex bugs. Capturing groups can be numbered or named, and a non-participating optional group returns `null`. Regex metacharacters need escaping to be matched literally, and `Pattern.quote` safely escapes an entire literal, untrusted string for use inside a regex. Catastrophic backtracking is a real historical risk category, but a specific pattern's actual danger depends on the specific engine and JDK version — this chapter's own experiment showed a classic textbook example finishing in a couple of milliseconds on Java 21, a result worth verifying rather than assuming either way.

### Lesson 5: Explicit serialization schemas, compatibility, and native serialization risks

`serialVersionUID`, declared explicitly, is a version you control; left undeclared, it is silently computed from class shape, and any later structural change can invisibly break compatibility with previously serialized data. `ObjectInputFilter` restricts which classes an `ObjectInputStream` is even permitted to construct — a required control, not an optional extra, whenever deserialized bytes originate outside your own trusted process. Skipping native serialization for an explicit, self-versioned wire format gives full, auditable control over the format and removes exposure to native-deserialization risks entirely.

## Cheat sheet

### Filesystem boundaries

| Concern | Correct approach |
|---|---|
| Untrusted filename, no symlinks expected | resolve against root, normalize, check `startsWith(root)` |
| Untrusted filename, symlinks possible | also resolve to the real path with `toRealPath()` and check against the root's real path |
| Writing a file others might read concurrently | write to a temp file, then `Files.move` with `ATOMIC_MOVE` |
| Reading or writing any text file | always pass an explicit `Charset` |

### Byte versus character streams

| Type | Handles | Needs a charset? |
|---|---|---|
| `InputStream`/`OutputStream` | raw bytes | No — has no concept of text at all |
| `Reader`/`Writer` | text | Yes — always specify one explicitly |
| `Files.newBufferedReader`/`newBufferedWriter` | text, already buffered | Yes, as a required parameter |
| `Files.lines()` | text, lazily, as a `Stream<String>` | Yes — and must be closed via try-with-resources |

### java.time types

| Type | Has a time zone? | Use it for |
|---|---|---|
| `Instant` | always UTC internally | recording when something globally happened |
| `LocalDate`/`LocalTime`/`LocalDateTime` | No | calendar-facing values with no global moment |
| `ZonedDateTime` | Yes | needing both a local reading and a real global instant |
| `Duration` | n/a | exact, machine-precise time spans |
| `Period` | n/a | calendar-based spans (years/months/days) |

### Regex and serialization

| Situation | Correct choice |
|---|---|
| Validating an entire field | `matches()` |
| Searching within larger text | `find()` |
| Matching literal, untrusted text inside a regex | `Pattern.quote(text)` |
| Deserializing bytes from outside your trusted process | `ObjectInputFilter` allow-listing expected classes |
| A `Serializable` class meant to persist across versions | declare `serialVersionUID` explicitly |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does a traversal check rely only on `normalize()` and `startsWith()`, without ever calling `toRealPath()`?
- Does any text-based file or stream operation omit an explicit charset?
- Does date-dependent logic call `LocalDate.now()`/`Instant.now()` directly instead of accepting an injectable `Clock`?
- Is `matches()` used where `find()` was actually intended, or vice versa?
- Is untrusted or user-supplied text concatenated directly into a regex pattern string instead of being passed through `Pattern.quote`?
- Does any `Serializable` class omit an explicit `serialVersionUID`?
- Is `ObjectInputStream.readObject()` ever called on bytes from outside the application with no `ObjectInputFilter` in place?

## The judgment question

The judgment question describes a normalized path that lexically matched the allowed root string, yet still pointed through a symbolic link to a location outside it — the correct diagnosis is that **the policy considered lexical paths but not actual filesystem resolution**. This is precisely Lesson 1's central gap: `normalize()` collapses `.`/`..` segments by rewriting text, with zero awareness that any path component might actually be a symbolic link redirecting to somewhere else on the real filesystem. A requested name with no `..` in it at all can pass every lexical check completely legitimately while still leading somewhere it should never be allowed to reach, once you follow where it actually resolves with `toRealPath()`. The fix is never "run the check more often" or "add another string comparison" — it is checking the **real**, symlink-resolved path against the **real**, symlink-resolved root, which is the one thing pure lexical normalization structurally cannot do.

## Approaching the implementation lab

The lab asks for `courseCode`: accept exactly two uppercase ASCII letters, a hyphen, and four digits, using whole-input matching rather than a substring search.

1. Write the precondition and boundary table first, exactly as every function lab in this course requires: a valid code, a lowercase code, a code with an extra prefix or suffix character, a code with the wrong digit count (too few and too many), and the exact minimum-length valid boundary.
2. Recall Lesson 4's central distinction directly: this task explicitly requires validating the *entire* string, which means `matches()`, not `find()` — `find()` would incorrectly accept a valid code embedded inside other text, exactly the embedded-substring trap this chapter demonstrated.
3. Build the pattern from what the task specifies precisely: `[A-Z]{2}` for exactly two uppercase letters, a literal hyphen, and `\d{4}` (or `[0-9]{4}`) for exactly four digits — with no leading `^` or trailing `$` needed, since `matches()` already anchors both ends of the input implicitly.
4. Compile the pattern once (as a `static final Pattern` field, or simply call `matches()` once per invocation) and keep the method deterministic and side-effect-free, consistent with every function lab in this course.

## Approaching the debug lab

The debug lab's regex check uses `find()` on a pattern searching for a course code inside `"prefix JV-0021"`, so it incorrectly reports `true` instead of the required `false`.

1. Run the program and confirm it currently prints `true` instead of the expected `false`.
2. Recall this chapter's second lesson exactly: the task requires validating the **entire** input region, not finding a matching substring anywhere within it — and `"prefix JV-0021"` genuinely does contain a valid course code as a substring, which is exactly why `find()` (wrongly) succeeds here.
3. Change the check from `matcher.find()` to `matcher.matches()`, keeping the same compiled `Pattern` and the same input string unchanged.
4. Confirm your fix now prints `false`, and be ready to explain, without consulting the answer, why `matches()` and `find()` disagree specifically on this input: the code coexists with other characters when using `find()` but the code alone does not consume the entire string, which is what `matches()` demands.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Build a small "safe file storage" class that accepts a base directory and an untrusted filename, applies both the lexical and real-path traversal defenses from Lesson 1, and exercises it against at least one `..`-based attempt and one symlink-based attempt.
2. Write a method that reads a text file using `Files.lines()` inside a try-with-resources block, counts lines matching a given regex using `find()`, and compare its memory behavior conceptually against loading the whole file with `Files.readAllLines` first.
3. Design a small "subscription" class using `LocalDate` and `Period` with an `isActive(Clock clock)` method, and write tests using at least three different fixed clocks (before, during, and after the subscription period).
4. Take a `Serializable` class without an explicit `serialVersionUID`, add a field to it, and reproduce Lesson 5's compatibility failure yourself; then fix it by adding an explicit UID from the start and confirm the same change becomes compatible.
5. Write a small deserialization entry point that uses `ObjectInputFilter` to allow-list exactly one expected class, and confirm it rejects an instance of a different class with `InvalidClassException`.

## Self-assessment

You are ready for Chapter 13 when you can do all of the following without notes:

- Explain why `normalize()` plus `startsWith()` alone is not a complete path-traversal defense, and what additional step closes the symbolic-link gap.
- Explain the difference between a byte stream and a character stream, and why every character-stream operation needs an explicit charset.
- Explain the difference between `Instant`, the `Local...` types, and `ZonedDateTime`, and when each is the correct choice.
- Explain why injecting a `Clock` makes date-dependent code testable in a way that calling `LocalDate.now()` directly does not.
- Explain the difference between `matches()` and `find()`, and describe a concrete bug caused by using the wrong one.
- Explain why `Pattern.quote` is necessary when searching for literal, untrusted text with a regex-based API.
- Explain why declaring `serialVersionUID` explicitly matters for compatibility, and why `ObjectInputFilter` is a required control, not an optional one, when deserializing bytes from outside your trusted process.
