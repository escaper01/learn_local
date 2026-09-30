# Release process

There are two separate GitHub Actions workflows: **Package desktop apps** (manual, builds all three OSes as temporary CI artifacts, never publishes) and **Release Windows build** (automatic on a version tag, publishes a draft GitHub Release with the Windows installer attached). Most releases today should use the tag-triggered flow below.

## Cutting a Windows GitHub Release

1. Confirm CI passes on the commit you intend to release.
2. Bump `"version"` in `package.json` (and any release notes) and commit that change.
3. Tag the commit with a `v`-prefixed version matching `package.json` exactly, and push the tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
4. Pushing the tag triggers **Release Windows build** (`.github/workflows/release.yml`) on `windows-latest`. It runs `npm run release:win`, which builds the NSIS installer and calls `electron-builder --publish always`. electron-builder creates the release as a **draft** by default — nothing public happens automatically. The workflow then runs `npm run curriculum:package` and attaches the resulting archive to the same draft release as `javaCourse.zip`, so a fresh install has a course to import immediately.
5. Open the repository's **Releases** page, review the draft (edit the auto-generated notes if you want), confirm the `.exe`, `latest.yml`, and `javaCourse.zip` assets are attached, then click **Publish release** yourself. This is the explicit owner action that makes the release public.
6. Smoke-test the published installer: first launch, Docker detection, Java installation, the canonical LearnPack import, Run/Submit/cancel, restart persistence, runtime removal, settings import/export, and diagnostics export.

The Windows build is currently **unsigned** — no code-signing certificate is configured, so Windows SmartScreen will warn installers came from an unrecognized publisher until a user clicks through it. To sign it later, add a certificate via the `CSC_LINK`/`CSC_KEY_PASSWORD` repository secrets and remove the `CSC_IDENTITY_AUTO_DISCOVERY: "false"` override in `release.yml` — no other workflow changes are needed.

## Building macOS and Linux artifacts

Trigger **Package desktop apps** manually in GitHub Actions for unsigned Windows, macOS, and Linux artifacts (uploaded as CI artifacts, not a GitHub Release). For a public multi-platform release, configure trusted Windows code-signing and Apple Developer ID/notarization credentials in repository secrets first, then publish macOS/Linux the same way `release.yml` publishes Windows.

The application intentionally does not auto-install Docker or modify Linux group membership. The installer must preserve local application data on uninstall unless the user explicitly chooses data removal.
