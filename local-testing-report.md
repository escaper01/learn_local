# Local verification report — Java Developer Academy curriculum

## Merged to main

`claude/affectionate-edison-gx2g0s` has been merged into `main` and pushed
(merge commit `50e08cd`, on top of main's prior tip `e2c438d`). One thing
worth your attention from that merge:

- **Conflict in `m16-l01` (the Maven POM lesson), now resolved the other way.**
  While this branch was in progress, a commit landed directly on `main`
  (`e2c438d revise Maven POM lesson...`, authored by your own account) that
  rewrote the exact same file this branch's Chapter 16 commit had also
  rewritten — two independent, non-trivial expansions of the same original
  stub, not a trivial or auto-mergeable diff. The merge commit (`50e08cd`)
  initially kept main's version; you then asked to use this branch's version
  instead, so a follow-on commit (`710e40e restore branch's m16-l01 Maven POM
  lesson over main's independent revision`) replaced it with the branch's
  306-line version. `main`'s `m16-l01` now reads exactly as this branch wrote
  it in the "write chapter 16 lesson markdown" commit; your own `e2c438d`
  revision of that file is no longer on `main`'s tip (still recoverable from
  git history at `e2c438d` if you ever want to compare or recover parts of
  it).
- I re-ran the same full id-uniqueness / schema-semantic validation script
  (see below) against `main`'s tip both right after the merge and again
  after this follow-on fix — zero errors both times, 428 registered ids,
  24 project files.
- Everything else below in this report (all chapters, the 18-project catalog,
  the 18 dedicated checkpoints) was already committed to the feature branch
  before this merge and is unaffected by it except for that one file.

## Session summary

Completed all remaining lesson markdown for Chapters 16 through 25 — the
entire rest of the 25-chapter curriculum. Nine separate commits, one per
chapter, each pushed to `claude/affectionate-edison-gx2g0s` immediately after
writing (learning from the prior session's mistake of batching too much
uncommitted work before hitting a session limit):

- Chapter 16 (all 6 files, was fully stub) — Maven, Gradle, dependencies,
  Git, CI
- Chapter 17 (l04, l05, assessment; l01-l03 pre-existed) — Concurrency
- Chapter 18 (all 6 files) — Networking, HTTP, JSON boundaries
- Chapter 19 (all 6 files) — Relational databases, SQL, JDBC
- Chapter 20 (l03-l05, assessment; l01-l02 pre-existed) — Architecture,
  SOLID, design patterns
- Chapter 21 (l02-l05, assessment; l01 pre-existed) — Reflection,
  annotations, modules
- Chapter 22 (all 6 files) — JVM memory, GC, performance
- Chapter 23 (l04, l05, assessment; l01-l03 pre-existed) — Security
- Chapter 24 (all 6 files) — Spring Boot, JPA
- Chapter 25 (l03-l05, assessment; l01-l02 pre-existed) — Distributed
  delivery and capstone

No lesson file anywhere in the 25-module curriculum is a stub anymore (I
scanned every module for files under 30 lines after finishing — none found).
`examples/javaCourse/manifest.json` already listed all 25 modules, so no
manifest changes were needed.

