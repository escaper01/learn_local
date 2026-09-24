# Chapter 25 assessment and deliberate practice

This final chapter integrated the entire academy into an operable, defensible whole: API compatibility and idempotent messaging for a system that spans process boundaries, containers and graceful shutdown that cooperate with the platform running them, SLOs and incident response that turn "we watch our metrics" into a real practice, the reading and refactoring discipline that dominates real professional work, and an honest statement of exactly what an automated checkpoint can and cannot certify. Review each lesson below, then use the guidance to approach every lab in this closing chapter, including the capstone itself.

## Lesson recaps

### Lesson 1: API compatibility, messaging, idempotency, outbox, saga, and caching

Networks drop responses and processes crash between two lines of code; a professional service is designed so every such failure has a known, boring outcome rather than an unpredictable one. Duplicate message delivery is normal, not a bug to eliminate — idempotency keys and a processed-message store make handling duplicates safe. Writing to a database and a message broker in two separate, uncoordinated steps loses events on a crash between them; the transactional outbox pattern fixes this by writing the event and the business change in the same local transaction, but its relay can still publish an event more than once (a crash between publish and marking it done), which is why consumers must remain idempotent regardless.

### Lesson 2: Containers, runtime images, configuration, health, and graceful shutdown

A container image bundles an application and its runtime so the exact same image moves from test to production; it must never contain secrets baked in at build time. Liveness, readiness, and startup probes each answer a different question, and readiness specifically must reject traffic during shutdown, not just when a dependency is unhealthy. `shutdownNow()` does not forcibly kill arbitrary Java tasks — interruption is a cooperative signal, and tasks must actually check for and respond to it, exactly as the concurrency chapter established.

### Lesson 3: Logs, metrics, traces, SLOs, deployment strategies, and incidents

Distributed tracing extends the observability chapter's correlation-ID discipline across service boundaries. An SLO specifies a reliability target over a defined measurement window — never a guarantee of zero incidents — and the resulting error budget turns "how careful should we be right now" into a data-driven decision. Rolling, blue-green, and canary deployments trade risk, rollback speed, and infrastructure cost differently. A mature incident response mitigates user-facing harm first, root-causes during resolution afterward, and closes with a blameless postmortem.

### Lesson 4: Reading, reviewing, refactoring, and communicating in an existing codebase

Reading unfamiliar code efficiently means starting from a genuine entry point and following the real call chain, using tests and version-control history as concentrated sources of intent. Refactoring is precisely defined as preserving observable behavior — it may freely restructure classes, and adding dependencies is neither required nor implied by the definition. A refactor and a genuine feature change must stay in separate commits. A characterization test captures what existing code currently does, discovered by running it, providing a safety net for changing code not yet fully understood.

### Lesson 5: Capstone architecture, vertical slices, portfolio defense, and continued growth

A vertical slice builds one complete feature end to end, immediately demonstrable, rather than building every layer for every feature before anything works. The capstone should visibly integrate every prior chapter's discipline, applied deliberately to its actual requirements. Completing an automated course checkpoint does not certify professional readiness — a bounded, automated grader proves exactly its specific test cases and nothing about judgment, communication, or real production conditions; a broader portfolio and practical, human review are what a genuine readiness claim actually requires.

## Cheat sheet

### Delivery guarantees and idempotency

| Guarantee | Consumer must tolerate |
|---|---|
| At-least-once delivery | Duplicate messages — handle with an idempotency key or natural idempotency |
| Outbox relay | Publish may happen more than once for the same event (crash between publish and marking done) |
| Lost acknowledgment | Duplicate delivery without duplicate durable effects, never assumed exactly-once |

### Health probes

| Probe | Question it answers | Failure response |
|---|---|---|
| Liveness | Is the process healthy enough to keep running? | Restart the container |
| Readiness | Should traffic be routed here right now? | Stop routing new traffic (including during graceful shutdown) |
| Startup | Has initialization finished? | Delay liveness/readiness checks until startup completes |

### SLO and error budget

| Term | Meaning |
|---|---|
| SLI | A specific, measurable metric (e.g., fraction of requests under 300ms) |
| SLO | A target value for an SLI over a defined window (e.g., 99.9% over 30 days) |
| Error budget | The gap between 100% and the SLO — a spendable, data-driven allowance for release-pace decisions |

### Refactoring discipline

| Rule | Why |
|---|---|
| Preserve observable behavior exactly | That is the entire definition of a refactor |
| Separate commit from any feature change | Lets each be reviewed and reverted independently |
| Write characterization tests first | Verifies "unchanged behavior" mechanically, not by careful re-reading alone |

## Common mistakes checklist

Before submitting any lab in this chapter, check your code against this list:

