# Release preparation — October 12, 2026

Prepared version: **0.2.9 test**, Android version code **11**. This is a working-tree
test build, not a committed/source publication or production/store certification.
Existing projects, credentials, historical builds and staged changes are retained.

## Cleanup and release gates

- Declare `js-sha256` explicitly: a normal dependency install previously removed
  this undeclared dependency and broke a clean build.
- Keep Capacitor CLI in development dependencies. Exclude `node_modules` and all
  source maps from desktop packages; the desktop host is bundled and uses only
  Electron/Node built-ins externally. A build-time check enforces that boundary.
- Remove unused Android dependency build caches from desktop payloads. Application
  ASAR entry count drops from 7,434 to 165; both current ASARs are about 22 MiB.
- Refresh bundled notices, including JavaScript dependency licenses previously
  supplied only through the unneeded dependency tree. Source archives remain private.
- Enable Android release lint/error gates; do not hide future errors behind
  `abortOnError false`.
- Check desktop/Android/lockfile version agreement, exact bundled UI/core/reference/
  runtime/notice content, APK ABI/signatures, and forbidden source/private material.
- Update the build-only `http-cache-semantics` dependency to remove the reported high
  advisory without a broad major-version upgrade. Production dependency audit is
  clear. Eleven moderate findings remain in development/build-tool dependencies;
  no forced downgrade or speculative breaking upgrade is applied.
- Ignore signing containers and local environment secret files. Restrict the
  existing Android signing keystore to owner-only permissions.

## Desktop signing

The owner explicitly requested any signing, preferably sharing the Android key.
Windows now has a self-signed **Voyage Workbench Test Builds** code-signing certificate
using the same underlying public/private key as Android's existing development key.
Android's certificate and update identity are unchanged; Windows's certificate is
separate and has the code-signing extended key usage. This is test signing, not a
public CA certificate. Windows trust/SmartScreen warnings may remain.

Signing material lives only in the owner-only `~/.local/share/voyage-signing`
directory, outside the repository. PFX encryption passwords do not enter command
arguments, logs, app assets, checksum manifests or public downloads. A later build
reuses the identity and rejects Android-key mismatches rather than rotating it.
No certificate is automatically installed in a tester's trust store.

`./tools/npm run package:windows` now uses the verified signing workflow. The
after-pack hook signs the embedded application EXE; the artifact-completed hook
signs the portable EXE. Third-party provider executables are not re-signed or changed.
Verification checks signatures against the explicit test certificate, not a claim
of Windows-wide trust. The locally installed signer is osslsigncode 2.10 under
`.build-tools/signing/build`; `VOYAGE_OSSLSIGNCODE` can select another installed copy.

Linux archives and `checksums.json` receive SHA-256 detached signatures with the
same key. Public certificate/key material and its fingerprint are in the checksum
manifest, not private signing material. First-time trust still requires checking
the fingerprint through a trusted independent channel. No trusted timestamp is
claimed; the Windows test certificate expires October 9, 2036.

## Verification

- TypeScript typecheck and **214** core/UI/desktop/provider tests pass.
- **11** map/list/release-guard tests pass; **178** legacy Python tests pass.
- Production UI, desktop host and Android document-engine build succeeds.
- Electron UI smoke passes, including 60 workspace layout combinations, Form/JSON
  fidelity, provider settings, artwork defaults, publication and recovery fixtures.
- Android app release/debug/instrumentation APK compilation and local JVM tests
  pass. Debug/release lint contain warnings, but no errors.
- Windows and Linux compiled-only packages match the final build and bundled
  runtime/reference/notice assets. Windows signatures verify cryptographically.
- All three Android release APKs have verified signatures, version/ABI metadata
  and current UI/core/runtime assets.

Use `./tools/npm run verify:artifacts` after packaging. Use
`python3 tools/assemble-test-release.py` to verify and stage only the allowlisted
binaries, Linux archive, checksums and detached signatures. It refuses to overwrite
an existing staging directory and does not publish anything. It never copies the
application source tree, worlds, credentials, keystores or PFX material.

## Remaining qualification boundaries

- No Android device is attached in this run; T3 device support is unavailable.
  Instrumentation APKs compile, but on-device instrumentation/lifecycle tests are
  not rerun. Existing dogfooding is useful, not new verification evidence.
- Windows native execution and Windows trust-store behavior need Windows testing.
- No live paid inference, image allowance/moderation, remote world save or remote
  publication is performed; controlled fixtures do not qualify every account.
- Android still uses the existing development signing identity at the owner's
  request. Before production, choose a protected long-term signing/recovery plan.
- Android lint has existing launcher/resource/version warnings. They are not
  addressed by broad unrelated changes. Production build still reports Vite's
  chunk-size/mixed-import warnings; a successful build is not a performance claim.
- An initial unqualified Gradle task selected dependency-plugin instrumentation
  tasks and encountered their Kotlin dependency duplication. Application-scoped
  `:app:` build/test/lint tasks pass; that unrelated plugin test configuration is
  not modified or presented as passing.

Nothing is uploaded, no source is published, and no branch/commit is created by
this preparation pass. Local artifacts are under `releases/test-0.2.9`.
