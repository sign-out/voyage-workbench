# Maintainable feature planning tournament — October 8, 2026

Subsequent approvals supersede the reserve status of checkpoint comparison and the related shortlist additions. See `APPROVED_FEATURE_SCOPE_2026-10-08.md` for approved scope, adjustable defaults, and the Git/storage decision boundary. This tournament remains the rationale, not an implementation-status report.

## Decision in brief

**Safety prerequisite / tournament winner: proposal inbox safety and explicit retention.** Do not add a parade of new features on top of a reducer that can silently trim old pending work.

**Best genuinely new feature: a read-only reference impact inspector.** “Where is this used?” makes NPCs, factions, locations, areas and voices easier to understand, and creates the foundation for safer deletion and eventual narrowly scoped renames.

**Next workflow upgrades: scoped Work Orders, contextual help, and a save/publish readiness walkthrough.** These improve what already exists instead of introducing new services or parallel editing systems.

This is a planning artifact, not authorization to implement all winners. Full Native Studio parity remains a separate required track; losing an optional-feature tournament does not excuse dropping a requested native feature. The latest editor pass is documented in `STUDIO_PARITY_VALIDATION_2026-10-08.md`; remaining parity work is in `STUDIO_PARITY.md`.

## Interpretation and evidence

The user wants additions that add value **without becoming untenable to maintain**. The assessment therefore favors inspectable, local-first, deterministic changes and extensions of existing machinery.

The evidence is this repository and the user's screenshots/feedback, not a fictional survey of authors. Frequency/value ratings are hypotheses, not measured usage data. No implementation-time estimate or score is a performance guarantee. Scores within five points should be treated as roughly tied.

Inspected implementation anchors:

- `packages/core/document.ts`: exact-source spans, read/edit/insert/remove, authored-state paths, search, cached-schema validation and selective diff/apply support.
- `packages/core/project.ts`: durable draft state, base-hash guards, proposals, Work Orders/allowedPaths, task states, remote operations, and bounded task/proposal lists.
- `packages/core/features.ts`: maps, characters, ordered mods, publication inspection and base derivation.
- `hosts/desktop/service.ts` and Android `Host.java`/`Store.java`: checkpoint/history exports, recovery, explicit remote save/read-back/reconciliation, reference caching and provider hosting.
- `apps/workbench/src/main.tsx`: existing All tools, project status/history, proposal review, Work Order editing and durable draft UX.
- `apps/workbench/src/StructuredEditor.tsx`, `world-references.ts` and `ValueEditor.tsx`: the newly shared form/JSON views, real reference catalog, safe image inspection and source-preserving draft controls.
- `docs/DEFAULTS_REVIEW.md`: known broad-scope, retention, grader-route and artwork-default issues.

Existing search, checkpointing, provider presets, clipboard/export, full-screen previews, source fidelity and secure credential storage are **incumbents**, not novel proposals. Only a concrete improvement over those incumbents earns a place.

## Round 0 — maintenance and safety gates

Every candidate must pass these gates before it can become build-ready:

1. No silent world changes, source-number round trips, hidden defaults, lost pending work or replacement of protected package identity.
2. No new remote write, paid request, provider choice or publication without explicit user intent.
3. No secret store, session directory, API token or agent login files in exports, diagnostics or prompts. Arbitrary authored content is not silently rewritten or stripped; warn about sensitive content rather than pretending an export can safely sanitize an unknown world.
4. Reuse the shared TypeScript core and existing Android/Electron host boundaries where possible. A platform-specific feature needs explicit tests and ownership, not an optimistic browser-only prototype.
5. No parallel draft, history, validation, provider or task engine. New UI must use the existing guards and review/checkpoint flows.
6. A schema/reference-based feature must preserve unknown/runtime references and disclose what it cannot verify. Unknown is not the same as invalid.
7. No claim of runtime simulation or undocumented Studio/API capability based only on a screenshot.
8. Bound rendering, background work and resource use. Large worlds must have cancellable/worker-backed scans and pagination where necessary.
9. Accessibility and phone/tablet usability are acceptance conditions, not a decorative stretch goal.

