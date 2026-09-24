# Chapter 11 assessment and deliberate practice

This chapter turned "handling errors" from an afterthought into a designed part of your program's contract: which failures are checked versus unchecked, what information a failure carries as it travels up the call stack, how cleanup is guaranteed, and what a caller — human or another program — is actually told when something goes wrong. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Throwable hierarchy and checked versus unchecked exceptions

An exception interrupts normal flow and travels up the call stack until a handler catches it. Every throwable extends `Throwable`, which splits into `Error` and `Exception`, with `RuntimeException` a special subclass of `Exception`. Checked exceptions must be caught or declared with `throws`; `RuntimeException` and `Error` subclasses carry no such compiler obligation. This distinction is enforced only by the compiler — the JVM propagates every throwable identically. Choose checked versus unchecked based on what the caller can usefully do about the failure, not on what silences the compiler.

### Lesson 2: Throwing domain-specific failures and preserving causes

Use `IllegalArgumentException` for bad arguments, `IllegalStateException` for wrong object state, and `NullPointerException` (often via `Objects.requireNonNull`) for missing required values. Custom exceptions extend `Exception` or `RuntimeException`, pass message and cause to `super`, and may carry typed fields. Passing the original exception as the cause preserves its type, message, and stack trace across abstraction translation; stack traces show it as `Caused by:`. "Not found" and "could not find out" are different outcomes and must stay distinguishable.

### Lesson 3: Catching, propagation, multi-catch, and reading stack traces

The first matching `catch` runs; `finally` always runs after the `try` or `catch`, on every exit path. `catch` blocks must be ordered specific to general. A narrow `try` block prevents unrelated failures from being handled, and described, as if they were the one actually expected. A `return` or `throw` inside `finally` discards a pending result or exception. A stack trace lists frames most-recent first; `Caused by:` shows the original exception, and `... N more` marks frames shared with the enclosing trace.

### Lesson 4: try-with-resources, ownership, and suppressed exceptions

Calling `close()` as a plain final statement skips cleanup if an earlier exception is thrown. try-with-resources guarantees `close()` runs regardless of how the block exits, for any `AutoCloseable`, closing multiple resources in reverse order of opening. When both the body and `close()` throw, the body's exception is primary and the close failure is attached as a suppressed exception, retrievable via `getSuppressed()` — neither is silently lost.

### Lesson 5: Boundary validation and safe user-facing error reporting

Validation happens in layers — presence, syntax, semantics, authorization — each answering a different question; passing one does not imply passing another. Valid input never by itself proves the requester is authorized. Exposing raw exception messages or stack traces to external callers risks leaking internal implementation details. The professional pattern logs full diagnostic detail server-side while returning a generic, safe message externally, and specific, stable failure codes let calling code respond precisely.

## Cheat sheet

### Throwable hierarchy

| Type | Compiler obligation | Typical meaning |
|---|---|---|
| `Error` | none | serious runtime/environment problem, rarely caught |
| `RuntimeException` | none | a programming mistake or violated precondition |
| Checked `Exception` (not a `RuntimeException`) | must catch or declare `throws` | an anticipated, recoverable failure the caller should plan for |

### Exception translation

| Situation | Do this |
|---|---|
| A low-level exception leaks an implementation detail across an abstraction boundary | Catch it, throw a domain-specific exception, pass the original as the cause |
| Need to inspect the original failure later | `throwable.getCause()` |
| Reading a translated exception's trace | Look for `Caused by:` |

### try/catch/finally and resources

| Rule | Consequence |
|---|---|
| `catch` blocks are checked in order | put specific exception types before general ones |
| `finally` always runs | never `return`/`throw` inside it unless you mean to discard the pending outcome |
| try-with-resources | `close()` guaranteed; resources close in reverse declared order |
| Body and `close()` both throw | body's exception is primary; close's is suppressed, not lost |

### Boundary discipline

