# LearnLocal Engineering Guide

This file is the project-wide guide for AI coding assistants and human contributors. Read `LearnLocal-Full-Project-Plan.md` before making architectural changes. The plan is the product source of truth; this guide turns its decisions into day-to-day engineering rules.

## Product intent

LearnLocal is an offline-first Electron application for importing portable programming courses, learning in a Monaco-based workspace, running learner code in disposable containers, and tracking progress locally. It is provider-independent and requires no account.

The first release targets Java 21 and Python 3.x. Do not add language-specific behavior to the UI when it belongs in an adapter.

## Repository map

```text
apps/desktop/electron/   Trusted Electron main process and narrow preload bridge
apps/desktop/renderer/   Untrusted React renderer and Monaco learning UI
packages/contracts/      IPC schemas, public types, error contracts
packages/database/       SQLite migrations and repositories
packages/runner-core/    Provider/adapter interfaces and immutable policy
packages/runner-java/    Trusted Java workspace and harness generation
packages/runner-python/  Trusted Python workspace and harness generation
packages/sandbox-docker/ Docker lifecycle and process isolation
packages/learnpack/      LearnPack schemas, archive validation, and course views
packages/prompt-generator/ Provider-independent course-authoring prompts
packages/settings-core/  Setting definitions, validation, and precedence
```

Future packages should follow the structure in the full project plan instead of accumulating unrelated code in the desktop app.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run check
```

The Docker integration test is opt-in because it requires a running engine:

```powershell
$env:RUN_DOCKER_TESTS='1'
npx vitest run packages/sandbox-docker/src/docker.integration.test.ts
```

Run `npm run check` before committing. Run the Docker integration test after changing an adapter, sandbox policy, process lifecycle, harness, or result parser.

## Non-negotiable security boundaries

- Treat the renderer, imported course data, learner source, Markdown, assets, filenames, and compiler output as untrusted.
- Never expose Node.js, raw Electron IPC, Docker, filesystem paths, shell access, image names, mounts, capabilities, devices, or container flags to the renderer.
- Keep `nodeIntegration: false`, `contextIsolation: true`, renderer sandboxing, CSP, navigation guards, and strict sender validation enabled.
- Validate every privileged IPC payload at runtime with a strict schema. Types alone are insufficient.
- Course packs declare intent and test data only. They must never contain commands, image names, package-manager commands, host paths, or Docker options.
- Commands are an executable plus an argument array. Never interpolate learner or course content into `sh -c`, `cmd /c`, PowerShell, or another shell string.
- Sandbox containers have no network, no privileges, no added capabilities, no Docker socket, a read-only root filesystem, a non-root user, bounded memory/CPU/PIDs/output, and a hard timeout.
- Create fresh containers for attempts. Cleanup must run in `finally`, and startup reconciliation may only remove resources carrying exact LearnLocal ownership labels.
- Runtime image references are application-approved and digest-pinned for releases.
- Hidden tests must not be sent to the renderer or copied to a learner-visible persistent workspace.
- Settings and LearnPacks may never weaken mandatory Electron or sandbox policy.

If a requested feature conflicts with these rules, stop and redesign the boundary rather than adding a bypass.

## Architecture conventions

- Keep shared request/response types and Zod schemas in `@learnlocal/contracts`.
- Assign execution IDs in the trusted main process.
- Keep adapters responsible for language-specific validation, workspace generation, commands, diagnostics, and result normalization.
- Keep providers responsible for engine detection, runtime/container lifecycle, limits, cancellation, and cleanup.
- The renderer consumes normalized results and must not parse compiler- or Docker-specific output.
- Store structured application data in versioned SQLite migrations. Do not use an opaque, unversioned JSON blob for durable settings or progress.
- Keep imported course versions immutable and reference content by stable IDs.
- Preserve courses, learner work, and progress when removing a runtime unless the user explicitly requests data removal.
- Standard execution opens no TCP port. Any future preview port must bind to loopback and be selected by trusted application policy.

## TypeScript and React practices

- Keep strict TypeScript enabled. Avoid `any`; narrow `unknown` at system boundaries.
- Prefer small, explicit interfaces and discriminated unions for state transitions and results.
- Use runtime validation at IPC, file import, database migration, and external process boundaries.
- Keep side effects out of React rendering. Unsubscribe from IPC listeners in effect cleanup.
- Provide useful loading, empty, error, cancellation, and recovery states.
- Preserve keyboard accessibility, visible focus, semantic controls, and sufficient contrast.
- Do not fetch editor assets, fonts, scripts, course content, or telemetry from the network at runtime.

## Filesystem, archives, and persistence

- Resolve and validate canonical paths before extraction or writing.
- Reject absolute paths, traversal, symlinks, oversized entries, excessive entry counts, and unsupported file types in LearnPacks.
- Use dedicated temporary execution directories and remove them in `finally`.
- Never recursively delete a computed path without proving it is inside the expected application-owned directory.
- Use transactions for multi-row persistence and migrations. Back up the database before destructive migrations.

## Testing expectations

- Unit-test request validation, path handling, adapters, comparison modes, parsing, settings precedence, and progress calculations.
- Every adapter must eventually pass the same conformance suite: success, compile error, runtime error, timeout, memory/output limits, Unicode, hidden tests, cancellation, and cleanup.
- Add regression tests with every bug fix when practical.
- Tests must verify that secret hidden-test values and Docker implementation details do not leak into renderer responses.
- A successful production build is part of the definition of done.

## Dependency and release hygiene

- Prefer maintained dependencies with a clear need. Check `npm audit` after dependency changes.
- Never apply a forced major upgrade merely to silence an audit; inspect compatibility and the advisory first.
- Commit the lockfile with dependency changes.
- Do not use floating container tags for a release. Record and verify the approved digest and supported architectures.
- Do not commit generated `out/`, coverage, local databases, logs, secrets, runtime caches, or learner data.

## Git workflow

- Keep commits focused by coherent batch and use short imperative messages, for example `build desktop foundation` or `add learnpack validator`.
- Run the relevant checks before each commit.
- Push each completed batch to the configured GitHub remote.
- Never rewrite or discard unrelated user changes.
- Do not force-push, amend published commits, or run destructive Git commands unless explicitly requested.
- Branch names should use the `codex/` prefix when a new branch is needed.

## Current implementation boundary

The repository now implements the V1 product surface: secure Electron shell, onboarding, light/dark React and Monaco workspace, multi-file Java/Python adapters, typed function harnesses, restricted Docker execution, runtime install/verify/update/repair/removal and learning-data management, LearnPack 1.0 import/revalidation/repair, strict project milestones, function/debug/output/project/quiz flows, public versus hidden tests, progressive hints, safe Markdown, cancellation and execution phases, versioned SQLite settings/workspaces/attempts/progress, scoped settings, confidence dashboard, complete-course prompt generation with manifest scaffolding, local prompt templates/history, diagnostics, cross-platform packaging, and CI.

Remaining release infrastructure is intentionally external: production update hosting plus Windows and Apple signing/notarization credentials. Continue platform E2E, accessibility, and adversarial archive coverage as the product evolves. Do not bypass security boundaries with renderer commands or course-provided scripts.
