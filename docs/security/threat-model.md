# Security model

LearnLocal treats learner code and imported course content as hostile input.

Controls include:

- context-isolated, sandboxed Electron rendering with Node disabled;
- restrictive response and document Content Security Policy;
- denied navigation and new windows except explicit external HTTPS links;
- strict IPC schemas and trusted-frame checks;
- no raw commands, images, mounts, capabilities, devices, or paths from the renderer;
- network-disabled, non-root, read-only containers with no capabilities;
- bounded memory, CPU, PIDs, wall time, and captured output;
- digest-pinned approved runtime images;
- exact resource ownership labels and cleanup in `finally`;
- hidden tests resolved only in the trusted process;
- no executable settings or settings capable of weakening mandatory policy.

Containers reduce risk but are not a perfect security boundary. Users should keep their container engine and LearnLocal runtime images patched and prefer rootless Docker where supported.

Report vulnerabilities privately to the repository owner. Do not include learner source, course content, or local database files in public reports. The diagnostics export intentionally excludes source code and host filesystem paths.
