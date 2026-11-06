# Voyage Workbench 0.2.23 — World-focused imports and usability fixes

This is a **prerelease**, tagged `v0.2.23-test`. Stable 0.2.18 remains GitHub's
Latest release. Android version code is **25**. Existing application and signing
identities are preserved so this build can update previous test installations.

Back up important projects and test with a copy first. This update uses the same
application identity and data directory, not a separate preview installation.
Do not uninstall Android merely to update: uninstalling can remove local data.

## Changes and what to test

- **Adopt verified API additions automatically:** server-only world-data additions
  no longer require manual approval after a save. Submitted values, identity,
  version fields, array positions and the local source/revision must still match.
  Overwrites, removals and mixed differences remain explicit review cases. The
  original submission and a local checkpoint are retained; no extra write is sent.
- **See ongoing work:** header activity reports image/model/Voyage operations,
  targets, elapsed time and recent outcomes across views. Cover Studio shows
  generation/review progress inline. No fake percentages or automatic paid retries.
- **Use world data throughout authoring forms:** public metadata, cover and map
  briefs, creation premises and public previews use shared source-backed defaults.
  Untouched fields follow updates; edits are preserved. Missing facts and provider
  permissions are not invented, and private lore is not copied to public blurbs.
- **Accept expected open-ended score bounds:** the first tier's null minimum and
  the final tier's null maximum are valid. Interior and unrelated invalid null
  numbers still fail local checks; no sentinel values are inserted.
- **Review world changes instead of file churn:** import aligns bare Voyage
  GameState and Creator API envelopes and compares actual values, ignoring
  whitespace, object-key order, equivalent escapes and equivalent number spelling.
  Authored-world changes are shown first, with separate inspectable runtime,
  scaffolding, compatibility and API metadata categories. Classification never
  silently excludes selected changes.
- **Keep minification noise automatically:** local assistant, restore and older
  proposals also retain current object-key ordering and equivalent value
  spelling without hundreds of order-only review rows. Real field additions,
  removals and array reordering remain visible. Exact remote-save recovery
  remains a separate complete-snapshot review.
- **Merge or Replace explicitly:** Merge is the default and retains omitted
  branches, including generated/runtime records and unknown fields. Replace
  clearly warns about removals. Keep individual changes or an entire category
  across all pages, inspect full values, validate the exact selection, or refresh
  the comparison if the current world changes. Acceptance creates a checkpoint.
  Identity, transport, safety and linked version protections remain in force.
- **Ask for a short explanation:** optional assistant summaries use the configured
  Planning provider/model, including Codex CLI. The isolated read-only task sees
  the selected import snapshot, cannot edit or accept it, and reports coverage,
  truncated excerpts and stale summaries. Provider quota/billing may apply.
- **Refresh public authoring references deliberately:** refresh community schema,
  guides, limits, voices and starter JSON together from the unofficial community
  service. Documentation and schema authority remain distinct; refreshing does
  not upload your world or silently migrate it.
- **Switch projects safely:** delayed commands and loading results cannot overwrite
  a different project or fire stale follow-up UI actions. Concurrent actions keep
  their busy feedback until all have completed. Import choices no longer mutate
  earlier saved proposal snapshots.
- **See saved artwork more reliably:** previews prefer available local originals
  and can fall back to hosted references. Loading and error feedback follow the
  selected asset; preview errors do not delete artwork or assignments.

See [world import review](WORLD_IMPORT_REVIEW.md),
[community references](COMMUNITY_REFERENCE_INTEGRATION.md), and
[save normalization and recovery](VOYAGE_SAVE_NORMALIZATION.md).
Other remote save read-back recovery remains separate and all-or-nothing. Generating,
uploading, attaching, remote saving, moderation and publishing remain separate
actions. Codex generation uses Codex CLI, not a direct OpenAI API fallback.

See [world-backed forms, activity and automatic additions](WORLD_DEFAULTS_AND_ACTIVITY.md)
for data precedence, privacy, restart behavior and safe-adoption limits.

## Downloads and signing

- Windows x64: `Voyage-Workbench-0.2.23-windows-x64.exe` (portable).
- Linux x64: `Voyage-Workbench-0.2.23-linux-x64.tar.gz`; extract and run
  `run-linux.sh`.
- Android ARM64: `Voyage-Workbench-0.2.23-android-arm64-v8a.apk`. An x86-64 APK and
  a larger universal APK are also supplied.
- `checksums.json` records sizes, SHA-256 digests and public verification material.
  Detached signatures accompany the Linux archive and checksum file. Existing
  Android and desktop test-signing identities are preserved. Windows may still
  show unknown-publisher or SmartScreen warnings; self-signing does not establish
  public certificate trust.

## Validation and known limits

Typecheck, application/core/host/provider/rendered-UI tests, compiled native
harness scenarios, production builds, Android compilation, and release-contract
checks cover the changed workflows. Tests focus on complete import, artwork and
delayed-command journeys rather than adding redundant assertions as separate tests.
Packaging verifies current assets, versions, dependency notices, ABI metadata,
privacy exclusions and signatures before upload.

No live authenticated Voyage writes, paid generation, physical-device
instrumentation or native Windows execution are claimed. Account-specific Codex
model access still needs testing. The previously reported responsive map-thumbnail
timeout remains a validation limit; the full responsive suite is not claimed to
pass. This build does not claim the entire creation vision is complete.

Application source is GPL-2.0-only at the release tag. Third-party components
retain their own licenses and source-access obligations. Release artifacts
exclude private projects, attached research/world files, credentials and private
signing material.
