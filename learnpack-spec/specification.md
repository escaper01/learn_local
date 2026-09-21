# LearnPack 1.0

A LearnPack is a ZIP archive with the `.learnpack` extension. It contains declarative learning content only; commands, container configuration, image names, host paths, package-manager operations, and executable files are forbidden.

## Required layout

```text
course.learnpack
├── manifest.json
├── content/
│   └── module.json
├── projects/       optional referenced project JSON
├── assets/         optional images
└── checksums.json  reserved for signed distribution workflows
```

`manifest.json` must conform to `packages/learnpack/schema/manifest.schema.json`. Every module referenced by the manifest must conform to `packages/learnpack/schema/module.schema.json`.

## Trust model

LearnPack content is untrusted. The importer performs structural and semantic validation without extracting the archive. It rejects unsafe paths, duplicate paths, symbolic links, executable file extensions, oversized archives, excessive entry counts, duplicate stable IDs, missing references, invalid limits, and language/adapter mismatches.

Exercises describe arguments, expected values, starter files, hints, and bounded resource requests. A trusted adapter shipped with LearnLocal converts those declarations into a workspace and allowlisted command arguments.

## Compatibility

- `schemaVersion` is exactly `1.0.0` for this specification.
- Course and runtime language/version declarations must agree.
- Imported versions are immutable and stored independently.
- IDs are stable across compatible course updates so progress can be mapped safely.