- Does a message handler assume delivery happens exactly once, with no idempotency protection against duplicates?
- Does a readiness check ignore an in-progress shutdown, still reporting ready while draining?
- Is an SLO treated as a promise of zero failures rather than a target over a measurement window?
- Does a commit mix a structural refactor with a genuine behavior change?
- Is a refactor's "unchanged behavior" claim unverified by any characterization test?
- Is a graded automated checkpoint treated as sufficient proof of readiness, with the external portfolio work skipped?

## The judgment question

The judgment question describes a message that was published but whose acknowledgment was lost, and asks what the consumer must tolerate — the correct answer is **duplicate delivery without duplicate durable effects**, not guaranteed one-time delivery and not automatic distributed rollback. This is Lesson 1's central point: a lost acknowledgment is indistinguishable, from the sender's side, from a lost message — the sender cannot tell whether the consumer actually processed it, so a correctly-designed at-least-once system redelivers to be safe, which means the consumer *will* sometimes see the same message twice. Guaranteed one-time delivery is not something a real distributed system without extraordinary, usually impractical coordination overhead can actually promise — treating it as available leads directly to the double-processing bugs idempotency keys exist to prevent. Automatic distributed rollback is not a real capability at all in this context; there is no single transaction spanning both the original publish and the consumer's own processing to roll back. The only genuinely correct design response is making the consumer's own handling of the message idempotent, so redelivery is safe regardless of how many times it occurs.

## Approaching the implementation lab

The lab asks for `readiness(database, queue, shuttingDown)`: return `READY` only when both dependencies are healthy and the service is not shutting down; otherwise `NOT_READY`.

1. Write the precondition and boundary table first: all healthy and not shutting down (`READY`), one dependency unhealthy (`NOT_READY`), every dependency healthy but shutting down (`NOT_READY` — this is the case the debug lab below tests directly), and a dependency unhealthy while also shutting down (still `NOT_READY`, for either reason).
2. Combine all three conditions into a single boolean expression: `database && queue && !shuttingDown` — every one of the three must hold in the right direction for `READY`.
3. Recall Lesson 2's exact point, reinforced by this chapter's concept check: readiness must actively reject new traffic during a graceful shutdown, which is precisely why `shuttingDown` participates in the readiness decision at all, not merely the two dependency-health booleans.
4. Confirm the hidden test case where every dependency is `true` but `shuttingDown` is also `true` still yields `NOT_READY` — this is the single case most likely to be gotten wrong by only checking dependency health.

## Approaching the debug lab

The debug lab's starter code checks only `database && queue`, entirely ignoring `shuttingDown`, so a draining instance (healthy dependencies, but actively shutting down) still incorrectly reports `READY` — exactly the "readiness ignoring an in-progress shutdown" mistake this chapter's checklist names directly.

1. Run the program and confirm it currently prints `READY` instead of the required `NOT_READY`, given `database=true, queue=true, shuttingDown=true`.
2. Recall Lesson 2's exact point: a readiness probe exists specifically to let the platform stop routing new traffic to an instance that should no longer receive it, and an instance draining its in-flight work during shutdown is exactly such a case, regardless of how healthy its dependencies remain.
3. Extend the condition to `database && queue && !shuttingDown`, preserving the surrounding ternary structure exactly as given.
4. Confirm your fix now prints `NOT_READY` for the given inputs, and be ready to explain why a readiness check that ignores shutdown state would let a load balancer keep sending new requests to an instance that is actively trying to finish and exit — precisely the scenario graceful shutdown is designed to prevent.

## Approaching the phase project: Secure task-import boundary

`SecureImport.run` is a bounded exercise in exactly this course's cumulative boundary-handling discipline: validate every field before accepting a record, enforce a hard capacity limit, reject invalid input without side effects, and redact secrets using the same masking contract from Chapter 23.

