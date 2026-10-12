# Voyage Workbench: workspace review and build handoff

Historical pre-build review. The working implementation is now documented in [README.md](README.md), with the plan comparison and test evidence under `docs/`.

Reviewed 29 September 2026 with three independent subagent reviews: plan/UI, world/API specifications, and archive contents.

## What is here

| Resource | Role | Findings |
| --- | --- | --- |
| `Voyage_Workbench_Plan.md` | Main product and implementation plan | Eight consolidated chapters; local browser SPA and companion architecture; milestones M0–M6. |
| `Voyage_Workbench_Plan_Package.zip` | Source/evidence package | Same eight chapters, modular prototype, 13 core tests, browser smoke test, bridge contract, reports, and contract/probe utilities. |
| `Voyage_Workbench_Prototype.html` | Offline behavior demonstration | Byte-identical to archived standalone prototype. Simulated remote service and deterministic proposals; in-memory state. |
| `LC_v6_9_2_TIME_COMMAND_HARDENING.json` | Real systems fixture | 553,915-byte raw GameState, 49 top-level keys, heroesVersion 36; 177 triggers, 169 with scripts. Content collections are empty: this is a systems/mod seed, not a complete playable world. |
| `latitude-voyage-worldsmith-0.7.3.zip` | Authoring references and fixtures | Seven world/mod fixtures plus blank world, cached wiki covering 69 sections, authoring pipeline, runtime and map references. Fixtures range up to approximately 3.3 MB. It is not builder application source. |
| `voyage-creator-api-agent-specification.md` and numbered copy | Creator API notes | Only substantive difference is alpha versus production API hostname. Resolve against the live contract before connection. |
| `index(1).html` | Incomplete wiki shell | References missing styles.css, docs-data.js and app.js. Not an application entry point. |

No AGENTS.md was found in the inspected project/parent tree. Original supplied files were left unchanged.

## Product direction

Keep the existing plan's local-first architecture: browser workspace served by a loopback companion, durable project metadata and immutable snapshots, with remote integration behind an adapter. The first useful deliverable is an offline world editor with reliable recovery. Build remote draft synchronization and actual agent proposals on that foundation.

The core workflow is import → inspect/edit → review diff → checkpoint → validate → export or conditionally save. A proposal must refer to a specific document revision; accepting one must check whether the working copy changed.

## Critical gaps in the prototype

- Real fixtures are raw GameState; the prototype requires an envelope with shortId, title and initialGameState. Detect supported formats explicitly and preserve original import bytes. An offline raw document does not imply a remote identity.
- JSON.parse/stringify is not a lossless document model. Preserve numeric tokens, unknown fields, key and trigger order, omitted values and script strings. Reject duplicate keys with actionable diagnostics while retaining original input.
- Storage, remote calls, official validation and agent execution are simulated. Labels and acceptance tests must distinguish these from implemented capabilities.
- The simplified diff does not expose order-only changes. Arrays should remain atomic until safe identity semantics are established.
- Script syntax checks cannot certify Voyage runtime behavior. Never execute imported trigger scripts merely to validate them.

## Implementation sequence and acceptance gates

### 1. Document foundation

Establish app/companion/document/contracts boundaries. Evaluate and pin a lossless parser before selecting form abstractions. Implement raw GameState versus editable-world-envelope detection without reconstructing documents from a field whitelist.

Acceptance: all bundled fixtures import; unchanged exports preserve exact bytes; targeted edits preserve untouched numbers, keys, unknown fields and script text. Tests cover unsafe integers, numeric lexemes, duplicate keys, null/missing distinctions, ordering and atomic arrays.

### 2. Durable offline workspace

Implement project list, section navigator, raw editor, diff, immutable checkpoints, restore and export. Retain invalid editor buffers separately from the last valid document. Add revision checks for concurrent browser tabs. Introduce structured forms only for fields confirmed by references and fixtures.

Acceptance: import → edit → diff → checkpoint → process restart → recover → export works against the supplied Living Continuity fixture. Interrupted writes preserve a recoverable snapshot. Validation results become stale when the document changes.

### 3. Official API reads and validation

Refresh and cache the authoritative contract and guide with timestamps/hashes. Resolve alpha/production origin explicitly. Add companion-held credentials, owned-world listing, download with exact ETag, guarded envelope extraction and official draft validation bound to document hash.

Acceptance: real read-only responses satisfy explicit guards; offline failures are visible; credentials are absent from browser storage, exports and agent context. Community references remain supplementary.

### 4. Guarded draft saves

Verify full replacement and read-back behavior on a disposable world. Add checkpoint-before-write, complete editable envelope, If-Match, conflict review and uncertain-outcome recovery. Distinguish response metadata from editable fields using evidence.

Acceptance: stale ETag cannot overwrite remote changes; delete/edit conflicts remain explicit; read-back differences are reviewed; failed or ambiguous requests cannot falsely show synchronized status.

### 5. Actual agent proposals

Integrate a verified runtime using staged snapshots and scoped tools. Produce reviewable proposals with base hash, touched paths and validation. Keep remote credentials outside the agent boundary.

Acceptance: stale proposals cannot apply silently; imported world text is treated as data; runtime restrictions are demonstrated. Simulated proposals never display as real model output.

Publishing, media, revision restore, map authoring and bulk operations follow these milestones. They are not prerequisites for the first useful offline release.

## Resource verification and remaining decisions

Requested references: https://api.unofficial.voyage, https://builder.unofficial.voyage/, https://wiki.unofficial.voyage/tools/validator.

In this review, web access could not retrieve the API or validator pages; the builder returned no extractable page text. A browser attempt to open the community API reported ERR_BLOCKED_BY_CLIENT. Official alpha and production OpenAPI URLs were also unavailable through the web tool. These observations do not establish that the services are down or confirm current contracts. Use bundled references as dated evidence until a live refresh succeeds. No private world content was uploaded.

The archive records 13 passing core tests from earlier work. The review agent could not rerun them because node was absent from the shell PATH; that is not evidence of current test success or failure. No production app or remote integration was implemented in this review.

Before implementation, settle the first delivery target (current Linux environment versus the plan's Windows packaging target), parser/editor selection and supported connection environment. Preserve the existing plan as the detailed specification; this handoff narrows the first build sequence rather than replacing its safety and recovery requirements.
