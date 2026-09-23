# LearnLocal

LearnLocal is an offline-first desktop learning environment for portable programming courses. It imports validated LearnPack 1.0 archives for any programming language, teaches through a visual learning path and Monaco workspace, runs supported Java and Python code in restricted disposable Docker containers, and stores learning data locally without an account.

## What works

- Secure Electron boundary with typed IPC, CSP, navigation guards, and no renderer access to Node or Docker.
- Persistent dark and light themes.
- Dedicated chapter-and-lesson curriculum navigation, a focused lesson/editor workspace, and a hoverable task-completion grid.
- Any-language course authoring and import; languages without a trusted execution adapter remain fully usable in study mode.
- Java 21 and Python 3.13 runtime installation, verification, approved-image updates, repair, inventory, scoped cleanup, and installation-specific Docker ownership.
- Typed function, debugging, output, multi-file project-checkpoint, and multiple-choice exercise flows.
- Public tests for Run, hidden tests for Submit, custom trusted entrypoints, cancellation, bounded resources, and normalized diagnostics.
- LearnPack archive/schema/semantic/project validation, repair prompts, immutable course versions, safe Markdown, progressive hints, and persisted course progress.
- Local SQLite attempts, multi-file workspaces, scoped settings, versioned migrations, recovery backups, activity, streaks, and confidence scores.
- First-run onboarding, complete-course prompting with manifest scaffolding, local prompt templates/history, diagnostics export, desktop packaging, and cross-platform GitHub CI.

## Prerequisites

- Node.js 22+
- Docker Desktop or Docker Engine

## Development

```bash
npm install
npm run dev
```

**Run** executes public tests, while **Submit** also executes hidden tests. Each compile and test run uses a restricted, disposable container built from an approved digest-pinned image. The normal execution path opens no TCP port.

## Checks

```bash
npm run check
```

The first Docker execution may take longer while the pinned Java image is downloaded.

Run the real-container conformance suite after runner or sandbox changes:

```powershell
$env:RUN_DOCKER_TESTS='1'
npx vitest run packages/sandbox-docker/src/docker.integration.test.ts
```

## Packaging

```bash
npm run pack   # unpacked application for local validation
npm run dist   # platform installer
```

Installer output is written to `release/`. The manual packaging workflow builds Windows, macOS, and Linux artifacts. Public trusted releases still require repository-owner signing credentials and an update distribution endpoint.

The repository includes a small canonical import fixture at `learnpack-spec/examples/java-foundations.learnpack` and a full Java 21 developer academy under `examples/`. The academy contains 25 chapters, 152 sequential lessons, 208 knowledge checks and executable labs, five cumulative portfolio phases, and a production-minded capstone. It progresses from first compilation through the JVM, language fundamentals, algorithms, object design, testing, builds, concurrency, networking, SQL/JDBC, architecture, security, Spring/JPA, distributed systems, and operations.

Every file under `examples/content/` and `examples/projects/` is independently authored curriculum and is the source of truth. There is no curriculum-content generator. The pack distinguishes runnable standard-library exercises from external database/framework/deployment work and reviewer-assessed portfolio requirements. Checkpoints test behavior; they do not certify professional mastery.

Package the reviewed files using the PowerShell commands in `NOTES`, from `examples/`:

```powershell
Compress-Archive -Path manifest.json,content,projects -DestinationPath ..\my-course.zip
Move-Item ..\my-course.zip ..\my-course.learnpack
```

The resulting `my-course.learnpack` is validated against the current JSON by the LearnPack tests. `npm run curriculum:package` is an alternative archive-only helper; it never changes lesson content. `node scripts/verify-java-curriculum.mjs` checks instructor reference solutions for all function labs, debug repairs, and project cases in the locally available Java 21 Docker image. Instructor fixtures are excluded from the pack. This verifies those cases, not every illustrative snippet or external framework integration.

To author a course with any AI assistant, use LearnLocal's prompt generator and follow the [LearnPack authoring guide](docs/learnpack-authoring.md). Choose the programming language and describe what you want to learn or build; the AI infers the remaining course and runtime metadata. It produces all separately labeled JSON files in one response. Save the manifest, let LearnLocal scaffold its referenced paths, paste each JSON block, and package the files into the `.learnpack` archive yourself.
