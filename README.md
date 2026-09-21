# LearnLocal

LearnLocal is an offline-first desktop learning environment for portable programming courses. This repository currently contains the first vertical slice described in `LearnLocal-Full-Project-Plan.md`.

## Prerequisites

- Node.js 22+
- Docker Desktop or Docker Engine

## Development

```bash
npm install
npm run dev
```

The prototype opens a Java exercise in Monaco with persistent light and dark themes. **Run** executes public tests, while **Submit** also executes a hidden test. Each compile and test run uses a restricted, disposable Docker container built from a pinned Java 21 image. Attempts are stored locally in SQLite.

## Checks

```bash
npm run check
```

The first Docker execution may take longer while the pinned Java image is downloaded.
