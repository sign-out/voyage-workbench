# Voyage compatibility completion checklist — October 29, 2026

This follows the initial changelog audit. It updates the repository, not the
separately installed Worldsmith plugin. It does not upgrade any user's world,
enable a different API environment, or publish anything.

## Completed in this follow-up

- Retain the fetched V37 community codec as an offline reference snapshot with
  upstream and bundled fingerprints. The only byte transformation is a trailing
  newline. Builds verify its bundled hash before generating reference assets.
- Keep V36-era wiki sections separately labelled as legacy advisory material,
  not a complete or independently certified V36 codec. V37 schemas do not inherit
  potentially stale wiki summaries, limits or related-field guidance.
- Select references from the document's authored `heroesVersion` across the
  shared editor, validation, base-world derivation, desktop Codex/provider agents
  and Android agent bridge. Unknown/missing versions get no cross-version schema
  fallback. Validation and agent schema responses explain unavailable coverage.
- Preserve other cached versions on refresh and restart. Newly refreshed schemas
  must declare a version; malformed/unversioned refreshes retain the previous
  cache. Each refreshed section retains source, hash, retrieval time and an
  explicitly unverified environment label. A version match is not proof of
  Alpha/Beta/Production compatibility. The catalog and metadata are persisted
  together in one database transaction; a simulated storage failure regression
  verifies rollback without replacing the active desktop references.
- Retain the official Alpha `1.3.0-preview` contract separately from the earlier
  Production `docs/openapi.json`. Offline regressions compare all image targets
  with both its allowance and moderation endpoints. This does not enable those
  environments or establish upload acceptance.
- Add **Validation → Reviewed V37 field updates**. Supported changes are NPC
  `relationship` → `initialRelationship`, NPC `known` → `initialKnown`, and authored
  quest `initialStatus` → `status`. This operates only on already-V37 worlds.
  Exact numeric spelling, whitespace outside the renamed keys, unknown fields,
  IDs, schema versions and package metadata remain unchanged.
- Stage field updates as normal review candidates, leaving the active document
  untouched until acceptance. Wrong versions, destination collisions, bad value
  types, unsupported quest statuses, pending editor drafts and stale base hashes
  block proposal creation. Any collision blocks the whole batch; no values are
  silently dropped or merged. Accepted local changes can be reverted through
  existing local history/checkpoints. No remote save happens automatically.
- Expand incoming/outgoing impact and advisory missing-reference checks for
  trait `unlockedBy[]` and `excludedBy[]`. Array indices are retained in issue
  paths. Both traits and Story Starts are valid local lookup candidates, with
  ambiguous IDs shown against both existing targets. Missing local targets may
  be supplied by mods or runtime state and are warnings, not errors. Self-links
  are advisory. OR logic, category ordering, eligibility and cycle failures are
  not simulated or inferred.

The trait target interpretation was checked by read-only retrieval of
`https://wiki.unofficial.voyage/mechanics/traits` on October 29, 2026. The page's
field descriptions distinguish character creation, level-up selection and
direct engine assignment. This community documentation is not an official
runtime execution test. The supplied timeline alone did not establish those
semantics.

## Remaining work and prerequisites

1. **Full V36 → V37 migration:** not implemented. A few field renames cannot
   establish whole-world compatibility. Obtain paired source/destination exports,
   a trustworthy migration specification and representative regression fixtures.
   Do not bump `heroesVersion` to make a cached schema fit.
2. **Environment switching:** desktop/Android remain Alpha-only. Production and
   Beta need independently checked host contracts plus end-to-end credential,
   project-link, upload, conditional-save, read-back and validation-result binding
   tests. Existing project links must not be retargeted silently.
3. **Specialized trigger/visibility/portrait controls:** schema-driven/raw editing
   remains available; focused builders and portrait-expression management remain
   optional product work, not completed by this patch. Add target-environment
   fixtures before asserting runtime behavior or enforcing channel-specific caps.
4. **Map import, runtime parties and October 28 Alpha mechanics:** obtain matching
   representative imports/exports and schemas. No guessed tiers, refinement,
   learned-ability conditions or authored `parties` registry was added.
5. **Legacy Python service parity:** its existing refresh and mismatch safeguards
   remain intact, but the new offline multi-version catalog and reviewed-field UI
   are in the shared desktop/Android application. Port these workflows explicitly
   before claiming feature parity with the older Python server.
6. **Live acceptance:** no official validation POST, upload, moderation, draft
   replacement, Studio import, live gameplay or device instrumentation run was
   performed. A disposable linked draft, account access and explicit approval for
   the exact remote operations are prerequisites. Compilation is not a device test.

## Verification

Regression coverage includes offline snapshot fingerprints, version selection,
missing coverage, cross-version cache retention, native-bridge serialization,
exact-source renames, collision/type/enum/version rejection, stale proposal
rejection, unchanged active source before review, and array/Story Start links.
The final validation counts and platform limitations are recorded in the audit.