Vetoes are not permanent bans on ideas. They mean the current code/evidence does not justify adding the maintenance obligation now.

## Round 1 — weighted seeding

Ratings are 1–5, with 5 best. Column order is **Value / Frequency / Architecture fit / Maintenance simplicity / Safety / Evidence**. Maintenance simplicity incorporates dependencies, platform branches, schema churn, migrations, test surface and ongoing support—not just initial code length.

Weights: value 25%, frequency 10%, fit 20%, maintenance simplicity 20%, safety 15%, evidence 10%. Score = sum(weight × rating) / 5. The table is a transparent starting judgment, not empirical measurement. Safety vetoes override any score.

| ID | Candidate | V / F / Fit / M / S / E | Score / 100 | Decision | Rationale |
| --- | --- | --- | --- | --- | --- |
| C01 | Reference impact inspector | 5 / 5 / 5 / 5 / 4 / 4 | 95 | Advance | New read-only navigation over known references; no new service. |
| C02 | Safe entity-ID rename | 5 / 3 / 4 / 3 / 3 / 3 | 74 | Defer | Valuable, but script/free-text/runtime references make blanket renames unsafe. |
| C03 | Scoped Work Order builder | 5 / 4 / 5 / 4 / 5 / 5 | 94 | Advance | Reuse allowedPaths and proposals; replace the broad scope UX, not the task engine. |
| C04 | Proposal inbox safety and explicit retention | 5 / 4 / 4 / 4 / 5 / 5 | 90 | Advance | Existing bounded arrays are a preservation risk; safety prerequisite. |
| C05 | World coverage checklist | 4 / 4 / 5 / 4 / 4 / 4 | 84 | Advance | Deterministic missing-reference/content diagnostics, not AI judgments. |
| C06 | Contextual field help and schema provenance | 4 / 4 / 5 / 5 / 5 / 4 | 91 | Advance | Use cached references; no second wiki or duplicate validation schema. |
| C07 | Save/publish readiness walkthrough | 5 / 5 / 5 / 4 / 5 / 5 | 96 | Advance | Present existing operations and blockers; never invent server status. |
| C08 | Checkpoint comparison and labels | 4 / 4 / 5 / 4 / 5 / 5 | 89 | Advance | Extend existing History/diff/checkpoint engine; not a second history store. |
| C09 | Command palette | 3 / 4 / 5 / 5 / 5 / 5 | 88 | Advance | Share existing tool/navigation actions, with no command plugin system. |
| C10 | Verified history-archive restore | 5 / 3 / 4 / 2 / 4 / 3 | 73 | Defer | Export exists; secure bounded restore, migration and task replay rules are new work. |
| C11 | Previewed scoped text replacement | 4 / 3 / 4 / 3 / 3 / 4 | 71 | Defer | Useful only with leaf/path selection, checkpoints and explicit change review. |
| C12 | Local asset inventory | 4 / 3 / 4 / 4 / 5 / 4 | 81 | Reserve | Read-only listing of local assets and authored URLs; no automatic web crawling. |
| C13 | Provider-wide cost dashboard | 4 / 4 / 3 / 2 / 3 / 2 | 61 | Reject broad scope | No reliable universal usage/pricing contract established in this codebase. |
| C14 | Named local planning conversations | 4 / 4 / 4 / 3 / 4 / 3 | 74 | Required-parity track | Keep as parity work; avoid inventing server-private conversation sync. |
| C15 | Curated reusable content snippets | 3 / 4 / 4 / 4 / 4 / 3 | 73 | Defer | Needs collision and reference-remapping rules; snippets are not world templates. |
| C16 | Entity bookmarks and recent locations | 3 / 4 / 5 / 5 / 5 / 5 | 88 | Merge into C09 | Same navigation surface; separate implementations would duplicate maintenance. |
| C17 | Automatic remote synchronization | 4 / 4 / 2 / 1 / 1 / 2 | 47 | Veto | Changes remote-write intent, conflict handling and background-work obligations. |
| C18 | Real-time multiplayer editing | 4 / 2 / 1 / 1 / 1 / 1 | 37 | Veto | Requires a new collaboration/conflict/service architecture. |
| C19 | Full local Voyage game simulator | 5 / 3 / 1 / 1 / 1 / 1 | 44 | Veto | No verified equivalent runtime semantics; a convincing mock is not parity. |
| C20 | Third-party extension marketplace | 3 / 2 / 1 / 1 / 1 / 1 | 32 | Veto | Adds API stability, untrusted code, permissions and ecosystem support duties. |
| C21 | Automatic AI lore repair | 4 / 3 / 3 / 1 / 1 / 2 | 49 | Veto | Subjective edits, paid calls and false corrections; explicit proposals already exist. |
| C22 | Cross-platform background generation scheduler | 3 / 3 / 3 / 2 / 2 / 2 | 51 | Defer | Background execution, task recovery and device lifecycle increase the support matrix. |
| C23 | Theme designer | 2 / 2 / 3 / 3 / 4 / 4 | 58 | Reject | Current graphite/slate preferences meet the demonstrated need; low incremental value. |
| C24 | Local embedding/semantic-search runtime | 3 / 3 / 2 / 1 / 2 / 2 | 43 | Defer | New model/index/storage maintenance; improve existing deterministic search first. |

