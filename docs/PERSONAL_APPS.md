# Voyage Workbench desktop and Android apps

These are local, personal preview builds of the lean hybrid workbench. They use the same React interface and exact-source TypeScript document engine. The previous Python application remains available.

## Install and run

| Platform | File | Requirements |
| --- | --- | --- |
| Windows | `releases/test-0.2.11/Voyage-Workbench-0.2.11-windows-x64.exe` | Windows x64; portable executable; self-signed test certificate, not publicly trusted |
| Android phone | `releases/test-0.2.11/Voyage-Workbench-0.2.11-android-arm64-v8a.apk` | Android 13+; ARM64; permit installation from the source used to open the APK |
| Android emulator | `releases/test-0.2.11/Voyage-Workbench-0.2.11-android-x86_64.apk` | Android 13+ x86-64 |
| Linux | `releases/test-0.2.11/Voyage-Workbench-0.2.11-linux-x64.tar.gz` | Linux x64; extract the archive, then run `./run-linux.sh` |
| Android lightweight | `releases/test-0.2.11/Voyage-Workbench-0.2.11-android-arm64-v8a-lightweight.apk` | Optional ARM64 editor with provider packs installed on demand; x86-64 variant also available |

The Android release APKs are non-debuggable and signed with this machine's development certificate. Preserve that certificate to build compatible updates. Version 0.2.11 uses Android version code 13 and updates the existing app without uninstalling. These are personal installation packages, not store releases. Native Windows execution is unverified on this Linux computer; earlier scoped provider startup/login/vault and catalog tests ran on an attached ARM64 Samsung phone.

The default full/offline Android edition bundles Codex, Claude Code and Cursor with their required support. The optional lightweight edition starts with the same editor but no provider binaries. Open **Settings → Models & agents → On-device runtimes**, permit Android installation prompts, then explicitly install the provider you need. Save settings first and approve the normal Android installation dialog. Packs are version-pinned Workbench release downloads built from qualified official packages, not untested vendor `latest`. Install over the existing application when switching editions; do not uninstall to preserve projects and encrypted credentials. The full/offline APK is the simplest option if all providers are needed or installation prompts are not available.

Android uses PRoot support; it does not require a Linux distribution or a separate Termux installation. PRoot is a compatibility layer, not a security sandbox. Agent access is restricted to Workbench's structured read/edit tools. Provider installation never performs inference or substitutes a direct API fallback.

## First use

1. Create a blank world, open an example, or import JSON. Imported JSON is kept exactly, including number notation, unknown fields, field casing, and ordering.
2. Navigate objects in World Explorer. Edit the selected JSON value, then select **Apply edit**. Drafts save locally; the status distinguishes an in-flight save from a saved draft. Apply or discard a draft before navigating to another value.
3. In **Connection**, sign into Codex with the displayed device code. Complete the browser sign-in and select **Refresh status**. Desktop can explicitly copy an existing Codex CLI login into the app's isolated provider directory.
4. Use **Planning** to discuss changes. Write the objective and requirements in **Work Order**, optionally restrict allowed paths, and save it. **Approve & run** starts the implementation agent.
5. Completed assistant work applies locally automatically by default, with a before-change checkpoint. Choose **Proposal only** in Settings to review it first. Open drafts, unapplied edits in the task's editor snapshot, or newer local changes keep the result as a proposal. Imports and checkpoint restores always require **Accept proposal**; stale proposals are blocked.
6. Export the active world using the native file dialog. Automatic checkpoints preserve the state before edits; the latest 30 are retained.

**Graphite dark mode is the default.** All tools → Settings offers Graphite, Light, and System. The choice is saved separately on each device.

In **Map**, click or tap anywhere on an occupied region tile to open that region's location map. **← Realm grid** returns to the grid and its selected region inspector. Empty-cell selection, map panning and region dragging remain available.

The shared desktop/Android UI uses the muted **Graphite** dark palette and adaptive master/detail panes. Light and System appearance settings remain available. Desktop has a compact top tool strip; phones have World, Map, Characters, Proposals, and All tools along the bottom. **All tools** retains all 15 workspace screens. The current world title in the header opens the local project picker.

**Files & sync** keeps JSON import/export and explicit Voyage API actions together without crowding the header. World fields drill into a dedicated editor with **← Back** and **Browse fields / Edit JSON**. Text and boolean values open as controls by default; exact JSON remains available. This UI change does not migrate project data or change draft, checkpoint, proposal, provider, or remote-save behavior.

