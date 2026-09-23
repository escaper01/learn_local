# Path, Files, traversal defense, metadata, and atomic moves

## Paths are names; Files performs work
Path.of creates a path representation without checking existence. Relative paths resolve against the working directory. Files handles reading, writing, attributes, walking, and moving.
```java
var root = java.nio.file.Path.of("data").toAbsolutePath().normalize();
var target = root.resolve(userName).normalize();
if (!target.startsWith(root)) throw new IllegalArgumentException("outside root");
```
This blocks lexical .. traversal, but symbolic links can still lead outside the root. With untrusted filesystem access, real-path validation, link policies, permissions, and race-resistant operations need consideration. A normalized prefix check alone is not a complete security boundary.

## Durable writes
Write to a temporary file in the destination filesystem, close it, then move it into place with ATOMIC_MOVE when supported. Define what happens if atomic moves are unsupported; silent fallback can change crash guarantees. Closing and renaming alone may not satisfy strict power-loss durability requirements.

## Practice
Test relative, absolute, .., missing, and linked paths in a dedicated temporary directory. Replace a report through a temp-file move and inject a write failure. The previous valid report should survive. Close Files.walk streams and avoid following links without a deliberate policy.
