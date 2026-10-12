# Application UI mockups

HTML is the mockup medium, not the product type. These five full-height screens propose layouts for the existing Voyage Electron / Android application. They replace the rejected website-like studies.

Run `./tools/npm run dev -- --host 0.0.0.0` from the repo root. Open `http://localhost:5173/ui-lab/index.html` to compare layouts.

| Existing route | New app layout |
|---|---|
| fieldnotes.html | Docked studio — tool rail, world tree, source editor, inspector |
| atlas.html | Spatial canvas — realm/region coordinate map, object list, property dock |
| assembly.html | Review desk — queue, comparison, explicit decisions, working source |
| focus.html | Adaptive detail — native-style master/detail and mobile bottom tools |
| signal.html | Object browser — source table, selected object inspector, changes tray |

All five use the same supplied Lantern Coast fixture. Main panes scroll independently; mobile shows one active pane with bottom tools and a back-to-list action rather than stacking desktop columns.

All 15 current application tools are represented; FEATURES.md maps their required surfaces to the existing source. Core interactions are implemented: object selection, filtering, separate text drafts, Apply edit / Discard draft, known-state editing, read-only JSON inspection, per-field proposal inclusion, accept/reject, actual local checkpoints, local save, and complete active/candidate JSON export. Ctrl/Cmd+K opens source search; Ctrl/Cmd+S saves locally. Source tabs support arrow-key navigation.

These are isolated mockups. The footer identifies the local demo. No production projects, providers, agents, validation, sync, or publication are connected. The map honestly shows the fixture's unplaced location and missing realm rather than inventing coordinates. Planning, cover grading, map artwork, validation, publication, templates, history, connection settings, and sync have their own app panes with backend actions disabled.

Persistence uses concept-specific `voyage-app-layout-v2-*` keys so edits from the rejected first round do not enter these new screens. Exports preserve the complete fixture. Serve over HTTP; `file://` cannot fetch the fixture.

`TOURNAMENT.md` records the corrected brief and pre-build competition for each layout.

## Dark / muted adaptive variants

Open `adaptive.html` for five palette variants of the approved adaptive master/detail layout: Graphite, Slate, Olive, Umber, and Fog. Each has a dedicated `adaptive-<palette>.html` route and independent local persistence. The original light `focus.html` remains available. All five reuse the same adaptive layout and all 15 app tool areas; no features or navigation are removed to make the darker screenshots cleaner. See `ADAPTIVE_PALETTES.md` for the pre-build palette competition.
