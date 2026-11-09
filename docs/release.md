# Release process

There are two GitHub Actions workflows: **Package desktop apps** builds temporary cross-platform CI artifacts, while **Release Windows build** runs for a version tag and creates a draft GitHub Release containing the Windows installer, portable application, update metadata, and both bundled curricula. Use the tag-triggered flow for public releases.

## Cutting a Windows GitHub Release

1. Confirm CI passes on the commit you intend to release.
2. Bump `"version"` in `package.json` (and any release notes) and commit that change.
3. Tag the commit with a `v`-prefixed version matching `package.json` exactly, and push the tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
4. Pushing the tag triggers **Release Windows build** (`.github/workflows/release.yml`) on `windows-latest`. It builds the NSIS installer (`LearnLocal-<version>-x64.exe`) and portable application (`LearnLocal-Portable-<version>-x64.exe`). Electron Builder uploads to a draft release. The workflow then merges any duplicate drafts, validates and packages the curricula from `examples/`, and uploads `javaCourse.zip` and `electronicsCourse.zip`.
5. Open the repository's **Releases** page and review the draft. Confirm the installer, portable executable, `latest.yml`, `javaCourse.zip`, and `electronicsCourse.zip` are present. Edit the notes and publish the release manually; tag creation alone does not make it public.
6. Smoke-test the published installer: first launch, Docker detection, Java installation, the canonical LearnPack import, Run/Submit/cancel, restart persistence, runtime removal, settings import/export, and diagnostics export.

The portable build needs no installation: copy the `.exe` anywhere (including removable media) and run it. It stores its database, imported courses, and settings in a `LearnLocal-Data` folder created next to the executable itself, not in the Windows per-user profile, so the whole thing — app plus data — stays self-contained and movable between machines. The installed (NSIS) build still uses the normal per-user `%APPDATA%` location.

Curriculum ZIP files are transport artifacts. Extract one and import the folder containing `manifest.json`. Do not commit generated `.learnpack` or `.zip` files: the release job always rebuilds them from the reviewed curriculum source.

The Windows build is currently **unsigned** — no code-signing certificate is configured, so Windows SmartScreen will warn installers came from an unrecognized publisher until a user clicks through it. To sign it later, add a certificate via the `CSC_LINK`/`CSC_KEY_PASSWORD` repository secrets and remove the `CSC_IDENTITY_AUTO_DISCOVERY: "false"` override in `release.yml` — no other workflow changes are needed.

## Building macOS and Linux artifacts

Trigger **Package desktop apps** manually in GitHub Actions for unsigned Windows, macOS, and Linux artifacts (uploaded as CI artifacts, not a GitHub Release). For a public multi-platform release, configure trusted Windows code-signing and Apple Developer ID/notarization credentials in repository secrets first, then publish macOS/Linux the same way `release.yml` publishes Windows.

The application intentionally does not auto-install Docker or modify Linux group membership. The installer must preserve local application data on uninstall unless the user explicitly chooses data removal.
