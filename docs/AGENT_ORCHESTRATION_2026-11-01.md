# Delegation and checkpoint continuation — November 1, 2026

This follows the [shared harness hardening phase](HARNESS_HARDENING_2026-11-01.md).
It implements bounded orchestration rather than exposing unrestricted agents or
assuming that all providers have compatible resumable sessions.

## Using the features

In **Planning**, under **Permissions for the next Work Order**, optionally enable:

- **Read-only child reviews:** desktop work agents may request up to two scoped
  reviews through `delegate_review` using the task's frozen provider and model.
- **Automatic checkpoint continuation:** an interrupted work task may continue in
  a fresh provider session, at most twice, from its saved staged source.

Both permissions default to **off**, apply only to the next approved Work Order,
and reset in the form after work starts or the selected project changes. They are
captured in the persisted task;
changing providers or form options later does not silently change that task's
route or permissions. Planning-only tasks cannot enable either permission.

Additional provider requests **may incur charges**, including charges for a new
session after an interrupted provider request. There is no token/dollar budget
enforcement or provider-side billing deduplication. The UI discloses this before
approval. These options do not grant generation, upload, publication, remote-save
or external-tool permissions.

## Host capability map

| Capability | Desktop | Android |
| --- | --- | --- |
| Same-route read-only child reviews | Supported by the existing API/CLI adapters | Disabled |
| Saved-checkpoint continuation | On host startup, for previously opted-in interrupted work | When the project is reopened/refreshed and the foreground agent service is idle |
| Resume an existing provider-native conversation | Not implemented | Not implemented |
| Switch provider/model automatically | Never | Never |

`orchestrationCapabilities` advertises this host-side contract. This is a static
map of implemented adapters, not a live provider negotiation or a claim that a
particular account/model/runtime is available. Missing runtimes, authentication
and provider errors fail normally without a fallback. Android rechecks its native
runtime availability before starting a continuation. Browser/legacy Python hosts
do not acquire these features; unavailable controls are disabled.

The frozen identity is the configured route, not an immutable model binary or
account snapshot. An unset CLI/Codex model retains the provider's default; model
aliases/defaults can resolve differently over time. Choose an explicit model ID
when stronger model selection is important. Account-identity pinning is not added.

## Delegation contract

The parent opts in before execution. A tool request must provide an objective and
one to ten existing paths inside the approved Work Order scope. The core reducer
atomically creates a persisted child task and a **pending** parent receipt.
Call-ID replay reuses that child/result instead of spawning duplicate work.

The child receives an exact-source snapshot of the parent's staged world and a
hash binding findings to that snapshot. Its provider/model route is copied from
the parent; it cannot choose another route. The packet omits project memory,
chat history and global world summaries, and describes only its delegated paths.

Children have just four tools:

- `world_read` and `world_children`, enforced inside the delegated scope.
- `world_schema` and `world_schema_coverage`, for cached reference metadata.

They cannot edit, propose work/artwork, approve, run official validation, spend
through generation tools or delegate further. Schema metadata is shared; scope
is not an OS sandbox or a claim that no reference metadata can mention other
parts of the world. The host retains the complete snapshot locally to preserve
exact-source semantics, but does not put it wholesale into the child packet.

The parent waits for the child to settle. The host commits a bounded advisory
summary into the pending receipt and returns it to the parent. The child report
is untrusted data, not instructions, scope approval or validation proof. Parent
edits remain subject to the original Work Order and the independent completion
gate. A review of an older staged snapshot does not certify a newer source.

At most two children may be created over the root task's entire lifetime,
including continuations and interrupted/failed reviews. Children cannot create
grandchildren. Root and child calls/results consume one shared 256-call,
524,288-serialized-character journal budget; continuation never resets it.
Final summaries are capped at 4,000 characters and can be omitted from the
receipt if needed to preserve the journal cap. Child task text remains bounded.

Stopping a parent cancels its children, rejects pending receipts, and aborts the
corresponding provider processes/requests. Stopping just a child leaves the
parent able to handle a rejected review result. Provider completion without a
committed terminal transition is a failure, not a success badge.

## Checkpoint continuation contract

Continuation starts a **fresh** provider session with the saved staged source,
original approved Work Order and a bounded evidence recap. It does not replay the
old transcript or repeat stored edit calls. The prompt explicitly tells agents
to inspect current values rather than blindly repeat insert/remove operations.
The original task baseline remains unchanged for diffing, stale-source checks
and final local application.

