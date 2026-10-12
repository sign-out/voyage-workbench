# Pre-alpha feature completion and audit — October 8, 2026

## Scope and tournament outcome

Implemented the winning designs in `PRE_ALPHA_FEATURE_TOURNAMENT_2026-10-08.md`:

- A global asset catalog in existing guarded feature storage, with separate local
  originals and retained hosted URLs. Project deletion does not delete the library.
- Content-hash and exact-URL deduplication, including consolidation of local-only
  and URL-only records. Bulk import reports individual failures without discarding
  successful imports. Names, tags, search, type/storage filters, inspection,
  original export, legacy discovery and reviewed world assignment are available.
- First-class soundtrack families, variants, cues and character-creation selection,
  with cached-schema forms, peer JSON, durable drafts and reviewed edits.
- Explicit music allowance/PUT/finalization with durable operation receipts,
  exact retry keys, concurrency leases and hosted URL reuse. Upload credentials
  stay in the host credential vault, not the library or music journal.
- Author-controlled publication details over the existing envelope, or separate
  local creation details for bare GameState projects. Package identity remains
  protected; incomplete typed values survive until review-time validation.
- Focused Mechanics/runtime-AI section navigation using existing schema editors,
  rather than a parallel editor framework or invented game defaults.
- Reviewed ordered mod references plus bounded exact-path conflicts/shared values.
  Missing sources and unmatched pinned versions remain explicitly unknown.

All three added workspace tools participate in the existing customizable tool
selection/order settings. Opening an editor never creates missing game sections
or starts paid work. Local asset management requires no open project.

## Audit corrections

- Publication now has one scroll owner: the readiness checklist no longer squeezes
  author controls underneath phone navigation. Browser hit-testing confirms the
  review button is reachable at 320 × 915.
- Incomplete `https://` input persists after reload without a premature error or
  lost keystrokes. Invalid JSON stays in the same saved section draft.
- Asset selection uses an actual modal with focus restoration, not a squashed
  inline picker. Existing full-size artwork/publication previews are retained.
- An expired signed URL after a lost PUT response attempts finalization before
  requesting new bytes or another allowance. Pending/conflicting finalization
  responses stay unknown and resumable; HTTP status alone does not prove expiry
  except an owned upload that is not found. Expired replay-window acknowledgement
  remains explicit and retains its receipt.
- Reserved custom music cannot bypass the documented assignment-field restriction
  through the picker's general hosted-URL reuse button.
- Signed-upload payloads are bounded before decoding on both hosts, and before
  address resolution on desktop. Image/audio decoded byte limits remain enforced.
- Mod catalog extraction uses original JSON slices, not `JSON.stringify` of
  parsed response values. Adjacent integers above JavaScript's exact-number limit
  therefore cannot become a false shared-value finding.
- Successful image uploads retain their known outcome if catalog indexing fails;
  local project indexing cannot upgrade an unsaved music reservation to durable.

## Validation evidence

- TypeScript typecheck: passed.
- Node/core/UI/desktop-host tests: **176 passed**, none failed or skipped.
- Production UI, desktop bundle and ES5 native-core build: passed.
- Existing Electron smoke: **60 workspace layouts** plus existing draft,
  provider, artwork, publication, import/save and authoring regression workflows.
- New Studio smoke: **15 feature layouts**, actionable-button hit-testing,
  bulk deduplication/partial failure, modal focus, durable music drafts and review,
  hosted reuse without uploads, publication identity and mod conflict/review flows.
- Android app and instrumentation APK builds: passed.
- Android emulator instrumentation: **33 passed**. The explicitly paid/live agent
  fixture is excluded. Native coverage includes encrypted upload credentials,
  catalog compare-and-set, media export, narrow endpoint allowlists and payload bounds.
- Final Android debug APK installed and app launched on `emulator-5556`.
- `git diff --check`: passed. Existing workspace changes are preserved.

Local logs are `/tmp/voyage-studio-{typecheck,tests,build,sync,workflows,smoke,native-build,native-tests}.log`.
Expected error messages in the existing desktop smoke are intentional fixtures
for remote revision conflicts and unavailable cover grading, not failed tests.

## Test artifact

`releases/android/Voyage-Workbench-0.2.6-studio-test.apk`

SHA-256: `1237d4594cf8a109518950716f5cfd8b7c2912f7d510afb3eb02e5c4bf46c7b4`

This is a local debug/test build, not a signed production release or a public
download publication. Existing packaged desktop release binaries are not rebuilt
by this pass; desktop validation uses the freshly built application bundle.

## Remaining boundaries before release qualification

- No live music allowance, paid provider request, world save or remote publication
  was performed. Cached API contract, deterministic transport fixtures and native
  storage tests do not establish live service qualification.
- Hosted URLs are retained, not promised reachable forever. Finalized music must
  be saved to a remote revision before its reservation expires.
- No cloud library synchronization, waveform editing/mixing, music generation,
  automatic remote downloads, automatic reuploads or speculative deletion.
- Conflict review is advisory authored-path overlap analysis, not an engine-order
  simulator or semantic merger. Analysis limits and incomplete coverage are visible.
- Mechanics/AI controls preserve the existing schema and unknown fields; they do
  not invent defaults, runtime behavior or a different agent settings system.
- Complete Native Studio parity is not claimed. Remaining visual/runtime gaps stay
  recorded in `STUDIO_PARITY.md`, including dense maps, richer mod cards, Markdown
  toolbar and native-private note/sync semantics.
- T3's Device panel could not find its SDK/support installation. Native validation
  uses the working configured Android SDK and ADB emulator instead.

The feature pass is complete within these boundaries. Freeze work should prioritize
authorized end-to-end service qualification and device dogfooding, not new systems.