**What I could not do in this session:** `npm install` failed with a 403
from `registry.npmjs.org` (blocked by this environment's network policy),
so `npm run curriculum:package` (which rebuilds the root `javaCourse.learnpack`
archive), `npm run typecheck`, `npm test`, and `npm run build` never ran —
not once, on any chapter. Every prior "write chapter N" commit in this
repo's history included a rebuilt `.learnpack`; the nine commits from this
session do not. **First thing to do before anything else:** widen this
environment's network access (or run locally), then:

```
npm install
npm run curriculum:package
npm run check
```

and commit the resulting `.learnpack` plus fixes for anything `check` flags —
none of this session's markdown has been validated by the packaging
script's own checks (its "lesson file is empty" guard) or by typecheck/build.

Also: no Docker, database, message broker, or real JVM/Maven/Gradle toolchain
was available, so every code example, console-output block, and lab-solution
walkthrough below is reasoned from documented tool behavior, not executed.
Details on exactly what to verify are organized by chapter below.

## Newest round: a dedicated graded checkpoint + full build guide for every portfolio project

You asked two things after the last round: (1) whether the 18 supplementary
projects had any real "how do I actually build this" guidance, and (2) how
they could possibly be tested at all, given this is meant to be a fully
interactive, offline learning platform — not just a spec a learner reads and
self-grades in their head. Both are now addressed structurally, not just in
prose:

### 1. Every one of the 18 projects now has its own dedicated, automated checkpoint

Previously the 18 projects mostly pointed at the six pre-existing, generic
phase-project/capstone checkpoints (or, for the newest three added in that
round, weren't checkpointed at all in a project-specific way). That's fixed:
I designed, wrote, and inserted **18 new exercises of type `"project"`**,
one per portfolio project, each isolating that project's single hardest pure
reasoning problem as a deterministic, dependency-free, stdin/stdout Java
program (no framework, no network, no database — exactly what this sandbox
can actually run and grade). Each is spliced into the relevant module's
`*-assessment` lesson content JSON (not the project file itself), for
example:

| Project | Checkpoint id | What it actually tests |
|---|---|---|
| Library Management System | `library-management-checkpoint` | loan/return/availability ledger logic |
| Inventory / Stock Management | `stock-movement-checkpoint` | stock-movement accounting |
| Booking / Reservation Core | `resource-booking-checkpoint` | double-booking prevention |
| URL Shortener | `url-shortener-checkpoint` | collision-free code generation/lookup |
| Notes Web App | `notes-versioning-checkpoint` | note-revision history |
| Blog Backend | `blog-moderation-checkpoint` | post/comment moderation state |
| Auth & User Management | `credential-store-checkpoint` | real PBKDF2 salted hashing, register/login/change-password |
| Online Quiz Platform | `quiz-scoring-checkpoint` | idempotent scoring + duplicate-submission handling |
| Study Group Web App | `session-overlap-checkpoint` | `LocalDateTime`-based scheduling-conflict detection |
| Forum / Reddit-Style Backend | `forum-vote-checkpoint` | self-referential comment/vote aggregation |
| E-commerce Backend | `checkout-idempotency-checkpoint` | idempotent checkout, stock decrement |
| Project Management App | `role-gated-task-checkpoint` | per-team role-gated task transitions |
| Food Delivery Backend | `delivery-state-machine-checkpoint` | multi-actor (customer/restaurant/courier) order state machine |
| Real-Time Tic-Tac-Toe | `tic-tac-toe-checkpoint` | turn validation + win/draw detection |
| Connect Four / Battleship | `connect-four-checkpoint` | gravity-drop board + four-in-a-row detection |
| Real-Time Chat App | `chat-room-ledger-checkpoint` | room-scoped, globally-ordered message ledger |
| Multiplayer Game Platform | `matchmaking-checkpoint` | FIFO-fair matchmaking pairing + win/loss records |
| Capstone Deployment Exercise | `rollback-target-checkpoint` | rollback-target selection from a deployment history |

Each project's `checkpointExerciseIds` now points at its own checkpoint
instead of a reused generic one, and each checkpoint has public and hidden
tests, 1-2 hints, and sandbox limits (3s timeout, 256MB, 64KB output) well
inside the schema's hard caps.

**How I actually verified these (not just hand-traced them):** I discovered
partway through this round that a real JDK 21 (`java`/`javac`) *is* available
in this environment (I'd wrongly assumed otherwise earlier, having only
checked Docker/npm). I used it to write a real verification harness:
for each of the 18 checkpoints, compile its starter-file Java classes plus a
hand-written reference solution with `javac`, then run `java -cp <dir> Main`
piping in every test's exact `input` string and diffing the actual stdout
against the test's `expected` string — the same contract the real sandbox
enforces. **This caught two real bugs before they could ship:**
- `quiz-scoring-checkpoint`'s test 1 used an invalid answer letter (`X`) that
  my own validation rules would reject, producing `ERROR` instead of the
  intended `SCORE|3` — fixed by changing it to a valid-but-wrong letter.
- `tic-tac-toe-checkpoint`'s hidden test 4 had a transcription error (missing
  the leading `OK` for a `NEW` command) in my hand-traced `expected` string —
  fixed to match the actual correct sequence.

All 18 checkpoints, all their test cases, now pass against a real compiled
reference solution. **What I could not do:** run them through the actual
`packages/sandbox-docker` Docker execution path (no Docker daemon here) or
the real `packages/learnpack` schema/semantic validator (`npm install` still
blocked). I wrote a Python script replicating that validator's real rules
(id-pattern regex, global id-uniqueness across all 428 ids in the course,
the `PACK_PROJECT_CHECKPOINT_TYPE` rule that every `checkpointExerciseIds`
entry must reference an exercise whose `type` is exactly `"project"`,
starter-file extension checks, test-shape checks for output/project types,
and limits against the schema's hard caps) and ran it — zero errors across
all 25 modules and all 24 project files. Treat that as strong evidence, not
a substitute for actually running:
```
npm install
npm run curriculum:package
npm run check
```
and then importing the rebuilt `.learnpack` through the real desktop app to
confirm `packages/learnpack`'s own `importPack` reports zero errors, and that
compiling+running each checkpoint's starter files inside a real Docker
sandbox container produces the same pass/fail results my harness got outside
a container. Also worth adding, if practical: wiring these 18 reference
solutions into `packages/sandbox-docker`'s or the course's own CI as
permanent regression fixtures, so a future edit to a checkpoint's tests gets
re-verified automatically instead of relying on a one-off harness run in
this session.

### 2. Every project's `descriptionMarkdown` is now a full lesson-depth build guide

Previously each project's markdown was compact and spec-like (scope,
required evidence, one review scenario) — useful as a target definition, but
not something a learner could follow to actually build the thing, and it
didn't say anything about what is or isn't machine-graded. Every one of the
18 files now follows the same expanded structure:

- **Position in the curriculum** — when to build it relative to other projects.
- **What is graded, and what is external** — names the exact dedicated
  checkpoint, states plainly that passing it proves the isolated reasoning
  core is correct, and is explicit that the real HTTP/persistence/
  concurrency/WebSocket/security wiring around it is external, self-reviewed
  work the sandbox cannot run or grade (no network, no Docker socket, no
  ability to hold open a server or a real DB connection inside the graded
  exercise). For `auth-user-management`, this section goes further: the
  checkpoint's black-box tests can't detect *how* you hashed a password, so
  it explicitly states that real salted PBKDF2/bcrypt/Argon2 hashing is
  required and checked by source review, not just by the automated tests.
- **Beyond what the lessons taught** (on the four WebSocket-based projects,
  plus Auth) — states outright that Spring Security/JWT/WebSockets are not
  covered by the 25-chapter curriculum and must be learned via each
  framework's own official reference docs as deliberate self-directed
  research, rather than silently assuming knowledge the course never gave.
- **Architecture overview** — a small ASCII component diagram naming the
  real controller/service/entity classes the project needs.
- **Build it as vertical slices** — 5 concrete, ordered implementation steps,
  each one an independently testable increment, starting from "port your
  already-verified checkpoint logic into a real Spring bean."
- **Common pitfalls** — 4 specific, project-relevant mistakes (e.g., trusting
  a client-submitted score, comparing passwords as plaintext, broadcasting a
  corrupted board after rejecting an illegal move, checking availability
  outside the transaction that depends on it), each tied to a concrete
  consequence, not generic advice.
- **How to self-test what the checkpoint cannot reach** — 2-3 concrete manual
  or scripted verification steps a learner can actually run locally (curl a
  raw JSON payload and inspect it by eye, kill and restart the server between
  a send and a broadcast, replay an identical HTTP request and check for
  duplication) to gain real confidence in exactly the parts the sandbox
  cannot grade.
- **Required evidence** — a concrete checklist (specific tests, specific
  artifacts like a state-machine diagram or a rollback runbook) a learner
  should be able to produce and point to.
- **Review and completion** — one concrete end-to-end reviewer scenario tying
  the whole project together.

**What still needs your local judgment, not mine:** whether the specific
vertical-slice ordering, pitfalls, and self-test steps I picked for each
project actually match the depth and phrasing you want for learners at this
level — I wrote all of this from my own domain expertise (Spring/JPA/
WebSocket/security patterns), the same way the 25 chapters were written, not
from any external source or by running a real Spring Boot app in this
session. Skim a few of the harder ones (E-commerce Backend, Food Delivery
Backend, Multiplayer Game Platform, Auth & User Management) end to end and
tell me if the scope or voice needs adjusting anywhere.

I also updated `course.description` in `manifest.json`, which previously
(incorrectly, as of this round) said the 18 supplementary projects were
"ungraded practice... not additional automated checkpoints" — it now
correctly states that each has its own dedicated automated checkpoint.

All of this (18 checkpoint exercises spliced into 12 module content files,
all 18 project files rewritten, and the manifest description fix) is
committed and pushed to `claude/affectionate-edison-gx2g0s` in one commit:
`add dedicated graded checkpoints and lesson-depth guides for portfolio projects`.

## New in this round: extended portfolio project catalog

You asked for the 20 named projects (Library Management System through
Dockerized Full-Stack SaaS App) to be integrated into the curriculum, with
no duplicated projects. Here's exactly what changed and how to check it.

### What I did, and what I deliberately dropped

- **Dropped as duplicates** (not added as standalone files): *Personal
  Expense Tracker* — this is already the existing Phase 1 (`phase-1.json`)
  and Phase 3 (`phase-3.json`) ledger/reporting project, just under a
  different name. *Task Manager with PostgreSQL* — this is already Phase 4
  (`phase-4.json`) and the final capstone (`final-capstone.json`), both of
  which are a JDBC-backed task tracker. If you wanted these as their own
  separate, differently-named entries anyway (e.g., because you want the
  catalog to visually list all 20 names), say so and I'll add thin
  wrapper files that just point back at the existing checkpoints instead of
  writing new content that would genuinely duplicate the phase files.
- **Reframed**: *Dockerized Full-Stack SaaS App* (#20) became
  `capstone-deployment-exercise.json` — instead of inventing a 19th unique
  app domain (which would have overlapped the final capstone's own
  Docker/Postgres/deployment requirements), it asks the learner to
  containerize and deploy *whichever* earlier catalog project they already
  built. If you'd rather have a genuinely new, named SaaS-app domain
  (distinct from every other entry) built and dockerized from scratch,
  tell me and I'll write that as an additional 19th project instead of this
  reframing.
- **Added 18 new files** under `examples/javaCourse/projects/`, wired into
  `examples/javaCourse/manifest.json`'s `"projects"` array:
  - Three woven into the *existing* chapter progression, right after the
    phase that unlocks their skills: `library-management-system.json` (after
    ch10), `inventory-stock-system.json` (after ch15),
    `booking-reservation-core.json` (after ch20, pre-Spring — pure
    JDBC/transactions/concurrency, deliberately no REST layer yet).
  - Fifteen as a **post-course portfolio catalog**, meant to be built after
    finishing the whole curriculum including the final capstone:
    `url-shortener`, `notes-web-app`, `blog-backend`,
    `auth-user-management`, `online-quiz-platform`, `study-group-web-app`,
    `forum-reddit-backend`, `ecommerce-backend`, `project-management-app`,
    `food-delivery-backend`, `realtime-tic-tac-toe`,
    `connect-four-battleship`, `realtime-chat-app`,
    `multiplayer-game-platform`, `capstone-deployment-exercise`.

### Why the four real-time projects say "beyond what the lessons taught"

WebSockets are never covered anywhere in the 25-chapter curriculum (it
teaches request-response HTTP in Chapter 18 and in-process concurrency in
Chapter 17, but never a persistent bidirectional connection). The two
real-time games, the chat app, and the multiplayer platform all say this
explicitly in their `descriptionMarkdown` and point the learner at Spring's
own WebSocket documentation as required self-directed research, rather than
silently assuming knowledge the course never provided. If you'd rather I
first write actual WebSocket lesson content into the curriculum (a new
chapter or an added lesson) so these four projects have real supporting
material instead of a "go learn this yourself" pointer, that's a separate,
sizeable follow-up task — let me know if you want it.

### How to verify this batch specifically

1. **Schema/semantic validation** — I wrote and ran a script that replicates
   every check `packages/learnpack/src/index.ts` performs (id pattern,
   string-length limits, and — the one that actually matters here —
   that every `checkpointExerciseIds` entry references a real exercise of
   type `"project"`, since only six such exercises exist in the whole
   course: `m05/m10/m15/m20/m25-phase-project` and
   `java-developer-capstone`). All 24 project files (6 original + 18 new)
   passed. This was NOT run through the real `learnpack` package itself
   (npm install is blocked), so treat it as strong evidence, not a
   substitute for the real thing:
   ```
   npm install
   npm run curriculum:package    # also re-validates via the packaging script's own checks
   ```
   Then, once the desktop app can build (`npm run build`), import the
   rebuilt `javaCourse.learnpack` and confirm `packages/learnpack`'s own
   `importPack`/validation function reports zero errors for the manifest.
2. **UI spot-check** — In the running app, the projects render in a
   "MILESTONE PROJECTS" section in manifest-array order (see
   `apps/desktop/renderer/src/App.tsx` around line 910); the button on each
   card jumps to whichever of its `checkpointExerciseIds` isn't completed
   yet. Confirm all 24 project cards render (title + markdown description),
   and that clicking "Open next checkpoint" on a few of the new ones
   (e.g., `library-management-system`, `url-shortener`) correctly navigates
   to the chapter 10 / capstone lesson respectively.
3. **Content review** — Each new project file's `descriptionMarkdown` is my
   own design of scope, required evidence, and a reviewer scenario, written
   to match the terse, spec-like voice of the existing `phase-N.json`
   files — not pulled from any external source. Read through a few,
   especially the harder ones (E-commerce Backend, Food Delivery Backend,
   Multiplayer Game Platform), and tell me if the scope feels right for a
   learner who just finished this specific curriculum, or if any should be
   scaled up/down.
4. **Ordering/placement** — Open `examples/javaCourse/manifest.json`'s
   `"projects"` array and confirm the interspersing (phase-1, phase-2,
   library-management-system, phase-3, inventory-stock-system, phase-4,
   booking-reservation-core, phase-5, final-capstone, then the 15
   post-course ones) matches what you actually want learners to see, in
   that order, in the UI.

---

This session authored lesson content without a working Docker daemon or
registry egress, so no `mvn`, `gradle`, `docker`, database, or network
command shown in the lessons below was actually executed in this
environment. The content is written from documented, well-established
tool behavior, but exact console output (stack traces, warning text,
version-specific messages, line numbers) should be spot-checked against
a real run before treating it as gospel. This file tracks what to verify
locally, chapter by chapter.

## Environment limitation affecting every chapter

This session's network policy blocks `registry.npmjs.org` (npm install got a
403) and Docker registry pulls, and no Docker daemon is running. That means:

- `npm install` never completed, so `npm run curriculum:package`,
  `npm run typecheck`, `npm test`, and `npm run build` could not be run at all
  in this session — not even once, on any chapter.
- The root `javaCourse.learnpack` binary was **not regenerated** for any
  chapter written in this session. Every previous "write chapter N lesson
  markdown" commit included a rebuilt `.learnpack`; commits from this session
  will not, until you run `npm install && npm run curriculum:package` locally
  (or in a session with npm registry access) and commit the result.
- Recommended first step when you pick this up: `npm install`, then
  `npm run curriculum:package`, then `npm run check`, and commit the
  regenerated `.learnpack` (and fix anything `check` flags — none of these
  chapters' markdown has been validated by the packaging script's own checks,
  e.g. its "lesson file is empty" guard, or by typecheck/build).

## Chapter 16 — Build Automation, Dependencies, Git, and CI

- `m16-l01` (Maven): the `GreeterTest`/`Greeter` BUILD FAILURE transcript
  (Expected/Actual, `AssertionFailedError`, Surefire report path, plugin goal
  name) is written from documented Maven/Surefire output conventions, not a
  real run. Verify against an actual `./mvnw test` failure with a recent
  Maven/Surefire version (3.2.x) and JDK 21.
- Maven `dependency:tree` sample output (Spring/Jackson versions/graph shape)
  is illustrative, not from a real resolved project — fine as a teaching
  example, but don't treat the specific versions as a recommendation.
- `m16-l02` (Gradle): the UP-TO-DATE/FROM-CACHE console block and the
  `tasks.register`/`tasks.create` execution-vs-configuration timing claims
  should be confirmed against a real Gradle 8.7 run — I'm confident in the
  underlying model but the exact log wording can shift between Gradle
  versions.
- `m16-l03`: the sample OWASP Dependency-Check CVE block
  (`CVE-2019-12384`/jackson-databind 2.9.8) is a real, historical CVE used as
  a realistic illustration, not output from an actual scan run in this
  session. Worth running `dependency-check-maven` for real once npm/Maven
  network access is available, to show learners genuine tool output instead.
- `m16-l04` (Git): all conflict-marker and rebase examples are conceptually
  accurate but not captured from an actual `git merge`/`git rebase` session.
  Cheap to verify: run the exact example commands locally.
- `m16-l05` (CI): the GitHub Actions YAML uses `actions/checkout@v4` and
  `actions/setup-java@v4` with Temurin 21 — versions were current as of this
  writing but should be checked against whatever the repo's actual
  `.github/workflows/` already pins (see `packages/*` CI setup) so the lesson
  matches this project's real CI, not just a generic example.
- The `m16-debug-lab` fix (exit-code check) and `m16-coding-lab` (`artifact`)
  solutions were reasoned through by hand against the JSON's test cases, not
  executed — worth a quick real run once `npm install`/JDK tooling works in
  this environment.

## Chapter 17 — Concurrency and Asynchronous Programming (l04, l05, assessment only; l01-l03 pre-existed)

- `m17-l04`: all `CompletableFuture` console output (sums, timing, exception
  class names, `CompletionException`/`ExecutionException` unwrapping) is
  reasoned from the documented API contract, not executed. Worth compiling
  and running each snippet on JDK 21 to confirm exact printed text
  (especially the `handle`/`exceptionally` cause formatting, which depends on
  `Throwable.toString()`).
- `m17-l05`: the virtual-thread pinning example is conceptually accurate for
  JDK 21 (pinning on `synchronized` was still present at 21; later JDKs may
  reduce or remove it via JEP 491) — worth a footnote check against whatever
  JDK version this course ultimately targets, and worth running the pinning
  demo with `-Djdk.tracePinnedThreads=full` to show real diagnostic output
  instead of just narrating the effect.
- `m17-coding-lab` (`parallelSum`) and `m17-debug-lab` (restore interruption)
  solutions were reasoned through by hand against the JSON's test cases, not
  compiled or executed.

## Chapter 18 — Networking, HTTP, and JSON Boundaries (all 6 files new)

- `m18-l01`: `DataInputStream.readInt/readFully` behavior and the sample
  client/server code are correct per the JDK spec but not compiled/run in
  this session. Worth compiling and running the length-prefixed
  send/receive example over an actual loopback socket.
- `m18-l03`: confirm on a real JDK 21 that `HttpConnectTimeoutException`/
  `HttpTimeoutException` class names and hierarchy match what's described
  (they do per the `java.net.http` spec, but this was not run against a real
  endpoint). The Jackson-based JSON examples assume `jackson-databind` is on
  the classpath, consistent with `m18-l04`.
- `m18-l04`: Jackson's exact class names (`StreamReadConstraints`,
  `JsonMapper.builder()...streamReadConstraints(...)`) are correct for
  recent Jackson 2.15+ but worth confirming against whatever Jackson version
  this course ultimately pins in a real `pom.xml`/`build.gradle` example
  project, since older Jackson versions lack `StreamReadConstraints`.
