# Voyage Workbench — Tournament-Winner Architecture & Implementation Plan

**Status:** final proposed architecture  
**Primary targets:** Windows desktop and Android  
**Architecture style:** shared product core, shared UI feature implementation, platform-specific agent hosts  
**Guiding principle:** keep the correctness boundaries, remove speculative infrastructure

---

# 1. Product definition

Voyage Workbench is a purpose-built authoring environment for Voyage worlds.

Its job is not to become a generic IDE or a generic AI agent shell. It exists to make Voyage world authoring, large-scale editing, planning, validation, and safe remote saving much easier.

The application should support this end-to-end workflow:

```text
Open or import Voyage world
        ↓
Inspect/edit directly
        ↓
Discuss changes with planning chat
        ↓
Create Work Order
        ↓
Send Work Order to work agent
        ↓
Agent edits staged world
        ↓
Structural diff
        ↓
Validation
        ↓
Review
        ↓
Accept / revise / reject
        ↓
Guarded save to Voyage
```

The same workflow should exist on desktop and Android with only layout and platform integration differences.

---

# 2. Hard product requirements

The architecture must preserve these capabilities.

## 2.1 World editing

- one authoritative active world JSON;
- structured editing;
- raw JSON access;
- support for large worlds;
- unknown-field preservation;
- safe handling of large numbers and evolving schemas;
- import/export of large world JSON files.

## 2.2 AI planning

Planning chat is used for:

- discussing world design;
- planning changes;
- comparing options;
- analyzing world systems;
- refining requirements;
- generating Work Orders.

Planning chat does not directly mutate the canonical world.

## 2.3 AI implementation

Work agents are used for:

- implementing approved plans;
- large JSON surgery;
- content rewrites;
- system-wide world changes;
- schema-aware edits;
- repair passes.

Primary work-agent target:

```text
Codex
```

Additional future providers may include:

```text
Claude Code
OpenCode
other subscription-backed coding agents
```

## 2.4 Subscription-first provider use

The system should prefer provider-supported subscription/account authentication over direct metered APIs wherever possible.

The application should not be architected around direct API keys as the primary AI model access mechanism.

## 2.5 Dynamic Voyage support

Voyage is a moving target.

The Workbench must rebuild most of its understanding of Voyage from the current reference/schema API rather than permanently hard-code one schema version.

## 2.6 Android resilience

Android may kill:

- the UI process;
- foreground work;
- the Linux compatibility process;
- the provider process.

Correctness cannot depend on uninterrupted process lifetime.

## 2.7 Minimal filesystem dependence

The active world and most application state should live in memory.

Filesystem use should be concentrated around:

- explicit saves/checkpoints;
- imports/exports;
- provider binaries/runtime;
- provider auth/config;
- schema/reference cache;
- SQLite state;
- tiny temporary agent workspaces.

---

# 3. Architecture overview

The preferred architecture is:

```text
                         VOYAGE WORKBENCH
                                │
                         Shared React UI
                   ┌────────────┴────────────┐
                   │                         │
             DesktopShell               MobileShell
                   └────────────┬────────────┘
                                │
                       TypeScript Workbench Core
                                │
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
   ActiveWorld              Voyage Runtime             SQLite
 CandidateWorld           Understanding                State
       │                        │                        │
       └─────────────┬──────────┴───────────┬────────────┘
                     │                      │
              Context Resolver          Import/Diff
                     │                      │
                Planning Chat               │
                     │                      │
                  Work Order                │
                     └──────────┬───────────┘
                                │
                            AgentHost
                  ┌─────────────┼─────────────┐
                  │             │             │
               Desktop        Android       Remote
                native       CLI appliance    host
                  │             │             │
                  └─────────────┼─────────────┘
                                │
                          Candidate Result
                                │
                      Diff + Validation
                                │
                           User Review
                                │
                          User Acceptance
                                │
                     Guarded Voyage Save
```

---

# 4. Major architectural boundaries

These boundaries are mandatory.

## 4.1 ActiveWorld

The authoritative working world.

```text
ActiveWorld
```

Only accepted changes may replace or mutate this state.

## 4.2 CandidateWorld

Any imported or generated alternative state.

Examples:

- imported external JSON;
- Codex result;
- repair output;
- merge proposal;
- migration output.

A CandidateWorld never becomes ActiveWorld without explicit acceptance.

## 4.3 Planning vs implementation

Planning chat may:

