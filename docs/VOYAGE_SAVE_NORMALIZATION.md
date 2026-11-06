# Reviewing Voyage save differences

## November 6, 2026 investigation

The supplied Studio export and Workbench export use different containers:

- Studio exports a bare GameState.
- Workbench project JSON preserves the editable Creator API envelope, including
  title, description, cover and `initialGameState`. It can also contain local
  creation notes. These are not all sent to the API: the request uses the
  existing editable-field allowlist.

After comparing the GameState objects, the reported save differences are
reproducible as 50 server-generated `__generated_quest_progress__/…` triggers,
omission of empty `unassignedAreas` and `worldVoices`, and a default
`characterCreationMusic: "fantasy"`. The API export also retains
`compatibilityRevision: 16`, which linked imports protect. Aligning the supplied
files with that protected field reproduces the screenshot's 53 differences. The
files are not a captured HTTP exchange and cannot alone prove the exact live
server state; the mismatch is not proof of a failed PUT.

The updated source and the Studio-exported GameState differ at only three
structural paths: one instruction-map key changes `/` to `%2F` (a removal and an
addition), and an empty `parties[""].entities` appears. This is evidence about
these supplied files, not a general permission to URL-encode identifiers.
Workbench does not rewrite these keys or assume encoded IDs are equivalent.

Both official public Alpha/Production contracts and guides checked again on
November 6 match the November 5 baselines (`1.3.0-preview`). The community codec
now differs in `attributeSettings`, `resourceSettings`, `itemSettings` and
`itemTypes`; this is separate from the read-back mismatch and has not been
silently promoted into bundled references. No private research/world content is
added to public fixtures; regression worlds are synthetic.

## Safe recovery

1. Keep your local project and use **Review Voyage changes…** from Connections or
   Publish. This makes a GET on the linked world's original environment; it never
   repeats a PUT, requests moderation, or publishes a world.
2. Open the proposal and inspect its before/after changes. The existing paginated
   review shows all changes, not just the save banner's first 20 paths. Read-back
   differences are not silently ignored, including generated-looking records,
   version changes, unknown fields and exact large-number changes.
3. **Accept Voyage draft & resolve save** adopts the complete downloaded snapshot
   locally, with a History checkpoint of the prior world. It stores the fetched
   revision/envelope as the next conditional-save baseline. Original submitted
   bytes and their comparison remain in the save journal.
4. The journal reports **ACCEPTED**, not **CONFIRMED**: accepting a reviewed
   different draft is not proof that the original submission matched exactly.
   Rejecting the proposal leaves local content and the unresolved save intact.

Snapshot review is all-or-nothing. A partial selection cannot certify a different
remote draft, and a changed local source, pending operation, environment, fetched
revision or review snapshot invalidates acceptance. Reconciliation invalidates
older review evidence. No update is automatically sent after acceptance. If a
remote edit occurs after the GET, the next write still uses the fetched ETag and
must pass Voyage's normal conflict check.

Local-only envelope fields absent from the read-back, such as creation notes,
are preserved because they were outside the transmitted editable-field
allowlist. Server-managed identity/status flags are not synthesized from stale
local values. Authored fields inside GameState still receive full diff review.

## Explicit exports

**Files & sync** offers **Export project JSON** for the complete saved local
document and **Export Voyage GameState** for its exact GameState subtree, shaped
like Studio's JSON export. Both preserve numeric spellings and unknown fields;
neither rewrites IDs, strips version fields, normalizes data, or mutates the
project. Unapplied drafts are not included. Export the project format when you
need the world envelope and metadata as well as authored content.

These fixes do not change the official API contract, certify compatibility with
an unobserved engine build, or treat a world/schema version as an API version.
