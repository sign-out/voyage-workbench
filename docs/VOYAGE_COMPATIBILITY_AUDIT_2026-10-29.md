# Voyage changelog compatibility audit — October 29, 2026

Follow-up implementation and explicit deferrals are tracked in
[the completion checklist](VOYAGE_COMPATIBILITY_COMPLETION_2026-10-29.md).
The original fixes below are supplemented by bundled version-specific references,
reviewed already-V37 field-update proposals, and expanded trait reference analysis.

## Scope and evidence

Reviewed the supplied `latitude_voyage_changelog_timeline_2023_2026.csv`
(62 records) and matching Markdown timeline. Their research cutoff is
**October 28, 2026**, not the date of this audit. Historical R&D reports,
announcements, Alpha, Beta, Production and unlabelled patches are not
interchangeable evidence of shipping support. Product `2.x` versions are
not `heroesVersion` values.

Read-only network checks on October 29, 2026:

- Official Alpha contract: `https://api-alpha.aidungeon.com/creator/v1/openapi.json`.
  Reports `1.3.0-preview`; SHA-256
  `2e002a431201777891dcd8eff01129613b14940e4c1d77af4a7b13efe8258340`.
  Both image allowance and moderation list `WORLD_COVER`, `ITEM_IMAGE`,
  `AREA_IMAGE`, `LOCATION_IMAGE`, `NPC_PORTRAIT`, `REGION_MAP_IMAGE`.
  The contract says to attach moderated covers through `world.image` using
  conditional replacement. This is endpoint evidence, not a successful upload.
- Community codec: `https://api.unofficial.voyage/schema.json`.
  SHA-256 `7a100f7c5f77709380179156b455fa8e229f17f039616ea5abe66ad95d744352`.
  A top-level intersection combines 46 required and 7 optional fields;
  `heroesVersion` is the literal `37`. This is community evidence, not an
  official per-environment compatibility guarantee.
- The primary patch pages were not retrievable through the web tool during
  this audit. Channel/date claims below remain attributed to the supplied
  timeline unless separately supported by the contracts above. No claim that
  October 28 is the latest available release has been established.

Input fingerprints:

- CSV SHA-256: `fb11fe9ae71457b91e6bbf530f435d7771cb02ebc996c01131055ebf9c98084f`.
- Markdown SHA-256: `802d0c08f2e635e7fab4ea1adeb0e8478b642afa60d4534b2b4ab4cc566b3f1e`.

No user world, key or private project was transmitted. No draft, schema
version, environment link, bundled wiki or installed Worldsmith plugin was
automatically changed. This work updates this repository, not the separate
Worldsmith plugin installation.

## Updates implemented

1. **Schema refresh works with the fetched V37 codec.** Desktop previously
   required direct root `fields`; Android accepted only section arrays.
   Both rejected the actual intersection root. A shared bounded codec parser
   now collects required and optional root fields, preserves overlapping
   intersection constraints and legacy section metadata, rejects malformed
   codecs and duplicate sections, and retains the previous cache on parse or
   network failures. Successful refresh records its hash, date and detected
   schema version. Refresh remains an explicit action. The follow-up bundles the
   captured V37 codec and selects matching cached sections by source version,
   retaining the legacy V36-era advisory material separately.
   The fetched codec also uses serialized quoted-string unions for time of day
   and `undefined` alternatives. These now normalize to explicit enum codecs
   or non-JSON alternatives rather than accepting arbitrary types. Python's
   refresher is updated for those forms too; it previously rejected them.
2. **Known cross-version schema checks are skipped with a warning.** If loaded
   references declare a numeric version but a document has a different or
   missing numeric `heroesVersion`, TypeScript and Python issue a compatibility
   warning instead of applying another version's field rules. Exact document
   bytes are not changed. Syntax checks and TypeScript's independent known
   reference warnings remain separate. Unversioned legacy references still
   cannot prove version compatibility.
3. **Named NPC portraits are discoverable and assignable.** Existing
   `npcs.<id>.portraits.<name>` strings now appear as `NPC_PORTRAIT` destinations,
   with distinct expression names in artwork labels. Updating one preserves
   the default portrait, other expressions, history and unknown fields. This
   does not invent a portrait registry, enforce an unverified cap, or add a
   dedicated expression-management UI.
4. **Current trigger registries are classified as Mechanics.** Both
   `triggerDefinitions` and `questTriggers` are included in content grouping
   and mechanics assistant context. Legacy `triggers` is retained, not renamed
   or merged. Refreshed schemas expose verified trigger field definitions to
   generic editing; no imported script is executed.
5. **World covers use the verified image-upload purpose.** `WORLD_COVER` now
   participates in the existing reviewed upload/moderation workflow. Envelope
   covers attach locally to `world.image`; bare-world covers remain creation
   metadata. A linked Voyage draft is still required for uploads. Uploading
   and attaching does not automatically save or publish the world. Removed
   the obsolete UI statement that Alpha has no dedicated cover upload target.

## Feature impact and remaining work

