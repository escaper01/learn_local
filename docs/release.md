# Release process

1. Confirm CI passes checks on Windows, macOS, and Linux, plus the Linux Docker conformance and dependency-audit jobs.
2. Update the application version and release notes.
3. Trigger **Package desktop apps** in GitHub Actions for unsigned Windows, macOS, and Linux artifacts.
4. For a public release, configure trusted Windows code-signing and Apple Developer ID/notarization credentials in repository secrets, then rerun packaging.
5. Smoke-test first launch, Docker detection, Java/Python installation, the canonical LearnPack import, Run/Submit/cancel, restart persistence, runtime removal, settings import/export, and diagnostics export on each supported OS.
6. Publish checksums and keep the pinned runtime digests in the release notes.

The application intentionally does not auto-install Docker or modify Linux group membership. The installer must preserve local application data on uninstall unless the user explicitly chooses data removal.