### Adversarial judges

- **Author:** Does this remove an observed editing/review bottleneck rather than merely add another screen?
- **Solo maintainer:** Can it reuse the current engine, survive cached-schema changes, and be covered without a new service team?
- **Safety/recovery:** What happens after a crash, stale draft, renamed ID, interrupted request, old archive or unavailable provider?
- **Phone/accessibility:** Is it usable on a small screen, with a keyboard, with visible focus, and without squeezed previews?
- **Skeptic:** What happens if the evidence or assumed usage frequency is wrong? Is the minimal version still useful?

A judge can force deferral despite a high score. In particular, a technically cheap destructive feature is not maintainable merely because its implementation is short.

## Round 2 — bracket with incumbent challenge

C16 merges into C09 before the bracket. C14 remains on the required parity track rather than pretending a user-requested feature is optional. The eight finalists are C01, C03, C04, C05, C06, C07, C08 and C09.

| Match | Challenger arguments | Winner and reason |
| --- | --- | --- |
| C01 Reference impact vs C09 Command palette | Palette makes existing tools easier to reach; reference impact reveals relationships the current UI cannot inspect. | **C01**: greater incremental author value and directly supports the new relationship forms. Palette is still a cheap later polish pass. |
| C03 Scoped Work Orders vs C08 Checkpoint comparison | Comparison strengthens recovery; narrower work scope reduces unintended edits before they reach review. | **C03**: fixes a known overly broad default while reusing allowedPaths and proposals. Existing checkpoints already offer a recovery baseline. |
| C07 Save readiness vs C06 Contextual help | Help makes forms clearer; readiness makes local/saved/moderated/published states harder to confuse. | **C07**: clarity before consequential actions has higher value. Help is a low-cost supporting increment, not a new documentation subsystem. |
| C04 Inbox safety vs C05 Coverage checklist | Coverage finds unfinished world areas; retention prevents an author's work from disappearing. | **C04**: preservation is a hard prerequisite, not a quality preference. |
| C01 vs C03 | References help both human authors and later safe operations; scoped work mainly improves agent workflows. | **C01**: useful even with every provider disconnected. C03 remains an immediate safety/workflow priority. |
| C07 vs C04 | Readiness has the highest initial score; retention has a concrete known failure mode, while remote operations already have guards. | **C04**: a safety veto defeats the seed score. UI clarity cannot compensate for missing work. |
| Final: C01 vs C04 | C01 is the best new authoring capability; C04 makes existing work reliably recoverable. | **C04 wins the first implementation slot. C01 wins the new-feature slot.** This distinction prevents exciting features from displacing necessary repair. |

## Wildcard round — less conventional, still maintainable

The practical bracket should not suppress creative ideas. Four additional challengers test whether a less conventional experience can remain source-driven and cheap to maintain:

