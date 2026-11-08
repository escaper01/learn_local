# Curriculum agent guidance

When asked to add or change a learning topic, edit the repository curriculum directly. Do not recreate an in-app curriculum-generation workflow.

Before editing curriculum:

- Read `docs/learnpack-authoring.md` completely.
- Inspect `examples/javaCourse/manifest.json` and the adjacent modules, Markdown lessons, assessments, and projects most similar to the requested topic.
- Read the relevant schemas in `packages/learnpack/schema/`.

Match the existing curriculum's depth and progression. Teach concepts before assessing them, preserve stable IDs, use new globally unique kebab-case IDs, update all references, bump the semantic course version, and run the relevant validation/tests. `examples/javaCourse/` is the source of truth; generated archives are outputs, not authoring inputs.
