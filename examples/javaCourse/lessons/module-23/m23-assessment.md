# Chapter 23 assessment and deliberate practice

This chapter treated security as ordinary design and review discipline, not a separate specialty bolted on at the end: threat modeling before code exists, structured APIs that keep untrusted data from ever becoming control syntax, the JDK's own cryptographic tools used correctly rather than invented from scratch, resource limits that turn overload into a clear rejection instead of a slow-motion outage, and dependency/configuration/audit practices that make "we did the right thing" provable rather than merely asserted. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Threat modeling, assets, actors, authentication, and authorization

Most real security failures are ordinary design gaps, not exotic cryptographic breaks — an endpoint returning a record just because the caller is logged in, or a client-controlled field the server should own. Threat modeling asks what is valuable, who can reach it, and what stops the wrong person, before code exists. Authentication (proving who the caller is) and authorization (deciding what that specific caller may do) are distinct, and object-level authorization must be checked on the server for every request naming a specific resource — being logged in never implies being allowed to act on any particular ID a client happens to supply.

### Lesson 2: SQL/command/log injection, traversal, XXE, SSRF, and deserialization

Every injection vulnerability shares one root cause: untrusted data allowed to become control syntax instead of staying data. `PreparedStatement` binds SQL values separately from SQL structure; `ProcessBuilder`'s argument array avoids shell interpretation entirely; log injection is neutralized by stripping or escaping newlines; path traversal requires resolving and validating a canonical path against a base directory; XXE requires hardening XML parsers against external entity resolution; SSRF requires validating destination URLs against an allowlist, not just syntactic well-formedness.

### Lesson 3: Secrets, cryptography, password storage, TLS, and sensitive data

A secret has a full lifecycle — provisioning, storage, access, rotation, revocation, redaction — and mishandling any stage produces a real breach. Passwords need a deliberately slow, salted password-hashing algorithm (bcrypt, scrypt, or Argon2), never a fast general-purpose digest like plain SHA-256, because a fast hash lets an attacker try enormous numbers of guesses per second against stolen hashes regardless of salting. `SecureRandom` generates secure tokens; AES-GCM provides authenticated encryption, and its nonce must never repeat for a given key. TLS certificate validation must never be disabled, and secrets must be kept out of logs, exceptions, and `toString`.

### Lesson 4: Resource exhaustion, request limits, timeouts, queues, and cancellation

Resource exhaustion is a security concern (denial of service), not merely a performance issue. An unbounded queue does not solve overload — it converts it into unbounded memory growth and unbounded latency, a worse failure arriving later; a bounded queue with immediate rejection gives a clear, actionable signal instead. Body-size limits, per-client concurrency limits, and rate limits each catch a distinct overload shape. Timeouts at every layer are a mandatory defense against a deliberately slow client, and cancellation must be propagated through a request's full processing chain once its caller is gone, to actually reclaim wasted resources.

### Lesson 5: Dependency scanning, secure configuration, patching, and audit evidence

Dependency security is continuous: a dependency safe when added can become vulnerable later with zero code changes, so scanning must run on every build, not only at add-time. An SBOM is an inventory of components, not proof of security — its value is making a fast, accurate lookup possible once a vulnerability is disclosed, paired with active scanning. Secure configuration requires deliberately hardening away from convenient-but-insecure defaults. A patching cadence is a genuine, severity-differentiated risk decision. Audit evidence (scan history, patch timelines, access logs, version-controlled configuration) makes "we did the right thing" provable, not merely true.

## Cheat sheet

### Authentication versus authorization

| Question | Answer |
|---|---|
| "Who is this caller?" | Authentication |
| "May this specific caller act on this specific resource?" | Authorization (object-level, checked on the server, every request) |

### Injection defenses by category

| Injection type | Defense |
|---|---|
| SQL | `PreparedStatement` with bound parameters |
| Shell/command | `ProcessBuilder` with an argument array, never a shell string |
| Log | Strip/escape newlines and control characters before logging untrusted input |
| Path traversal | Resolve to a canonical path and validate it is inside the expected base directory |
| XXE | Disable external entity resolution on XML parsers |
| SSRF | Validate destination URLs against an allowlist, not just syntax |
| Deserialization | Never deserialize untrusted data with an unrestricted, type-arbitrary deserializer |

### Secrets and cryptography quick reference

| Need | Correct tool |
|---|---|
| Password storage | A slow, salted password-hashing algorithm (bcrypt/scrypt/Argon2) — never plain SHA-256 |
| Secure random tokens | `SecureRandom` |
| Authenticated encryption | AES-GCM, with a nonce that never repeats for a given key |
| Transport security | TLS with certificate validation always enabled |

### Resource limits by attack shape