| Wildcard | Useful experience | Small, maintainable version | Hidden obligation / decision |
| --- | --- | --- | --- |
| C25 World sandboxes | Try a major lore/map/agent change without anxiety about the original world. | Explicitly fork current applied source into a new local project, with no inherited remote link or running task; compare selected changes through existing review. Offer to export/apply the original draft first rather than guessing which version to fork. | Cross-project rebase/merge semantics and source-copy storage can grow rapidly. **Strong reserve** after retention safety; do not build a git-like branching engine. |
| C26 Offline world tour | Browse a world as a sequence of places, people and lore instead of implementation folders. | Read-only, user-chosen location → areas → resident NPC cards using authored reference IDs. Include jump-to-edit and an explicit “not a gameplay simulation” label. | Unknown/runtime relationships and massive collections need honest coverage and bounded rendering. **Best creative follow-up to C01**, once a shared relationship index exists. |
| C27 Editorial contact sheet | Compare location/NPC imagery and descriptions side by side to spot tonal inconsistencies without a model judging the writing. | A filtered, virtualized collection view over current names, thumbnail URLs and short text; reuse existing full-size image inspection. No regenerated art and no automatic aesthetic score. | Adding a separate export/print/render stack would outweigh the initial value. **Reserve**, as another collection presentation rather than a new document system. |
| C28 Change blast-radius rehearsal | Before accepting an agent proposal, see which known world relationships would become unresolved. | Compare the reference index for current and proposed source, report added/removed/dangling structural links, then return to existing per-change review. | Cannot prove narrative correctness or runtime compatibility. Rejected-change selection and stale hashes must be reflected in the inspected candidate. **Merge into C01's later iteration**, not a parallel validator. |

Wildcard verdict: none defeats retention safety. The world tour is the most distinctive maintainable experience, but its shared relationship foundation should ship first. Sandboxes should reuse ordinary projects/checkpoints instead of introducing permanent branch algebra. Creative value is allowed; unsupported runtime guarantees and whole new subsystems are not.

## Round 3 — buildable winner specifications

### 1. Proposal inbox safety and explicit retention

**Problem:** Existing proposal/task caps can silently discard older work. Removing every bound forever is not a responsible fix either: task records can contain whole-world source copies.

**Minimal scope:** Never silently prune pending proposals or active/interrupted/recoverable tasks. Show retained counts and approximate storage cost. Let users explicitly discard or export/archive completed material. Preserve accepted/rejected outcomes where a retention policy says they are retained. Do not reinterpret “cancel” as “delete.”

**Reused pieces:** Project reducer, existing task states, history export, native/desktop stores and proposal review. The first change should protect pending work and make current bounds explicit; a larger archive-store migration is a separate decision.

**No-go boundary:** No automatic age deletion, hidden disk-pressure cleanup, auth-directory backup, or automatic resumption of restored tasks. A restore is data recovery, not an instruction to contact a provider.

**Acceptance tests:** Stage more than ten pending proposals; create more than fifteen mixed-state tasks; verify every pending/active/recoverable item survives subsequent operations, app restart and export. Test stale baseline rejection, legacy capped records, low-storage write failures and Android recovery. Measure full-source retention cost before adding automatic archival policies.

**Maintenance cost:** Medium, because storage semantics are involved. Keep policies in shared core rather than duplicated UI/native rules. Explicit archive versioning and bounded imports are required if a new archive format is introduced.

**Stop condition:** If a design requires two competing task/history engines, reject it and keep the smaller pending-work protection plus explicit export/discard policy.

### 2. Reference impact inspector

**Problem:** IDs are meaningful relationships, but authors cannot readily ask which NPCs, locations or regions depend on an entry. Current pickers help choose a target; they do not explain its inbound uses.

**Minimal scope:** “Used by” from entity detail views, with counts, source path, friendly name and click-to-open navigation. Start with verified structural relationships already represented in the reference catalog: NPC faction/type/currentLocation/currentArea/worldVoiceId, location region/factions, region realm/factions. Area matching must include its parent location; the same area ID in two locations is not one global entity.

**Reused pieces:** Exact-source parser, reference catalog, worker RPC, existing navigator and draft flush/base-hash rules. Compute a read-only index for a particular active-source hash; invalidate it when the relevant snapshot changes.