| Layer | Question it answers |
|---|---|
| Presence | Is a value provided at all? |
| Syntax | Is it well-formed? |
| Semantics | Is the well-formed value acceptable? |
| Authorization | Is the caller allowed to do this, regardless of the data? |
| External error message | Safe and generic, with full detail logged server-side |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does a caught exception get discarded and replaced with a new one, losing the original as a cause?
- Is a `try` block wrapped around more code than the one operation actually expected to fail?
- Does a `finally` block contain a `return` or `throw` that could silently discard a pending exception?
- Does any code path leak a raw exception message or stack trace to an external caller?
- Is "no result found" ever confused with "could not determine whether a result exists," when they are genuinely different outcomes?
- Does a resource's cleanup rely on a manually placed `close()` call rather than try-with-resources?

## The judgment question

The judgment question describes a storage outage silently converted into an empty result. The lost distinction is exactly what Lesson 2 emphasized: "not found" and "could not find out" are different outcomes, and collapsing them into the same empty result destroys information a caller genuinely needs. A caller receiving an empty list has no way to tell whether the search legitimately found nothing, or whether the search never actually ran because the storage layer was unreachable — and those two situations call for completely different responses (accept the empty result versus retry, alert, or fail loudly). The exception type itself and any retry count are secondary details; the fundamental loss is conflating "answer: none" with "no answer was obtained."

## Approaching the implementation lab

The lab asks for `parsePort`: parse a decimal port number using `Integer.parseInt`'s exact spelling rules (no trimming), returning `-1` for anything malformed or outside 1 to 65535.

1. Write the contract first: the task is explicit that whitespace is *not* trimmed, unlike several of this course's earlier console-input exercises — a leading or trailing space should be treated as malformed input, not silently cleaned up.
2. Build a boundary table: an empty string, non-numeric text, `0`, `1` (the lowest valid port), `65535` (the highest valid port), `65536` (one past valid), a negative number, and text with surrounding whitespace.
3. Structure the method exactly as Lesson 5 taught: attempt to parse (catching `NumberFormatException` and returning `-1` for that case specifically), then separately check the semantic range, returning `-1` for anything outside it too.
4. Keep the method deterministic and free of side effects, consistent with every function lab in this course.

## Approaching the debug lab

The debug lab's exception translation discards the original `NumberFormatException` instead of forwarding it as the new exception's cause, so `e.getCause() instanceof NumberFormatException` incorrectly evaluates to `false`.

1. Run the program and confirm it currently prints `false` instead of the expected `true`.
2. Recall Lesson 2's exact pattern: `throw new IllegalArgumentException("quantity")` constructs the new exception with no cause at all. The original `NumberFormatException e` caught in the inner `catch` block is simply lost the moment that line runs.
3. Use the two-argument `IllegalArgumentException(String message, Throwable cause)` constructor, passing the caught `NumberFormatException` as the second argument, so it becomes retrievable via `getCause()`.
4. Confirm your fix preserves the demonstrated two-exception structure exactly as written, and produces `true`.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Design a small custom checked exception and a small custom unchecked exception for a domain of your choosing, and write a short justification for which category each one belongs to, based on what a caller could usefully do in response.
2. Write a method that catches a low-level exception (a parsing failure, for instance) and translates it into a domain-specific one, preserving the cause; then deliberately trigger the failure and read the resulting `Caused by:` chain in a printed stack trace.
3. Build a small `AutoCloseable` resource whose `close()` can fail, and write a test exercising all four body-success/failure and close-success/failure combinations, checking `getSuppressed()` where relevant.
4. Take a method that currently returns a raw exception message to a caller, and redesign it using this chapter's safe-reporting pattern: log full detail, return a generic and safe result instead.

## Self-assessment

You are ready for Chapter 12 when you can do all of the following without notes:

- Explain the difference between a checked exception, an unchecked exception, and an `Error`, and what governs the compiler's obligations for each.
- Translate a low-level exception into a domain-specific one while preserving the original as a cause, and read the resulting `Caused by:` chain in a stack trace.
- Order a multi-catch block correctly and explain why a `return` inside `finally` is dangerous.
- Explain why try-with-resources is preferred over a manually placed `close()` call, and what happens when both the body and `close()` fail.
- Explain the difference between "not found" and "could not determine," and why collapsing them loses information a caller needs.
- Design a boundary validation flow with distinguishable layers, and describe the safe way to report a failure to an external caller without leaking internal details.
