# Voyage Workbench 0.2.11 — Smaller packages and optional Android runtimes

## Standard packaging

- Duplicate desktop reference and legal-notice copies are removed; the application
  and offline notice viewer use one bundled copy. Required notices remain present.
- Identical Cursor SDK files are stored once across Android architectures. Each
  device reconstructs the exact original SDK tree, without foreign-ABI files.
- Full/offline builds remain the upgrade-safe default. Windows and Android keep
  the existing signing identity; Windows remains self-signed, not CA trusted.
- Android version code 13 updates existing installations without uninstalling.
- Includes the finished artwork destination and safe new-world-copy work, plus
  deterministic template ordering and protection against an in-flight character
  refresh replacing newly typed edits.

## Lightweight Android edition

An additional ABI-specific lightweight APK provides the same editor without
preinstalling agent binaries. Settings → Models & agents → On-device runtimes
shows each qualified provider version, readiness, and download size. Installing
Codex, Claude Code, or Cursor downloads only that provider and missing shared
support. Merely viewing presets or selecting a model never downloads anything.

Provider files are unmodified official upstream runtime/SDK packages, repackaged
into Workbench-signed Android splits. Downloads are from this project's versioned
GitHub release, not directly from the vendors. An embedded catalog protected by
the base APK signature pins each complete APK's SHA-256, byte size, version, ABI,
and signing identity. Android verifies signatures/package/version atomically at
installation. No signing key is included in the app. Updating compatible provider
versions requires a qualified app release; untested upstream `latest` is not used.

Installation is explicit, requests Android's normal approval, and may restart the
app. Save settings first. There is progress, cancellation, missing-dependency
feedback, and actionable retry/error states. Installation does not sign in, run
inference, forward account credentials to download servers, or fall back to an
inference API. Active tasks block installation; incomplete runtimes cannot start.

Use the full/offline APK if you need all providers immediately, cannot permit
in-app package installation, or want to avoid downloading packs later. Do not
uninstall the app to switch editions: local projects and encrypted credentials
belong to the existing application identity. Runtime packs are not standalone apps.

## Platforms and release boundaries

Windows x64 portable EXE, Linux x64 tar.gz, full Android ARM64/x86-64/universal
APKs, and lightweight ARM64/x86-64 APKs are included. Source belongs in the
separate GPLv2-only source repository, never as a source archive in downloads.
Private projects, account state, signing keys, logs, and development caches must
not be published. Physical ARM64 execution and native Windows execution remain
unverified on this Linux release host; see the release audit for test evidence.