**No-go boundary:** Never rewrite scripts or free-text mentions. Report coverage as “known structural references,” not “all uses.” Do not create a generic inference graph or install a graph database. Do not scan remote worlds or load remote images in the background.

**Acceptance tests:** Duplicate area IDs in different locations; missing/runtime references; arrays of factions; escaped IDs; unknown fields; large worlds; cancellation; stale index invalidation; navigation with an unapplied draft. Preserve source byte-for-byte and make the limits visible.

**Maintenance cost:** Low-to-medium. One explicit relationship registry, shared by pickers, validators and impact inspection. Do not let three independent relationship lists drift apart.

**Failure fallback:** If indexing fails or is canceled, leave editing intact and show an unavailable/partial result—not zero uses. A result must carry the source hash and coverage version.

### 3. Scoped Work Order builder

**Problem:** Empty allowedPaths currently permits whole-world editing. A raw JSON field is a poor way to communicate scope.

**Minimal scope:** Pick current entity/section paths, show their human-readable labels, and preview allowed scope. Offer whole-world access as an explicit choice with an explanation. Start a task with exactly the accepted paths. Keep raw path JSON as a peer input for expert users.

**Reused pieces:** Existing WorkOrder/allowedPaths, task preparation, provider routing, proposals and checkpoints. No new agent policy language or separate agent runner.

**No-go boundary:** Do not silently change existing saved Work Orders. Do not infer permission from natural-language intent or from an LLM suggestion. Protected package fields remain protected regardless of selected scope.

**Acceptance tests:** Old broad orders remain loadable and visibly broad; new scope selections match exact paths; array paths and removed/renamed entities are handled without rebinding to a different entity; forbidden edits are rejected in both native and desktop engines; draft and stale-source guards still hold.

**Maintenance cost:** Low-to-medium if it is a UI over the existing contract. Medium-to-high if path semantics change; avoid that expansion initially.

### 4. Save/publish readiness walkthrough

**Problem:** “Local,” “draft saved,” “validated,” “moderated,” “public” and “uncertain save” are different states. Existing operations are safe but scattered.

**Minimal scope:** A compact checklist with the current local revision, remote link/environment, unreviewed proposals/draft blockers, last verified save, cached check result, moderation result if actually returned, and explicit next action. Distinguish local checks from server checks. Every row links to an existing workflow.

**Reused pieces:** Current publication journal, remote baseline/source hashes, validation and save read-back/reconciliation. This is state presentation, not a new publish state machine.

**No-go boundary:** No automatic chain of remote writes. No “ready” badge based on stale results or invented quota/rating fields. Do not guess moderation response shapes from screenshots.

**Acceptance tests:** Changed local source invalidates previous readiness; stale moderation is visibly stale; failed create/save/validate and uncertain read-back show distinct blockers; unreviewed remote import cannot upload; cancellation causes no subsequent action; offline state never becomes a fake success.

**Maintenance cost:** Low-to-medium if existing operation records are sufficient. If their provenance lacks necessary hashes, add provenance narrowly before exposing a badge.

### Supporting increment: contextual field help

Show cached schema guidance and reference provenance beside the current field. Clearly mark community references, missing guidance, stale caches and unknown fields. Existing Reference remains available; do not produce or store a parallel set of prose rules. Test malformed/missing cached records and offline operation. This may ship alongside another winner when it stays small.

## Round 4 — rejected designs and narrower rescues