- inspect;
- reason;
- suggest;
- create/revise Work Orders.

Planning chat does not directly perform authoritative mutations.

## 4.4 Work Order

The contract between planning and implementation.

## 4.5 Work agent staging

Work agents edit staged state, not ActiveWorld.

## 4.6 Workbench-owned saves

Agents never own Voyage credentials or authoritative saves.

All remote saves flow through the Workbench core.

---

# 5. Shared UI strategy

Use one React/Vite UI implementation.

The product should share:

- feature state;
- components;
- data contracts;
- interaction logic;
- validation views;
- diff views;
- planning/work workflows.

Use two compositions:

```text
DesktopShell
MobileShell
```

## 5.1 DesktopShell

Optimized for:

- multiple panes;
- large monitors;
- keyboard shortcuts;
- persistent project/navigation panel;
- persistent AI panel;
- side-by-side diffs;
- drag/drop imports;
- large raw JSON editing.

Suggested layout:

```text
┌─────────────┬────────────────────────┬──────────────┐
│ Project     │ Main editor/review     │ Chat / Work  │
│ navigation  │                        │ panel        │
│             │                        │              │
└─────────────┴────────────────────────┴──────────────┘
│ Validation / Tasks / Diagnostics drawer            │
└────────────────────────────────────────────────────┘
```

## 5.2 MobileShell

Optimized for:

- touch;
- narrow screens;
- large tap targets;
- single-primary-task presentation;
- bottom navigation or navigation rail;
- full-screen review;
- full-screen chat/work;
- Android back behavior.

Possible navigation:

```text
World
Edit
Chat
Work
Review
Tasks
```

The mobile app should not simply shrink the desktop pane layout.

---

# 6. Platform services boundary

Platform-specific behavior belongs behind a small interface.

Conceptual interface:

```ts
interface PlatformServices {
  pickImportDocument(): Promise<DocumentHandle | null>;
  pickExportDestination(name: string): Promise<WritableTarget | null>;
  shareDocument(...): Promise<void>;
  showNotification(...): Promise<void>;
  setForegroundTask(...): Promise<void>;
  clearForegroundTask(...): Promise<void>;
  secureStoreGet(key: string): Promise<string | null>;
  secureStoreSet(key: string, value: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}
```

Desktop and Android provide separate implementations.

Do not scatter platform conditionals through feature code.

---

# 7. Workbench core language

Use TypeScript for the initial shared product core.

This includes:

- world state;
- routing;
- schema interpretation;
- reference indexing;
- diff orchestration;
- validation orchestration;
- import/export orchestration;
- Work Orders;
- provider state;
- task state;
- context construction.

Use native/Rust modules only where profiling proves they are valuable.

Potential native candidates later:

- lossless high-performance JSON parser;
- structural hashing;
- very large diff acceleration;
- mmap-based import;
- local model inference runtime.

This keeps development simple while preserving a path to native optimization.

---

# 8. World document representation

The world is one authoritative JSON object.

Example paths:

```text
$.heroesVersion
$.storySettings.worldBackground
$.aiInstructions.generateStory
$.npcs["Keryava"]
$.locations["Alderhaven"].areas["Foundry Ward"]
$.skills["athletics"]
$.triggers["ah_lc_biology_seed_01"]
```

The application should preserve:

- unknown fields;
- exact key casing;
- arrays;
- object content;
- untouched values;
- large numeric values without unsafe coercion.

## 8.1 Numeric fidelity

Do not assume all Voyage numbers fit safely into normal JavaScript numeric semantics.

Use a lossless JSON representation or parser where needed.

At minimum:

```text
unchanged values must round-trip safely
```

If large integers are present, preserve lexical representation or use a lossless-number type.

---

# 9. Memory-first state

Primary runtime state should be in memory.

```text
ActiveWorld
CandidateWorld
routing indexes
reference registries
schema/reference interpretation
validation results
diff
planning context
Work Orders
task state mirrors
```

Persistent storage exists for recovery and explicit durability, not because the application is fundamentally file-based.

---

# 10. SQLite state

Use SQLite for durable application/task metadata.

Suggested tables:

```text
projects
tasks
work_orders
checkpoints
provider_sessions
remote_operations
schema_cache_metadata
settings
```

## 10.1 projects

Example fields:

```text
id
name
remote_world_id
current_checkpoint_id
current_remote_revision
created_at
updated_at
```

## 10.2 tasks