- `m18-l05`: the circuit breaker and bulkhead code are illustrative,
  hand-built minimal implementations for teaching, not based on (or claiming
  to be) a production library like Resilience4j — worth a note in a future
  revision pointing learners to a real library for production use, if that
  fits the course's scope.
- `m18-coding-lab` (`retryDelay`) and `m18-debug-lab` (status classification)
  solutions were reasoned through by hand against the JSON's test cases, not
  compiled or executed. `retryDelay`'s overflow-avoidance reasoning
  (clamping the attempt before shifting) should be verified with the
  `Integer.MAX_VALUE` hidden test case on a real JVM.

## Chapter 19 — Relational Databases, SQL, and JDBC (all 6 files new)

- No real database (Postgres, H2, etc.) was available in this session, so
  every SQL example, every sample result table, and every `EXPLAIN` plan
  output block (`m19-l02`) is illustrative/hand-constructed, not run against
  a real engine. High priority to actually run these against Postgres (or
  H2 for a lightweight in-course example) once tooling is available —
  especially the `LEFT JOIN` ON-vs-WHERE examples and the `EXPLAIN` Seq
  Scan/Index Scan output, whose exact formatting is Postgres-specific and
  worth double-checking against whatever engine this course's JDBC labs
  ultimately target.
- `m19-l04`: the HikariCP configuration snippet uses illustrative method
  names consistent with recent HikariCP versions but wasn't compiled against
  the actual dependency.
