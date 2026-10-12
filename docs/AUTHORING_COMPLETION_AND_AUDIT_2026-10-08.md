# Authoring completion and audit — October 8, 2026

## Delivered workflows

The approved authoring shortlist is implemented within the maintenance boundaries
below. This is not a claim that every feature in an external Studio is now identical.

| Feature | Where / behavior |
| --- | --- |
| Scoped Work Orders | Planning: search and select existing entries/systems, inspect selected paths, or explicitly allow the whole authored world. Advanced path JSON remains available. New approvals are hash-guarded and scopes revalidated at task start. |
| Readiness | Publish: separate draft/agent/local/proposal/baseline/journal/official/moderation rows. Official checks are explicit requests. Recorded results carry source hash, stage and time; draft validation cannot pass as publish validation. |
| Reference impact | World tools or the current editor's entry-tools action: incoming/outgoing known structural links, unresolved targets, navigation and explicit coverage registry. |
| Checkpoint UX | History: manual labels, rename labels, compare any two revisions (including active content) in a full-screen exact diff, and stage a restore for selective review. |
| Completeness | World tools: structural findings separate from configurable optional-section advice; navigate to the closest existing entry. Unknown fields are retained, not rejected. |
| Contextual guidance | Current editor: collapsible cached schema/summary information for the selected field, available with both Form and JSON. Missing/uncertain guidance is labeled. |
| Navigation / bookmarks | World tools: search all authored entries, named project bookmarks and bounded device-local recents. Deleted bookmark destinations remain visible as unresolved. |
| Duplication | World tools: new content key, collision checks, optional supported display-name replacement; proposal first. Exact numbers and unknown fields survive. External relationships are preserved and builder notes are not copied. |
| Entity-centered review | Proposals: entry/entity grouping or exact field order over the same exact diff and selective choices. Checkpoint comparison supports both groupings too. |
| Narrow batch edits | World tools: explicitly select up to 100 entries from one record collection, replace one existing scalar field with matching type, preview in Proposals, then selectively accept. |
| Asset inventory | World tools: deduplicated image/audio references and their usage paths; embedded byte sizes; local generation/upload records with explicit local-size inspection. Remote size/availability remains unknown; no automatic fetch/deletion. |
| Builder-context preferences | Settings: default inclusion; Planning has a per-request override. Explicit Address project notes always includes its queued notes. Existing note outcomes and change history remain accessible. |

World tools is in All tools and can be promoted/reordered using the existing shortcut
settings. Contextual tools do not add permanent header controls. Authoring defaults
are adjustable in Settings; saved orders, world data and bookmarks are not rewritten.

## Deliberate boundaries

- Structural relationship coverage currently includes NPC location/faction, location
  region and region realm. It does not infer references in scripts, prose or unknown
  custom fields. There is one shared registry for validation and impact analysis.
- Duplication supports object entries in authored record collections. Arrays, package
  records and independent/ambiguous identity fields require manual editing. A matching
  explicit `id` is changed to the new content key. No heuristic global rewriting.
- Batch edits require 1–100 distinct entries, one collection and existing scalar fields
  of the same type. Identity and known relationship fields are excluded.
- Bookmarks into arrays are positional and clearly labeled as such. They do not claim
  stable entity tracking through ambiguous array reorders.
- Entry/asset traversals disclose their 100,000-node/depth bounds. Lists and comparisons
  are paginated. Local asset inspection covers stored asset data, not arbitrary filesystem
  crawling. Custom asset naming may be missed.
- Checkpoint restore retains package-identity protections. Incompatible metadata must
  be excluded in selective review; history is not an identity override.
- Git remains a separate architectural evaluation, not a newly implemented history
  backend. The existing transactional SQLite checkpoint store remains authoritative.

## Audit and bug pass

Reviewed source preservation and metadata guards, task/scoping/provenance transitions,
notes/requeueing, history isolation and restore, pagination, mobile hit testing/layout,
defaults persistence, asset/relationship coverage, remote readiness and credential paths.

Fixed findings:

1. Readiness records initially failed the desktop/Android feature-key allowlists.
   Added the bounded project-key namespace and round-trip tests on both hosts.