Character cards open their editing form immediately. The phone layout replaces the card list with the form and **← All characters** returns to the list. Applying character edits saves them locally. Leaving unapplied character/map forms or unsaved provider settings asks before discarding them. Map settings are collapsed on phones; selecting a location marker opens its inspector. Validation issues offer **Open field**. Provider **Save settings** also stores entered API keys.

## Voyage connection

**Import from Voyage** and **Save to Voyage** are available in the header and the **Voyage sync** tab, as well as Connection. Local autosaving and **Import JSON / Export JSON** remain independent. No local edit uploads automatically.

To import, connect the key for the selected environment, list owned worlds or enter a short ID, and choose **New local project** (default) or **Current project — review as proposal**. Imports into the current project do not replace its active source until accepted in Proposals. Review any imported proposal before a remote save.

Local JSON imports are aligned to the current document shape before review. A raw GameState imported over an API world replaces only `initialGameState` in the proposal, preserving the downloaded envelope, metadata and identity. In **Proposals**, use **Keep current** beside a diff item to exclude it, or **Use proposed** to undo that exclusion. Choices persist and do not modify the active world until **Accept selected changes**. Validation and proposal export use the selected result. Large diffs have Previous/Next pages; all unexcluded changes across all pages are included when accepting. Array changes remain atomic; object-order choices are independent of field edits.

Previously accepted raw-state imports can still save using the preserved downloaded envelope (or the original API download in older projects). The app does not invent missing metadata or change the linked world identity. If no usable envelope remains, re-import the Alpha world and review it before saving. Local saving is unchanged.

To save, apply local editor drafts, open **Voyage sync**, and select **Save to Voyage API**, then confirm the linked world and environment. This validates and conditionally replaces the linked remote draft with read-back confirmation; it does not publish it. For a local-only project, use **Create a new private Voyage draft** to open the existing private-draft workflow in Publish. Local storage continues to keep the project in either case.

Voyage connections always use **Alpha**, at `https://api-alpha.aidungeon.com/creator/v1`. Production is disabled per the current release requirement, and Beta remains disabled because its Creator API endpoint is unconfirmed. The selector shows these states explicitly. Stored Production preferences cannot route requests to Production; credentials remain environment-isolated and are not copied automatically.

Downloaded projects remember their environment. Validation, saving and reconciliation reject non-Alpha links. Existing links without an environment are still treated as Production for safety: they are not silently retargeted. Import the corresponding Alpha world separately rather than uploading an old Production-linked project to Alpha.

Connect a Creator API key, list your worlds, then enter the short ID to download a draft. Downloading into an existing project creates a proposal. Official validation and saving are explicit actions. The app sends draft validation and conditional `If-Match` updates using the official Creator API envelope.

Each remote save records PREPARED and SEND_ATTEMPTED in SQLite before sending. A network failure after dispatch becomes UNKNOWN. Reconcile reads the remote world and confirms a matching submitted payload. Unknown results block another save; there is no automatic retry. If remote content differs, inspect it in a separate project and resolve the conflict deliberately. This initial UI does not offer automatic conflict merging or an override for an unresolved save.

Local validation uses bundled community references. A failed reference refresh retains the prior cache. Unknown fields remain editable. Local validation does not certify that world scripts behave correctly; scripts are never executed by the editor.

Voyage keys use Android Keystore or Electron's platform credential encryption. Where desktop encryption is unavailable, the key remains in memory for that session. Provider sign-in is stored in Codex's private application directory. Voyage keys are excluded from the provider environment and prompts.

## Model providers

In **Models & agents**, add a preset or custom connection, enter the API endpoint and key, and use **Discover models** or enter an exact model ID. Discovery saves a newly entered key before querying the provider. **Save & test connection** saves the connection and key and sends a small text-only request; it does not send world content or modify a project. API tests can incur provider charges. Codex's test verifies sign-in rather than generating text.

Select the connection and model for Planning, Building, or Map layout, then **Save settings**. Adding a connection alone does not change an existing stage route. Text model access and image model access can differ. Artwork can use the bundled Codex app-server image tool with its current sign-in, or a separately configured OpenAI-compatible image endpoint and image model. Select Codex explicitly for Artwork; image capability is checked and unsupported requests fail without a paid API fallback.

