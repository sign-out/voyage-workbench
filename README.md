> **Desktop and Android apps:** Download the [0.2.11 test release](https://github.com/sign-out/voyage-workbench-downloads/releases/tag/v0.2.11-test), or browse the [binary release list](https://github.com/sign-out/voyage-workbench-downloads/releases). Windows x64, Linux x64, and Android builds are available. See [install instructions and current validation limits](docs/PERSONAL_APPS.md). The original Python workbench below remains available.

## Public source and test builds

This repository contains the application source, tests, build scripts, and bundled authoring examples. Private projects, account state, credentials, signing keys, local SDKs, downloaded provider runtimes, internal screenshots/logs, and build caches are excluded. Release binaries live in the separate `voyage-workbench-downloads` repository; source archives are not attached there.

Version **0.2.11** is an alpha/test build. Conservative packaging cleanup is standard; Android retains a full/offline default plus optional lightweight editions with explicit provider-pack installation. See [release notes](docs/RELEASE_0.2.11_NOTES.md). Windows uses a self-signed certificate, so unknown-publisher or SmartScreen warnings may remain. Android retains the existing test-build signing identity. Linux and the checksum manifest have detached signatures; public verification material is in `checksums.json`. A signature does not establish public certificate trust.

For source development, install Node.js 22 or newer, then run `npm ci`, `npm run build`, `npm run typecheck`, `npm test`, and `npm run dev`. The build generates the reference assets required by desktop service tests. Run `npm run desktop` for the Electron app. Android also requires a JDK, Android SDK, and separately prepared native/provider runtimes; see [development and packaging prerequisites](docs/PERSONAL_APPS.md). Packaging scripts currently expect locally prepared provider runtimes and retained dependency compliance inputs, which are not included in this source snapshot. Building from source does not reproduce the distributor's signing identity; never share private signing keys.

Original Voyage Workbench code is licensed under **GNU GPL version 2 only** (`GPL-2.0-only`), not "version 2 or later". See [LICENSE](LICENSE) and [licensing scope and dependency obligations](docs/LICENSING.md). Third-party software and reference material retain their own licenses; the application license does not relicense provider CLIs/SDKs, dependencies, or third-party content.

# Voyage Workbench

The proposed Windows/Android successor architecture and the successful Android Codex runtime experiment are documented in [Lean hybrid implementation decisions](docs/LEAN_HYBRID_DECISIONS.md). The native experiment is a feasibility probe; the application described below remains the current implementation.

A local Voyage world builder with exact-source JSON editing, nested record controls, durable projects, checkpoints, validation, reviewable Codex proposals and optional official Creator API integration.

## Install and run

The editor uses Python’s standard library. Local artwork slicing uses **Pillow**, prepared automatically in the project’s `.venv` by both installers; ImageMagick is an alternative for manual installs. It needs **Python 3.10+**, **Git**, and **Codex CLI** for the agent. **Tailscale** is needed for private remote access. Installer scripts run from the project folder and keep project data in `.workbench/` beside the app. Launchers prefer `.venv` when present; recreate it with the installer after moving between operating systems. A Docker daemon is not required.

**Linux:** run `./install-linux.sh`, then `./start-workbench-tailnet.sh`. The installer detects and installs missing Python, Git, curl, Tailscale, and Codex CLI through your distribution package manager or the vendors’ official installers. It checks Codex sign-in, starts `tailscaled`, prints Tailscale’s browser login URL on a new device, waits for authentication, and grants the current user permission to register Serve. `./install-linux.sh --check` only reports prerequisites.

**Windows 10/11:** run `install-windows.bat`, then `start-workbench-tailnet.bat`. The installer requests Administrator access, uses `winget` for Python, Git, Node.js, and Tailscale, installs Codex CLI from its official npm package, then guides Codex and Tailscale browser sign-ins. The launcher requests Administrator access for Tailscale Serve. PowerShell users can run `install-windows.ps1` or `start-workbench-tailnet.ps1` directly. `install-windows.ps1 -Check` reports prerequisites without installing anything.

Windows launchers enable Python UTF-8 mode, and the validator reads its bundled reference file as UTF-8 explicitly. You do not need to change the system locale or code page. The installer checks for Python 3.10+ even when an older `py` or `python` is already installed.

Both launchers print the local URL and the tailnet-only HTTPS URL. To work offline, use `./start-workbench.sh` or `start-workbench.bat`; the world editor still works without Codex/Tailscale, while agent calls need Codex sign-in. `python3 -m workbench.server --port 8766 --tailscale --tailscale-port 8444` chooses other ports on Linux. On Windows use the PowerShell launcher’s `-Port` and `-TailscalePort` arguments. Stop the foreground server with Ctrl+C; Tailscale Serve’s saved mapping resumes when the server restarts.

## Private access through Tailscale

Once the installer has connected this machine to your tailnet, run `./start-workbench-tailnet.sh` or `python3 -m workbench.server --tailscale`. The backend registers Tailscale Serve at an HTTPS URL on port 8443 and prints the address. Use `--tailscale-port` to choose another free port. Tailscale may require enabling HTTPS for your tailnet through its setup link.

The backend still listens only on loopback. It accepts the exact registered HTTPS hostname, checks Origin, and marks remote session cookies Secure. Registration refuses an existing conflicting service or a port with public Funnel enabled. It uses Serve, not Funnel. Devices permitted to reach this endpoint by your tailnet policy can access the workbench, edit projects, and invoke your local agent account; this is a single-user app without separate per-user permissions.

On a new system, the installer prompts through `tailscale up` and waits for the device to connect before registration. If the tailnet has not enabled HTTPS certificates, Tailscale Serve prints its setup URL; complete it and rerun the launcher. Tailscale Serve configuration persists; the workbench process must also remain running. If registration fails, the local UI remains available and the reason is printed. To remove just this endpoint, use `tailscale serve --https=8443 off`.

## Try it

1. Choose **Lantern Coast** for a small authored starter, **Blank World** to start from the bundled blank structure, or **Living Continuity** for the supplied systems seed. The templates are local authoring examples, not remotely validated playable-world certifications.
2. Choose a section on the left. Click record names to drill down; use breadcrumbs to go back. **Edit** opens a complete value in a dialog. String values are plain text; other values use JSON so numbers retain their exact spelling.
3. Use **Add field / record** in any object or array. Enter an exact key and a JSON value. Unknown fields are retained. Removing a selected value first creates a checkpoint.
4. Edit the raw source when needed. **Save locally** or Ctrl/Cmd+S persists it, including invalid drafts. Invalid section edits switch to the full document for repair. Browser recovery retains unsaved editor buffers when storage permits.
5. **Changes** compares against the original import. **History** restores checkpoints with a safety checkpoint of the outgoing draft. **Export JSON** offers the current document with its mod references or a base export with `mods: []`.
6. Open **Validation** and click **Run local checks**. This checks the current editor text, including unsaved or malformed section drafts, for JSON syntax, basic world structure, documented references, and types from the bundled community wiki. It also warns about the `successLevelSettings` shape observed in a Voyage draft-validation response. The local check runs in Python, never executes world scripts, and never sends the document to Voyage. Warnings are advisory; no local result certifies gameplay or remote acceptance. **Validate with Voyage** is a separate connected action using the official Creator API.

**Characters** lists named `npcs` and `premadeCharacters` as searchable portrait cards, with initials when a portrait is missing or fails to load. Select a character to write descriptions, backstory, personality, mechanics, voice fields and other schema fields in a form, or create an NPC/premade locally. NPC `name` is its record identity and must match its map key; `properName` edits its display name. Numeric/container fields use exact JSON text. Only changed fields are applied, retaining unknown fields, scripts and exact numbers elsewhere. **Upload portrait** uploads to Voyage and stages its approved URL in the form; **Apply character edits**, then **Save locally**, records the edit in recoverable world history. Premade characters are selectable player templates rather than NPC type templates.

**Map** is a spatial editor over the same world JSON. Create realms, place regions on their integer grid, drag regions between cells, and open a region to place and drag locations within its local coordinate space. Existing regions or locations without coordinates appear in **Unplaced** lists so you can position them. The inspector edits descriptions, location radius/type, parent region, and the region's hosted map-image URL. It warns about overlapping or disconnected region cells and locations outside the configured `regionSize`. All map changes stay in the working copy until **Save locally**; export includes the same coordinates and image URLs. Region map images need a hosted HTTPS URL to display in the browser and work in Voyage. Use **Upload region map image…** to upload a local file or generated artwork through Voyage and attach its approved URL to the working copy. The map editor does not infer a geography from an illustration or build one continuous raster map automatically.

To remove a local project, open it and choose **Move to trash**. The sidebar **Trash** view can restore it later. **Delete permanently** in Trash removes the local document, checkpoints, Git revisions and staged worktrees, agent conversations, and generated artwork after you type the project name. These actions affect only this workbench; they do not delete a world on Voyage. Export or back up anything you want to keep before permanent deletion.

To apply an externally edited full JSON file to an existing project, open the project and choose **Import JSON changes**. The workbench validates the file, stages it in a project Git worktree, saves a checkpoint of the outgoing document, and applies the imported content as one local revision. Existing remote Voyage worlds are unaffected until you explicitly save to Voyage.

Map zoom uses a stable viewport: drag the zoom slider, use +/−, or wheel-zoom around the pointer. Pan on empty map space or with the middle mouse button. **Feather image edges** edits `locationSettings.regionMapBorderFeatheringEnabled`; **Region width** edits `locationSettings.regionSize`. Voyage stores width in coordinate units (local locations span ±width/2). These are ordinary world edits: save locally to commit/export them. Changing width preserves existing location coordinates; review travel-distance warnings afterwards.

Open **Mod overlays** to inspect and edit the ordered `mods` references, pin a version or follow the latest published version, and reorder or remove entries. **Resolve IDs with Voyage** uses the connected Creator API `/mods` catalog to show available names. When an ID cannot be resolved, use **Attach JSON** beside it or **Attach mod JSON** below the stack. The file's embedded `shortId`, if present, must match; if absent, enter the ID before attaching. The original file stays in the local project, and its title and nonempty sections identify the overlay offline. You can download or detach it later. Attaching a new ID stages a reference that you must apply to the working copy. These files are identification and review aids, not included in the exported world JSON.

Click **Apply reference changes to working copy**, then save locally. The base export removes only mod references; it preserves all authored sections and any content Voyage previously merged into them. The workbench does not flatten mod contents into the JSON or reverse a prior Voyage Apply operation. [Voyage’s modding reference](https://wiki.unofficial.voyage/mods/modding) documents that Apply can persist merged content in the world, so keep a pre-apply checkpoint if you need a clean base.

## Configure the base world

Open **Base world** in the sidebar. Upload a known-good world JSON or enter an owned-world short ID using the connected Voyage account. The companion derives a minimal candidate, removing authored content while preserving required definitions. Inspect the sanitized JSON, summary, and warnings before using it.

Expand **Inspect and edit sanitized JSON** to make corrections, then choose **Save candidate edits**. Editing invalidates prior validation. **Validate with Voyage** checks the saved candidate against the official service. **Activate base world** is enabled only for a verified candidate and sends its exact checksum to prevent activating a different revision. The configured base replaces the blank starting template in the cards and new-project selector; existing projects are unchanged. **Restore bundled base** returns new projects to the bundled template.

After official validation passes, optional **Minimize with Voyage** tries individual field deletions against the official validator. It runs sequentially, with progress after each response, and keeps only accepted removals. Each run is bounded to 120 probes. **Stop after current check** ends the loop after the in-flight request; accepted reductions remain available for review. Starting again works from the current candidate. Activation stays disabled during minimization. This greedy procedure finds accepted reductions, not a guaranteed global minimum.

Schema references are advisory. **Refresh schema reference** fetches current community definitions; the dialog displays refresh failures and keeps the previous reference available. An activated, officially checked base supplies shapes for new fields and overrides stale cached types that disagree with it. Its presence does not prove that every field is required. The agent can read the configured base through its dedicated `world_base_template` tool. Schema warnings alone do not establish official acceptance. Derivation is a starting point that may need manual repair and official validation.

## Validation sources

**Run local checks** works offline using syntax, structural/reference checks, and cached advisory schema checks. **Validate with Voyage** sends the current draft to the official Creator API using your connected account. **Send to community validator** explicitly submits the current GameState to `https://api.unofficial.voyage/validate`, an independent service, without sending your Creator API key. Its errors, warnings, suggested fixes, and recommendations supplement official validation.

Community results include the source, validator version when available, and document hash. Changed editor text invalidates displayed results; unavailable or malformed responses never count as a pass. No validator result alone proves gameplay behavior or compatibility with existing play sessions.

## World agent and local history

The **Assistant** panel stays available alongside every editor without navigating away or discarding a form. It shares the project's Planning conversation and shows the current screen or selected NPC, region, location, music track, system, or JSON field. Vague requests such as “How can we improve this?” use that selection first, or the current collection when nothing is selected. Explicit instructions can override that focus.

Each message freezes the current selection and bounded, exact-source excerpts of the applied local world. Unapplied form/draft values are **not** sent; the panel warns when they exist. The selected Planning provider receives this context, pinned memory, and up to twelve recent conversation entries, including earlier selection labels. Chat survives project reloads. Open **Review suggestions** to review proposed Work Orders: context never grants edit permission, runs work automatically, or uploads a world to Voyage.

**Settings → Local assistant edits** defaults to **Apply locally automatically**. After you approve and run a Work Order, successful edits apply locally with a before-change checkpoint saved atomically in History. Choose **Proposal only** to restore review-before-apply for future tasks; the setting is frozen when each task starts. Open drafts or newer local edits block automatic application and preserve the result as a proposal. Failed, canceled, interrupted, and legacy tasks never auto-apply. Planning, imports, and checkpoint restoration still require their existing review steps. Local checkpoints restore world JSON, not provider charges, uploaded media, remote saves, or publication; keep off-device backups too.

Open the **Assistant** panel or **Planning** to discuss your world. For example: “Build a harbor faction, connect it to two NPCs, and add matching lore.” Send uses the configured Planning provider with read-only world tools. The local conversation, task records, and pinned memory survive local restarts; recent messages and world excerpts are sent to that provider. Account limits and provider charges apply.

The planner can inspect sections, read exact values, search records, consult bundled references, and propose scoped Work Orders. After you approve and run a Work Order, the work agent stages edits and validates its result. Successful work follows the frozen local-edit mode described above. Proposal-only work leaves the active world unchanged until **Proposals → Accept proposal**. Failed or canceled runs retain staged partial edits for explicit recovery and review; they never auto-apply.

**History → Restore** creates a proposal containing the older checkpoint. Review and accept it to restore that exact world source; existing history is not rewritten or deleted. Local changes retain their before-change source in SQLite checkpoints, and named checkpoints are also available. The checkpoint and automatic application commit in the same database transaction: a failed checkpoint write cannot leave automatic changes applied without a recovery point. Concurrent world changes block stale automatic application. Local history is not an off-device backup and does not undo external side effects.

World tools are scoped to one project's staged world. The app-server verifies disabled shell/browser/plugin features and disconnected MCP servers before a model turn. Conversation history lives in Codex's own rollout storage as well as the local workbench transcript. The T3 Code app-server architecture informed this integration; the editor remains this project's implementation.

## Generate world artwork

The app’s **Artwork → Artwork destinations** workspace groups every NPC portrait, playable-character portrait, region map, location scene, nested area scene, item image and world cover by its human-readable name. Select a destination to import a PNG/JPEG/WebP file, reuse a library image, generate with the Artwork model route, or attach a hosted HTTPS URL. New files and generated images stay local until you explicitly upload and attach them; saving to Voyage is a separate action. Unsaved editor drafts must be resolved before attachment.

Alpha supports five upload purposes: `NPC_PORTRAIT`, `REGION_MAP_IMAGE`, `LOCATION_IMAGE`, `AREA_IMAGE` and `ITEM_IMAGE`. Uploads require at least 600×600 pixels and no more than 5 MiB. There is no documented cover-file upload purpose: use **Cover art & grading** to import or generate covers, inspect crops and grade against the supplied weighted rubric, then download for the official editor or attach a hosted cover URL. Custom image fields likewise accept hosted URLs without inventing an upload purpose.

**Publish → Save as new Voyage world** copies the saved local content into a separate local project and creates a new **private Alpha** world. The original project, remote link and world remain untouched. Review the new downloaded envelope in Proposals before further saves. If creation has an uncertain outcome, use that copy’s publication journal to replay the exact request with the same idempotency key instead of creating another copy.

**Build tiled artwork** in World agent supports two workflows. Choose **Individual tiles** for sequential tile generation, or **Master image → split → refine** for a coherent master illustration. Set its aspect ratio, detail level and grid dimensions. Changing detail also changes the suggested grid (low 2×2, medium 3×3, high 4×4); rows and columns remain editable and the resulting tile count is shown. Detail requests approximately 512/1024/1536 pixels per tile; actual model output dimensions and seam continuity still need review.

**Create artwork plan** saves the brief without generating images. Generate a master or choose an existing project image, then **Split master locally**. The backend crops every source pixel exactly once into lossless PNGs, with no model call. **Regenerate all tiles** or a tile’s **Regenerate** sends its actual crop and full master as image references to native Codex generation. Completed tiles survive retries; older crops and generated versions remain available. Cancel stops the queue and preserves completed work. These jobs do not edit the world JSON automatically.

In **World agent**, ask for an actual image—for example, “Generate a parchment map of Tideglass harbor,” “Create a seamless mossy stone tile,” or “Make a portrait of Mara Venn.” The image prompt starters help compose these requests. Native Codex image generation uses the existing signed-in Codex account; no separate API key is configured. Account access and usage limits apply. Conversations created before image support carry their visible transcript and pinned memory into a new image-capable native thread on their next turn.

Completed images appear in **World artwork** with a preview, full-size view, download, revised prompt and content hash. Each generation is stored as an immutable PNG/JPEG/WebP asset under `.workbench/assets`, with project/run metadata in SQLite. Prior images survive new generations, discarded world proposals and world JSON rollback. Back up assets together with the database. Artwork is saved when generated; it does not require applying a JSON proposal. Images are retained separately from world.json Git history.

Generated artwork starts local/private. **Upload to Voyage** in the gallery or **Image uploads** sends a selected local PNG/JPEG/WebP file or existing asset to the linked world: the backend requests an upload allowance, puts the bytes to its signed URL without forwarding the Creator key, and runs Voyage image moderation. Images must be at least 600×600 pixels and no more than 5 MiB. Rejected images never supply a world URL. Approved uploads expose the canonical HTTPS URL; attaching that URL is a separate working-copy edit and requires saving the world locally and to Voyage. Uploads are journaled so retries reuse their original request keys. Local worlds need a linked private Voyage draft and the matching environment’s Creator key first. The agent does not automatically insert private gallery URLs. Map artwork is an illustration, not an automatically playable map; seamless tile requests need visual verification. Regeneration creates a new image rather than overwriting the prior result.

## Focused Codex proposals

Select a section or record, open **Proposal review**, describe a focused edit and choose **Generate proposal**. This explicitly sends the selected content and your instruction to the installed Codex CLI, using its signed-in account. Account limits apply. Sections are limited to 60 KB; drill down to an individual record for large systems.

The companion invokes `codex exec` in a temporary directory, read-only, with user configuration/rules ignored and shell, plugins, apps, hooks, browser, image-reading and multi-agent features disabled. Voyage credentials remain in the companion’s separate local credential store and process; they are not passed to Codex. Run history and completed candidates are persisted in SQLite. **Cancel run** stops an active invocation; a run interrupted by a companion crash is marked interrupted rather than silently restarted. Open **Proposal history** after a refresh to review a completed candidate or watch a running one. The candidate is returned as structured output and applied only through the lossless editor. Acceptance checks the original local revision and current text. Nothing is saved remotely by the agent.

Install/sign in to Codex separately if unavailable. Tested here with CLI `0.155.0-alpha.16.4`; incompatible CLI versions fail visibly. You can also **Import proposal** from a full edited JSON file. CLI restrictions are not an OS-level isolation boundary against arbitrary software running as your user.

## Optional Voyage connection

JSON imported over a linked Voyage world keeps its `shortId`, load/safety metadata, `heroesVersion`, and `compatibilityRevision` from the current linked document. Import review lists the protected fields while still letting you selectively accept or reject authored content changes. Protection is rechecked on acceptance, including older pending import proposals. Use a separate project for a different world identity; use an explicit Voyage API refresh to update schema versions. Upload payloads also recover these fields from the preserved download, without modifying your edited local content or treating a mismatched read-back as success.

Open **Voyage connection**, select production or alpha, and enter a Creator API key. Keys are saved by environment on this machine, outside project JSON and exports. Linux uses an owner-only file; Windows encrypts the file for the current account. Leave the key field empty and choose **Connect / use saved key** to reuse it after restarting. **Forget saved key** removes the selected environment’s saved credential. Listing worlds verifies access. **Load more** fetches further owned-world pages without replacing earlier results. You can also enter a known short ID and download it into a new local project.

**Save to Voyage** works for a linked world in its original environment. Link an existing world by downloading it, or create a private draft through Publish. Saving checks local revision and world identity, creates a local checkpoint, runs official draft validation, sends the full editable envelope with the downloaded ETag in `If-Match`, then downloads and compares the result. Normalization differences appear as a proposal. Publication is a separate action.

A stale ETag stops the save. Use **Refresh linked world** to fetch its current draft into a review in the same local project. Review the changes before applying the remote copy; your outgoing local document remains in History and Git. This updates the linked revision without making a duplicate project. An uncertain save outcome blocks blind retries; refresh reconciles the observed remote state. It does not automatically merge conflicting edits.

## Titles and publishing

**Rename world** opens Publish’s title controls. Renaming updates the local project name and the world envelope’s `title` together, preserving exact GameState source. Raw GameStates use their project name when creating a Voyage draft. Renames have checkpoints/Git revisions; restoring an envelope also restores its title/name. Save the draft to Voyage to update the remote title.

In **Publish**, create a private Voyage draft for a local world, save the latest linked draft, run official **publish** validation, inspect/run moderation, then explicitly **Publish on Voyage**. Publish checks that the downloaded draft and revision still match your saved world. **Unpublish on Voyage** withdraws the published version. Voyage controls eligibility and moderation decisions; API failures display its returned details.

Create, moderation, publish and unpublish requests retain their exact payload and idempotency key in local operation history. Unknown outcomes block new publication actions. Refresh status and **Retry same request** to recheck Studio state and replay the protected request; a stored successful response only retries read-back. The API publishes the live draft and does not document a conditional-publication ETag guarantee.

The official production OpenAPI and guide were fetched on 29 September 2026 (`1.2.0-preview`). Authenticated remote reads/writes require your account and were tested with controlled responses, not a live account in this build. No claim of live remote acceptance is made.

## Data and tests

- `.workbench/revisions/`: per-world Git repositories and retained agent worktrees. Back up the entire `.workbench` directory with the server stopped. Copying `.workbench` to another machine carries projects, accepted Git history, chat transcripts, and image assets. If the original native Codex thread is unavailable there, the agent starts a new thread and replays the saved visible conversation and pinned memory. Worktrees for in-progress runs are machine-specific; finish or discard those runs before moving the folder.
- `.workbench/workbench.sqlite3`: projects, exact original and working text, checkpoints, remote baselines, proposal history and operation journal. Back up this file while the server is stopped.
- `.workbench/base-world/`: candidate, active starting world, matching validation checksums, and archived prior candidates/defaults. Source uploads are sanitized before persistence.
- `.workbench/schema/`: refreshed community codec cache and provenance. Failed refreshes retain the previous checks.
- `.workbench/creator-credentials.json`: environment-specific keys stored separately from worlds; Windows encryption is bound to the account that saved them. Reconnect on another account or machine when needed.
- `fixtures/`: local templates; original supplied files remain untouched.
- `docs/wiki.json`: community references extracted from the supplied Worldsmith archive; provenance in `docs/IMPLEMENTATION_PLAN.md`.
- `workbench/`: standard-library Python companion and lossless document engine.
- `web/`: dependency-free browser UI.

```bash
python3 -m unittest discover -s tests -v
```

The service binds only to loopback, enforces Host/Origin checks, and requires a session cookie plus a write token. It is a single-user local app; do not expose it through a public proxy.

Current scope is world authoring and draft synchronization. It does not implement publication, graphical map authoring, game execution, collaborative hosting, or automatic conflict merging. Those are later milestones in the supplied plan.