2. Mobile form content could overlap contextual controls. Corrected flex sizing and
   added actual hit-testing to the Electron regression, not just overflow assertions.
3. Removing the last result on a later page could strand notes/suggestions/outcomes.
   Added shared offset clamping across new tools and existing note workflows.
4. Grouped review parsed the entire source per change. It now parses once and groups
   with an indexed lookup, preserving exact changes and selection semantics.
5. A previously approved suggestion could become stale before work started. Task
   preparation now rejects stale/missing provenance and revalidates reviewed scopes.
6. Normalizing comma-separated advisory sections on every keystroke prevented normal
   typing. Editing now retains the text draft and saves on leaving the field.
7. Missing completeness destinations swallowed navigation errors. The action now finds
   the nearest existing ancestor and reports draft/navigation blockers visibly.
8. Unrelated preference changes reset the per-task builder-note override. Only a change
   to the actual inclusion default updates that override. Disabling/reducing recent
   history also truncates its stored list rather than merely hiding old entries.
9. Draft-stage official validation could be misread as publish readiness. Results are
   now matched against both source revision and selected validation stage.
10. Remote plaintext provider endpoints could transmit credentials and world content.
    API use now requires HTTPS off-device, including old saved routes, artwork and
    model-list requests. Canonical localhost/127.0.0.1/[::1] HTTP remains supported;
    non-loopback HTTP LAN/emulator-host endpoints must use TLS or a loopback tunnel.
11. Desktop credentials were overwritten in place and updated in memory before a
    failed write. Ciphertext now uses a synced temporary file and atomic replacement;
    the memory state only commits after persistence succeeds. OS-encryption-unavailable
    sessions retain the existing session-only behavior, never plaintext persistence.
12. Artwork detail silently changed grid dimensions (and potential request count).
    Separated detail from explicit row/column controls while retaining the conservative
    2×2 new-plan default and every existing saved artwork job.

Android API-key storage remains AndroidKeyStore-backed authenticated
encryption with credential-name binding and backup exclusions. Credentials are not
introduced into project exports, note snapshots or stored provider/task settings.

## Validation

Final post-audit validation:

- 158 Node/core/UI/desktop-host tests pass, with no failures or skips.
- TypeScript typecheck, production UI/desktop build and ES5 native-engine build pass.
- Electron smoke passes all 51 workspace layouts (17 tools × 3 widths), provider
  settings, sync/import, exact Form/JSON round trips, publication preview, cover flows,
  all six authoring panels, staged duplicate/batch acceptance, bookmark persistence,
  scope approval, full-screen checkpoint comparison, readiness and artwork defaults.
- 28 Android app-package instrumentation tests pass. The live/paid agent fixture is
  explicitly excluded; native provider fixtures run against loopback test servers.
- `git diff --check` passes. Browser verification at 320 px confirms the contextual
  entry-tools button is clickable rather than covered by form fields, with no page
  overflow. Internal reference-impact screenshot evidence is retained privately.
- Final debug APK rebuilt and installed on the local SDK emulator without app-data
  reset: `android/app/build/outputs/apk/debug/app-debug.apk`.
- APK SHA-256: `fb1e5487b7259e417ec3793d8eb52aae0422e62958ceb1b7d299bd7acfabb947`.

Logs: `/tmp/voyage-authoring-tests.log`, `/tmp/voyage-authoring-typecheck.log`,
`/tmp/voyage-authoring-build.log`, `/tmp/voyage-authoring-smoke.log`,
`/tmp/voyage-authoring-native-build.log`, `/tmp/voyage-authoring-native-tests.log`.
The T3 Device panel cannot discover this SDK; verification uses configured SDK/ADB.

No paid provider call, public release, data reset, Git migration or destructive cleanup
is performed. Live-provider reliability and the remote service's current API/Studio
parity are not certified by local fixtures. The production bundle has a non-blocking
Vite size advisory; deeper code splitting remains a performance follow-up, not a
reason to suppress the warning. This is an engineering audit pass, not a formal
penetration test or proof that no undiscovered bugs remain.