- `m19-l05`: deadlock error detection (`isDeadlockError`) is described
  generically ("a database-specific deadlock error") since the exact
  SQLState/exception class differs by database vendor (e.g., PostgreSQL's
  `40P01` vs. MySQL's deadlock error code) — worth making this concrete for
  whatever database this course's JDBC exercises actually connect to.
- `m19-coding-lab` (`placeholders`) and `m19-debug-lab` (`IS NULL` fix)
  solutions were reasoned through by hand against the JSON's test cases, not
  compiled or executed.

## Chapter 20 — Architecture, SOLID, and Design Patterns (l03-l05, assessment; l01-l02 pre-existed)

- All code examples (hexagonal ports/adapters, Factory/Builder/Adapter/
  Decorator/Proxy, Strategy/Command/State/Template Method/Observer) are
  hand-written and reasoned through, not compiled. Worth compiling the
  full set as a standalone sample project — several files reference sibling
  types (`Task`, `TaskId`, `AccountId`, `Record`) that were left as
  illustrative/undefined for brevity and would need stub definitions to
  actually compile.
- `m20-phase-project` (`EventLedger.run`): this is the most algorithmically
  involved lab in the module (parsing, dedup, conflict detection, overflow
  guarding). The assessment's walkthrough was reasoned through by hand
  against all 6 test cases in the JSON, including the subtle ones (case 5's
  overflow-after-first-success, case 6's `01` vs `1` numeric-equality
  requiring dedup as `long`, not string, comparison). This one most needs a
  real compile-and-run against the JSON's hidden tests before being treated
  as verified — it's exactly the kind of multi-branch logic most likely to
  have an off-by-one or ordering bug that reasoning alone can miss.
- `m20-coding-lab` (`discount`) and `m20-debug-lab` (strategy routing)
  solutions were reasoned through by hand, not compiled or executed.

## Chapter 21 — Reflection, Annotations, Modules, and Metaprogramming (l02-l05, assessment; l01 pre-existed)

- All reflection/annotation/class-loader/JPMS code examples are hand-written
  and reasoned through against documented JDK behavior, not compiled or run.
  Particularly worth compiling and running for real: the `MethodHandle`
  example (`invokeExact` static-type strictness is easy to get subtly wrong
  by hand), and the JPMS two-module `exports`/`opens` example (actually
  requires a real multi-module build to demonstrate the
  `InaccessibleObjectException` it claims).
- `m21-l04`: the exact `ClassCastException` message format shown
  (`"...is in unnamed module of loader 'app'; ...is in unnamed module of
  loader..."`) reflects modern JDK (9+) wording but should be spot-checked
  against the actual JDK 21 message text, which has changed slightly across
  versions.
- `m21-coding-lab` (`componentNames` via `getRecordComponents`) and
  `m21-debug-lab` (`int.class` vs `Integer.class` fix) solutions were
  reasoned through by hand against the JSON's test cases, not compiled or
  executed. The `componentNames` reasoning (case-sensitivity, empty-selector
  fallthrough) should be double-checked against a real `Class.
  getRecordComponents()` call once a JDK is available.

## Chapter 22 — JVM Memory, Garbage Collection, and Performance (all 6 files new)

- No JVM profiling tools (JFR, `jstack`, GC logging, a real collector) were
  run in this session — every GC log excerpt, flame-graph sketch, thread
  dump excerpt, and JFR command shown is illustrative, written from
  documented JDK behavior, not captured from a real run. High priority to
  regenerate the GC log line (`m22-l02`), the `jstack` thread-dump excerpt
  (`m22-l04`), and a real JFR recording's `jfr print` output on JDK 21 once
  tooling is available, since exact formatting/field names can shift
  slightly between JDK versions.
- `m22-l01`: `-XX:MaxRAMPercentage` default behavior and container-awareness
  claims are correct for JDK 10+ but worth a footnote citing the exact JDK
  version this course targets (stated elsewhere as Java 21, which is fine).
- `m22-l05`: the `LinkedHashMap` access-order/`removeEldestEntry` mechanics
  are correct per the JDK API contract but were not compiled/run — worth
  verifying the `BoundedLruCache` example and its constructor arguments
  compile and behave as described.
- `m22-coding-lab` (`cacheHits`) and `m22-debug-lab` (eviction boundary fix)
  solutions were reasoned through by hand against the JSON's test cases,
  including the more involved trace (`["a","b","a","c","a","b"], 2` → `2`
  hits) — this is exactly the kind of stateful, multi-step simulation most
  worth actually compiling and running against all 5 test cases before
  treating the reasoning as verified. (I hand-traced this and case 5 myself
  during writing and both matched the expected outputs, but that's still
  hand-tracing, not a compiler.)

## Chapter 23 — Secure and Robust Java Development (l04, l05, assessment; l01-l03 pre-existed)

- No real load-testing, dependency-scanner (OWASP Dependency-Check), or SBOM
  tooling was run in this session. `m23-l04`'s `ThreadPoolExecutor`/
  `AsyncContext` examples and `m23-l05`'s CycloneDX SBOM JSON snippet are
  illustrative and API-accurate per documentation but not compiled or
  generated by a real tool.
- `m23-l04`: the `AsyncContext`/`AsyncListener` example is Jakarta
  Servlet-API-shaped; worth confirming it matches whichever server/framework
  this course's actual project labs use (if any concrete framework is
  targeted elsewhere in the curriculum) rather than staying purely
  illustrative.