The **OpenAI API** preset uses Responses, with function-call outputs and encrypted reasoning items retained between tool turns. Existing **OpenAI compatible** connections still use Chat Completions, as do the xAI/Grok, OpenRouter, and local-server presets. For an existing OpenAI connection that needs Responses, change its Provider / harness type to **OpenAI API · Responses**, then reselect its model and save. Anthropic uses Messages, and Google Gemini uses GenerateContent. These API connections work on desktop and Android. On the Android emulator, use `10.0.2.2` for a server running on the desktop; on a phone, use the server's reachable LAN address. Hosted providers require a valid API key, billing/access, and a tool-capable text model for world-editing tasks. Subscription CLI sign-in is not a direct API key.

Desktop also supports Claude Code, Cursor Agent, Gemini CLI, and OpenCode through separately installed and signed-in CLIs. Set an executable path when auto-detection cannot find the CLI. Claude uses `claude auth login`, Cursor uses `agent login`, Gemini uses its interactive `gemini` sign-in, and OpenCode uses `opencode auth login` and `provider/model` model IDs. The desktop app does not install these harnesses. Test the connection before routing tasks to it. Android also bundles the unmodified official Claude Code CLI: add its connection in Models & agents, sign in there through its native browser flow or supply your own API key, and select stage routes explicitly. Claude authentication tests do not request inference. Retained credentials are Keystore-encrypted, but the official CLI needs temporary private credential files while running; these are cleaned on exit and restart. Android also includes the official Cursor SDK with browser sign-in, Keystore-encrypted retained keys and an explicitly selected model. Cursor startup/login initialization is tested on both ABIs; completed live sign-in/inference remains unverified. Gemini CLI and OpenCode are still excluded from Android route choices pending real runtime qualification. See `ON_DEVICE_PROVIDERS_2026-10-09.md` for scope and limitations.

The 403 code `creator_api_access_required` is a Voyage account/key access rejection, not a model-provider problem. Enable Creator API access for the Voyage account or contact Voyage support with the displayed request ID. Changing local code cannot grant the entitlement; local editing remains available.

Version 0.2.1 fixes Alpha's weak download ETags: `W/"revision"` is sent as `If-Match: "revision"` when saving. Existing `400 invalid_revision` failures can be cleared by **Reconcile save**, or by selecting **Save to Voyage API** again after updating. Genuine uncertain network writes remain blocked pending reconciliation; revision conflicts still require a fresh download and review. Install the updated Android APK over the existing app to retain local projects.

Version 0.2.2 compares remote JSON values independently of object key order and equivalent number spelling, preserving exact large-integer distinctions and array ordering. For old false read-back mismatches, use **Reconcile save** first; it only reads the remote draft. Remote save feedback distinguishes confirmed success, unconfirmed results with differing paths, rejected saves, failed actions and in-progress checks. Local JSON remains unchanged. The app displays **Saved to Voyage** only after confirmed read-back.

**Save to Voyage API** also checks a pending previous save automatically before sending another write. A confirmed identical local version returns success without another upload. A confirmed older version permits a conditional save of newer local edits using the confirmed revision. Failed reconciliation or genuine remote differences keep the write blocked; no conflict checks are bypassed.

## Android behavior

A separate foreground-service process owns the local agent. Closing the UI does not intentionally cancel a task. Android may still stop processes. Interrupted work is marked interrupted and must be restarted explicitly; force-stop does not auto-resume. Completed proposals, active documents, draft text, and checkpoints live in SQLite.

The emulator uses API 36 and KVM. The package supports Android 13+, but earlier supported Android versions, physical ARM64 devices, vendor battery restrictions, and device-code sign-in completion on those devices remain validation gates. The 554 KB fixture and four simultaneous full-size proposals are covered by native tests; very large worlds have not been qualified. Native document work runs off the UI thread. Cached-schema validation and repeated large-document operations are slower in the interpreted Android core than on desktop.

## Development

On this computer:

```sh
./tools/npm run dev
./tools/npm test
./tools/npm run typecheck
./tools/npm run desktop
```

`tools/npm` uses the user-local Node installation when present. The dev server binds to loopback, uses the real desktop service, and stores development projects in `.workbench-next/`. Packaged apps use their platform application-data directories.

Build desktop runtimes and packages:

```sh
python3 tools/package-desktop-runtime.py
./tools/npm run build
./tools/npm exec electron-builder -- --win --linux --x64
```

Build Android on this configured machine:

```sh
python3 tools/android/package_runtime.py
./tools/npm run android:sync
JAVA_HOME="$HOME/.local/share/voyage-android/jdk" android/gradlew -p android :app:assembleRelease
```

