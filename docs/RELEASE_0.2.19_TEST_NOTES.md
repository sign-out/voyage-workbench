# Voyage Workbench 0.2.19 — Source-to-world test release

This is a **prerelease** from `feat/source-to-world-creation`, tagged
`v0.2.19-test`. It does not merge PR #16, change `main`, or replace the stable
0.2.18 release as GitHub's Latest release. Android version code is **21**, so it
can update an existing 0.2.18 installation (version code 20) signed with the same
development identity. It supersedes the older, 0.2.12-based source-to-world
preview; use these new artifacts when testing the integrated branch.

## What to test

- Create a world from a prompt and Markdown research. Review source coverage,
  canon, characters, locations, culture, tone, and visual design before approving
  the planned model work. No ComfyUI dependency is required.
- Plan geography and render the atlas, region maps, and connected locations.
  Atlas cartography is now the default; schematic rendering remains available.
  These are procedural maps, not diffusion-painted or guaranteed canon-perfect
  franchise maps.
- Configure a supported generation route for covers and other artwork. Review
  the title, blurb, descriptions, tags, and generated assets before publication.
- Optionally run whole-package visual review using a supported vision-capable
  text route. Source excerpts and four 768px image previews per request are sent
  only after approval of the route and request cap. Completed batches survive
  interruption; unresolved failures/uncertainties block readiness and cannot be
  silently cleared by recording another inspection. An explicit, documented,
  hash-bound resolution is available.
- Copy a creation or export and restore its private creation package. Restored
  copies retain authored content, maps, and local artwork, but get a fresh local
  identity without remote links, stale approval, grades, or source-read evidence.
  Shared artwork is deduplicated. The recovery package is **not** the public
  Voyage-import JSON and may contain private research; do not post it publicly.
- Inspect publication readiness and export the Voyage world. Live upload and
  publication remain separate, explicit approvals; a passing review never
  automatically publishes a world or authorizes a paid retry.

Start with a disposable project or a copy, and back up important local projects
before installing. Upgrading keeps the same application identity and data
location; this is not a separately sandboxed preview installation.

## Downloads and installation

- Windows x64: `Voyage-Workbench-0.2.19-windows-x64.exe` (portable).
- Linux x64: `Voyage-Workbench-0.2.19-linux-x64.tar.gz`; extract and run
  `run-linux.sh`.
- Android phones: `Voyage-Workbench-0.2.19-android-arm64-v8a.apk` for modern ARM64
  devices. Use the x86-64 APK for compatible x86-64 devices/emulators, or the
  larger universal APK if you need both architectures. Allow installation from
  your chosen download/file-manager app. Do not uninstall first merely to update.
- `checksums.json` records asset sizes and SHA-256 hashes and includes the public
  verification key/certificate. Detached signatures accompany the Linux archive
  and checksum manifest. Android and Windows retain the existing test-signing
  identities. Windows is self-signed and may show unknown-publisher/SmartScreen
  warnings; this is not public certificate trust or production/store signing.

## Validation and limits

The source change was validated with 559 shared/core/host/UI tests, 10 compiled
native harness tests, 26 release-contract tests, five authenticated API safety
mocks, 194 Python tests, and 45 Android JVM tests, plus typecheck, build,
Capacitor sync, and Android application/instrumentation compilation. No paid
provider request or live Voyage write was used for that validation.

Release packaging additionally requires refreshed dependency notices, signed
Windows/Linux artifacts, all three release APKs, package/source/resource and
signature verification, and the desktop offline-resource smoke check before
publication. These local checks are not GitHub Actions CI or a live provider
quality evaluation.

Native Windows execution and physical-device/emulator instrumentation are not
verified here. The broad responsive runner has an existing hidden-Electron map
thumbnail timeout reproduced on unchanged main; do not treat it as fully passing.
macOS/iOS installers, fully unattended quality-repair loops, OS-service job
execution, and cross-device execution are not part of this release. Real model
output quality, Voyage acceptance, and end-to-end public publication still need
user testing. Review generated content before publishing.

Application source is GPL-2.0-only and available at the release tag. Bundled
third-party components retain their own licenses, notices, pinned upstream source
links, and source-access obligations. Binaries exclude private projects,
attached research/world files, credentials, and private signing material.
