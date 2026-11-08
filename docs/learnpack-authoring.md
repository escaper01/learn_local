# LearnPack authoring

LearnPack courses are authored directly as repository files. The full Java curriculum under `examples/javaCourse/` is the reference implementation; the smaller `learnpack-spec/examples/java-foundations/` course is a compact format example.

## Add a topic with a coding agent

Give Codex, Claude, or another coding agent access to the repository and describe the topic, intended depth, and any project goals. Ask it to inspect the existing curriculum before editing. The agent should:

1. Read `examples/javaCourse/manifest.json` and the neighboring modules, lessons, assessments, and projects that best match the new topic.
2. Read the schemas under `packages/learnpack/schema/` and preserve the established LearnPack 1.0 shapes.
3. Add the topic to an existing module when it fits the current progression, or create a new module when it needs a substantial chapter of its own.
4. Teach the material in focused Markdown lessons before adding concept checks, coding labs, debugging work, or project checkpoints.
5. Use globally unique, stable, lowercase kebab-case IDs for modules, lessons, exercises, tests, and projects.
6. Update every manifest or project reference, bump the course version, and validate all JSON and referenced Markdown files.

A useful request is:

> Inspect this repository's Java curriculum and LearnPack schemas. Add a production-quality chapter about [topic], matching the depth, structure, exercise quality, IDs, tests, hints, and Markdown style of adjacent chapters. Update all references and the course version, then run the relevant validation and tests.

Do not ask the agent to generate disconnected JSON in chat. It should edit and verify the repository files directly.

## Course structure

```text
my-course/
  manifest.json
  content/
    module-01.json
    module-02.json
  lessons/
    module-01/
      lesson-01.md
  projects/
    final-project.json
```

`manifest.json` declares course metadata and ordered module and project paths. A module contains ordered lessons. Each lesson contains either inline `theoryMarkdown` or a `theoryFile` path plus an `exercises` array. The full Java curriculum uses external Markdown files because they are easier to write and review.

Reading lessons may have an empty `exercises` array. Assessments should follow the theory they test and may use `multipleChoice`, `function`, `debug`, `output`, or `project` exercises. Project files point to existing exercises of type `project` through `checkpointExerciseIds`.

Electronics and other physical subjects may also use `calculation`, `shortAnswer`, `schematic`, `simulation`, `lab`, `firmware`, `designReview`, and `troubleshooting`. These guided exercise types require `solutionMarkdown` and a non-empty `checklist`. The learner completes the work, reveals the worked solution and expected evidence, checks each completion item, and then records completion. A `project` may use the same guided shape when physical work cannot be safely auto-graded.

## Offline images and diagrams

Store course visuals under `assets/` and reference them with standard Markdown image syntax:

```markdown
![RC charging curve](assets/diagrams/rc-charge.svg "Voltage reaches 63.2% after one time constant")
```

LearnLocal accepts SVG, PNG, JPEG, and WebP assets. It validates paths, sizes, file signatures, references, and SVG active content before import, then stores the assets inside the local course snapshot. Remote images, scripts, event handlers, external SVG references, and paths outside `assets/` are rejected. Always provide meaningful alt text and a caption when the interpretation is not obvious.

## Import the course

In LearnLocal, select **Import course** and choose the folder containing `manifest.json`. The app walks the folder, rejects symlinks and unsafe paths, validates the complete course, and stores a local snapshot.

After changing source files, bump the semantic version in `manifest.json` and import the folder again. LearnLocal does not watch the source directory for changes.

Any valid language can be imported for reading, quizzes, hints, completion tracking, and projects. Java currently has a trusted local execution adapter. Other languages remain in study mode until a reviewed adapter is available.

## Content requirements

A course should teach before it tests. Divide a chapter into narrowly focused lessons with motivation, explanations, worked examples, tradeoffs, common mistakes, guided practice, and recaps. Make every exercise assess a contract taught by the preceding lessons.

Long lessons should use `theoryFile`, for example:

```json
{
  "id": "m01-l01-first-program",
  "title": "Your first program",
  "theoryFile": "lessons/module-01/m01-l01-first-program.md",
  "exercises": []
}
```

A lesson uses `theoryFile` or `theoryMarkdown`, never both. Supported Markdown includes headings, paragraphs, emphasis, inline and fenced code, lists, tables, callouts, and horizontal rules. HTML, images, and links are displayed as plain text.

If import fails, use the reported file, JSON path, and validation message to repair the original curriculum files, then import the folder again.
