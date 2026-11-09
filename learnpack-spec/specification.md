# LearnPack 1.0

A LearnPack is a directory of declarative learning content rooted at `manifest.json`. A manifest may describe runtime/toolchain requirements, but commands, executable container configuration, image names, host paths, package-manager operations, and executable files are forbidden. Distribution archives are ordinary ZIP files that must be extracted before their folder is imported.

## Required layout

```text
course-directory/
├── manifest.json
├── content/
│   └── module.json
├── lessons/        optional Markdown lesson theory referenced by modules
├── projects/       optional referenced project JSON
├── assets/         optional images
└── checksums.json  reserved for signed distribution workflows
```

`manifest.json` must conform to `packages/learnpack/schema/manifest.schema.json`. Every module referenced by the manifest must conform to `packages/learnpack/schema/module.schema.json`. Every project referenced by the manifest must conform to `packages/learnpack/schema/project.schema.json`; its ordered `checkpointExerciseIds` must reference exercises of type `project` in the course modules.

## Lesson theory

Each lesson provides its theory in exactly one of two ways:

- `theoryMarkdown`: the Markdown text inline in the module JSON.
- `theoryFile`: a course-root-relative path to a UTF-8 `.md` file, such as `lessons/module-01/first-program.md`. Long lessons should use this form so they can be edited as ordinary Markdown.

A `theoryFile` must be a safe relative path ending in `.md`, must exist in the course directory, must not be empty, and must not exceed 200,000 characters. The importer resolves it into `theoryMarkdown` before storing the course, so an imported course never depends on the original source layout. Lesson Markdown is rendered as untrusted text: headings, paragraphs, emphasis, inline and fenced code, lists, tables, blockquote callouts, horizontal rules, and validated local images. HTML and remote links are not trusted content.

## Trust model

LearnPack content is untrusted. The importer walks the selected directory without following symbolic links. It rejects unsafe paths, duplicate normalized paths, symbolic links, executable file extensions, oversized files, excessive file counts, duplicate stable IDs, missing references, invalid limits, unsafe assets, and language/adapter mismatches.

Exercises describe arguments, expected values, starter files, hints, and bounded resource requests. A trusted adapter shipped with LearnLocal converts those declarations into a workspace and allowlisted command arguments.

Function exercises use a typed `entrypoint` with argument tests. Output and project exercises use text `input` and `expected` tests. Debug exercises may use the output style when no entrypoint is declared, or the typed function style when an entrypoint is declared.

Course language identifiers are extensible. A course whose language has no trusted installed adapter is imported in study mode and cannot execute learner code. Course-provided runtime metadata never selects an image or command.

## Compatibility

- `schemaVersion` is exactly `1.0.0` for this specification.
- Course and runtime language/version declarations must agree.
- Imported versions are immutable and stored independently.
- IDs are stable across compatible course updates so progress can be mapped safely.
