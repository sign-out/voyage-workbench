# Maintaining Voyage compatibility

## Implemented in the November 5 follow-up

The shared desktop/Android app now offers explicit Production and Alpha
connections. Switching fetches both public documentation endpoints from the
chosen host and checks the contract before committing the selection. Failed
checks retain the old selection and cached evidence. Keys remain separated;
linked projects, uploads and uncertain operations are never retargeted. Existing
installs remain on Alpha until explicitly switched, including installs with an
older ignored `voyageEnvironment` setting. The legacy Python host remains
Alpha-only; this does not claim parity with that older UI.

The header's **Save & compatibility** control distinguishes local persistence,
unapplied edits, offline state, unconfirmed remote outcomes and the last observed
remote baseline. It shows authored version/revision and explicitly unknown
engine information, not a guessed engine version derived from a release label.
Public contract refresh does not validate or upgrade a world. Open the selected
environment's Studio for its live engine-compatibility display.

Cover prompts and artwork guidance use the target environment's recommendation:
Alpha currently recommends 1280 × 720; Production recommends 1000 × 1000.
A refreshed contract takes precedence for its own environment only. Existing
cover dimensions remain valid; nothing is silently cropped or regenerated.
The real provider output still needs visual inspection.

New source-to-world briefs also expose an explicit artwork target. It is pinned
in the creation plan and approval hashes, retained on archive restore and does
not switch an API connection. Legacy plans without a target retain their old
composition and approvals; replacing the brief is an explicit reset, not a
silent regeneration. Changing Connections never rewrites an approved art brief.

Artwork enumeration and assignment recognize registries already present under
`parties[partyId]`, as well as existing flat/shared registries. Labels include the
party ID, and assignment uses the complete original path. This is not a
flat-to-party migration, an assertion about where every registry belongs, or
complete party-aware character/map editor support.

Validation and Publish show Alpha 2.55.0 announcement-derived item limits and
schema warnings. Over-limit item Media Content and estimated catalog sizes are
advisories, not locally invented official rejection rules: upstream character
counting and Production rollout have not been verified. Draft loading never
truncates existing content. Official publish validation and moderation remain
authoritative. Artistic grading does not override a rejected cover.

The refreshed community codec still does not describe the announced new resource
description/multi-boost shapes. Those shapes are deliberately not fabricated.
Unknown fields are preserved; migration and specialized controls need a current
codec and representative export first. A type match against an older codec is
not proof of current engine compatibility.

## One configuration file

`packages/core/voyage-compatibility.json` records environment hosts, reference
snapshot paths, contract hashes, cover recommendations and release advisories.
Release labels are separate from authored/schema/engine identities. Production
does not inherit Alpha's announced rules.

The code deliberately has no automatic "latest" rule, automatic world upgrade,
provider substitution or production/alpha mutation fallback. Codex images still
use Codex CLI, not a direct OpenAI API or Voyage's model display names.

## Check an upstream update

Run from the repository root:

```sh
npm run voyage:check -- --schema
npm run voyage:check -- --schema --check
npm run voyage:check -- --offline --schema
npm run voyage:check -- --schema --curl
```

Live checks make public GETs only, with no credentials or Origin header. They
compare both official contracts against their configured snapshots, compare
guide hashes, list Production/Alpha differences and identify changed top-level
community codec sections. A contract can drift without changing `info.version`.
Community references do not certify official schema/environment compatibility.

The machine-readable report is written to the ignored
`.build-tools/voyage-update-report.json`. `--check` exits 2 when reviewed baseline
drift is found; network/parse failures exit 1. Offline checks inspect bundled
fixtures only. The tool never changes snapshots, policies, keys or worlds.

If Node networking times out but system curl works, explicitly choose `--curl`.
This optional transport requires curl, disables its user configuration, performs
GETs only and does not follow redirects or supply credentials. Transport failure
never silently switches tools or promotes an old report to fresh evidence.

## Promote a reviewed update

1. Capture the announcement, official contract/guide and representative exports
   for the actual target environment. Record the retrieval date, source URLs,
   upstream byte hashes and any bundled-byte transformation. Preserve earlier
   dated snapshots instead of overwriting historical evidence.
2. Read the report's changed paths/sections, not just version strings. Confirm
   whether a change is authored schema, runtime state, API behavior, moderation,
   UI-only behavior or a recommendation. Never derive an engine/schema field
   name from prose or put an app release label in `heroesVersion`.
3. Update the appropriate environment entry in the JSON profile. Point
   `contractBaseline`/`guideBaseline` at reviewed snapshots; record the upstream
   `contractHash`. Use `release: null` when rollout/limits are unknown. Keep
   announcement-derived checks advisory until the environment and counting
   convention are verified.
4. For a new codec, use `normalizeReferences` with an optional metadata envelope:

   ```json
   {
     "metadata": {
       "schemaVersion": 37,
       "compatibilityRevision": 9,
       "environment": "alpha",
       "provenance": "Verified source URL",
       "snapshotHash": "SHA-256 of the captured source"
     },
     "schema": {
       "_type": "partial",
       "fields": {"heroesVersion": {"_type": "literal", "value": 37}}
     }
   }
   ```

   The numbers above illustrate the envelope, not a claimed current revision.
   `schemaVersion` here identifies the numeric authored major. Optional
   `engineVersion` and `schemaId` are reference-cache metadata only; supply them
   only from verified evidence. They are never inserted into authored worlds.
   Revision/environment/build identities coexist in the cache. Selection needs
   an exact supplied identity; unknown or ambiguous matches return no schema
   instead of falling back across revisions. Legacy unscoped references remain
   advisory, not engine certification.
5. Add fixtures for old/new formats, unknown fields, exact large numbers,
   same-major revisions, missing metadata, both environments and any party-local
   paths. Changes to remote operations need isolated-key, conditional-save,
   read-back, stale-validation and uncertain-outcome tests.
6. Run validation before packaging:

   ```sh
   npm run typecheck
   npm test
   npm run test:voyage-updates
   npm run build
   npm run test:harness
   npm run test:release
   ```

   Android host changes additionally need Gradle compilation/unit checks. Local
   tests and documentation fetches are not live-account, device or publication
   acceptance tests. Use a disposable world and explicit approval for billable or
   world-mutating network acceptance checks.

## Verification notes for this follow-up

- Typecheck and production web/desktop/ES5-native builds pass. The final full
  regression suite reports 598 passing tests; the focused creation/archive/
  compatibility follow-up also passes. All 11 native harness and 26 release
  contract checks pass; Android reports 50 passing unit tests and successful
  application/instrumentation Java compilation. No device test is claimed.
- All 26 responsive viewport cases passed the added compatibility-panel bounds
  and truthful-status checks. Android workspace resume/retry checks also passed.
  The complete responsive runner still stops later at its existing map-thumbnail
  fixture waiting for 600-pixel image loading; this is not a complete responsive
  acceptance pass. The pre-existing thumbnail behavior was not rewritten here.
- The live checker succeeded with explicit `--curl`: official contracts/guides
  matched the new baselines, while the community codec reported changed
  `itemSettings` and `itemTypes` sections. The checker flagged review and did not
  overwrite bundled references. Native Node fetch timed out on this machine;
  there is no silent transport fallback in either the checker or application.
- No authenticated Production world access, paid image generation, live upload,
  moderation, world replacement or publication was performed. No release was cut.