| Limit | Catches |
|---|---|
| Body size | A single oversized payload |
| Per-client concurrency | One client monopolizing shared capacity at an instant |
| Rate limit | Excessive total request volume over time |
| Every layer's timeout | A deliberately slow client holding a connection/thread open |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does an endpoint check only authentication (is the caller logged in) without also checking object-level authorization (may this caller act on this specific resource)?
- Is any untrusted value concatenated into SQL, a shell command, or a log line instead of using a structured API or explicit escaping?
- Is a password ever hashed with a fast general-purpose digest instead of a dedicated slow password-hashing algorithm?
- Is a secret or credential ever logged, printed in an exception message, or included in a `toString()` output — even partially, beyond an intentional, deliberate redaction?
- Is any queue left unbounded in front of a fixed-capacity worker pool?
- Is a dependency vulnerability scan run only at dependency-change time rather than on every build or a scheduled cadence?

## The judgment question

The judgment question describes a valid task ID that belongs to another user, and asks what decision is required — the correct answer is **object-level authorization**, not only integer parsing and not only SQL escaping. This is Lesson 1's central distinction, restated at the chapter level: the task ID is syntactically valid (it parses correctly) and the query retrieving it is safely constructed (properly escaped or bound), so neither integer parsing nor SQL escaping was ever the actual gap — both already succeeded. The missing check is whether *this specific authenticated caller* is actually permitted to access *this specific* resource, which is a business-logic decision entirely separate from whether the request was well-formed or safely executed. An authenticated user proving who they are says nothing about what they are allowed to do, and skipping the object-level check is exactly the "confusing authentication with authorization" vulnerability class this chapter names as one of the most common in real web APIs.

## Approaching the implementation lab

The lab asks for `redact(value)`: for secrets longer than four characters, return `***` plus the final four characters; otherwise, return `***` alone.

1. Write the precondition and boundary table first: a secret longer than four characters (`"abcdefgh"` → `"***efgh"`), a secret exactly at the four-character boundary (`"1234"` → `"***"`, fully masked, not partially revealed), an empty string (`"***"`), and a secret one character over the boundary (`"12345"` → `"***2345"`).
2. Check the length boundary explicitly: only when `value.length() > 4` does any portion of the secret get revealed — a length of exactly `4` must be fully masked, matching the hidden test case directly.
3. For a secret longer than four characters, take the substring of its final four characters (`value.substring(value.length() - 4)`) and prepend `"***"`.
4. Recall this lab's own stated caveat: this is a bounded, illustrative masking contract for the exercise, not a recommendation for real production logging — a real system should usually omit credentials from logs entirely, per Lesson 3's secret-lifecycle material, rather than partially reveal them under any masking scheme.

## Approaching the debug lab

The debug lab's starter code treats a secret of **up to and including** four characters (`secret.length() <= 4`) as safe to print entirely unmasked, when the intended contract (matching the implementation lab exactly) requires a short secret to be **fully redacted**, exactly like any other secret — never printed in the clear regardless of its length.

1. Run the program and confirm it currently prints `abc` (the secret itself, unmasked) instead of the required `***`.
2. Recall this chapter's central secrets-handling principle from Lesson 3, reinforced by the implementation lab's own boundary: a short secret is not "safe" merely because it is short — it must never be printed in the clear, and the `<= 4` branch's current behavior does exactly the opposite of the intended contract.
3. Change the condition so that any secret of four characters or fewer resolves to the fully-masked `"***"` branch instead of the unmasked branch — for example, always returning `"***"` when `secret.length() <= 4`, rather than returning `secret` itself.
4. Confirm your fix now prints `***` exactly for the given three-character secret `"abc"`, and be ready to explain why treating a short secret as "safe to print" is precisely the kind of insecure-by-default reasoning Lesson 5 warns against — a convenient shortcut that is also the wrong security decision.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Design a threat model (assets, actors, entry points, trust boundaries) for a small API you have built or could build, and identify at least one place an object-level authorization check is required beyond authentication alone.
2. Write a small endpoint handler that safely accepts a user-supplied file path, resolves it to a canonical path, and validates it remains inside an expected base directory, rejecting any attempt at traversal.
3. Implement password storage using a real slow password-hashing library (bcrypt or Argon2, via a well-maintained Java library), and write a test confirming two calls with the same password produce different stored hashes (due to per-call salting) that both still verify correctly.
4. Configure a bounded thread pool, a body-size limit, and every layer's timeout for a small service, and demonstrate each limit rejecting a deliberately crafted request that exceeds it.
5. Generate an SBOM for a real or sample project, and simulate discovering a new CVE against one listed component, describing exactly how the SBOM would let you determine which of your systems are affected.

## Self-assessment

You are ready for Chapter 24 when you can do all of the following without notes:

- Explain the precise difference between authentication and authorization, and why object-level authorization must be checked on the server for every request naming a resource.
- Explain the single root cause shared by SQL, command, log, path-traversal, XXE, and SSRF vulnerabilities, and the structured-API-based fix for at least three of them.
- Explain why a fast general-purpose hash is unsuitable for password storage, and what property a dedicated password-hashing algorithm provides instead.
- Explain why an unbounded queue does not solve overload, and name the three request-level limits that together catch distinct overload shapes.
- Explain what an SBOM does and does not prove, and why dependency scanning must run continuously rather than only at dependency-change time.
- Explain why a patching cadence is a genuine risk decision, and why audit evidence matters even when a team is confident it followed correct practice.
- Explain why treating a short secret as "safe to print unmasked" is an insecure-by-default mistake, not a harmless shortcut.
