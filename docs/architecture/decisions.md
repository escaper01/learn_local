# Architecture decisions

## Trusted execution boundary

The renderer is untrusted and receives a narrow preload API. It cannot access Node.js, Electron IPC primitives, Docker, host paths, or raw commands. Main-process handlers validate the sender frame and every payload with strict runtime schemas.

Language adapters generate trusted workspaces and structured executable/argument arrays. The Docker provider owns engine access, fixed policy, cancellation, bounded output, exact ownership labels, and cleanup. Standard execution opens no TCP port.

## Runtime lifecycle

Approved images are digest-pinned. Runtime installation creates a LearnLocal-owned tag and performs a restricted smoke test. Attempts use fresh containers. Removing a runtime removes only exactly labeled containers and the LearnLocal-owned image reference; courses, workspaces, attempts, settings, and progress remain.

## Local persistence

SQLite stores settings, attempts, test results, completion, and autosaved workspaces. A local backup is created before startup migrations. Imported course versions are immutable files under application data and are revalidated when opened.

## Course trust

LearnPack source is a declarative directory whose root contains `manifest.json`. The desktop importer accepts a selected directory, rejects symlinks and unsafe or unsupported files, enforces file/count/size limits, validates every schema and reference, and copies an immutable snapshot into application data. Executables, invalid schemas, duplicate IDs, missing references, and adapter mismatches are rejected.

Release archives are ordinary ZIP files produced from the reviewed source directories. A learner extracts an archive and imports the resulting folder; the archive itself is a transport format, not a trust boundary and not an authoring source.
