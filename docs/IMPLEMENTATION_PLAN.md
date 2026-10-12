# Plan comparison and implemented architecture

29 September 2026

## Decision

The supplied plan has the stronger product and preservation model. Keep its local companion architecture, lossless documents, staged proposals, immutable checkpoints, exact ETags, explicit validation and verified draft saves. Replace the proposed framework-heavy kickoff with a dependency-free implementation that can be tried immediately in the current environment.

This is a practical first release of its core authoring workflow, not a claim that all M0–M6 milestones are complete.

| Choice | Original plan | This implementation | Reason |
| --- | --- | --- | --- |
| Companion | Node/TypeScript | Python standard library | Python already installed; no dependency bootstrap required. |
| Browser | React/Vite/editor library | Native DOM, CSS and textareas | Small deployable surface, no bundler, offline operation. |
| Document model | Evaluate lossless parser | Source-span parser preserving numeric lexemes and duplicate-key rejection | Targeted edits preserve surrounding source; real fixtures covered by tests. |
| Storage | SQLite plus snapshot files | SQLite transactional immutable checkpoint rows and exact original/working text | One atomic local backup, no DB/file reconciliation gap. |
| Agent | Codex app-server | Bounded noninteractive Codex section proposals | Installed CLI exercised live; no simulated model output. App-server streaming remains a future enhancement. |
| Forms | A few verified section forms | Generic nested record/field controls, cached section references | Every section is editable without reconstructing or dropping unknown fields. |
| Validation | Local plus official | Local structural/reference checks, advisory cached schema checks, optional official draft validation | Source and limits are explicitly labeled. |
| Remote | Exact ETag + journal + read-back + merge | Exact ETag + journal + read-back; conflicts stop for manual reconciliation | Prevents overwrite; automatic merge UI is not claimed. |

## Implemented workflow

Import raw GameState or supported world envelopes → inspect sections/records → edit exact source or individual values → save draft → checkpoint → compare original/proposal → validate → export. Linked downloads additionally support validate → conditional remote PUT → read-back, with differences presented for review.

Codex runs against selected section text in a temporary directory and returns a structured replacement. No original project file or Voyage token is passed to it. Proposals carry a base hash in the service and base text/revision in the browser; accepting stale proposals is blocked.

## Evidence and resource use

- `https://builder.unofficial.voyage/json/`: direct curl fetch succeeded; HTML shell saved as `docs/builder-reference.html`. No builder source code was reused.
- `https://api.aidungeon.com/creator/v1/openapi.json`: fetched successfully; version `1.2.0-preview`, saved as `docs/openapi.json`.
- `https://api.aidungeon.com/creator/v1/agent-guide.md`: fetched successfully, saved as `docs/agent-guide.md`.
- Community API/validator pages were not reliably readable through browser/search tooling. The supplied `latitude-voyage-worldsmith-0.7.3.zip` contains the wiki reference used for local section help and advisory type checks. Its freshness is not implied by the current fetch date.
- `fixtures/blank-world.json` is extracted from the supplied archive. `fixtures/living-continuity.json` is a copy of the supplied LC file. `fixtures/lantern-coast.json` adds a small authored example to the blank structure.
- Codex implementation references: https://learn.chatgpt.com/docs/non-interactive-mode and https://learn.chatgpt.com/docs/config-file/config-reference. Tested installed CLI: `0.155.0-alpha.16.4`.

## Validation boundaries

Unit/integration tests cover exact values and numeric lexemes, ordering, duplicates, invalid buffers, nested mutations, references/schema warnings, persistence and restart, optimistic concurrency, CSRF/Host/Origin protection, exact remote envelopes and ETags, validation refusal, uncertain save journals and isolated proposal replacement.

A live Codex proposal test modified a small section and preserved an unrelated 9007199254740993 integer. Browser tests exercise actual UI flows. Authenticated Voyage acceptance and gameplay are unverified until an account is connected; the original plan's full remote release gate is therefore still outstanding.

## Later milestones

Add in-app three-way conflict resolution, automatic contract-drift gating, streamed app-server sessions, large-document worker/virtualization work, project archive import/export, richer schema-specialized forms, and packaged installers. Publication, media, remote revision restores and maps remain the later features identified in the original plan. No active game-state editing or runtime emulation is included.

## T3 Code reference, applied after initial implementation

Reviewed the user-supplied [T3 Code repository](https://github.com/pingdotgg/t3code), specifically [architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md) and [Codex provider guidance](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-codex.md). Its server-owned execution and durable lifecycle patterns informed a concrete improvement: proposal jobs now persist before invocation, completed candidates survive reconnects, interrupted runs are distinguished from completed work, and cancellation terminates the owned process. The browser lists project-scoped proposal history and can resume watching an active run.

This is an independently implemented adaptation of architectural ideas. No T3 source code or assets were copied, and its multi-provider/remote-client scope was not introduced into the local Voyage builder.

## Implemented extension: persistent whole-world agent

The direct World agent view adds a project-scoped conversation through Codex app-server. Native thread IDs resume conversational context; SQLite stores the visible transcript, pinned memory, run status and tool activity. Dynamic world tools operate on a fresh per-turn Git worktree, preserving source tokens and supporting atomic multi-section batches. Follow-up turns can carry forward an unchanged pending proposal.

Each project has a private Git repository containing world.json. Manual saves, checkpoints, proposal acceptance and restoration append commits. Agent branches retain individual batch commits. Review applies an immutable snapshot only when the working project still matches the run baseline. Cancellation and process failure keep staged commits; restart recovery reconciles the worktree HEAD. Late callbacks are rejected after a run terminates.

This follows T3 Code's persistent app-server/provider architecture without replacing the existing lossless Voyage editor with its larger TypeScript stack. No T3 source was copied. Native Git is an additional runtime dependency; no package installation is required.
