# Source-to-world creation — implementation and delivery plan

## Product contract

Give Workbench a creative request and Markdown research. The assistant should
produce substantial, source-faithful playable world content, planned and rendered
maps, the requested artwork, a cover, and truthful publishing copy. The output is
a reviewable publishing package, not just a plan, a template, or an image prompt.

Maps are part of the first workflow. ComfyUI, a local GPU, and a specific image
backend are not prerequisites. Final publication remains an explicit user action.

## Implemented foundation

- A **Create world** tool in the shared desktop/Android workbench, available in
  **All tools**. Its **New V37 creation project** action constructs a fresh
  schema-shaped seed from the bundled version-labelled community codec. It does
  not relabel or migrate an existing V36 world. Seeds are intentionally incomplete,
  not ready-to-publish defaults or officially validated templates.
- Project-persisted creative requests and up to twenty Markdown/text documents,
  bounded to four million characters total and one million per document. Text is
  hashed, paginated in 12,000-character tool responses, and treated as untrusted
  reference data. Host-recorded served ranges prevent certification when source
  pages have not been supplied to an assistant. This records delivery of bytes,
  not proof that a model understood every sentence.
- Structured canon/inference/original-addition decisions with document/line
  provenance, timeframe, assumptions, tone and art direction. Canon requires valid
  source spans. Users can lock decisions and map objects; subsequent assistant
  updates cannot remove/change locked values or locked objects' coordinate frames.
- A durable adaptation inventory connects source decisions to actual world-content
  paths. Unbuilt deliverables and orphaned source decisions block completion.
  Exclusions need explicit rationales and remain visible in the report; locked
  source decisions cannot be certified through exclusions. Updating checklist
  status alone does not regenerate otherwise unchanged artwork.
- Shared `creation_read` and `creation_update` tools. Only an explicitly approved
  whole-world creation task can update the workspace. Review children cannot read
  its sources or mutate it. Source documents cannot grant permissions, change the
  rubric path, or invoke an image provider.
- The existing staged world editor, task journal, exact-number preservation,
  proposal review, schema completion checks and guarded checkpoint continuation
  remain in use. Changing the brief or sources invalidates old continuation
  permissions. Construction and asset preparation are different stages; finishing
  a text task is not certification of a finished package.

## Maps and artwork

The assistant authors global, north-up geographic blueprints. Features have stable
IDs, constrained coordinates, an explicit palette, optional labels and links to
actual world locations. Supported features include land/water/forest polygons,
mountain peaks, roads, rivers, settlement symbols and landmarks.

The renderer makes actual 1,000 × 1,000 PNG region maps by clipping the same global
SVG blueprint. It does not ask unrelated prompts to invent each region. Global
geometry therefore continues across region edges. Labels are off by default.
Checks identify uncovered/overlapping regions, missing location markers, wrong
realm relationships, and disagreement with Voyage's region-local coordinates.

This first renderer is **schematic cartography**, not a promise of illustrated
8K maps, building meshes, individual-tree edits, elevation simulation, road-network
solving, or pixel-perfect franchise artwork. Geography and source-faithful quality
still require meaningful agent design and review.

Artwork briefs resolve to stable destinations across bare GameState and downloaded
world envelopes. Cover/portrait/scene generation uses the existing Artwork route.
The user can authorize an image-request limit for the foreground batch; map
rendering needs no paid provider. The route is frozen and rechecked without a
silent fallback. Requests are reserved durably before provider dispatch, and
successful images are saved in the shared asset library before completion.

Duplicate workers cannot own the same reservation. Failed or uncertain image
requests are never automatically repeated. Startup recovery marks in-flight jobs
uncertain, including projects without running text tasks. Explicit retry warns
about possible duplicate charges. Completed assets survive interruptions.

