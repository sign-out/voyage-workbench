# UI and credential validation — October 8, 2026

## Completed checks

- TypeScript typecheck passes.
- All 90 Node/UI unit and integration tests pass, including delayed connector refresh, cancellation, independent status failures, connection presets, credential isolation/removal, content categories, package metadata protection and exact-source legacy recovery.
- Shared UI, Electron host and Android document-engine build passes.
- Electron smoke passes: 48 tool/viewport layouts, menu bounds and dismissal at 320/412/1280 px, mutually exclusive menus, shortcut-limit feedback, provider settings/key saving, internal provider-field overflow checks, selective import/save/read-back, publication previews, character/map editors and cover generation/grading failure handling. External model-provider tests use fixtures, not paid real requests.
- Android debug app and instrumented test APK build passes. Installed over the existing emulator app with `adb install -r`; no uninstall or data reset.
- All 25 tests in the `dev.voyage.workbench` Android package pass, including three new credential tests: non-exportable encryption key, randomized ciphertext, credential-name binding, older ciphertext compatibility, status/settings isolation and removal lifecycle.
- The real paid agent test was explicitly excluded. The unrelated Capacitor-generated example test still assumes the scaffold package name; it was not changed or included in the app-scoped run.
- Browser inspection at 412 px confirms grouped world navigation, real category counts, the connection catalog and no internal provider-page horizontal overflow.
- `git diff --check` passes.

## Artifacts and limits

The current debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`; SHA-256 is `dac1090e1b95e4a1584d58a239d3e2dc1a9c2517068587e985976b09dc7e21a0`.

This is a local test build, not a newly published release. Version remains 0.2.6 / Android versionCode 8. The Device panel cannot find the configured SDK; native checks use the installed SDK and ADB emulator directly. Physical Android devices and Windows execution are not verified by this run.

Native Studio parity is not complete. See `STUDIO_PARITY.md` for the screenshot-grounded checklist and unsupported/unverified workflows; do not treat JSON access or a similarly labeled button as proof of complete structured-editor parity.