```text
id
project_id
provider
host
state
base_world_hash
proposal_hash
work_order_id
provider_session_id
started_at
updated_at
```

## 10.3 remote_operations

```text
id
task_id
operation_type
state
request_hash
expected_etag
remote_revision
dispatched_at
confirmed_at
```

## 10.4 checkpoints

```text
id
project_id
world_hash
storage_location/blob
reason
created_at
```

SQLite transactions should protect state transitions.

---

# 11. Checkpoint policy

Do not write a checkpoint constantly.

Create checkpoints:

- when user explicitly saves;
- after accepting an imported CandidateWorld;
- after accepting an agent proposal;
- before a remote save;
- after a confirmed remote save;
- when the user manually requests a checkpoint;
- before risky migrations.

A checkpoint can be:

```text
compressed JSON blob in SQLite
```

or:

```text
external JSON file + SQLite metadata
```

Choose based on practical size testing.

---

# 12. Dynamic Voyage runtime understanding

The application should rebuild most of its Voyage understanding from live reference data.

Input sources:

```text
current Voyage schema/reference API
current base world
current section index
current limits/reference data
current validator
small semantic-rules.json
current ActiveWorld
```

The application should not ship a giant hard-coded schema engine that must be updated manually for every Voyage change.

---

# 13. Cached schema/reference data

Keep a last-known-good cache of:

```text
schema
sections
base world
limits
reference metadata
source fingerprints
```

On startup:

```text
load cached data
→ app becomes usable
→ check freshness
→ fetch changed references
→ compile runtime interpretation
→ run sanity checks
→ replace cache if valid
```

If refresh fails:

```text
continue using previous known-good cache
```

This preserves the strongest reliability idea from the larger architecture without requiring a large snapshot subsystem.

---

# 14. Semantic rules

Maintain a small declarative semantic routing file.

Example:

```json
{
  "npc_generation": {
    "aliases": [
      "npc generation",
      "new npc",
      "generated character"
    ],
    "targets": [
      "$.aiInstructions.generateNewNPC",
      "$.aiInstructions.generateNPCDetails",
      "$.npcTypes",
      "$.characterArchetypes"
    ]
  }
}
```

At runtime:

```text
load rule
→ verify path exists in current schema/world
→ retain valid bindings
→ mark missing paths unresolved
```

New Voyage sections remain accessible generically even before curated semantic rules exist.

---

# 15. Deterministic context resolver

The resolver should use this order:

```text
1. exact JSON path
2. exact ID/name/entity
3. exact section key
4. curated semantic alias
5. schema-derived alias
6. lexical / FTS search
7. required dependency expansion
8. planning-chat disambiguation among a small candidate set
```

No local model is required for the first release.

---

# 16. Entity registries

Build exact registries from ActiveWorld.

Examples:

```text
realms
regions
locations
areas by location
factions
NPCs
NPC types
world voices
world lore titles
story starts
items
abilities
skills
traits
trait categories
resources
quests
narrative events
triggers
game modes
arcs
attributes
skill types
item categories
item slots
damage types
```

This makes many queries trivial.

---

# 17. Dependency rules

Use lightweight explicit dependency rules.

Examples:

```text
skills.attribute
→ attributeSettings.attributeNames

skills.type
→ skillSettings.skillTypeDifficultyBonus

npcs.currentLocation
→ locations

npcs.currentArea
→ areas under current location

locations.region
→ regions

regions.realm
→ realms

itemTypes.category
→ itemSettings.itemCategories

damage references
→ combatSettings.damageTypes
```

Do not build a generalized semantic graph framework unless later measurements justify it.

---

# 18. Ambiguity handling

When deterministic resolution is insufficient:

```text
reduce candidate set to a handful
→ ask planning model which candidates are relevant
```

Example:

```text
Request:
"fix hatchling anatomy generation"

Candidates:
A. generateNewNPC
B. generateNPCDetails
C. npcTypes
D. worldLore["Dragon Biology"]
```

This avoids shipping a local classifier before one is actually needed.

---

# 19. Optional local semantic judge

Add later only if:

- routing ambiguity is frequent;
- chat round trips are noticeably slow;
- offline routing is valuable;
- planning providers cannot make candidate selections reliably.

Likely class:

```text
200M–600M decision/scoring model
```

The model should only select among Workbench-supplied candidates.

It should not invent paths or directly mutate data.

---

# 20. Planning chat integration

Planning chat receives a bounded context packet.

Example:

