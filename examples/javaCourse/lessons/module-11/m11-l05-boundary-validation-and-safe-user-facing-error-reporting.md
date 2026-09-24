# Boundary validation and safe user-facing error reporting

This closing lesson of the chapter connects everything you have learned about exceptions to a genuinely practical, professional concern: what happens at the exact **boundary** where untrusted input enters your program, and what should the program say back when something goes wrong? Get boundary validation wrong, and invalid data corrupts everything downstream of it. Get error reporting wrong, and you either confuse users with useless messages or, worse, leak internal implementation details — database schemas, file paths, internal hostnames — directly to whoever triggered the error, which is a real, documented category of security vulnerability.

What you will learn:

- Why validation happens in layers — syntax, then semantics, then authorization — and why passing one layer says nothing about the others
- Why "valid input" and "authorized request" are two completely separate questions, and conflating them is a security bug
- Why exposing raw exception messages or stack traces to end users is dangerous, using a realistic leaked-database-error example
- How to log full diagnostic detail on the server while returning a safe, generic message to the caller
- Designing specific, machine-checkable failure codes instead of a single generic "something went wrong"

## Validation happens in layers, and each layer answers a different question

You have already met this idea piece by piece, in Chapter 2 for console input and in Chapter 4 for null contracts — this lesson makes the full layered structure explicit, because a chapter about exceptions is exactly where it belongs: **syntax** (is this well-formed?), **semantics** (is this value acceptable?), and **authorization** (is the *caller* allowed to do this, given otherwise-valid input?) are three genuinely separate questions, and passing one tells you nothing about the others.

```java
public class LayeredValidation {
    record ParsedAge(int value) {}

    static ParsedAge parseAge(String text) {
        String trimmed = text == null ? "" : text.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("age is required");
        }
        int value;
        try {
            value = Integer.parseInt(trimmed);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("age must be a whole number, got: " + text, e);
        }
        if (value < 0 || value > 130) {
            throw new IllegalArgumentException("age must be from 0 to 130, got: " + value);
        }
        return new ParsedAge(value);
    }

    static boolean isAuthorizedToViewProfile(String requestingUser, String profileOwner) {
        return requestingUser.equals(profileOwner) || requestingUser.equals("admin");
    }

    public static void main(String[] args) {
        System.out.println(parseAge(" 34 "));

        try {
            parseAge("abc");
        } catch (IllegalArgumentException e) {
            System.out.println("syntax rejected: " + e.getMessage());
        }

        try {
            parseAge("200");
        } catch (IllegalArgumentException e) {
            System.out.println("semantic rejected: " + e.getMessage());
        }

        ParsedAge valid = parseAge("42");
        System.out.println("parsed successfully: " + valid);
        boolean authorized = isAuthorizedToViewProfile("karim", "amina");
        System.out.println("valid input does not imply authorization: karim viewing amina's profile allowed? " + authorized);
    }
}
```

Output:

```text
ParsedAge[value=34]
syntax rejected: age must be a whole number, got: abc
semantic rejected: age must be from 0 to 130, got: 200
parsed successfully: ParsedAge[value=42]
valid input does not imply authorization: karim viewing amina's profile allowed? false
```

`parseAge` layers its checks precisely: **empty check** first (a distinct, named failure — missing input is different from malformed input), then **syntax** (`Integer.parseInt`, wrapped to preserve the original `NumberFormatException` as a cause, exactly as Lesson 2 taught for exception translation), then **semantics** (the range check, which can only run on a value that already parsed successfully). Notice the final two lines: `"42"` parses perfectly, producing a completely valid `ParsedAge` — and *none of that* answers whether `karim` is allowed to view `amina`'s profile. This is exactly the chapter's concept-check question: **valid input does not prove the caller is authorized to perform the requested operation.** A request can be syntactically perfect, semantically sensible, and still be forbidden, because authorization is not a property of the *data* at all — it is a property of the *relationship* between the requester and the specific thing being requested, checked entirely separately, using entirely different information (who is asking, not what they are asking with).

## Why leaking raw exception details to a user is a real security risk

An exception's message, and especially its full stack trace, often contains exactly the kind of information that should never reach an untrusted caller: internal class names, file paths, SQL fragments, and — in the worst realistic case — database connection strings, internal hostnames, or credentials embedded in a driver's own error text.

