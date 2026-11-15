# Voyage Sync 0.1.0 — Tiny Android world-sync companion

This is a **prerelease**, tagged `sync-v0.1.0-test`, for Android 8.0 / API 26
and newer. It is a separate app (`dev.voyage.sync`, version code **1**) and
installs alongside Voyage Workbench. The full Workbench release is unchanged.

## Download and use

Install **Voyage-Sync-0.1.0-test-android.apk**. The APK is approximately **57 KiB**
and contains no model, provider CLI, native libraries or full Workbench runtime.
This is a package-size measurement, not a performance guarantee for older phones.
An up-to-date Android System WebView and Creator API access are required.

1. Choose Production, Beta or Alpha and save that connection's Creator API key.
2. Download an existing owned world, or import JSON offline and link it later.
3. Import the update and review actual world changes with merge or replace.
4. Save the reviewed update to Voyage. Validation, conditional saving and
   read-back show progress in place.

**Test on a copied world first. Export a backup before saving important changes.**
This version updates existing drafts only; it cannot create or publish worlds.

## Included

- Semantic world imports ignore wrappers, key order and equivalent number
  formatting. Merge preserves omitted fields; replace requires confirmation.
- Separate connection keys use Android Keystore-protected storage. Only Internet
  permission is requested; Android's document picker handles import and export.
- Exact numeric source text, two local backup snapshots and manual export.
- Durable save recovery reads the original connection without resending a PUT.
  Verified server additions are accepted automatically; conflicting changes
  remain explicit decisions. Engine upgrades require approval in Voyage Studio.
- Shared Beta compatibility and host-independent world routing are included in
  source. This release does not rebuild the full desktop or Android Workbench.

## Signing and verification

This non-debuggable APK uses a local Android **development/debug certificate**,
not a production signing identity. Updates must preserve this signer. Uninstalling
removes the companion's local worlds, backups and keys.

The adjacent `.apk.sha256` file verifies the APK bytes. The signing certificate's
SHA-256 fingerprint is:

```text
f2feafab893b50ed43d9221aea0d61b99f1ea2de21024fe284b147c6eaf8b50a
```

The shared JS/TS suite passed 648 checks, including four consolidated companion
workflow/UI checks. Companion JVM checks, shared native HTTP-policy checks,
typecheck, Android release lint and APK signature/assets/permission verification
passed. UI checks use mocked native calls in headless Chromium; no physical phone
or authenticated live Voyage save has been tested.

Source is included at this tag under GPL-2.0-only, with third-party notices in
the APK. See [the companion guide](VOYAGE_SYNC.md) for build commands and limits.
