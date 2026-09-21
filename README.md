# LearnLocal

LearnLocal is an offline-first desktop learning environment for portable programming courses. It imports validated LearnPack 1.0 archives, teaches in a Monaco-based workspace, runs Java and Python code in restricted disposable Docker containers, and stores learning data locally without an account.

## What works

- Secure Electron boundary with typed IPC, CSP, navigation guards, and no renderer access to Node or Docker.
- Persistent dark and light themes.
- Java 21 and Python 3.13 runtime installation, smoke testing, inventory, repair, and removal.
- Function, debugging, output, project-checkpoint, and multiple-choice exercise flows.
- Public tests for Run, hidden tests for Submit, custom trusted entrypoints, cancellation, bounded resources, and normalized diagnostics.
- LearnPack archive/schema/semantic validation, immutable course versions, progressive hints, and persisted course progress.
- Local SQLite attempts, workspaces, settings, backups, activity, and streaks.
- Course prompt generation, settings import/export, diagnostics export, desktop packaging, and GitHub CI.

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

The repository also includes a canonical importable course at `learnpack-spec/examples/java-foundations.learnpack`.