```java
import java.sql.SQLException;

public class LeakyErrorMessage {
    static void updateBalance(String accountId, long newBalanceCents) throws SQLException {
        throw new SQLException("ERROR: duplicate key value violates unique constraint \"accounts_pkey\" "
                + "DETAIL: Key (id)=(" + accountId + ") already exists. "
                + "at jdbc:postgresql://internal-db-prod-01.corp.local:5432/accounts, user=svc_billing");
    }

    static String handleRequestUnsafe(String accountId, long newBalanceCents) {
        try {
            updateBalance(accountId, newBalanceCents);
            return "OK";
        } catch (SQLException e) {
            return "Error: " + e.getMessage();
        }
    }

    static String handleRequestSafe(String accountId, long newBalanceCents) {
        try {
            updateBalance(accountId, newBalanceCents);
            return "OK";
        } catch (SQLException e) {
            System.out.println("[server log] update failed for account " + accountId + ": " + e.getMessage());
            return "Error: unable to update this account right now. Please try again later.";
        }
    }

    public static void main(String[] args) {
        System.out.println("unsafe response sent to the client:");
        System.out.println(handleRequestUnsafe("acct-777", 5000));
        System.out.println();
        System.out.println("safe response sent to the client:");
        System.out.println(handleRequestSafe("acct-777", 5000));
    }
}
```

Output:

```text
unsafe response sent to the client:
Error: ERROR: duplicate key value violates unique constraint "accounts_pkey" DETAIL: Key (id)=(acct-777) already exists. at jdbc:postgresql://internal-db-prod-01.corp.local:5432/accounts, user=svc_billing

safe response sent to the client:
[server log] update failed for account acct-777: ERROR: duplicate key value violates unique constraint "accounts_pkey" DETAIL: Key (id)=(acct-777) already exists. at jdbc:postgresql://internal-db-prod-01.corp.local:5432/accounts, user=svc_billing
Error: unable to update this account right now. Please try again later.
```

`handleRequestUnsafe` forwards `e.getMessage()` straight to whatever is on the other end of this call — a web response body, a mobile app's error dialog, anywhere. Look at what that actually exposes: the exact database table name (`accounts_pkey`), the internal hostname (`internal-db-prod-01.corp.local`), the port, and even the service account username (`svc_billing`) — a genuine reconnaissance gift to anyone probing your system, entirely by accident, just from a routine duplicate-key error. `handleRequestSafe` fixes this with the standard, professional pattern: **log the full, unfiltered diagnostic detail where only your own team can see it** (a server-side log, exactly the structured logging Chapter 15 will cover in depth), and **return a generic, safe, user-appropriate message** to the actual caller. The information is not lost — it is fully preserved in the log for whoever needs to diagnose the real problem — it is simply routed to the correct audience instead of the wrong one.

## Designing specific failure codes instead of one generic message

A single generic `"Error: something went wrong"` for every possible failure is safe from the leaking problem above, but it throws away information a well-behaved caller genuinely needs: was the input malformed? Out of range? Missing entirely? A better design returns a specific, stable, machine-checkable failure identifier alongside a safe human-readable message:

```java
public class SpecificFailureCodes {
    sealed interface ValidationResult permits Valid, Invalid {}
    record Valid(int value) implements ValidationResult {}
    record Invalid(String code, String message) implements ValidationResult {}

    static ValidationResult validateAge(String text) {
        String trimmed = text == null ? "" : text.trim();
        if (trimmed.isEmpty()) {
            return new Invalid("AGE_REQUIRED", "age is required");
        }
        int value;
        try {
            value = Integer.parseInt(trimmed);
        } catch (NumberFormatException e) {
            return new Invalid("AGE_NOT_A_NUMBER", "age must be a whole number");
        }
        if (value < 0 || value > 130) {
            return new Invalid("AGE_OUT_OF_RANGE", "age must be from 0 to 130");
        }
        return new Valid(value);
    }

    public static void main(String[] args) {
        for (String input : new String[] {"34", "", "abc", "200"}) {
            ValidationResult result = validateAge(input);
            String description = switch (result) {
                case Valid(int value) -> "accepted: " + value;
                case Invalid(String code, String message) -> "rejected [" + code + "]: " + message;
            };
            System.out.println("input=\"" + input + "\" -> " + description);
        }
    }
}
```

Output:

```text
input="34" -> accepted: 34
input="" -> rejected [AGE_REQUIRED]: age is required
input="abc" -> rejected [AGE_NOT_A_NUMBER]: age must be a whole number
input="200" -> rejected [AGE_OUT_OF_RANGE]: age must be from 0 to 130
```

This brings together three earlier chapters at once: the **sealed hierarchy with record variants** (Chapter 6) gives a compiler-enforced, exhaustive set of outcomes; the **pattern-matching `switch`** (also Chapter 6) decomposes each variant cleanly; and the specific, stable `code` strings (`"AGE_REQUIRED"`, `"AGE_NOT_A_NUMBER"`, `"AGE_OUT_OF_RANGE"`) give a calling program — a web frontend, a mobile app, another service — something concrete and reliable to check programmatically ("if the code is `AGE_OUT_OF_RANGE`, highlight the age field specifically and show this exact message"), which a single generic error string can never support. The human-readable `message` stays safe and generic in content (no internal details, exactly as the previous section required), while the `code` carries the precision a caller actually needs to respond appropriately.

## What happens under the hood