- **Safe rename:** Defer mutation. Ship “find known usages” first. A future rename must propose an exact atomic key/reference patch, block destination collisions, retain stale-baseline checks and display unverified script/text uses. No regex rename across the whole source.
- **Batch text replacement:** Keep a future version to selected string leaves, preview each change and apply through proposals/checkpoints. Never replace keys or numeric tokens incidentally.
- **AI lore repair:** Rescue only as an explicit scoped request through the existing provider/proposal system. No background paid linter or authoritative “canon consistency” score.
- **Full runtime simulator:** Rescue deterministic structural validation and content coverage. They cannot prove that a story plays identically to Voyage.
- **Auto sync:** Rescue a user-triggered stale-status refresh and clearer save-readiness states. No automatic remote mutation.
- **Cost dashboard:** Rescue reported usage from supported completed task responses with an honest unavailable state. Do not synthesize cross-provider dollar estimates or promise billing accuracy without a verified contract.
- **Asset inventory:** Keep it local/read-only, bounded and opt-in. Distinguish authored URL from locally available file. Never crawl every URL to manufacture a freshness badge.
- **Semantic search:** Improve current literal/path search, labels, filters and navigation first. Reconsider only after evidence shows that those cannot solve real findability problems.
- **Theme designer:** Preserve graphite/slate and system/light settings. Better information hierarchy beats another theme-maintenance matrix.
- **Extension marketplace / multiplayer:** Separate product and security commitments, not “one extra feature.” Do not seed an unsupported ecosystem in a single-user builder.

## Maintenance budget and delivery sequence

1. **Parity obligations and preservation defects stay first-class.** Finish verified native workflows; fix silent retention before increasing proposal-generating features. Resolve known inconsistent defaults as targeted changes, not incidental scope creep.
2. **Build one optional feature at a time.** Start the impact inspector after its relationship registry is shared and tested. Do not queue ten simultaneous subsystem changes.
3. **Use existing storage by default.** Every persistent new format needs versioning, migration, bounded import, explicit deletion and recovery fixtures. Bookmarks are small local preferences; world relations come from source and do not become a second canonical database.
4. **No new service/dependency by default.** A candidate that needs one must show why existing shared core/UI/host APIs cannot satisfy the minimal scope.
5. **Measure before indexing/caching.** Use small and large neutral fixtures, record runtime/memory, and cap rendering separately from scan completeness. A truncated index must never claim no references.
6. **Native and desktop acceptance stay paired.** Existing tests, shared builds, 320/412/1280 layout checks and Android app-scoped instrumentation form the baseline. Feature-specific tests add stale-snapshot, recovery, unknown-field and exact-number cases.
7. **Design explicit removal paths.** UI-only features should be removable without rewriting world content. Caches can be rebuilt. Optional preference records can be dropped. Persistent authored data must remain accessible through JSON and export.
8. **Avoid maintenance camouflage.** A button backed by an undocumented endpoint, a simulated status, or a generic catch-and-ignore path does not count as shipped capability.

Suggested order: retention protection → impact inspector → scoped Work Order UI → readiness walkthrough. Contextual help can accompany one of these when it does not delay preservation work. Palette/bookmarks and richer checkpoint comparison are reserves. Verified archive restore needs its own import/security design before implementation.

## Standards cross-check

Two primary references informed acceptance boundaries, not the subjective candidate scores:

- Android Developers, Auto Backup: cloud backup and device-transfer inclusion/exclusion rules must be considered explicitly. User-managed history exports are not a substitute for or automatic extension of those OS policies. Keep credential/session exclusions intact.
  `https://developer.android.com/identity/data/autobackup`
- W3C WCAG 2.2 guidance: keyboard focus must be visible and not entirely hidden by app-created overlays. Modal focus restoration, reachable controls and small-screen checks belong in the acceptance suite. A 44 px comfortable touch target is an app design target, not a claim that every WCAG rule mandates 44 px.
  `https://www.w3.org/WAI/WCAG22/Understanding/focus-visible`
  `https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum`

## What would change the result?

- If users rarely create proposals or agents, retention remains a safety fix but scoped Work Orders drop below navigation/coverage polish.
- If existing validation already provides actionable inbound usage details after UI inspection, C01 becomes a presentation improvement rather than a new index.
- If physical-device tests expose text/JSON overlay selection, font-scaling or input-method regressions, repair the editor baseline before adding features. Keep a plain textarea fallback available in the design.
- If a verified Creator API contract supports a currently missing native workflow, that belongs in the parity backlog with fixtures and explicit remote semantics—not in a speculative integration tournament.
- If performance measurements show a small feature requires a persistent global index or a service, reconsider its maintenance score and narrow it.

**Conclusion:** Improve trust, relationships and task boundaries. Do not turn the builder into a game engine, collaboration service, model host, sync daemon or plugin platform merely to expand its feature list.