| Change from supplied timeline | Evidence / existing support | Remaining work |
| --- | --- | --- |
| V35 → V37; October 12 `initialRelationship` | Fetched V37 codec confirms `npcs.*.initialRelationship` and `initialKnown`. Version-specific snapshots and already-V37 reviewed field updates are implemented. | Full cross-version migration remains unsupported. No automatic version bump or blind rename. |
| October 5 quest `status` | Fetched V37 quests use `status`, not `initialStatus`. Reviewed already-V37 proposals reject destination collisions and unsupported status values. | Paired fixtures and a migration specification are still needed for older versions and runtime save state. |
| September 14 trait dependencies | Array reference impact and advisory missing/self-link diagnostics implemented. Community trait field descriptions also permit Story Start targets. | Runtime eligibility, category-order behavior and cycle failure analysis are not simulated. Optional mod/runtime targets remain warnings. |
| October portrait, visibility, day/time features | Fetched codec confirms named portraits, realm `initialKnown`, `day` / `time-of-day` conditions and effects, `location-hidden` / `location-image` effects. | Dedicated controls and target-environment fixtures; preserve schema-driven raw editing meanwhile. |
| October 23 item / October 27 ability trigger operations | Fetched `triggerDefinitions` includes `player-item`, `item-add`, `item-remove`, and `player-abilities`. | Add focused builders/reference analysis using full verified condition/effect schemas, not guessed script APIs. Gameplay behavior is untested. |
| October 16 map import | Timeline only establishes the Studio feature. Existing Workbench map/artwork tools are not the same importer. | Obtain representative exported/imported data and implement a preservation-first, previewed import separately. |
| October 23–26 cover uploading | Official Alpha contract confirms `WORLD_COVER`; support added to existing image workflow. `ITEM_IMAGE` is also confirmed and was already wired. | Real disposable-draft upload/moderation/read-back test with creator approval; no such network mutation was run. |
| September 9 runtime catalogs at 1.5× authored limits | Timeline explicitly distinguishes runtime from published authored caps. | Classify document/limit scope; do not multiply authored publish limits. |
| October 21 party-local state paths | Fetched authored root has no top-level `parties`; timeline describes selected-party state. | Separate save-state schema and selected-party tooling. Do not add `parties` to authored configuration from this note alone. |
| October 28 item tiers, refinement, learned-ability conditions | **Alpha in supplied timeline**. Fetched `itemSettings` has no configurable tier fields; no matching learned-ability condition is present. | Await matching Alpha schema/exports and contract evidence. Do not fabricate field names or claim Production support. |
| October 28 mod inspection / save / undo fixes | **Alpha in supplied timeline**. Workbench already has source diff and local history; those do not reproduce Studio runtime behavior. | Party-isolation and stacked-mod regression fixtures; no claim that upstream Production is fixed. |
| Unified Assistant/Studio, usage, privacy, discovery and mobile fixes | Product/UI behavior, not automatically an authored-world schema change. | No JSON changes from these notes alone. Assess only where a verified external contract or desired Workbench UX changes. |

## Priorities after this patch

1. **Reference snapshots implemented in shared application.** V36-era advisory
   and captured V37 profiles are separate, provenance-labelled and selected by
   world version. Environment compatibility remains explicitly unverified.
   The older Python server does not yet use the new multi-version catalog.
2. **Creator API environment support.** The fetched official Alpha contract now
   advertises Production and warns that Alpha/Beta require explicit opt-in and
   may upgrade shared drafts beyond Production compatibility. Workbench remains
   deliberately Alpha-only in desktop/Android; this patch does not enable
   Production or retarget any project. Enabling it needs per-host contracts,
   credential isolation and conditional-save/read-back tests, not just a new URL.
3. **Reviewed field updates and array analysis implemented.** NPC/quest legacy
   keys in already-V37 worlds have collision-checked, exact-source proposals.
   Trait links include arrays and Story Starts. Full cross-version migration and
   specialized trigger builders remain separate work.
4. **Alpha-only features after evidence.** Item-tier controls and party-aware
   runtime tooling require matching schemas, not extrapolation from release prose.

## Validation scope

Completed locally: TypeScript typecheck; production web/desktop/native-engine
build; 287 TypeScript/React/host tests; 193 Python tests; Android application
and instrumentation Java compilation. The full fetched 53-section V37 codec
also normalizes identically through the TypeScript parser and built ES5 native
bridge, and all six image targets match both fetched official upload endpoints.
Build output retains existing chunk-size/dynamic-import and Gradle deprecation
warnings. Android instrumentation was compiled, not run on a device.

Regression coverage includes intersection/wrapped/legacy schema shapes,
overlapping fields, malformed/deep codecs, cache retention and persisted
provenance, native-bridge serialization, cross-version warnings, named portrait
assignment, cover upload routing, and current trigger grouping/context.

The Android instrumentation regression is supplied separately from host-side
tests. Building it is not evidence that it ran on a device. Local checks and
mocked upload tests do not establish official validation, Studio import success,
real moderation acceptance, gameplay correctness or Production compatibility.