Android runtime prerequisites can be installed with the existing `tools/android/bootstrap.py`, `fetch_termux.py`, and `emulator.py` utilities. The runtime packaging scripts pin Codex 0.156.1 and verify the Windows npm archive integrity; Termux downloads verify package-index SHA-256 values. Linux runtime packaging currently uses the Codex executable already installed on this workstation.

Relevant tests:

- `packages/core/*.test.ts`: numeric fidelity, exact edits, malformed input, fixtures, proposal isolation, task scope and stale-write checks.
- `hosts/desktop/*.test.ts`: SQLite recovery and official API contracts, including uncertain-save protection.
- `tools/desktop-smoke.ts`: real subscription-backed Codex proposal and acceptance using a temporary private provider directory.
- `tools/electron-smoke.cjs`: actual Electron preload bridge, SQLite round-trip, character editing, region navigation, mocked Voyage import/save, provider key/settings persistence and all 15 screens at mobile/desktop widths.
- `hosts/desktop/export.test.ts` and Android `ExportTest.java`: large-world JSON byte fidelity, safe destination handling and compact/restorable native picker payloads. Android stages export data in private app storage before opening the picker; the full world is not retained in saved activity state.
- `android/app/src/androidTest/.../WorkbenchTest.java`: native core/store checks and optional real Codex task.
- `tools/android/test_app.py --with-agent`: temporary test login is removed in `finally`..
- `tools/android/test_app_lifecycle.py`: prepares a fixture, starts work through the normal UI, kills the UI process, and checks persisted state after force-stop.

## Cover generation and grading

Artwork now has separate **Cover art & grading** and **Map artwork** interfaces. Cover generation uses the configured Artwork image provider; visual grading defaults to the Building profile and its effective text model (route override, otherwise profile model), assuming vision support. Both selections remain overridable. Grading can use Codex through the bundled app server (the model override is optional), or an API profile and vision-capable text model (OpenAI-compatible chat, OpenAI Responses, Anthropic, or Gemini). Other CLI harnesses and image-only API models cannot grade covers through this interface. Unsupported Building defaults stay visible with a notice to choose Codex or a vision API profile; no unrelated provider is substituted. The generation-and-grade action confirms two calls that may consume subscription usage or incur API charges and sends the brief and image evidence, not the full world JSON. No automatic regeneration, upload, or publication occurs.

The supplied Voyage Discover weighted rubric is bundled unchanged. Generation uses its prompt kernel, priorities, safe areas, original-world guidance, and cross-crop constraints. Grading receives the full rubric, the source artwork, five center-cropped public views (landscape discovery, square phone hero, wide desktop hero, portrait listing, and profile feed), and thumbnail, blur, and grayscale evidence. Hero evidence includes the title overlay. These are approximate layouts, not a live website capture. No neighboring covers are supplied, so the neighbor test is explicitly unassessed.

Category scores and evidence come from the vision model. Weighted totals, hard-floor warnings, caps, and structural-redesign rules are calculated locally. The overall score is conservatively the lowest public-view score. A strong-candidate label additionally requires every view to score at least 82, meet its hard floors, and report no clipped critical content. This is a visual heuristic, not a popularity prediction. Each saved cover retains its brief and crop evidence; grading failures preserve the artwork and can be retried without regenerating. Refinement creates a new cover using the previous assessment's prioritized recommendations. The cover remains in the local artwork library until explicitly downloaded and attached through Voyage's editor.

The Publish screen previews the active local world's short description (`description`), long description (`advancedDescription`), and authored cover (`image`). Discovery-card and world-page crops approximate Alpha's desktop and phone layouts, scaled to the workspace. The viewport selector defaults to phone on narrow screens. Edit shortcuts open the corresponding exact JSON field; missing fields open the world object for insertion. Previewing does not upload or modify the world. Empty API cover values may represent upload-backed covers that this local JSON cannot display. Save and verify the remote draft before publishing; these previews are not a read-back of the published page.

## Release boundaries

This is a working first app release, not completion of every future item in the long-term plan. Use one desktop instance at a time; multi-instance agent coordination is not implemented. The editor offers structured navigation, primitive-value controls and exact JSON editing, not a dedicated schema form for every Voyage section. Remote world listing renders owned worlds with short-ID import and review options. There is no automatic merge for conflicting remote content. Public distribution still needs physical-device and Windows validation, release signing, dependency/toolchain review, and complete third-party distribution notices/source obligations.

Production npm dependencies passed `npm audit --omit=dev` at build time. The packaging dependency tree still reports development-tool advisories. No credentials or user worlds are bundled in the installers; bundled worlds are repository fixtures.