Content hashes invalidate stale jobs. A changed map invalidates its affected
region crops without regenerating the cover. World-content/canon changes are
deliberately conservative and can invalidate multiple artifacts. Assigning image
URLs or adopting an equivalent downloaded world envelope does not alone require
regeneration. This is hash-based dependency tracking, not a general-purpose DAG
scheduler or provider-side billing deduplication.

## Rubric and completion contract

The supplied **Voyage High Popularity Potential Rubric v1.6.2**, dated October 27,
2026, is bundled in `packages/core/world-creation-rubric.ts`. Its v1.6.2 superseding
readiness definition takes precedence. The universal or specialist path is chosen
before grading; optional entry overlays are not applied implicitly.

The implementation combines:

1. **Scope completion:** actual world content, authored geography, a cover brief,
   all planned image/map jobs, uploaded URLs and current assignments.
2. **Source evidence:** immutable source hashes, served-document coverage, canon
   citations, explicit assumptions, and an exact final package hash.
3. **Assisted rubric review:** evidence-backed criterion/gate records, P3/P4
   diagnostic arithmetic, unknown-score intervals, section floors, rounding of the
   final total, applicable evidence caps, and all twenty gates.

The host independently rejects missing/placeholder NPC visual descriptions,
incomplete/duplicate location and area visual tags, and absent area descriptions
in the standard NPC/location/nested-area/top-level-area/unassigned-area registries.
The implemented visual-tag default is at least three distinct meaningful strings.
An unusual target schema with a different authoritative tag contract needs an
explicit implementation of that override, not an invented automatic waiver.

Agents cannot mark jobs generated or clear missing image evidence by asserting
that prompts look good. Actual visual inspection is required. The existing paid
cover diagnostic can inspect cover crops; it does not inspect all secondary art
or establish G20 alone. This version provides an explicit user-recorded
whole-package visual inspection step. The assistant can then review that evidence
and repair/grade the package. New relevant content or changed pixels invalidate
old evidence; URL assignment alone does not invalidate an otherwise identical
visual inspection.

Semantic canon fidelity, agency, enjoyable mechanics, visual specificity and the
rubric's detailed subdiagnostics still require competent review. Structural checks
and model-supplied grades are not objective proof of those qualities. The detailed
rubric is available to the assistant, but this is not a complete deterministic
implementation of every qualitative probe, external-mod registry or subrubric.

The normal publication workflow blocks `publish` for creation projects unless the
current creation assessment is static-ready and its required local artifact bytes
still match their recorded hashes. Existing official validation, read-back,
moderation and final publish confirmation remain separate requirements.

Every report states **STATIC DESIGN ASSESSMENT — NOT PLAYTESTED**, retains
`official: false`, and marks runtime behavior unverified. The rubric does not
require live gameplay or popularity measurements; neither is silently introduced
as a scoring dependency. Static readiness does not predict popularity or prove
official acceptance. Creator integration remains **Alpha-only**; production access
is not enabled by this feature.

## User workflow

1. Open **All tools → Create world**, preferably create a fresh V37 project, enter
   the request, attach research, select a rubric path, and save the brief.
2. Approve whole-world construction. Optionally authorize bounded image generation
   and the existing checkpoint/review permissions. Text/provider usage can incur
   charges. The assistant uses the same validated world editing tools as ordinary
   work and stores its design/map/artwork/publication artifacts incrementally.
3. Accept the world proposal if automatic local application requires review. In
   the same open project, the foreground coordinator then renders maps and, only
   if approved, generates the bounded image batch. Continue missing batches from
   the saved workspace rather than restarting completed jobs.
4. Inspect the canon, maps and artwork. Use the explicit cover diagnostic if
   desired, record full visual inspection, and run assistant rubric review/repair.
   An 85/100 total is insufficient if section floors, gates, evidence or artifacts
   remain incomplete.
5. Prepare publication details in **Publish**. For an enveloped project this stages
   a publication-details proposal; for a bare GameState it saves separate creation
   details without injecting them into game-state fields.
