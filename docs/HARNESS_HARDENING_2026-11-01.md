# Agent harness hardening — November 1, 2026

**Follow-up:** [Delegation and checkpoint continuation](AGENT_ORCHESTRATION_2026-11-01.md)
now implements opt-in desktop child reviews and bounded desktop/Android checkpoint
continuation. The report below records the initial hardening phase; its resume
and delegation deferrals are superseded only to the extent documented there.

This phase strengthens the shared desktop/Android world assistant. It follows the
meta-harness principle of keeping permissions, execution, evidence and application
decisions in the host rather than relying on model promises. It adds no T3 Code
dependency and does not grant agents unrestricted shell or remote-world access.
The legacy Python workbench has not been ported to this new harness.

## Execution boundary

`packages/core/agent-tools.ts` is the shared registry of tool names, descriptions,
role permissions, argument schemas and effects. Desktop API/CLI adapters and the
Android adapters dispatch world tools through the shared `taskTool` reducer
command. Android tool-definition assets are generated from that same registry.

- Planning tools can read and propose; they cannot edit or approve work.
- Work tools stage edits only inside the approved Work Order scope. They cannot
  propose artwork or approve work. Artwork generation retains separate approval.
- Runtime validation rejects unknown fields, malformed paths, unsafe integer
  indices, invalid actions and missing action-specific arguments. Tool schemas
  advertised to the provider are not the security boundary.
- Core-generated commands implement effects; a provider cannot supply an arbitrary
  reducer command through a tool argument.
- The task must be running and the attempt must match. Late tool callbacks after
  cancellation, completion or failure cannot execute or replay tools.
- Protected package metadata and exact numeric source spelling remain preserved.

The desktop and Android stores supply their own current reference catalogs for
tool execution and completion. Caller-provided catalogs cannot override these
host-owned checks. The reducer itself remains an internal trusted application API,
not a separately authenticated service or an OS-level sandbox.

## Durable tool receipts and replay

Effects and their receipts persist together in the existing project database
transaction. Each receipt contains the task attempt, call ID, tool name, canonical
request hash, before/after source hashes, outcome, bounded result and timestamp.
Arguments themselves are not stored in the receipt.

An identical call ID and canonical request replays the persisted receipt without
repeating the mutation. Reusing an ID with different arguments is rejected.
Argument-key ordering does not change request identity. Validation, permission
and domain failures normally produce rejected receipts without staged changes;
invalid task identities, unserializable/oversized requests and exhausted journals
are rejected before a receipt can be added. This is not a guarantee that every
invalid incoming request is recorded.

API loops qualify wire IDs by response turn so providers that reuse IDs across
turns still work. Native RPC adapters propagate their call IDs. Deduplication is
limited to the same running task attempt and retained call identity; it is not
provider-session resumption or exactly-once delivery across arbitrary restarts.

Current limits, defined by `toolJournalLimits`:

| Limit | Value |
| --- | --- |
| Calls per task attempt | 256 |
| Serialized result characters | 131,072 |
| Serialized journal characters | 524,288, with a safety reserve |
| Recent task positions retaining detailed journals | 10 |

The limits count JavaScript serialized characters, not tokens, dollars or exact
UTF-8 bytes. Additional request, path, depth and node limits apply. Budgets fail
closed; live receipts are not evicted to allow more calls. Starting another task
is an explicit user action, not an agent budget-bypass strategy.

When a new task starts, completed/stopped tasks outside the latest ten positions
lose detailed journals but retain call/rejection counts and completion evidence.
Running/prepared tasks are not pruned by that retention pass. Task records,
proposals and all other project data do not acquire a new retention policy.

**Privacy:** read results may contain private world excerpts. Receipts are stored
locally in the app database, not inserted into authored world JSON. Database
backups may contain these excerpts. This change adds no telemetry or new remote
transmission path; existing selected-provider calls still receive their normal
context and tool results.

## Host-owned completion gate

On work completion the host independently computes evidence bound to the staged
source: source/base hashes, selected schema hash and version, schema coverage,
local validation issues, scope-check completeness and timestamp. Model claims
such as “all checks passed” do not substitute for this evidence.

- `pass`: locally matched schema version, no local validation errors and complete
  scope evidence.
- `blocked`: local validation, protected metadata, base snapshot or scope errors.
- `review`: missing/advisory schema coverage or incomplete bounded scope evidence.

