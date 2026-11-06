# Voyage Workbench 0.2.21 — Artwork usability and Voyage compatibility

This is a **prerelease**, tagged `v0.2.21-test`, based on the artwork and
compatibility changes merged into `main` in PR #18. Stable 0.2.18 remains GitHub's
Latest release. Android version code is **23**, allowing updates over previous
builds with the existing signing identity.

Back up important projects and test with a copy first. This update uses the same
application identity and data directory, not a separate preview installation.
Do not uninstall Android merely to update: uninstalling can remove local data.

## Changes and what to test

- **See the artwork:** generated-image previews, a full-size viewer, named
  generation history, and destination/provider/stage/elapsed feedback. Character
  details offer portrait generation and library/upload shortcuts.
- **Keep artwork attached:** choosing artwork saves the exact character or other
  destination locally before reporting success. Switching selections or reopening
  the project retains successful assignments. Stale selection and unsaved-edit
  guards prevent attaching an image to the wrong record.
- **Choose Voyage explicitly:** the shared desktop/Android host supports verified
  Alpha and Production connections, with separate credentials. Existing installs
  remain on Alpha until explicitly switched; linked projects and pending requests
  never silently change environments. The legacy Python host remains Alpha-only.
- **Know what is saved:** Save & compatibility separates local drafts, local
  saving, offline state, uncertain remote saves, and the last checked remote
  baseline. It does not confuse API versions with authored or engine versions.
- **Use the right cover target:** new creation briefs can pin the artwork target.
  Audited recommendations are Alpha 1280 × 720 and Production 1000 × 1000.
  Existing plans, approvals, and images are not silently rewritten or cropped.
- **Maintain compatibility:** revision-scoped references, source-bound validation
  evidence, centralized compatibility profiles, and the public-only
  `npm run voyage:check -- --schema` audit make future upstream changes visible.
  See `docs/VOYAGE_UPDATES.md` for the review and update checklist.

The Codex model and image fixes from 0.2.20 remain included. Image generation uses
Codex CLI, not a direct OpenAI API fallback. Generating, uploading, attaching,
saving to Voyage, moderation, and publishing remain separate actions.

## Downloads and signing

- Windows x64: `Voyage-Workbench-0.2.21-windows-x64.exe` (portable).
- Linux x64: `Voyage-Workbench-0.2.21-linux-x64.tar.gz`; extract and run
  `run-linux.sh`.
- Android ARM64: `Voyage-Workbench-0.2.21-android-arm64-v8a.apk`. An x86-64 APK and
  a larger universal APK are also supplied.
- `checksums.json` records asset sizes, SHA-256 digests, and public verification
  material. Detached signatures accompany the Linux archive and checksum file.
  Existing Android and desktop test-signing identities are preserved. Windows is
  self-signed, so unknown-publisher/SmartScreen warnings may remain; this is not
  public certificate trust or store-signing qualification.

## Validation and known limits

The merged changes passed 598 application/core/host/provider/rendered-UI tests,
11 compiled native harness tests, 26 release-contract tests, and 50 Android JVM
tests, plus typecheck, production build, and Android application/instrumentation
compilation. Release packaging additionally checks current UI/core/host bytes,
versions, dependency notices, ABI metadata, privacy exclusions, and signatures.

The responsive smoke runner passed all 26 viewport compatibility checks, then
timed out in the map-thumbnail fixture waiting for an image's natural width of
600. The complete responsive suite is **not** claimed to pass. Native Windows
execution, physical-device instrumentation, paid generation, live authenticated
Production writes, and account-specific Codex model access remain unverified.

Announced item limits remain advisories pending verified counting and rollout.
New resource-description/multiple-boost shapes and engine sub-version metadata
are not invented. Community `itemSettings`/`itemTypes` drift is reported but not
promoted automatically. Existing party-scoped artwork can be assigned without
claiming a complete party-aware character/map editor or registry migration.

Application source is GPL-2.0-only at the release tag. Third-party components
retain their own licenses and source-access obligations. Release artifacts
exclude private projects, attached research/world files, credentials, and private
signing material.
