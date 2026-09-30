# LearnPack authoring

LearnLocal's prompt generator asks an AI assistant to produce every required JSON file in one response. You save `manifest.json` first, let LearnLocal create its referenced file paths, paste the remaining JSON blocks into those files, and package them yourself.

## Generate the JSON files

1. Open **Generate prompt** in LearnLocal. Enter any programming language and describe what you want to learn or build in one combined request. You may include topics, exclusions, experience, or project ideas when they matter; the AI infers the identifier, version, extension, runtime requirements, level, duration, teaching progression, and projects. Then copy the generated prompt.
2. Paste it into your AI assistant. Its response should begin with `manifest.json`, then contain every referenced module and project as a separate labeled JSON block.
3. Save the JSON as `manifest.json` in a new empty course folder. Do not copy the `SAVE AS:` line or Markdown code fences into the file. This folder — not an archive — is what you import.
4. In LearnLocal's prompt generator, select **Create files from manifest** and choose the saved manifest. During development the file picker opens in `learnpack-spec/examples`; otherwise it opens in Documents. LearnLocal creates every referenced path and preserves any file that already exists.
5. Paste each remaining JSON block into the matching file, such as `content/module-01.json` or `projects/final-project.json`. Check that every manifest reference is filled before packaging.

Your folder should resemble:

```text
my-course/
  manifest.json
  content/
    module-01.json
    module-02.json
  projects/
    final-project.json
```

## Import the course

Import the course folder directly from **My courses > Import course** — pick `manifest.json`'s parent folder in the dialog. There is no archive step: a zip renamed to a custom extension isn't a meaningful trust boundary, so LearnLocal reads the folder in place, walking it (rejecting symlinks and paths that escape the folder) and validating paths, schema, language metadata, exercises, and tests before installing it.

Keep the folder as-is under version control or on a USB drive; that folder is the distributable unit. A packaged `.learnpack` zip can still be built for distribution or backup with `npm run curriculum:package` from the repository root, but it is not required to import.

Any valid language can be imported and studied through the merged course view. Java currently has a trusted local execution adapter. Other languages open in study mode: lessons, quizzes, hints, completion state, starter code, and projects remain available, while Run and Submit stay disabled until LearnLocal ships a trusted adapter for that language. The descriptive `runtime.containerRequirements` field does not authorize a course to choose an image or execute installation commands.

## Curriculum depth

A course should teach before it tests. Divide each chapter into multiple narrowly focused reading lessons with detailed explanations, worked examples, tradeoffs, common mistakes, and recaps. A reading lesson may have an empty `exercises` array. Place questions, coding tasks, debugging work, or project checkpoints after the related theory sequence, and make each task assess a contract that the preceding lessons actually taught. The comprehensive Java course under `examples/javaCourse/` demonstrates this structure.

Long lessons are easier to write and review as Markdown files. Replace a lesson's `theoryMarkdown` with `"theoryFile": "lessons/module-01/first-program.md"` and save the text at that path inside the course folder. A lesson uses one field or the other, never both. Supported Markdown: `#` to `####` headings, paragraphs, `**bold**`, `*italic*`, inline code, fenced code blocks, `-` and `1.` lists (one line per item), pipe tables, `> **Note:**`/`> **Tip:**`/`> **Warning:**` callouts, and `---` rules. HTML, images, and links are shown as plain text.

If the import fails, correct the named JSON file or path and import the folder again.
