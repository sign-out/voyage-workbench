# Voyage Workbench 0.2.11 test-release audit

Date: October 15, 2026. Release host: Linux x64.

## Release decisions

- Conservative deduplication is the standard packaging path. No provider,
  executable, authoring feature, offline reference or required notice is removed
  from the full/offline edition.
- The full/offline APK remains the upgrade-safe default. Lightweight ARM64 and
  x86-64 APKs are optional, with explicit provider installation in settings.
- All APKs use the existing signing identity and version code 13. Windows remains
  self-signed with the same underlying key; it is not publicly CA trusted. Linux
  and the checksum manifest have detached signatures.
- Source, tests and build recipes belong in the separate GPL-2.0-only source
  repository. Binary downloads include a license and version-specific source
  pointer, not an application-source archive. Keys, credentials, projects,
  screenshots, caches and build-only symlinks are excluded from public source.

## Automated and rendered regression checks

- TypeScript typecheck passes; 247 core/UI/provider tests, 12 release/map/list
  tests and 191 Python tests pass. Production npm audit reports zero known
  vulnerabilities in the audited dependency set.
- Production UI, Electron host and native document-engine builds pass. Electron
  smoke passes the existing workflows and 60 responsive workspace layouts,
  including the finished artwork/new-world-copy work and contextual assistant.
- A real refresh race discovered during smoke testing is fixed: character
  inspection started before typing can no longer replace newly typed form
  values. A deterministic delayed-response DOM regression covers this case.
- Template enumeration is deterministic rather than dependent on filesystem
  insertion order. The clean-export base-world test now passes as well.
- Windows/Linux packaged ASAR contents match current host/UI/assets. Reference
  data and legal notices are present in one copy; the offline notice viewer
  works for both packaged layouts. Windows executable signatures verify.
- Android release/instrumentation compilation, JVM tests and release lint pass.
  The app-scoped native runner reports `OK (66 tests)`. Five conditional/live
  cases are skipped in that ordinary run; the pack and approval cases are
  exercised separately below. No real inference is required for this audit.
- Both architectures and the universal APK pass signer, package/version,
  non-debuggable, current UI/core, notice and native-payload verification.
  Factored Cursor archives restore the exact original per-ABI SDK file tree.

## Provider-pack qualification

The dedicated disposable API 36 x86-64 emulator is used, without uninstalling the
app. All seven lifecycle checkpoints pass: full build; editor-only base;
restoration after an incomplete-pack probe; Claude only; adding Cursor; adding
Codex; and return to full. A local-edit fixture and an Android Keystore-encrypted
secret survive every transition. CLI version/SDK status/app-server initialization
checks do not start a model turn or sign into an account.

Android accepts a provider split lacking shared support on this emulator. The
negative regression confirms the application refuses to start that incomplete
runtime and never substitutes a direct inference API. Both install planning and
readiness enforce the complete dependency closure.

Both ABIs' signed pack builds pass alignment, certificate, embedded-catalog,
size/hash and exact-payload checks. Downloader tests reject truncated, oversized,
corrupt and canceled payloads and remove partial files. Origin tests reject
HTTP downgrades, credentials in URLs, unexpected ports and lookalike hosts. A
forged installer callback cannot change installer state.

The production inherited PackageInstaller session is also exercised, not just
ADB split installation. With the lightweight base and shared pack installed, the
instrumented production helper presents Android's real “Do you want to update
this app?” confirmation. Approving Update succeeds. A corrected shared-only test
fixture verifies the expected installed support, absent providers, retained local
edit and encrypted secret. Returning to the full APK again preserves both
fixtures and starts all three official runtimes without inference.

## Size results

Download/file sizes in MiB, not actual installed storage:

| Artifact | MiB |
| --- | ---: |
| Windows x64 portable | 171.86 |
| Linux unpacked files | 642.68 |
| Windows unpacked files | 810.85 |
| Full ARM64 APK | 302.59 |
| Full x86-64 APK | 310.35 |
| Full universal APK | 595.14 |
| Lightweight base, either ABI | 11.60 |
| ARM64 base + shared + Codex | 136.54 |
| ARM64 base + shared + Claude | 120.84 |
| ARM64 base + shared + Cursor | 70.62 |

The earlier cleanup comparison and exact archive-factoring design are documented
in `PACKAGING_AND_ON_DEMAND_ANDROID.md`. Windows retains maximum compression;
lower-memory intermediate packaging results are not the published artifact.

## Boundaries

- Native Windows execution, physical ARM64 execution, 16-KiB-page devices and
  Android versions other than the API 36 emulator are not newly qualified here.
- The real PackageInstaller path uses an already verified local pack. A live
  production GitHub download through the app is not an end-to-end test in this
  audit; the bytes/origin policy and OS staging/approval paths are tested
  separately. Network outages and vendor account/subscription access still need
  ordinary dogfooding. Provider versions are release-pinned, not vendor latest.
- The full edition remains available if in-app installation is disallowed or a
  device's package installer behaves differently. This is a GitHub sideloaded
  test release, not a claim of Google Play policy approval.
- T3 device support fails to initialize on this host. Native tests use the
  installed SDK emulator and ADB. No physical phone is modified.
- No paid inference, real Voyage create/save/publication, credential forwarding,
  signing-key rotation or private-project upload is performed.
- Existing bundle-size, Gradle deprecation and flat-directory warnings remain.
  The unrelated generated Capacitor example test is outside the app-scoped suite.

Builds run in an isolated source snapshot, moved off the size-limited `/tmp`
filesystem after initial packaging failures. The other task's completed source
changes are included. Public-source review and secret scanning are release gates;
the working repository's unrelated index is not reset or bulk committed.
