# Contributing

Read `CLAUDE.md` and `docs/architecture/decisions.md` before changing architecture. Read `docs/learnpack-authoring.md` before adding or changing a course topic.

For every change:

1. Keep renderer, adapter, provider, and persistence responsibilities separate.
2. Add runtime validation at every untrusted boundary.
3. Add or update tests, including Docker integration tests for execution changes.
4. Run `npm run check` and `npm audit`.
5. Use a focused, imperative commit message.

Run Docker integration tests with:

```powershell
$env:RUN_DOCKER_TESTS='1'
npx vitest run packages/sandbox-docker/src/docker.integration.test.ts
```

Do not submit generated output, packaged `.learnpack`/`.zip` course archives, local databases, runtime caches, learner data, secrets, or unsigned third-party runtime definitions. Release workflows generate course archives from the reviewed source under `examples/`.