6. Explicitly create a private Alpha draft using the existing Publish workflow,
   accept its downloaded envelope, and approve uploading/assigning the completed
   creation assets. Recorded uncertain uploads resume their existing upload IDs
   rather than obtaining duplicate allowances. Uploading is not saving/publishing.
7. Prepare/accept updated publishing details if needed, reassess the final package,
   save the remote draft, run official checks/moderation, and explicitly publish.

You can export the exact world JSON at any time. A separate Workbench package
archive contains the exact world text as a string, publication details, sources,
design, blueprints, local image bytes and the current readiness report. Incomplete
exports preserve their blockers. The archive is not a Voyage-import JSON and is
currently for inspection/backup/manual recovery, not a one-click archive restore.
It includes source documents: do not treat it as the public release artifact.

The standard blank-world/import flows are unchanged. “Save as new Voyage world”
still creates a separate local copy under the existing copy contract; use the
creation project's “Create private draft” path to retain its creation workspace.

## Execution limits and remaining work

- Automatic asset preparation is a **foreground workbench coordinator**. It stays
  mounted while navigating tools in the same project, but closing the project,
  page or Android process ends that coordinator. The saved jobs can be continued;
  this does not promise unattended OS-service or cross-device job execution.
- Existing task budgets are unchanged: two optional checkpoint continuations and
  the bounded shared journal. Large source collections may require explicit
  follow-up tasks. There is no hidden unlimited agent loop or enforced token/dollar
  budget. The image-request cap is per explicitly approved foreground batch.
- Full-package automated multimodal review, a source-aware quality-repair loop
  with its own approved budget, authenticated desktop-worker control from Android,
  archive restoration, richer illustrative cartography, and declared mod-registry
  extensions are separate follow-ups. Do not label these implemented.
- Live provider quality, a full supplied-research adaptation, official Voyage
  acceptance/publication and Android device behavior
  need integration exercises on configured hosts. Mock-provider, static-render and
  native-bundle tests do not establish those results. A controlled Electron test
  does exercise real SVG-to-PNG rasterization, equal pixels across a shared region
  boundary, publication-copy preparation and explicit build/stop controls without
  sending an image-generation request.

## Validation commands

```sh
export PATH="$HOME/.local/share/voyage-node/bin:$PATH"
npm run typecheck
npm test
npm run test:release
python3 -m unittest discover -s tests
npm run build
npx cap copy android
npm run test:harness
```

Android production/instrumentation compilation additionally uses the configured
local Android SDK and JDK. No test or build authorizes a real provider charge,
remote draft modification, publication, release or commit.

## Verification record — November 4, 2026

- Shared UI/core/desktop/provider suite: **358 passed**, including the controlled
  Electron creation-screen and real PNG map-rendering tests.
- Compiled native harness: **7 passed**. Release-contract tests: **12 passed**.
- Legacy Python suite: **193 passed** on rerun. An earlier run under concurrent
  load hit the existing cancellation test's short process-start timing window;
  no unrelated Python implementation or test was changed.
- TypeScript checking and the shared UI, desktop host and Android document-engine
  build passed. Final web assets were copied into the Android project.
- Android application and instrumentation-test Java compilation passed using
  `:app:compileDebugJavaWithJavac` and
  `:app:compileDebugAndroidTestJavaWithJavac`. Instrumentation was compiled, not
  executed on a device.

For reproducible Electron verification on a busy host, the full TypeScript suite
was run serially with isolated temporary `XDG_CONFIG_HOME` and `XDG_CACHE_HOME`
directories. The build retains bundle-size/import-layout warnings, and Android
reports existing deprecation warnings. These are not failed validation checks.

This verifies the implemented workflow with synthetic worlds, mock providers,
durable stores and actual local map pixels. It does **not** claim that the
attached research has already been turned into a finished world, that a paid
image/text provider was exercised, or that Voyage accepted or published a world.
