# Voyage Workbench 0.2.25 — Codex sign-in reuse and Alpha Creator updates

This is a **prerelease**, tagged `v0.2.25-test`. Stable 0.2.18 remains GitHub's
Latest release. Android version code is **27**. Existing application IDs, data
directories and signing identities are retained. **Update in place; do not
uninstall to resolve a Codex session limit.** Back up important projects first.

## Codex session handling

- Codex CLI checks saved authentication before requesting any device-code login.
  An existing account is reused across connections, assistant work, model checks
  and artwork. A failed/uncertain account check never starts a replacement login.
- Repeated requests share one pending attempt. Completion is matched to its
  login ID, including early events. Canceled/stale attempts cannot replace newer
  status. Codes disappear when finished, canceled or expired.
- The Connection and Models & agents screens show the same in-place sign-in
  controls, code copying, browser link, automatic local progress and cancellation.
  Session-limit responses never cause automatic re-login, logout or API fallback.
- Explicit desktop CLI-cache reuse preserves an already working app sign-in
  rather than overwriting it. Cancel/expiry cleans up the owned attempt; sign-out
  and credential replacement are blocked while Codex model work is active.

Workbench cannot enumerate or revoke other applications' sessions. A local CLI
process is not itself a new authenticated account session. The local 15-minute
pending-code window is not an OpenAI account-session lifetime or quota.
See [Codex sign-in details and limits](CODEX_SIGN_IN.md).

## Alpha Creator API and world authoring

- New **Analytics & feedback** screen: publish history, retention, daily play,
  session-depth and discovery-source reports, plus filtered/paginated shared
  feedback. Read-only, on demand, Alpha-only; reports show their actual freshness.
  Missing/null data is not zero, daily unique players are not summed, and player
  feedback is untrusted text, never automatically supplied to a model.
- Alpha V37 forms expose verified moving-location effects, resource descriptions
  and multiple resource boosts per attribute. Existing single-object boosts and
  unknown fields are preserved, not silently migrated. Official validation still
  decides acceptance for the target engine.
- Existing Alpha publication advisories retain the 350,000-character item catalog
  and 4,000-character Media Content limits. Nothing is automatically truncated.
- Production/Beta keys remain separate and worlds are not bound to a host.
  Actual world engine versions—not environment labels—drive upgrade warnings.
  New actions use the chosen connection; pending saves/uploads retain their
  original host. No engine upgrade is automatically approved.

NPC reaction frequency is Voyage runtime behavior. Duplicate/delete mods remain
Studio actions because this verified API contract has no such mutation endpoints.
See [Alpha evidence and compatibility scope](VOYAGE_ALPHA_UPDATES_2026-11-09.md).

Earlier in-place portrait/save actions, tier-art exclusions, scrollable character
lists and long-dialog usability changes are included. All 0.2.24 save/recovery
fixes remain included. The separate **Voyage Sync** micro app remains at its own
`sync-v0.1.0-test` release and is not replaced by these full Workbench installers.

## Downloads, verification and limitations

Windows x64 portable EXE, Linux x64 archive, and Android ARM64, x86-64 and
universal APKs are supplied. Linux and `checksums.json` have detached signatures;
Windows has an embedded self-signed test signature. These preserve the existing
development signing identity, not public certificate trust or store approval.

Shared typecheck/build, the 654-check JS/TS suite, compiled-native bridge,
focused Android JVM/Java compilation and release artifact/version/privacy/
signature checks run before publication. UI/auth workflows use synthetic data
and mocked Codex RPC, not real account-session allocation or revocation.
No physical phone, native Windows execution, authenticated live Voyage report
read/save or paid generation is claimed. Test remote changes on a copied world.
This prerelease does not complete or certify the entire world-creation vision.

Source is GPL-2.0-only at the release tag; bundled third-party terms remain
applicable. Credentials, signing keys, user worlds and private research are
excluded. The adjacent source notice identifies the corresponding application
source; published checksums identify the exact installer bytes.