```json
{
  "request": "expand everyday school skills",
  "primaryPaths": [
    "$.skills",
    "$.skillSettings"
  ],
  "dependencies": [
    "$.attributeSettings"
  ],
  "validationNotes": [],
  "worldExcerpts": []
}
```

The context resolver should do most selection before sending the message.

If more information is needed, expose structured read/search tools.

---

# 21. Structured planning tools

Expose purpose-built tools:

```text
world.get(path)
world.children(path)
world.search(query)
world.findByName(name)
world.findById(id)
world.references(path)
world.related(path)
world.schema(path)
world.validationErrors()
world.diff()
```

These tools are preferable to a fake shell for planning.

---

# 22. Optional virtual shell

A just-bash-style shell may be added later if useful.

It should simply map shell-like commands onto structured Workbench functions.

It is not a foundational subsystem.

---

# 23. Chat provider abstraction

Conceptual interface:

```ts
interface ChatProvider {
  capabilities(): Promise<ChatCapabilities>;
  listModels(): Promise<ChatModel[]>;
  createConversation(...): Promise<ConversationHandle>;
  send(...): AsyncIterable<ChatEvent>;
  resume?(...): AsyncIterable<ChatEvent>;
}
```

Planning providers may differ in:

- tool support;
- attachment support;
- session persistence;
- authentication;
- subscription entitlement.

Do not assume all consumer chat products expose equivalent programmable access.

---

# 24. Work provider abstraction

Conceptual interface:

```ts
interface WorkProvider {
  capabilities(): Promise<WorkCapabilities>;
  authenticateStatus(): Promise<AuthStatus>;
  runTask(task: WorkTask): AsyncIterable<WorkEvent>;
  resumeTask?(...): AsyncIterable<WorkEvent>;
  cancelTask(...): Promise<void>;
}
```

Primary target:

```text
Codex
```

Other providers plug into the same WorkTask/WorkEvent contracts.

---

# 25. Work Orders

A Work Order captures approved intent.

Suggested fields:

```json
{
  "id": "wo_123",
  "title": "Expand daily-life skills",
  "objective": "...",
  "requirements": [],
  "constraints": [],
  "primaryPaths": [],
  "allowedDependencies": [],
  "acceptanceCriteria": [],
  "notes": []
}
```

The Work Order should be human-readable and agent-readable.

---

# 26. Work task creation

When the user presses Build:

```text
ActiveWorld
→ clone/stage
→ attach Work Order
→ determine provider
→ determine AgentHost
→ run task
```

The agent receives staged state only.

---

# 27. Minimal work-agent workspace

Default workspace:

```text
/task/
  world.json
  AGENTS.md
```

Optionally:

```text
WORK_ORDER.json
```

Avoid materializing unnecessary files.

If the work provider can access Workbench tools directly, schema/reference data should be queried through tools rather than copied into the workspace.

---

# 28. No Git requirement

Do not use Git as the canonical change-tracking system.

Workbench already has:

```text
base world
candidate world
hashes
structural diff
checkpoints
```

Add Git only for providers/workflows that actually benefit from it.

---

# 29. AgentHost abstraction

Keep the host abstraction narrow.

Conceptual interface:

```ts
interface AgentHost {
  capabilities(): Promise<HostCapabilities>;
  runTask(task: HostTask): Promise<HostTaskHandle>;
  resumeTask?(id: string): Promise<HostTaskHandle>;
  cancelTask(id: string): Promise<void>;
  providerStatus(): Promise<ProviderStatus[]>;
}
```

Implementations:

```text
DesktopAgentHost
AndroidAgentHost
RemoteAgentHost
```

Do not build a generalized VM/container management API until required.

---

# 30. DesktopAgentHost

Desktop should run provider CLIs natively where possible.

Examples:

```text
Codex
Claude Code
OpenCode
```

The desktop host is responsible for:

- spawning process;
- provider environment;
- provider auth state;
- streaming events;
- task cancellation;
- detecting completion;
- importing result.

---

# 31. AndroidAgentHost

Android should use the smallest compatibility layer that makes provider CLIs reliable.

Target:

```text
minimal Linux-compatible CLI appliance
```

Not:

```text
full Linux desktop
general-purpose VM
large persistent distro
```

Possible contents:

```text
minimal userspace / BusyBox
provider runtime
provider binary
provider auth/config
tiny temporary workspace
```

Include Node/Bun/git only where required.

---

