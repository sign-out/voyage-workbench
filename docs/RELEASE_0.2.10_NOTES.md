# Voyage Workbench 0.2.10 — Assistant and safe Voyage imports

Fresh Windows, Linux and Android test builds.

## Highlights

- First-class assistant conversation follows the current editor and selection.
- Approved assistant work applies locally automatically by default, with a
  before-change History checkpoint. Settings can restore proposal-only behavior.
- JSON imports over linked Voyage worlds preserve identity and schema-version
  fields while allowing selective review of authored changes.
- Save payloads recover protected metadata from the preserved Voyage download;
  mismatched remote read-back is not falsely reported as success.
- Fixed already-canceled Android Cursor/Claude operations unnecessarily launching
  their subprocesses and potentially failing cleanup.
- Local saving remains independent. Voyage uses Alpha only; remote saves and
  publication never happen automatically as a result of local assistant edits.

## Downloads

- **Windows x64:** portable `.exe`.
- **Linux x64:** extract `.tar.gz`, then run `./run-linux.sh`.
- **Android ARM64:** `android-arm64-v8a.apk` for most current phones.
- **Android x86-64:** `android-x86_64.apk` for compatible emulators/devices.
- **Android universal:** both supported ABIs, larger download.
- `checksums.json`, its detached signature, and the Linux archive signature.

Android version code 12 preserves the existing update-signing identity. Install
over the existing app; do not uninstall if you want to retain local projects.
Windows is self-signed, not publicly trusted; SmartScreen warnings may remain.
No separate source archive, credentials, private worlds or signing keys are uploaded
to this downloads repository.

## Verification and limitations

235 core/UI/provider tests, 11 map/list/release tests, 178 Python tests and all 55
selected Android native tests pass. Electron smoke covers 60 responsive layouts.
Typecheck, Android JVM tests and release lint pass. Production npm audit reports
zero vulnerabilities. Packaged assets, versions, architectures, signatures and
checksums are verified before publication.

Android native tests use the x86-64 release APK on the SDK emulator. Windows-native
execution and a fresh physical ARM64 lifecycle run are not verified. No paid
inference or live Voyage world save/publication was performed. Existing UNKNOWN
remote saves are not retroactively confirmed by installing this update.
