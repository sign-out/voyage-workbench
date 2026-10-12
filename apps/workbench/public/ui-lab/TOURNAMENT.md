# App-layout tournament — corrected brief

The first round failed: those designs treated Voyage as an editorial website. This round treats it as the existing Electron / Android authoring application. HTML is only the mockup medium.

## Hard requirements

- Full-height application shell; only the work panes scroll.
- Keep projects, World, Map, Characters, Planning, Proposals, Artwork, History, and settings accessible.
- Normal app typography and control sizing. No hero, slogans, decorative manuscript, marketing navigation, or invented analytics.
- Compare the same supplied world and task: inspect Mara Venn, edit a source value, review a suggested change, save locally.
- The five contenders change workspace architecture, not just theme.
- Mobile needs deliberate navigation and master/detail behavior, not columns stacked into a long webpage.

## Before-build tournament

Scores are a single author's design judgments, not independent agent votes or user research. Criteria are task clarity, app fit, workflow distinction, and implementation/accessibility; each is 1–5.

| Slot | Candidate | Clarity | App fit | Distinction | Practicality | Total |
|---|---|---:|---:|---:|---:|---:|
| 1 | Large branded dashboard | 2 | 2 | 1 | 4 | 9 |
| 1 | Docked studio: tool rail, object tree, editor, inspector | 5 | 5 | 4 | 5 | **19** |
| 1 | Free-floating windows everywhere | 2 | 4 | 5 | 2 | 13 |
| 2 | Scenic atlas / illustrated hero | 2 | 2 | 4 | 3 | 11 |
| 2 | Spatial canvas with source-linked objects and property dock | 4 | 5 | 5 | 4 | **18** |
| 2 | 3D world fly-through | 2 | 2 | 5 | 1 | 10 |
| 3 | Assistant chat takes over the app | 3 | 4 | 2 | 4 | 13 |
| 3 | Review desk: change queue, comparison, working-source dock | 5 | 5 | 5 | 5 | **20** |
| 3 | Inbox of cards without comparisons | 3 | 3 | 2 | 4 | 12 |
| 4 | Serif writing webpage | 3 | 1 | 3 | 4 | 11 |
| 4 | Native-style adaptive master/detail with bottom tools | 5 | 5 | 4 | 5 | **19** |
| 4 | Mandatory creation wizard | 3 | 4 | 3 | 4 | 14 |
| 5 | Fake terminal and log wallpaper | 2 | 2 | 4 | 2 | 10 |
| 5 | Object browser: source table, field inspector, change tray | 5 | 5 | 4 | 5 | **19** |
| 5 | Unstructured command palette only | 3 | 4 | 5 | 2 | 14 |

## Winners and checks before implementation

1. **Docked studio** (fieldnotes.html, retained filename): dark desktop-tool layout. Visible relationship among tree selection, source editor, and properties. Small widths use one active pane rather than stacking four panes.
2. **Spatial canvas** (atlas.html): neutral creative-tool layout, source-derived relationship diagram, object list, property inspector. The diagram is not geographic map data. Selecting an object opens its actual field.
3. **Review desk** (assembly.html): separate queue and comparison panes; original, replacement, reason, and explicit decisions. Suggested content is labeled demo, not an agent run.
4. **Adaptive detail** (focus.html): familiar app bar, entity list, property form, and persistent bottom navigation. On phones, back-to-list is a genuine master/detail transition.
5. **Object browser** (signal.html): compact source table and inspector, with editable source values and a local change tray. Table rows come from the fixture, not made-up entities.

All layouts expose the same real fixture fields and retain complete JSON on export. Browser persistence is separate from real projects and separate per layout. No backend, agents, publication, or validation is connected.

The comparison launcher is a compact application window with a layout list and schematic pane previews, not a landing page. Existing HTML filenames remain so previously opened routes work.

## Feature-audit correction before map implementation

The existing app has realm grids and local coordinate maps, not a relationship-graph editor. The spatial winner therefore uses the actual coordinate-map workflow. The fixture's unplaced region/location state is shown honestly. The graph idea is rejected as an invented feature. FEATURES.md maps all 15 current tools and the draft/review protections that each layout must accommodate.