- `m23-coding-lab` (`redact`) and `m23-debug-lab` (fully-mask short secrets)
  solutions were reasoned through by hand against the JSON's test cases
  (including the `"1234"` exactly-four-chars boundary), not compiled or
  executed.

## Chapter 24 — Spring Boot and JPA Foundations (all 6 files new)

- No Spring Boot application, Maven/Gradle build with Spring dependencies,
  or real database was available in this session — every Spring
  annotation's behavior (`@Conditional...`, `@Transactional` proxy
  mechanics, `@Valid`/`MethodArgumentNotValidException`, JPA dirty
  checking/`@Version`/N+1) is described from well-documented, stable
  Spring/Hibernate framework behavior, but none of the code samples were
  compiled or run against a real Spring context. This is the single highest
  priority chapter to validate with a real `spring-boot-starter-web` +
  `spring-boot-starter-data-jpa` sample project, since Spring's exact
  generated exception types, proxy self-invocation behavior, and Hibernate's
  exact SQL generation are the kind of framework specifics best confirmed
  against a real, current (Spring Boot 3.x / Jakarta namespace, matching
  Java 21) dependency set rather than reasoned from documentation alone.
- `m24-l04`'s self-injection workaround (`@Autowired private OrderService
  self;`) is a real, documented Spring pattern but has known rough edges
  (a bean depending on itself can trigger circular-dependency warnings in
  recent Spring Boot versions requiring explicit opt-in); worth verifying
  against the specific Spring Boot version this course would target and
  presenting the "separate beans" fix as primary if self-injection proves
  awkward in practice.
- `m24-coding-lab` (`httpStatus`) and `m24-debug-lab` (add `AND version = ?`
  to the UPDATE) solutions were reasoned through by hand against the JSON's
  test cases, not compiled or executed.

## Chapter 25 — Distributed Delivery and Professional Capstone (l03-l05, assessment; l01-l02 pre-existed)

- No message broker, container orchestrator, or real deployment was
  available in this session — every outbox/saga, Dockerfile,
  probe/health-check, and SLO/deployment-strategy example in `m25-l03`
  (and the pre-existing `m25-l01`/`m25-l02`) is illustrative, reasoned from
  documented practice, not run against real infrastructure. This is a
  reasonable limitation for teaching material at this level, but worth
  flagging: the capstone's own external portfolio project (per
  `projects/final-capstone.json`) is exactly where a learner should validate
  this material against real Docker/Kubernetes/a real broker, not this
  chapter's theory lessons.
- `m25-coding-lab` (`readiness`) and `m25-debug-lab` (add `!shuttingDown`)
  solutions were reasoned through by hand against the JSON's test cases, not
  compiled or executed.
- `m25-phase-project` (`SecureImport.run`) and the final
  `java-developer-capstone` (`TaskService.run`) are both substantial,
  multi-branch stateful simulations (parsing, validation, capacity/dedup
  logic, exact output formatting). I hand-traced every test case for both
  (including the subtler ones — `SecureImport` case 6's "rejected record
  doesn't retain its ID" behavior, and `TaskService` case 4's "duplicate ADD
  leaves original state untouched" and case 6's field-count validation for
  `DONE|7|extra`) and my reasoning matched every expected output. That said,
  these are exactly the kind of implementations most valuable to actually
  compile and run against all hidden test cases before treating them as
  verified — multi-branch state machines like these are precisely where a
  subtle off-by-one or ordering bug is easiest to introduce and hardest to
  catch by re-reading alone.
- General note for this whole session: none of the 6 chapters' `m*-coding-lab`
  or `m*-debug-lab` reference solutions were actually compiled against a JDK
  (npm/Maven/JDK tooling unavailable — see the top-of-file environment
  note). None of these are shipped as "solution files" in the repo (the labs
  only ship starter code + hidden tests), so this doesn't block anything
  structurally, but if this course's own CI or a future session adds
  reference-solution verification, start there.