1. **Validate every field independently before accepting the record.** `id` must match `[A-Za-z0-9_-]{1,20}` exactly (rejecting anything like `../x`, which looks like a path-traversal attempt — exactly Chapter 23's injection-prevention discipline, applied here to a plain string field rather than a filesystem path); `title` must be 1 to 40 characters from the allowed character set (rejecting an empty title or one containing a disallowed character like `!`); `secret` must be non-empty and ASCII letters/digits only.
2. **Reject a record without consuming capacity or retaining its ID**, exactly as case 6 tests: `"a||secret"` (empty title) is rejected as `ERROR`, and critically, the ID `a` is *not* considered used afterward — the very next line, `"a|Good|secret"`, succeeds as a fresh record with that same ID, because the first, invalid attempt never actually claimed it.
3. **Enforce uniqueness and the three-record capacity together**, exactly as case 5 tests: a duplicate ID (even with different title/secret) is `ERROR` and does not disturb the original record's state; once three unique, valid records have been accepted, a fourth otherwise-valid record is `ERROR` for exceeding capacity, not silently accepted or silently dropped.
4. **Apply Chapter 23's exact redaction rule** to every accepted record's secret: length four or fewer becomes `***`; longer secrets become `***` plus their final four characters — the same boundary condition (`length <= 4` fully masked) the earlier chapter's lab and debug lab both tested.
5. **Preserve output order and format precisely**: one line per input line (an accepted record's `id|title|redacted`, or `ERROR` for a rejected one), in the same order as the input, joined with `\n` and no trailing newline; an empty input produces an empty string with no lines at all.

## Approaching the capstone: Task-service command core

`TaskService.run` is the final graded checkpoint: an in-memory command processor whose correctness depends entirely on precise parsing, precise validation, and precise state management — exactly the disciplines every debug and coding lab in this course has been building toward, now combined into one cohesive, stateful program.

1. **Parse every line the same way, defensively**: trim the line, skip it entirely if blank, split on `|` preserving empty fields (a negative-limit split, so a trailing empty field is not silently dropped), and trim every resulting field individually — case 6's leading/trailing-whitespace input (`" ADD | 7 | Trimmed "`) depends on this being done correctly.
2. **Validate the exact contract per command before mutating any state**: `ADD` requires exactly two additional fields (an id, a title) — a positive integer ID and a non-empty title containing neither `|` nor `;`; `DONE`/`REMOVE` require exactly one additional field (an id) referring to an *existing* task; `LIST` and `STATS` take no additional fields at all. Any syntax deviation (wrong field count, as case 6's `"DONE|7|extra"` tests directly), an unknown command (`"BOGUS"`), an invalid ID, or a missing task for `DONE`/`REMOVE` all produce `ERROR` while leaving state completely untouched.
3. **Reject a duplicate `ADD` without touching the existing task's state**, exactly as case 4 tests: `ADD|1|Second` after `ADD|1|First` already succeeded is `ERROR`, and the existing task's title remains `First`, confirmed by the subsequent `LIST`.
4. **Allow `DONE` to be repeated freely**: marking an already-`DONE` task `DONE` again succeeds with `OK` and changes nothing further — this is explicitly permitted, unlike `REMOVE` on a nonexistent task, which is an error.
5. **Format `LIST` output precisely**: tasks in ascending *numeric* ID order (not lexicographic string order, which would misorder IDs like `2` and `10`), as `id:status:title`, joined with `;`, or the literal string `EMPTY` if no tasks remain — and format `STATS` as `OPEN=<n>,DONE=<n>` counting current task statuses exactly.
6. **Keep `Main` and `TaskService` genuinely separate**, exactly as the instructions require: domain state (the task collection and its mutation logic) belongs entirely in `TaskService`, constructed fresh per invocation of `run`, so that each call to `run` is independent and carries no state left over from a previous call — mirroring this course's repeated emphasis (Chapter 15's fixture independence, Chapter 22's leak-avoidance discipline) on avoiding shared, accidentally-persistent state between logically separate operations.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency — and to genuinely complete this course, per Lesson 5's own honest framing — go beyond them:

1. Implement the transactional outbox pattern for real, with an actual database and an actual (or simulated) message broker, and demonstrate that a crash between the local commit and the broker publish never loses the event, while confirming your consumer handles the resulting occasional duplicate delivery correctly.
2. Build and run a real container image for a small service, non-root, with liveness and readiness probes actually wired to a container orchestrator (or a local Docker health-check equivalent), and demonstrate graceful shutdown draining in-flight requests before the container actually stops.
3. Define a real SLI and SLO for a service you have built, instrument it with real metrics, and simulate an incident (a deliberately introduced bug or slowdown) to practice the full detect-mitigate-resolve-postmortem cycle, including writing a genuine blameless postmortem.
4. Take an unfamiliar codebase (an open-source project, or a classmate's project if you have one available) and practice this chapter's reading strategy end to end: identify an entry point, read its tests, use `git blame` to understand one confusing decision, and write a characterization test for one piece of behavior before proposing any change to it.
5. Complete the full external capstone project described in `projects/final-capstone.json`, building the real HTTP layer, real persistence, real authentication and authorization, real deployment, and real observability that this graded in-memory core deliberately does not — and assemble the portfolio Lesson 5 describes: the deployed project, an architecture decision record, multi-level test evidence, and a genuine retrospective.

## Self-assessment

You have completed the Java Developer Academy's automated curriculum when you can do all of the following without notes — and you are ready to move on to building the broader portfolio Lesson 5 describes when you can also explain, honestly, what this curriculum could not itself verify:

- Explain why duplicate message delivery is normal in a distributed system, and how idempotency keys make handling it safe.
- Explain the difference between liveness, readiness, and startup probes, and why readiness must reject traffic during graceful shutdown specifically.
- Explain what an SLO actually specifies, and why an error budget turns a subjective reliability debate into a data-driven decision.
- Explain the precise definition of a refactor, and why it must be committed separately from any genuine behavior change.
- Explain what a characterization test verifies and why it matters specifically for code you did not originally write.
- Explain exactly what this chapter's graded automated labs proved, and what they explicitly could not — and name at least two concrete next steps (a real deployed project, real code review, real production experience) this course points toward but cannot itself provide.