The reducer records the previous/new attempt, staged source hash, timestamp and
bounded previous reply. Existing tool receipts and child tasks remain. Call IDs
are deduplicated within an attempt; a new attempt can use the same wire ID without
replaying an old result. Old-attempt callbacks cannot read, edit or complete the
new attempt.

The host rechecks all of these conditions before preparing a continuation:

- A root **work** task is `INTERRUPTED` and had explicit continuation permission.
- The original provider/model route and host platform still match their frozen
  identity, and no previous provider process remains active.
- Fewer than two continuations have been used and lifetime evidence/budgets remain.
- The project is active, the task is the latest root task and no other work is
  running. A newer task supersedes old automatic recovery permission.
- The active world still matches the original baseline. There is no editor draft,
  task-start unapplied form conflict, or already recovered partial proposal.
- The original snapshot hash, staged JSON, protected metadata and bounded scope
  comparison remain valid. Expired or incomplete evidence requires manual review.

Unknown or invalid *schema* content can still be continued so the agent can fix
it; final local application still requires the existing host completion checks.
Continuation never treats a schema error as a validation pass.

`CANCELED`, `FAILED` and completed tasks are never automatically retried. Startup
recovery only classifies unfinished `PREPARED`/`RUNNING` work as interrupted. A
provider error is not retried just because the option was enabled. Pending child
reviews interrupted by shutdown become rejected evidence rather than silently
restarting. A resumed parent can decide how to proceed within its remaining
child limit.

When blocked, the task remains interrupted with a visible reason. **Retry
checkpoint continuation** rechecks eligibility after the conflict is resolved;
**Cancel recovery** revokes execution by setting the task canceled. Existing
**Review partial changes** remains available. Android does not promise an
unattended OS-level background restart; recovery is triggered through the opened
project and normal foreground-service rules.

## Implementation and validation

- Shared contracts and eligibility: `packages/core/agent-orchestration.ts`.
- Atomic child, receipt, cancellation and attempt transitions:
  `packages/core/project.ts`.
- Desktop lifecycle and child execution: `hosts/desktop/orchestration.ts` with the
  existing API/CLI and native RPC hosts.
- Android continuation: trusted platform injection in `Store`, foreground recovery
  in `Host`, and attempt-aware receipt extraction in `AgentService`.
- Consent and evidence: `AgentRunOptions` and `AgentActivity` in the shared UI.

Run `npm run typecheck` and `npm test`. Core tests cover permissions, scopes,
attempt identity, cancellation, stale/draft guards, limits and native guidance.
Desktop integration tests use disposable SQLite projects and local mock API/RPC
providers to cover delegated review, duplicate calls, live cancellation and host
restart without duplicate insertions. UI render tests check disclosures,
capability gating and escaped recovery text.

After `npm run build` and `npx cap copy android`, run `npm run test:harness` for
generated native-bundle delegation/recovery tests and asset parity. Compile both
Android production and instrumentation Java sources. The instrumentation suite
includes checkpoint/old-callback checks, but compilation and Node VM tests do not
constitute an Android-device run or actual Rhino execution.

Completed local validation on November 1, 2026:

| Check | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Shared core/UI/desktop/provider regression tests | 326 passed |
| Generated native bundle and asset-parity tests | 6 passed |
| Release regressions | 12 passed |
| Legacy Python regressions | 193 passed |
| UI/desktop/native build and Capacitor copy | Passed |
| Android production and instrumentation Java compilation | Passed |

Device instrumentation was not run: device discovery reported “Device support
failed during installing device support” and listed no emulator. No direct device
control fallback was used. Existing build/deprecation and Python resource-cleanup
warnings remain; they did not fail these checks.

## Deliberate remaining boundaries

- Android child delegation remains disabled until its service lifecycle can own
  parent/child process trees and cancellation without provider/session mixing.
- Native provider-session resume, account-identity pinning, live capability
  negotiation, cross-provider switching, persistent provider transcripts and
  distributed orchestration/outboxes remain separate work.
- Token/dollar budgets, autonomous delegation routing and deeper agent trees are
  not implied by bounded local journal limits.
- Real provider/account recovery and Android device instrumentation still require
  separate verification. Local mock success is not evidence of live Voyage
  acceptance, gameplay compatibility or remote publication.
- No commits, release publication, official validation calls, remote world changes
  or production provider spending are required to validate these local contracts.
