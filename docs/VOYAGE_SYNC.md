# Voyage Sync micro companion

Voyage Sync is a separate Android app for phones that cannot run the full
Workbench. Its package ID is `dev.voyage.sync`; installing it does not replace
Workbench or access Workbench's private storage or credentials.

## Download

The [Voyage Sync 0.1.0 test release](https://github.com/sign-out/voyage-workbench/releases/tag/sync-v0.1.0-test)
provides the standalone Android APK and its SHA-256 checksum. Install
`Voyage-Sync-0.1.0-test-android.apk`, not a full Workbench APK. Android may ask
you to allow installation from your browser or file manager. Test on a copied
world first and export a backup before saving important changes.

Voyage Sync has its own release tags and version code. It does not replace or
change the full Workbench's latest release.

## Intended workflow

1. Choose Production, Beta or Alpha and save a Creator API key for that host.
   Keys use Android Keystore-protected storage and are never part of exports.
2. List your owned worlds, or enter a short ID, and download the target world.
3. Import an updated JSON file from Android's document picker. A bare GameState,
   a world envelope or an API response wrapper is accepted. An offline file can
   be imported first and linked to a target later without losing its contents.
4. Review the world-focused section summary and optional individual changes.
   Merge keeps omitted data; replace removes omitted GameState fields and asks
   for confirmation. Wrapper layout, key order and equivalent number formatting
   are not world changes. IDs, version fields and existing publication metadata
   use the same protection rules as the full Workbench importer.
5. Keep the reviewed update locally, then choose **Save update to Voyage**.
   This validates, sends a conditional replacement and confirms by read-back.
   It updates an existing draft; it does not publish or create another world.

The selected connection routes new work; worlds are not bound to a host.
Checks use real engine versions, not environment labels. Pending engine
upgrades require explicit approval in the selected Studio and a fresh download
before an older local import is applied. Production can upgrade older worlds
when opened. Merely launching this app or switching a connection does not open
a remote world or make any other network request.

## Deliberately small

- Android 8.0 / API 26 and newer; use an up-to-date Android System WebView.
- Java/DEX plus a small system-WebView interface: no bundled native libraries
  and no ARM64-only runtime requirement. Suitable for supported 32-bit devices
  as well as ARM64/x86 devices, subject to their Android/WebView capabilities.
- No Capacitor, React, Electron, Rhino, provider CLI, model, map editor,
  artwork generator, media library, background service or analytics.
- Only the Internet permission. Import/export uses Android's document picker,
  not broad storage permission.
- Imported files are limited to 8 MiB; API reads and exports to 16 MiB. The
  durable local state has a 64 MiB ceiling. These are local memory guards, not
  Voyage limits. Very large worlds can still exceed an older phone's memory.
- Package budgets are enforced: 350 KiB generated JavaScript, 2 MiB APK.
  Actual generated/package sizes are printed by the build and verifier.

This is not an iOS build, a speed benchmark or a guarantee for every old phone.
No account-specific access, live private writes or physical-phone behavior has
been validated by the automated checks described here.

## Saving and recovery

Local state is written with Android AtomicFile and a revision check. World JSON
is stored as exact source text, not parsed and reserialized through Java numeric
types. The two most recent local snapshots are kept, and you can export your
current world separately. Uninstalling removes local worlds, backups and keys.

The native host journals validation and dispatch before any PUT. If the process
stops during validation, no world write is assumed; if it stops during sending,
the save becomes uncertain. Do not upload again: **Check / recover save** reads
the original host without resending the mutation. Verified additive server
changes are accepted automatically; different existing values require review
and explicit acceptance of the downloaded result. The submitted source remains
in a local backup. A remote revision conflict preserves your local update and
asks you to download the latest target for another import review.

No cloud service, LAN companion or running computer is needed after installing.
An account with Creator API access and an Internet connection are still required
for remote operations; offline import, review and export remain local.

## Build and test

From the repository root with Node 22+, JDK 17+ and the Android SDK configured:

```sh
npm ci
npm run build:sync
npm run package:sync
python3 tools/verify-sync-apk.py
```

No provider downloads, `.android-lab`, bundled Workbench references or native
runtime packaging are needed. `:sync` is a separate Gradle application module.
It copies only the shared Secrets and HTTP-policy Java sources into its generated
source tree. The full app remains a separate, unchanged package identity.

The initial APK is `releases/sync-0.1.0-test/Voyage-Sync-0.1.0-test-android.apk`,
with an adjacent SHA-256 file. This is a prerelease test build signed with the
local Android debug keystore, but its release manifest is not debuggable. Future
updates must retain that signer and increase the companion's own version code.
The certificate is a development identity, not a production signing identity.
An APK you build with another keystore cannot update the published test APK in
place. The companion does not change the Workbench release version.

Focused validation:

```sh
npx tsx --test packages/core/sync-companion.test.ts apps/workbench/src/sync-companion-ui.test.tsx
cd android
./gradlew :sync:testDebugUnitTest :sync:lintDebug
```

Tests cover partial imports, exact numbers, merge/replace, local-first linking,
remote conflicts, simulated interruption/restart and original-host read-back,
additive/divergent results, native state/revision policy and bounded HTTP reads.
The actual UI runs in a headless Chromium fixture at phone-sized viewports with
mock native responses; it is not an Android device test. Android builds, lint,
APK signature/identity/assets/permissions and absence of full-app runtimes are
verified separately. Real-device and authenticated Voyage testing remain needed.

Initial local validation on November 7, 2026: 648 shared-suite tests passed,
including four consolidated companion workflows; the companion's 25 JVM tests,
the full app's 24 shared HTTP-policy checks, typecheck and release lint passed.
The signed internal-test APK is 58,023 bytes, with only Internet permission,
five verified assets and no native libraries or full Workbench classes. This is
a package-size measurement, not an old-phone performance measurement.
