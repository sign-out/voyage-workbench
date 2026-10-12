# Approved authoring improvements — October 8, 2026

The approved authoring workflows are now implemented within the documented maintenance boundaries; see `AUTHORING_COMPLETION_AND_AUDIT_2026-10-08.md`. Builder-note semantics remain documented in `BUILDER_NOTES_2026-10-08.md`. The first-increment status below is historical and does not override these newer completion documents. Full external Studio parity and a Git-backed history adapter are not implied.

## Status and interpretation

The user approved checkpoint improvements and candidates 3–10 from the additional-feature shortlist, with sane, user-adjustable defaults. These join the already requested scoped Work Orders, save/publish readiness checklist, and reference-impact inspector.

Approval is not implementation status. The local experiment-copy candidate was not explicitly approved. Do not substitute it for checkpoint recovery or assume approval of a custom branching system. The storage decision remains open to evidence, including Git.

Settings belong in Settings or contextual feature configuration, not permanent workspace controls. Default changes apply prospectively: do not silently change existing orders, saved notes, bookmarks, or world content. Safety invariants (protected package identity, exact-source fidelity, credential exclusion, explicit remote writes, stale-baseline checks) are not optional preferences.

## Agreed scope and adjustable defaults

| Feature | Conservative default | User-adjustable choices | Maintenance boundary |
| --- | --- | --- | --- |
| Scoped Work Orders | Explicit existing authored-content paths; no implicit whole-world permission for new approvals | Selected scopes, requirements, explicit whole-world choice | Existing staged task/review engine; scope captured at task start |
| Save/publish readiness | Distinguish local checks, saved-baseline knowledge, official results, stale/unknown states | Optional advisory rows and display preferences | Existing journals and remote safeguards; never automate publication |
| Reference-impact inspector | Read-only known structural references; contextual rather than a main navigation item | Filters, grouping, result display | One relationship registry; disclose scripts/prose/runtime coverage limits |
| Checkpoint comparison and recovery | Preserve automatic pre-change checkpoints; restore through reviewed proposals | Manual labels, comparison target, selected changes | Preserve exact source, no automatic pruning, no second competing history engine |
| World completeness checklist (#3) | Verified structural errors first; optional-content omissions are suggestions | Enable/disable advisory checks and choose applicable sections | Deterministic rules; unknown schema is not invalid; no subjective AI grading |
| Contextual guidance (#4) | Brief existing schema/reference help on demand | Expanded/collapsed guidance and source visibility | Reuse cached guidance; mark missing/stale/uncertain material |
| Quick navigation/bookmarks (#5) | One search/navigation entry; explicit bookmarks, bounded recent-navigation display | Recent-list size, ordering and bookmark organization | Existing search/navigation and draft guards; no embedding service |
| Safe entity duplication (#6) | Require new content ID and preview; preserve external relationships unless explicitly changed | Supported copy options per entity type | No package identity duplication; no heuristic reference rewriting |
| Entity-centered reviews (#7) | Group all changes by entity/field; exact JSON remains a peer view | Grouping, sorting, expanded details and view preference | Presentation over the same exact diff; no AI summary as authoritative review |
| Narrow batch edits (#8) | Explicit selected entities, one supported field, mandatory preview | Selection/filter and per-field value | One guarded reviewed change set; no implicit global replacement |
| Asset inventory (#9) | Local/read-only listing of authored references and available local sizes | Type/usage filters, grouping; explicit optional remote checks | No automatic downloads/deletion; unknown or remote size remains unknown |
| Hidden builder information/notes/TODOs (#10) | Project-local builder context, not playable-world JSON; relevant notes available to the selected planning/building agent by default | Collapsed/expanded notes view, TODO filters, include-builder-context preference and per-task override | Stable attachment paths, preserve orphaned notes, define backup behavior; no credential/session inclusion |

## Agent access to notes

The user's clarification supersedes the earlier opt-in-private-annotation design: notes are **hidden builder information**, analogous in purpose to the game's hidden information but addressed to world creation rather than gameplay. They should be first-class project authoring context, not a separate notebook the author must manually attach to every agent request.

Keep ordinary world content uncluttered. Expose a labeled, collapsible Builder notes view for the current entity plus project-wide notes. Support TODOs and design intent. Defaults may be adjusted in Settings and overridden for a task. Treat "hidden" as a presentation/audience boundary, not encryption or a secret vault: the selected authoring provider can receive this context when enabled.

### Attachment coverage: every entry or system

The user's further clarification requires attachment to **any addressable entry in the document/schema**, not only predefined entity collections. Support individual entities, whole systems/sections, nested objects, arrays and their entries, and scalar fields. Examples include one NPC, an NPC's `personality`, a specific location area, `combatSettings`, a particular combat setting, and an AI-instruction leaf. Unknown/custom authored fields are eligible too; a missing cached schema does not disable notes. The authored world root is the attachment for world-wide builder context. Read-only package entries may be annotated without becoming editable; annotations never mutate their underlying metadata.

Use a shared attachment representation and one contextual notes component in both Form and JSON views. A note addresses a project and an exact document path; changing editor view must not duplicate or detach it. JSON view offers the same notes access for its selected document entry, with an explicit path target when needed. Do not inject note fields into world JSON, maintain per-entity-type note tables, or create schema-specific note forms.

Path attachment needs identity-aware reconciliation. An insertion/reorder in an array must not silently move a note to a different item merely because its numeric index was reused. Follow identity only when it is verified by the supported edit operation/entry identity; otherwise retain the note as unresolved and offer explicit reattachment. Deletion preserves the note as unresolved. Rename/move reconciliation and checkpoint recovery must preserve original attachment provenance and avoid applying notes to unrelated replacement entries. Duplicate operations require an explicit copy-notes option rather than quietly sharing one note between originals and copies.

Agent context lookup includes notes on the task's selected entry/field and relevant ancestor systems/root, with bounded descendant retrieval through tools. For example, editing one combat setting can use both its field note and the combat-system design note. This is contextual lookup over the same attachments, not a separate agent-only annotation store. Wider attachment coverage does not grant wider world-edit permission.

Planning/building tasks include bounded relevant notes for their selected entities/scopes and applicable project-level context by default, with visible inclusion status. Add bounded read/search access to the project's builder notes for further inspection rather than dumping every note into every prompt. If relevant context exceeds the budget, disclose omissions and offer paged retrieval; do not silently claim complete context. Notes outside edit scope may inform reasoning but never grant permission to edit their associated world paths.

Include entity paths and mark the material as builder annotations. Author design intent can guide work within the approved task, but annotations and tool output cannot override system safeguards, grant new capabilities, widen a Work Order, or trigger remote writes. Planner-proposed note changes remain reviewable suggestions. Agent reads do not require a repeated per-note sharing approval; ordinary task/provider authorization and the configured builder-context preference apply.

Keep builder notes in project storage and project backups, excluded from playable-world export and Voyage publication. Existing game `hiddenInfo` remains actual world content and is preserved in world JSON; do not reuse that field to store builder-only TODOs. Moving a builder note into gameplay hidden information must be a separate explicit authored-content edit. Preserve unresolved/orphaned notes when an entity disappears. Credentials, login data and cryptographic material belong in secure credential storage, never builder notes.

## Git versus current checkpoint storage

The current desktop Store and Android Store use SQLite with WAL and synchronous FULL. Desktop dispatch wraps the pre-change checkpoint and project update in one transaction; Android dispatch likewise uses a database transaction. Existing checkpoint restores stage a candidate for review rather than directly replacing active content. Earlier implementation-plan prose describing private Git repositories does not describe these current Store implementations.

Git is a valid candidate for versioned world snapshots, branch history, and standard interchange. Reuse is not a principle that overrides durability or lower total maintenance. However, Git would not replace project drafts, task attempts, approval state, remote ETags, uncertain-save journals, or secure credential storage. Splitting authoritative world history across Git and SQLite introduces a commit/database reconciliation problem unless ownership and recovery are explicitly designed.

Before adopting Git, compare native Android integration, startup/storage costs on large JSON worlds, process interruption, disk-full failure, ref retention, and database/repository reconciliation. Retain old checkpoint access during any migration. Do not expose Git conflict markers as playable JSON, silently merge conflicting world data, or treat a local repository as an off-device backup.

Decision for this increment: keep the existing storage while improving checkpoint UX. Evaluate a Git-backed history adapter separately rather than build a homemade Git-like branching engine or prematurely migrate users' projects.

## Delivery discipline

1. Preservation defects and existing parity obligations remain first-class.
2. Structured planner proposals and explicit scope review come before expanded agent access.
3. Readiness and reference impact use shared, tested source/provenance data.
4. Checkpoint UX follows; then guidance/navigation/entity-centered review.
5. Duplication and batch mutations require collision, stale-source and exact-number fixtures.
6. Asset inventory and hidden builder notes stay local-first; scoped relevant builder context is available to authoring agents by default with configurable inclusion and bounded retrieval.
7. Each feature must pass desktop and Android checks before it is called shipped. No paid provider calls, migrations, public releases, or destructive cleanup are implied by this approval.

## First implemented increment: structured planning proposals

The planner now has `propose_work_order` alongside read/search/validate/schema tools. Desktop Codex, desktop direct providers/harnesses, and Android tool dispatch persist structured suggestions separately from approved orders and world-edit candidates. Suggestions carry their source hash, task ID, objective, requirements and validated existing authored-content paths. Whole-world suggestions require an explicit boolean and normalize to the authored root, not the package envelope.

The planning UI can load a current suggestion into its existing editable Work Order form after replacement confirmation, or explicitly dismiss it. Loading does not save/approve/start work. Stale suggestions cannot be loaded. The reducer rejects stopped/wrong-attempt/work-task proposals and proposals against a changed active world. Suggestions are not silently truncated when task history reaches its existing display/storage limits.

This is not the full scoped Work Order picker. Existing manual raw-path approval semantics remain unchanged in this increment; the explicit-scope builder and the other approved features still need implementation. In particular, no completeness settings, private-note context tools, asset inventory, readiness checklist, impact inspector, or richer checkpoint UI are claimed shipped by this document.

Validation: 111 Node/UI/host tests pass, including a local HTTP planner tool cycle without paid calls; TypeScript checks and shared UI/desktop/native-engine build pass; existing Electron smoke passes 48 workspace layouts; Android debug and instrumented builds pass; 26 app-package instrumentation tests pass, including the new structured-proposal test and excluding the paid real-agent test. Logs are `/tmp/voyage-work-orders-tests.log`, `/tmp/voyage-work-orders-build.log`, `/tmp/voyage-work-orders-smoke.log`, `/tmp/voyage-work-orders-native-build.log` and `/tmp/voyage-work-orders-native-tests.log`.

The debug APK was installed with replacement, not app-data reset, on the existing SDK emulator. The T3 Device panel could not discover this installed SDK, so verification used the configured SDK/ADB directly. No public release was created. APK: `android/app/build/outputs/apk/debug/app-debug.apk`; SHA-256: `53e1777b9936a7e01c92089280fd37a4707bc0b2efa75b5b259e60e115e9ce68`.