# 32. Android host implementation order

Prototype in this order:

```text
1. PRoot-style minimal userspace
2. custom lightweight launcher if useful
3. real VM only if future Android support makes it practical
```

The AgentHost contract should remain unchanged.

---

# 33. Android foreground service

Local work-agent execution should run under a foreground service.

Sequence:

```text
Build pressed
→ task committed in SQLite
→ foreground service started
→ persistent notification shown
→ AndroidAgentHost started
→ provider started
```

Notification example:

```text
Voyage Workbench
Codex is working on Royal Academy

[Open] [Stop]
```

---

# 34. Android recovery model

Assume local execution can disappear.

Task states:

```text
PREPARED
STARTING
RUNNING
PROPOSAL_READY
VALIDATING
AWAITING_APPROVAL
SAVE_PREPARED
SAVE_DISPATCHED
SAVE_CONFIRMED
COMPLETED

INTERRUPTED
UNKNOWN
FAILED
CANCELED
```

Every meaningful transition should be committed in SQLite.

---

# 35. Provider recovery

After restart:

```text
read task state
→ restore/check checkpoint
→ inspect provider/session state
```

If provider supports session resume:

```text
resume
```

If not:

```text
restart from Work Order + base world
```

The UI must distinguish:

```text
resumed
```

from:

```text
restarted
```

---

# 36. Remote AgentHost

Remote execution should be supported but not mandatory.

Use cases:

- desktop-only provider;
- heavy model;
- 4090 workstation;
- provider unavailable on Android;
- long-running task better suited to desktop.

The same Work Order should run on:

```text
Android local
desktop local
remote desktop
```

without changing the product workflow.

---

# 37. Large JSON import

External import is first-class.

Pipeline:

```text
external JSON
→ parse
→ CandidateWorld
→ schema/version detection
→ structural diff
→ validation
→ review
→ accept/reject
```

Never silently replace ActiveWorld.

---

# 38. Import modes

Support:

```text
Open as new world
Compare with current world
Stage as replacement candidate
Schema-aware merge where semantics are known
```

Do not claim arbitrary JSON merge is safe.

---

# 39. Large-file processing

Use structural techniques.

Potential approach:

```text
hash top-level subtrees
→ identify changed branches
→ recurse only into changed branches
```

UI should lazily request detailed diff information.

Do not render a huge JSON tree all at once.

---

# 40. Android import

Use Android's system document picker.

Support:

- Downloads;
- local file managers;
- cloud-backed document providers;
- Open With / Share to Workbench where practical.

No broad storage permission should be required.

---

# 41. Desktop import

Support:

- file picker;
- drag/drop;
- Open With.

All imports use the same CandidateWorld pipeline.

---

# 42. Export

Support:

```text
active world
candidate world
staged proposal
Work Order
diff/patch
validation report
recovery bundle
```

World exports must remain normal Voyage-compatible JSON.

---

# 43. Structural diff

Diff at JSON-path level.

Output should support:

```text
added
removed
changed
moved/reordered where significant
```

Group by Voyage section.

Example:

```text
skills
  + added cooking
  + added housekeeping

skillSettings
  ~ changed trainingCooldown

attributeSettings
  unchanged
```

---

# 44. Validation pipeline

Before accepting a CandidateWorld:

```text
JSON parse
→ schema compatibility
→ reference checks
→ limit checks
→ scope check
→ official Voyage validation
→ review
```

If validation is unavailable:

```text
do not pretend success
```

Display unavailable/stale state clearly.

---

# 45. Guarded save

Save sequence:

```text
ActiveWorld accepted
→ current remote revision/ETag check
→ validate
→ SQLite SAVE_PREPARED
→ conditional write
→ SQLite SAVE_DISPATCHED
→ response received
→ reread remote world
→ verify hash/revision
→ SQLite SAVE_CONFIRMED
→ checkpoint
```

---

# 46. Uncertain remote writes

If the process dies in:

```text
SAVE_DISPATCHED
```

then on restart:

```text
DO NOT retry automatically
```

Instead:

```text
reread remote
→ compare expected revision/hash
→ determine whether operation succeeded
→ reconcile
```

This is one of the most important correctness boundaries in the application.

---

# 47. Provider credential separation

Credential ownership:

```text
Voyage auth
→ Workbench

Codex auth
→ Codex/provider host

Claude auth
→ Claude/provider host
```

Provider prompts/workspaces should never contain Voyage credentials.

