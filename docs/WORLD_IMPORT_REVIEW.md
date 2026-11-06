# World-focused import review

Workbench edits GameState content, not a JSON Schema. Studio exports can be bare
GameStates; Creator API downloads can wrap `initialGameState` with world metadata.
Import review aligns those supported shapes and compares their actual values.
It does not migrate an engine version or infer that all party data is disposable.

## Merge and Replace

Opening JSON with no project creates a separate project and keeps its exact
source. Importing over an open project stages a proposal; it does not immediately
edit the project, upload images, save to Voyage or publish.

- **Merge** is the default. Objects merge recursively. Missing fields and records
  are retained, including unknown fields and generated/runtime data omitted from
  the export. Supplied strings, numbers, booleans, nulls and arrays replace their
  current values. Arrays are not merged by index or guessed identifiers.
- **Replace** replaces GameState content: omitted fields and records are removed.
  Use it only when the incoming GameState is intended to be complete.
- An empty object in Merge does **not** clear a map. Deletions and identifier
  renames are not inferred; a renamed key can leave both records present. Use
  Replace or explicit editor changes for those operations, then review them.
- Switching modes rebuilds from the retained original import, without editing
  the active world. Individual **Keep current** choices reset after confirmation.
  Older proposals without an original import keep their legacy replacement
  behavior until explicitly reconfigured.

Existing API identity, transport and safety metadata stay with the current
project. When both sides have envelopes, supplied supported publication fields
can update title, blurb, cover and related editable metadata; absent publication
fields are retained even in Replace. A bare GameState project cannot store those
outer publication fields: the alignment details explicitly disclose that they
were not imported. The original incoming file remains on the proposal.

Linked worlds additionally retain their protected GameState version fields.
Use a new project for a different world identity and an explicit API refresh for
a new linked version baseline. Import never silently URL-encodes IDs or treats
`/` and `%2F` identifiers as equivalent.

## Review world changes, not file churn

Whitespace, object-key order, equivalent string escapes and equivalent numeric
spellings are not world changes. Comparison preserves exact large integers and
distinguishes negative zero. No floating-point parse/stringify rewrite occurs.
Accepted imports preserve existing spelling for equivalent values; changed
values retain incoming numeric source. Object formatting may change.

The same automatic retention applies to local assistant, restore and older
persisted proposals: key reordering or minification does not become a review row
or require a Keep current click. Preview, validation, export and acceptance use
the same selected values. Added or removed fields, changed strings and array
reordering remain real changes. Exact remote-save recovery is deliberately
separate and still adopts the complete reviewed server snapshot.

Review opens with authored-world counts and per-system totals. Inspect changed
characters, triggers, geography, instructions and other systems without paging
through omitted runtime fields. The other categories remain inspectable:

- **Runtime / generated** recognizes the specific generated quest-progress
  trigger prefix and selected party entity/message/turn fields.
- **Empty collection / scaffolding** identifies known empty collection
  additions/removals, not arbitrary unknown or authored records.
- **Version / compatibility** and **API metadata** remain separate.

Classification is deliberately conservative, not proof that data can be deleted.
Unknown fields, scripts and authored party quests remain authored-world changes.
Every unexcluded change in every category applies on acceptance, even if its
category has not been opened. Categories organize review; they do not filter
what gets imported. **Keep current** excludes an individual change.

**Keep current for this category** and **Use imported for this category** apply
to every page of the chosen category. For example, you can retain all runtime
records in a Replace import without individually excluding hundreds of rows.
These controls only adjust the proposal selection; nothing applies until acceptance.

Omissions preserved by Merge appear in a collapsed list instead of deletion
diffs. Large previews are bounded, with an explicit full-value expansion. Local
validation and export remain available. Acceptance saves a local checkpoint;
History can restore the prior world. If the active world changes, use **Refresh
comparison against current world** to compare the retained original import again.
This preserves Merge/Replace mode, resets selection choices after confirmation,
and never applies the imported content automatically. Older proposals without
their original file must be imported again.

Review shows comparison progress, keeps validation results tied to the exact
selection, and reports canceled exports without losing the proposal. With no
selected changes, close the review to keep the current world; acceptance and paid
assistant summarization are disabled rather than suggesting a meaningless edit.

## Optional assistant explanation

**Summarize world changes with assistant** starts an isolated read-only Planning
task using the configured provider/model. If Planning uses Codex CLI, the summary
uses that CLI route, not a direct OpenAI API fallback. Provider quota or billing
may apply. Summarization is never automatic or required to accept an import.

The assistant receives a frozen snapshot of the effective selected changes and
can use only the paginated `world_import_review` reader. It cannot edit, accept,
upload, publish or delegate. Unrelated memory, chat history and builder notes are
not included. Proposed world text/excerpts go to your configured provider; this
feature does not submit your world to the community reference service.

Completion requires a successful read of the current snapshot. The UI shows
host-calculated coverage, incomplete review and truncated-excerpt warnings.
Reading all excerpts does not certify complete field inspection or gameplay
correctness. The explanation is advisory, not a replacement for deterministic
counts, full values or validation. Changing the proposal, selection, mode or
current world marks its prior explanation stale. Progress, stop and errors are
shown with the task.

## Remote saves remain distinct

This feature does not weaken exact save read-back verification. **Review Voyage
changes…** remains a complete remote snapshot recovery, with its own revision
and all-or-nothing acceptance rules. See
[save normalization and recovery](VOYAGE_SAVE_NORMALIZATION.md).