Automatic local application additionally requires unchanged active source and no
editing draft/unapplied form conflict. Changed work without a local pass remains
a review proposal with an explanation. Proposal-only mode remains proposal-only.
A no-op task can complete without applying changes even with unknown coverage.

**Behavior change:** changed worlds with no version or only legacy V36-era
advisory references now require review instead of automatically applying.
Matched version coverage describes the selected cached catalog; it is not proof
that every field or runtime behavior is understood. Warnings remain advisory.

Manual proposal review/acceptance remains available under the existing syntax
and metadata protections. Selective acceptance can create a different source;
the old task evidence must not be treated as validation of that new source.
Diff-based scope checks are conservative, especially for arrays, and stop at
2,000 changes; incomplete evidence forces review rather than a fabricated pass.

Every completion report records `official: false` and an unverified environment.
A local pass is not official Voyage acceptance, channel compatibility, moderation
approval or gameplay verification. No automatic save, publish, upload or
official validation POST is introduced.

## Inspection tools and UI

Both task roles can use four additional read-only tools:

- `world_reference_impact`: paginated known structural incoming/outgoing links;
  missing mod/runtime targets remain advisory.
- `world_diff`: paginated exact-source changes against the task-start snapshot.
- `world_readiness`: local project checks against the task's current source.
- `world_schema_coverage`: cached version coverage and environment uncertainty.

The shared system prompt directs agents to use these tools, disclose coverage
gaps and stop rather than bypass tool budgets. Work agents are told to validate
and inspect the diff before summarizing; the host still reruns its own checks.

Planning task-history cards include a collapsed **Execution evidence** view with
the last 20 receipts, bounded result previews, source transitions, completion
hashes and errors/warnings. Older journals display retained summary counts.
Untrusted result text is rendered as escaped text, not executable HTML.

## Verification

Run from the repository root after installing the documented build prerequisites:

```sh
npm run typecheck
npm test
python3 -m unittest discover -s tests
npm run build
npx cap copy android
npm run test:harness
cd android
./gradlew :app:compileDebugJavaWithJavac :app:compileDebugAndroidTestJavaWithJavac
```

`test:harness` requires the build and Capacitor copy first. It checks the generated
native bundle, Android tool definitions/reference copies, receipt replay,
permission/argument rejection, exact large-number preservation and completion
gates. It uses Node's VM with the host SHA-256 callback: this is **not** a Rhino
execution test or Android device test. Android instrumentation cases are included
and compiled, but were not executed on a device in this phase.

Completed validation on November 1, 2026:

| Check | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Shared core, React, desktop and provider tests | 308 passed |
| Python regression tests | 193 passed |
| Release regression tests | 12 passed |
| Built native bundle and copied-asset checks | 4 passed |
| UI/desktop/native build and Capacitor asset copy | Passed |
| Android production and instrumentation Java compilation | Passed |
| Patch whitespace check | Passed |

Existing Vite chunk-size/dynamic-import and Gradle deprecation warnings remain.
The Python run also emitted resource-cleanup warnings without test failures.
No live-provider, device, official Voyage acceptance or gameplay verification
is claimed. No commit, release publication or remote-world mutation was performed.

## Remaining work, in priority order

1. Run the compiled Android instrumentation suite on a prepared test device and
   exercise receipt/UI/recovery workflows with disposable projects. Validate real
   provider sessions separately; mocked provider tests do not establish that.
2. Define provider-session capability negotiation and explicit recovery contracts
   before implementing safe automatic resume, steering or provider switching.
   Existing interruption handling/manual restart remains; receipts survive, but
   stopped tasks cannot execute more tools.
3. Add request/usage accounting if token or monetary budgets are needed. Journal
   character limits do not constrain total model spending or transcript size.
4. Add an orchestration outbox/event model only when resumable workflows require
   it. These transactional receipts are not a full event-sourced orchestrator.
5. Add delegation only after child-task scope, budgets, cancellation and evidence
   contracts are defined. No automatic multi-agent orchestration was added here.
6. Port the boundary to the legacy Python service if feature parity is needed.
   Cross-environment Voyage support and live acceptance still require verified
   schemas, disposable drafts and explicit approval of exact remote operations.

These are separately scoped follow-ups, not hidden claims of completion. This
phase does not implement autonomous remote operations or require credentials,
spending, publication or changes to user worlds to validate local behavior.