---

# 48. Secure storage

Desktop:

```text
OS credential store if practical
```

Android:

```text
Android Keystore-backed secure storage
```

Provider runtimes may also maintain their own auth storage inside their environment.

---

# 49. Schema compatibility behavior

If live Voyage references add a new section:

```text
generic navigator should expose it
schema-derived labels should make it searchable
semantic rules may not yet classify it
planning chat can still inspect it
```

If an existing semantic rule points to a removed path:

```text
mark binding unresolved
do not silently redirect
```

---

# 50. Unknown-schema fallback

If reference refresh fails:

```text
use last known good references
```

If current world contains unknown fields:

```text
preserve them
```

If current world is newer than cached schema:

```text
allow inspection/import
warn that validation/routing may be incomplete
```

---

# 51. Planning UX

Planning chat should feel like normal chat, not a schema console.

The router works behind the scenes.

Example:

```text
User:
"Royal needs more believable everyday school skills."

Workbench resolves:
skills
skillSettings
attributeSettings
possibly character creation

Chat receives relevant context.

GPT:
discusses design

User:
"Build that."

Workbench:
creates Work Order
```

---

# 52. Work UX

Work panel should show:

```text
Provider
Host
Task
Current status
Changed-path count
Validation status
```

Possible states:

```text
Preparing
Running
Waiting for provider
Proposal ready
Validating
Review required
Interrupted
Failed
Completed
```

---

# 53. Review UX

Desktop:

```text
section tree + side-by-side diff
```

Android:

```text
changed-section cards + unified diff
```

Both should show:

```text
path
before
after
validation relevance
scope relevance
```

---

# 54. Import review UX

Show:

```text
file name/source
detected Voyage version
validation summary
changed sections
changed path count
potentially dangerous structural changes
```

Actions:

```text
Accept
Inspect
Repair
Reject
```

---

# 55. Schema diagnostics UX

Expose a diagnostics panel containing:

```text
current schema/reference age
source freshness
validator version
cache status
semantic rule binding problems
unknown world fields
reference errors
```

Keep this out of the main workflow unless needed.

---

# 56. Provider capability negotiation

Each host/provider should report capabilities.

Example:

```json
{
  "provider": "codex",
  "host": "android",
  "auth": "ready",
  "resume": true,
  "streaming": true,
  "filesystem": "temporary",
  "shell": true
}
```

The UI should adapt based on capabilities rather than platform hard-coding.

---

# 57. Android resource strategy

Idle app:

```text
UI
TypeScript core
SQLite
cached Voyage references
```

Not loaded:

```text
Linux host
Codex
local semantic model
large temporary workspace
```

During Build:

```text
foreground service
→ start AndroidAgentHost
→ start selected provider
→ materialize tiny workspace
```

After task completes:

```text
capture result
→ stop/dispose host where practical
```

---

# 58. No mandatory local model

Do not ship a hundreds-of-MB local model in the initial app unless required.

This keeps:

- install size lower;
- memory lower;
- battery lower;
- architecture simpler.

The deterministic resolver plus planning chat should be measured first.

---

# 59. Potential later optimizations

Only add if measured need exists.

## Native JSON module

Add if:

```text
large worlds cause unacceptable JS parse/diff cost
```

## Local decision model

Add if:

```text
ambiguous routing is common enough to justify it
```

## Virtual shell

Add if:

```text
providers perform materially better with familiar shell semantics
```

## Git

Add if:

```text
specific provider workflows benefit significantly
```

## Real Android VM

Add if:

```text
Linux userspace is insufficient
and
a practical supported VM path exists
```

---

# 60. Repository layout

Suggested:

```text
voyage-workbench/
│
├─ apps/
│  └─ workbench-ui/
│     ├─ src/
│     │  ├─ features/
│     │  ├─ components/
│     │  ├─ shells/
│     │  │  ├─ DesktopShell.tsx
│     │  │  └─ MobileShell.tsx
│     │  └─ platform/
│
├─ packages/
│  ├─ workbench-core/
│  ├─ voyage-document/
│  ├─ voyage-schema/
│  ├─ voyage-router/
│  ├─ voyage-diff/
│  ├─ voyage-validation/
│  ├─ voyage-import/
│  ├─ voyage-save/
│  ├─ work-orders/
│  ├─ chat-provider-types/
│  ├─ work-provider-types/
│  └─ agent-host-types/
│
├─ providers/
│  ├─ codex/
│  ├─ claude-code/
│  └─ opencode/
│
├─ hosts/
│  ├─ desktop/
│  ├─ android/
│  └─ remote/
│
├─ voyage/
│  └─ semantic-rules.json
│
└─ native/
   └─ optional-performance-modules/
```

