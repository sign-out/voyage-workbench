# Voyage Workbench 0.2.10 regression audit

## Changes included

- Context-aware assistant conversation across editors; approved assistant work
  applies locally automatically by default, with proposal-only available in Settings.
- Automatic apply retains atomic before-change checkpoints, leaves remote state
  untouched, and keeps proposals when saved drafts, the task's unapplied-editor
  snapshot, or concurrent source changes need review.
- Linked JSON imports preserve Voyage identity, load/safety fields,
  `heroesVersion`, and `compatibilityRevision`, including removal attempts and
  older pending proposals. Authored content remains selectively reviewable.
- Outgoing saves recover managed fields from the preserved download. Read-back
  mismatches still remain unconfirmed; this is not permission to ignore them.
- Fixed an Android provider cancellation regression found during the audit:
  already-canceled CLI operations no longer spawn Cursor/Claude subprocesses.
  Native regression tests require the process to remain null.
- Made the optional live proposal-only Android smoke test explicitly select and
  restore its editing preference rather than depending on the old default.
- Strengthened release verification to reject debuggable/test-only Android APKs.
- Desktop/Android version 0.2.10; Android version code 12; existing signing
  identities retained. Local user storage is not reset or migrated.

## Completed validation

- TypeScript typecheck and 235 core, host, provider, and UI tests pass.
- All 11 map/list/release tests and 178 legacy Python tests pass.
- Electron smoke passes, including 60 responsive workspace layouts, character
  editing, map clipping/navigation, selective imports, mocked Voyage saves,
  publication previews, cover grading, contextual assistant, and automatic apply.
- Android app-scoped release/test compilation, JVM tests, and release lint pass.
- All 55 selected native instrumentation tests pass against the rebuilt x86-64
  release APK, including large JSON export, encrypted credentials, provider
  cancellation, protected imports, automatic apply, and mocked save reconciliation.
- Production npm dependency audit reports zero vulnerabilities.
- Packaging inputs contain no literal Voyage API credentials; artifact verification
  checks current compiled assets, runtime bytes, version/ABI metadata and signatures.

## Boundaries

T3 device support was unavailable; Android verification used the SDK emulator.
An initial Android test run installed an older APK before packaging completed;
the final run waits for successful packaging and uses the rebuilt release APK.
The live paid-agent test and opt-in force-stop lifecycle preparation were excluded.
No paid inference, live world save, or live publication was performed.
Native Windows execution and a fresh physical ARM64 lifecycle run are unverified.
Windows is self-signed for testing, not publicly CA-trusted. This remains an Alpha
test release, not a claim of complete provider/site parity or production readiness.

Source changes and the pre-existing Git index remain local. The downloads release
contains built applications, public checksums and detached signatures only.

## Publication

Published `v0.2.10-test` in `sign-out/voyage-workbench-downloads` on October 14,
2026. All eight uploaded assets match their local sizes and GitHub SHA-256 digests.
Unauthenticated release metadata and HTTP downloads are verified for every asset.
No application-source archive or source-repository change was published in this pass.
