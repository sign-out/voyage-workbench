# Voyage Workbench 0.2.18

Regular release for every currently supported package: Windows x64 portable,
Linux x64, and Android ARM64, x86-64, and universal. There are no macOS or iOS
packages in this release. Android version code is 20.

## Fixes and maintenance

- Updated Electron to 44.10.0, Vite to 7.3.7, and affected transitive dependencies.
  The release lockfile reports zero known vulnerabilities in `npm audit`,
  including development dependencies, at release validation time. This is not a
  guarantee that the application or bundled native/provider runtimes are free
  from vulnerabilities.
- Fixed the desktop ChatGPT launcher covering the last All tools menu item at
  narrow desktop widths. The existing responsive hit-testing regression covers
  this boundary alongside phone, landscape, zoom, and safe-area layouts.
- Made Electron license/source notices follow the exact locked runtime instead
  of stale hardcoded metadata; artifact verification rejects mismatched notices.
- Added explicit stable-release staging with matching source tags, directories,
  and checksum channels. Existing test-release staging remains supported.
- Updated installation and source documentation and repaired outdated smoke
  fixtures for Mods navigation, world-cover uploads, and native Chat panel
  readiness. Synthetic fixtures use isolated profiles, not personal sessions.

## Included workflows

This release retains the features from 0.2.17: desktop ChatGPT response-to-local-
plan review and explicit Work Order handoff; configurable, bounded assistant
recovery; durable local section checkpoints; guarded Voyage publication and
image-upload recovery; and Android workspace restoration. ChatGPT embedding
remains experimental and desktop-only. Remote saves remain explicit; local
checkpoint rollback does not promise remote rollback. Voyage routing remains
Alpha-only where documented.

## Validation and limits

The release audit records the exact regression, packaging, signature, and smoke
checks in [RELEASE_0.2.18_AUDIT.md](RELEASE_0.2.18_AUDIT.md). Windows is
cross-packaged on Linux; native Windows execution and physical Android
sleep/resume were not tested for this release. Android instrumentation compiles
but is not a device-test result. No live, paid provider or authenticated Voyage
requests were made during this release audit.

## Downloads and signing

- Windows: `Voyage-Workbench-0.2.18-windows-x64.exe`.
- Linux: `Voyage-Workbench-0.2.18-linux-x64.tar.gz`; extract it and run
  `run-linux.sh`.
- Android phones: `Voyage-Workbench-0.2.18-android-arm64-v8a.apk` for modern
  ARM64 devices. Use the x86-64 APK for compatible x86-64 devices, or the
  universal APK when both architectures are required. These are full/offline
  packages, not the historical lightweight provider-pack edition.

Windows Authenticode uses the existing self-signed test identity; SmartScreen
and unknown-publisher warnings may remain. Android retains the existing debug-
keystore signing identity for update continuity; it is not a Play Store release
or a new production signing identity. Linux archives and the checksum manifest
have detached signatures. Public verification material is in `checksums.json`;
private keys and account data are never included. A regular GitHub release does
not turn these identities into publicly trusted certificates.

The application remains GPL-2.0-only. `LICENSE.txt` and `SOURCE.txt` accompany
the release; the corresponding application source is tagged `v0.2.18` in this
repository. Bundled third-party runtimes retain their own terms and notices.