---

# 61. Initial milestone plan

## Milestone 0 — Core contracts

Implement:

```text
ActiveWorld
CandidateWorld
WorldHash
WorldDiff
WorkOrder
TaskState
SaveState
AgentHost
ChatProvider
WorkProvider
PlatformServices
```

Acceptance:
- compile/test contracts;
- no platform-specific logic in core.

---

# 62. Milestone 1 — World document and diff

Implement:

```text
lossless-enough JSON representation
exact path navigation
world hashing
candidate creation
structural diff
changed-path enumeration
```

Acceptance:
- unchanged world round-trips safely;
- large integer fixture preserved;
- diff identifies exact changed paths;
- CandidateWorld cannot mutate ActiveWorld implicitly.

---

# 63. Milestone 2 — Voyage reference runtime

Implement:

```text
fetch/cached schema
section index
base world
limits/reference metadata
semantic-rules.json
runtime compilation
last-known-good fallback
```

Acceptance:
- app starts with cached references offline;
- refresh replaces cache only after sanity checks;
- unknown section remains generically visible;
- broken semantic binding is reported, not guessed.

---

# 64. Milestone 3 — Deterministic router

Implement:

```text
exact entity registries
exact path lookup
alias matching
FTS/lexical search
dependency expansion
context packet builder
```

Acceptance:
- known test prompts route correctly;
- exact entity/name requests never call a model;
- router returns traceable path selections.

---

# 65. Milestone 4 — Shared UI

Implement:

```text
world navigation
section editor
raw JSON view
DesktopShell
MobileShell
validation panel
review panel
task panel
```

Acceptance:
- same world state usable in desktop and mobile layouts;
- no platform-specific feature duplication.

---

# 66. Milestone 5 — SQLite recovery

Implement:

```text
projects
tasks
work_orders
checkpoints
remote_operations
provider_sessions
```

Acceptance:
- process killed between task states;
- state recovered correctly;
- uncertain remote operations remain uncertain.

---

# 67. Milestone 6 — Import/export

Implement:

```text
desktop file picker
desktop drag/drop
Android document picker
CandidateWorld import
large-file diff
export
```

Acceptance:
- very large world imports without UI lockup;
- import does not change ActiveWorld until accepted;
- rejected import leaves current world unchanged.

---

# 68. Milestone 7 — Desktop Codex vertical slice

Implement:

```text
DesktopAgentHost
Codex authentication detection
temporary world workspace
Work Order handoff
event streaming
result import
```

Acceptance:

```text
load world
→ create Work Order
→ Codex modifies staged world
→ diff
→ validation
→ accept
```

---

# 69. Milestone 8 — Guarded Voyage save

Implement:

```text
Voyage auth
remote download
ETag/revision tracking
validation
conditional save
read-back verification
remote-operation journal
```

Acceptance:
- stale remote revision rejected;
- save confirmed by reread;
- simulated crash after dispatch reconciles without duplicate write.

---

# 70. Milestone 9 — Android application shell

Implement:

```text
shared MobileShell
PlatformServices Android implementation
secure storage
SQLite
foreground service
notifications
import/export
```

Acceptance:
- editing/import/validation works without agent runtime;
- foreground-service lifecycle works;
- kill/restart restores application/task state.

---

# 71. Milestone 10 — Android Codex appliance

Implement:

```text
minimal Linux-compatible host
Codex runtime
provider auth persistence
temporary workspace
foreground-service integration
task event bridge
```

Acceptance:
- same Work Order that works on desktop works on Android;
- provider crash produces recoverable state;
- environment can be stopped after work.

---

# 72. Milestone 11 — Planning chat

Implement supported subscription-backed planning provider(s).

Flow:

```text
user message
→ deterministic context
→ chat
→ Work Order creation
```

Acceptance:
- chat does not require entire world;
- Work Order can be reviewed/edited before Build.

---

# 73. Milestone 12 — Additional work providers

Add:

```text
Claude Code
OpenCode
```

only after Codex path is stable.

Acceptance:
- same WorkTask contract;
- provider-specific complexity remains in provider adapter.

---

# 74. Milestone 13 — RemoteAgentHost

