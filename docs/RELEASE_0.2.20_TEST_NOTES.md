# Voyage Workbench 0.2.20 — Codex CLI image and model fixes

This is a **prerelease**, tagged `v0.2.20-test`, containing the source-to-world
workflow merged into `main` and the follow-up Codex CLI image/model fixes.
Stable 0.2.18 remains GitHub's Latest release. Android version code is **22**,
allowing updates over 0.2.18 and 0.2.19 with the existing signing identity.

## Changes and what to test

- Connections discovers Codex models from the bundled CLI rather than guessing
  model IDs. Saved custom IDs remain intact, with warnings when they are not
  advertised. Availability notices and image-input support are retained.
- Artwork clearly selects a **Codex CLI orchestrator model**, not a direct image
  engine. Inherited defaults are visible; models explicitly lacking image input
  are excluded from artwork choices without silently changing saved settings.
- **Save & check Codex image setup (no generation)** checks CLI sign-in, provider
  capabilities, and advertised model compatibility without starting a model turn.
  This metadata check does not prove account access, available image quota, or
  successful generation.
- Image instructions call the CLI's `image_gen.imagegen` tool and retain actual
  image-result bytes. Desktop and Android share preflight rules and clearer
  missing-image/usage-limit errors. No direct OpenAI API fallback, subscription
  token replay, automatic image retry, or automatic publication is added.
- The source-to-world creation, atlas, visual-review, and copy/restore workflows
  from 0.2.19 remain included. See the previous release notes for their scope.

Start with a disposable project or a copy, and back up important local projects.
The update uses the same application identity and data directory, not a separate
sandboxed preview installation. Sign into Codex from Connections, refresh its
models, choose an advertised compatible model, and run the no-generation setup
check before explicitly approving artwork generation.

The reported names **sol-6.1** and **terra 6.1** have not been live-qualified.
Use the exact IDs advertised by your signed-in CLI. Report the selected ID and
full error if either still fails; the application does not remap those names to
guessed alternatives.

## Downloads and signing

- Windows x64: `Voyage-Workbench-0.2.20-windows-x64.exe` (portable).
- Linux x64: `Voyage-Workbench-0.2.20-linux-x64.tar.gz`; extract and run
  `run-linux.sh`.
- Android ARM64: `Voyage-Workbench-0.2.20-android-arm64-v8a.apk`. An x86-64 APK and
  a larger universal APK are also supplied. Do not uninstall merely to update.
- `checksums.json` includes asset sizes, SHA-256 hashes, and public verification
  material. Detached signatures accompany the Linux archive and checksum
  manifest. Existing Android and desktop test-signing identities are preserved.
  Windows remains self-signed and may show unknown-publisher/SmartScreen warnings;
  this is not public certificate trust or store-signing qualification.

## Validation and limits

The CLI fixes passed 568 serial application/core/host/provider/rendered-UI tests,
10 compiled native harness tests, 26 release-contract tests, and 48 Android JVM
tests, plus typecheck, production build, Capacitor sync, and Android application
and instrumentation compilation. A temporary unauthenticated CLI protocol probe
checked initialization, model listing, capabilities, and thread configuration
without starting a model turn. Release packaging separately verifies current
resources, dependency notices, versions, and existing signing identities.

No paid generation, live authenticated 6.1 model qualification, live Voyage write,
native Windows execution, or physical-device instrumentation is claimed. The
broad responsive runner retains its previously documented hidden-Electron map
thumbnail timeout on unchanged main. Review generated content before publishing.

Application source is GPL-2.0-only and available at the release tag. Third-party
components retain their own licenses and source-access obligations. Binaries
exclude private projects, attached research/world files, credentials, and private
signing material.
