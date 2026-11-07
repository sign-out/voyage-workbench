# Voyage Workbench 0.2.24 — Confirm saves with empty optional maps

This is a **prerelease**, tagged `v0.2.24-test`. Stable 0.2.18 remains GitHub's
Latest release. Android version code is **26**. Existing application, data and
signing identities are preserved so this build updates previous test builds.
Back up important projects before updating; uninstalling Android can remove data.

## Changes and what to test

- A successful save no longer stays unconfirmed solely because Voyage omits
  empty `unassignedAreas` or `worldVoices` maps. The comparison receipt records
  those paths, and the success message explains the normalization. Your local
  JSON is preserved.
- After upgrading, use **Reconcile save** on an older affected save. If those
  empty maps are the only differences, Workbench confirms it without another PUT.
- Pure server additions, including generated quest triggers, are still adopted
  automatically when those empty maps are omitted in the same response.
- Removing populated maps, changing existing world values or versions, and
  removing unknown fields still require explicit review. This exception applies
  only to the two named root GameState maps when they are empty objects.

All earlier [0.2.23 changes](RELEASE_0.2.23_TEST_NOTES.md) remain included.
See [save normalization and recovery](VOYAGE_SAVE_NORMALIZATION.md).

## Downloads and validation

Windows x64 portable EXE, Linux x64 archive, and Android ARM64, x86-64 and
universal APKs are supplied. Existing signing identities are retained; detached
signatures accompany Linux and `checksums.json`. Windows uses a self-signed test
certificate, which does not establish public certificate trust.

Focused save/recovery and rendered review checks cover confirmation, older-save
recovery, durable receipts, additive updates, protected deletions and exact large
numbers. Typecheck, the compiled native harness, production builds, Android JVM
checks and artifact/version/privacy/signature verification run before publishing.
No live authenticated Voyage writes, paid generation, physical-device testing
or native Windows execution are claimed. Existing responsive-suite limitations
from 0.2.23 remain; this release does not complete the entire creation vision.

Source is GPL-2.0-only at the release tag. Third-party terms remain applicable.
Private projects, attachments, account credentials and signing keys are excluded.