Implement:

```text
authenticated connection
capability discovery
task dispatch
event stream
resume/reconnect
```

Acceptance:
- Android can send the same Work Order to remote desktop;
- proposal returns through normal CandidateWorld flow.

---

# 75. Milestone 14 — Optional optimizations

Evaluate:

```text
native JSON module
local fuzzy model
virtual shell
Git support
real VM host
```

Only implement when benchmarks justify them.

---

# 76. Test strategy

## Core tests

- lossless round-trip fixtures;
- unsafe integer fixtures;
- unknown-field preservation;
- exact path lookup;
- dependency routing;
- CandidateWorld isolation;
- diff correctness.

## Schema tests

- new Voyage section;
- removed field;
- changed enum;
- changed limit;
- malformed API response;
- offline startup;
- stale cache.

## Import tests

- multi-MB world;
- malformed JSON;
- valid but schema-invalid world;
- newer-schema world;
- massive single string field;
- external-agent-modified world.

## Agent tests

- normal completion;
- provider crash;
- user cancel;
- lost event stream;
- resumable provider session;
- non-resumable restart.

## Save tests

- stale ETag;
- validation failure;
- network loss before dispatch;
- network loss after dispatch;
- process killed after dispatch;
- read-back mismatch.

## Android lifecycle tests

- background app;
- lock device;
- kill process;
- kill provider;
- low-memory kill;
- reboot;
- network changes;
- user force-stop behavior documented correctly.

---

# 77. Performance goals

The app should remain light when idle.

Targets:

```text
no Linux host while idle
no local model while idle
no large provider workspace
incremental indexes
lazy diff rendering
minimal persistent writes
```

The provider runtime should be the dominant active-work cost, not Workbench itself.

---

# 78. UX success criteria

The architecture is successful if the user can perform this on both desktop and Android:

```text
Open world
↓
Ask planning chat for a change
↓
Discuss/refine
↓
Create Work Order
↓
Build locally or remotely
↓
Review exact changes
↓
Validate
↓
Accept
↓
Save
```

without needing to understand:

- schema refresh internals;
- provider process mechanics;
- Android Linux compatibility;
- checkpoint internals;
- remote-write reconciliation.

Those should be invisible unless something goes wrong.

---

# 79. Final architecture rules

Lock these rules:

1. The authoritative world belongs to Workbench.
2. The world is one JSON object.
3. Imported and agent-produced worlds are candidates until accepted.
4. Planning and implementation remain separate roles.
5. Work Orders are the planning-to-work boundary.
6. Work agents edit staged state only.
7. Workbench owns Voyage credentials and saves.
8. Desktop and Android share one feature UI implementation.
9. Desktop and Android may use different shells/layouts.
10. Platform differences stay behind PlatformServices and AgentHost.
11. TypeScript is the initial core language.
12. Native code is added only after measurement.
13. Voyage understanding is rebuilt from current references.
14. Last-known-good reference data is retained.
15. Deterministic routing comes before model routing.
16. No local model is required for launch.
17. No Git is required for launch.
18. No fake shell is required for launch.
19. No full Linux distro is required for launch.
20. No real Android VM is required for launch.
21. Android agent execution runs only when needed.
22. Android active work uses a foreground service.
23. Android correctness never depends on uninterrupted process lifetime.
24. Task/recovery state is transactional in SQLite.
25. Uncertain remote writes are reconciled, not blindly retried.
26. Large import/export is first-class.
27. Unknown fields are preserved.
28. Unknown schema states are surfaced, not guessed.
29. Validation failures never masquerade as success.
30. Complexity must earn its place through measured need.

---

# 80. Final recommendation

Build the lean hybrid.

Do not start by implementing:

```text
full Rust backend
local decision model
virtual bash
Git staging
full Linux distro
general VM manager
large schema ontology
microservice backend
```

Start with:

```text
shared React UI
TypeScript Workbench core
SQLite recovery
dynamic Voyage references
deterministic router
CandidateWorld
structural diff
large import/export
desktop Codex
guarded Voyage save
Android foreground service
minimal Android Codex appliance
```

This produces nearly the same end product as the larger architecture while dramatically reducing implementation surface.

The architecture remains expandable because the important seams are preserved:

```text
ChatProvider
WorkProvider
AgentHost
PlatformServices
semantic-rules.json
optional native acceleration
```

The stable center is the Workbench itself, not any particular model provider, schema version, operating system, or execution technique.
