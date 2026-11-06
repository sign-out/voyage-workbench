# Voyage Workbench 0.2.22 — Voyage save recovery and explicit exports

This is a **prerelease**, tagged `v0.2.22-test`. Stable 0.2.18 remains GitHub's
Latest release. Android version code is **24**. Existing application and signing
identities are preserved so this build can update previous test installations.

Back up important projects and test with a copy first. This update uses the same
application identity and data directory, not a separate preview installation.
Do not uninstall Android merely to update: uninstalling can remove local data.

## Changes and what to test

- **Recover a different save read-back safely:** Connections and Publish offer
  review of the actual linked Voyage draft when it differs from the submitted
  world. Inspect the full before/after proposal, then explicitly accept the whole
  snapshot or reject it. Review performs a read, not another save or publication.
- **Keep save evidence honest:** accepting a different draft records `ACCEPTED`,
  not an exact-match `CONFIRMED`. Original submitted bytes remain in the journal;
  acceptance creates a History checkpoint. Stale source, target, payload, or
  read-back evidence cannot be accepted, and partial adoption is rejected.
- **Choose the right JSON export:** Files & sync separates exact project JSON
  from the Voyage GameState subtree used by Studio-shaped exports. Both preserve
  numeric spellings, unknown fields, version information, and IDs. Unapplied
  editor drafts are not exported. No speculative ID encoding or silent cleanup
  is applied.
- **Understand normalization:** the supplied examples reproduced 53 read-back
  differences involving generated quest progress, omitted empty collections,
  and a music default. These are not treated as automatically safe to ignore.
  See `docs/VOYAGE_SAVE_NORMALIZATION.md` for evidence and recovery instructions.

All earlier artwork, Alpha/Production connection, compatibility, and source-to-world
changes remain included. Image generation uses Codex CLI, not a direct OpenAI API
fallback. Generating, uploading, attaching, remote saving, moderation, and
publishing remain separate actions.

## Downloads and signing

- Windows x64: `Voyage-Workbench-0.2.22-windows-x64.exe` (portable).
- Linux x64: `Voyage-Workbench-0.2.22-linux-x64.tar.gz`; extract and run
  `run-linux.sh`.
- Android ARM64: `Voyage-Workbench-0.2.22-android-arm64-v8a.apk`. An x86-64 APK and
  a larger universal APK are also supplied.
- `checksums.json` records sizes, SHA-256 digests, and public verification
  material. Detached signatures accompany the Linux archive and checksum file.
  Existing Android and desktop test-signing identities are preserved. Windows is
  self-signed, so unknown-publisher/SmartScreen warnings may remain; this is not
  public certificate trust or store-signing qualification.

## Validation and known limits

The changes passed 608 application/core/host/provider/rendered-UI tests,
12 compiled native harness tests, 26 release-contract checks, and 50 Android JVM
tests, plus typecheck, production build, and Android application/instrumentation
compilation. Packaging also checks current UI/core/host bytes, versions,
dependency notices, ABI metadata, privacy exclusions, and signatures.

No live authenticated Voyage writes, paid generation, physical-device
instrumentation, or native Windows execution are claimed. Account-specific Codex
model access still needs testing. The previously reported responsive map-thumbnail
timeout remains a validation limit; the full responsive suite is not claimed to
pass. Public Production/Alpha API contracts remained `1.3.0-preview` in the
November 6, 2026 audit; community schema drift is reported separately rather
than automatically adopted. This build does not claim the entire creation vision
is complete.

Application source is GPL-2.0-only at the release tag. Third-party components
retain their own licenses and source-access obligations. Release artifacts
exclude private projects, attached research/world files, credentials, and private
signing material.