Every technique in this lesson protects the same boundary from the same class of problem, viewed from different angles: layered validation stops bad data from ever reaching code that assumes it is good; separating authorization from validation stops a syntactically perfect request from being treated as automatically permitted; safe error reporting stops your own system's internals from leaking out through the one channel — error messages — that developers most often forget is user-visible. All three are really the same underlying discipline Chapter 4 first introduced for null contracts and defensive copying: **decide explicitly what crosses a boundary, in each direction, and enforce that decision deliberately** — rather than trusting that "it compiled" or "it didn't throw" means the boundary was actually respected.

## Common mistakes

**1. Treating "the input parsed successfully" as proof the request should be allowed.** Syntax, semantics, and authorization are three separate checks; passing one says nothing about the others.

**2. Forwarding `exception.getMessage()` (or, worse, a full stack trace) directly into a user-facing response.** Exception messages routinely contain internal details never meant for an external audience.

**3. Logging nothing and returning only a generic message.** This protects the user but leaves your own team with no way to diagnose the actual problem later; log the full detail server-side even while returning a safe message externally.

**4. Returning one single generic error for every failure reason.** This is safe but unhelpful; a caller cannot distinguish "you forgot a field" from "the server is down" from "you are not allowed to do this."

**5. Checking authorization *after* performing a side-effecting operation, rather than before.** Order matters: verify the requester is allowed to do something before doing it, not as an afterthought once it is already done.

## Best practices

- Validate in explicit layers: presence, syntax, semantics, then authorization — in that order — with a specific, distinguishable failure for each layer.
- Never conflate "the input was valid" with "the caller is authorized"; check authorization as its own, separate step, using information about the requester, not the request's data.
- Log full diagnostic detail (the real exception, its message, its stack trace) somewhere only your own team can see; return a generic, safe message to any external caller.
- Design specific, stable failure codes for validation and business-rule failures, so calling code can respond precisely instead of just displaying a generic error.
- Treat every exception message that might reach an external caller as untrusted output that needs the same scrutiny as any other user-facing text — assume it will eventually be seen by someone it was not intended for.

## Summary

- Validation happens in layers — presence, syntax, semantics, authorization — and each layer answers a genuinely different question; passing one does not imply passing another.
- Valid, well-formed input never by itself proves the requester is authorized to perform the requested operation; that must be checked separately.
- Exposing raw exception messages or stack traces to external callers risks leaking internal implementation details — database schemas, hostnames, credentials — that were never meant to be user-facing.
- The professional pattern is to log full diagnostic detail server-side while returning a generic, safe message to the caller, preserving the information for the right audience instead of discarding or exposing it to the wrong one.
- Specific, stable failure codes (often via a sealed hierarchy of result records) let calling code respond precisely to a failure, unlike one single generic error message.

## Practice

Warm-up:

1. Write a method that validates an email-like string in three layers: not blank, contains exactly one `@` character, and has non-empty text on both sides of it — each layer throwing a distinctly-worded exception.
2. Write a method `isOwner(String requestingUser, String resourceOwner)` and demonstrate, with valid but unauthorized input, that "the input parsed fine" and "the request is allowed" are different questions.
3. Take an exception message containing a made-up internal file path, and write both an unsafe version that forwards it directly and a safe version that logs it and returns a generic message instead.

Core:

1. Extend `LayeredValidation`'s `parseAge` into a small user-registration validator checking at least three fields (name, age, email), each with its own layered checks, collecting every failure rather than stopping at the first (a small design decision worth documenting: should validation stop at the first error, or report all errors at once?).
2. Design a sealed `ValidationResult`-style hierarchy (as in `SpecificFailureCodes`) for a small form of your choosing, with at least four distinct failure codes, and write a pattern-matching `switch` that turns each variant into a user-facing message.
3. Write a method that simulates a database failure (throwing a checked exception with a realistic but fake internal-looking message) and handle it the safe way: log the real detail, return a generic message, and write a test confirming the generic message never contains the internal detail string.

Challenge:

1. Design a small "API boundary" method that validates input, checks authorization, and only then performs an operation, structured so each of the three layers can fail independently with its own specific, logged, and safely-reported outcome — then write tests exercising all the ways it can fail.
2. Research (by reading Java's own documentation or writing a small experiment) what information `Exception.getMessage()` versus `Exception.toString()` versus a full stack trace each reveal for a checked exception thrown by a standard library method of your choosing, and write a short comparison of what would be safe versus unsafe to expose to an external caller in each case.

## Check your understanding

1. Name the three (or four, including presence) layers of validation this lesson describes, and state what question each one answers.
2. Why does successfully parsing a request's input say nothing about whether the requester is authorized to make that request?
3. What specific kinds of information can leak when a raw exception message or stack trace is returned directly to an external caller?
4. What is the standard professional pattern for handling a failure that must be diagnosable by your team but must not expose internal details to the caller?
5. Why is a single generic error message, used for every possible failure, safer but less useful than a set of specific failure codes?
6. In `SpecificFailureCodes`, what does the `code` field provide to a calling program that the `message` field alone does not?
