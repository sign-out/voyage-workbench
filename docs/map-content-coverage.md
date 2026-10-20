# Map content coverage

## Feature plan

1. Analyze the working copy locally without changing the world.
2. Associate records through explicit keys, never prose or guessed coordinates.
3. Offer locations, NPCs, factions, quests, story starts, authored words, areas,
   other spatial content, connections, and missing-description layers.
4. Tint realm cells and draw soft hotspots at valid location coordinates.
5. Add opacity, weighted combined scores, an explanatory legend, contributing
   records, and an unmapped/broken-link list.
6. Test aggregation, deduplication, invalid placement, special keys, host paths,
   and browser interactions including unsaved form protection.

## Counting rules

The layer starts off. Layer, opacity, and weights are session-only display state.
Changing them never discards unapplied map forms or writes authored JSON.

NPCs use `currentLocation`; quests use `questLocation`; story starts use `locations`.
Faction presence comes from `locations.*.factions`, `regions.*.factions`, and located
NPCs' `faction` links. Members indicate recorded presence, not inferred territory.
Explicit `location`, `locations`, `region`, and `regions` fields are accepted on
lore, items (including `itemTypes`), resources, creatures, encounters, and events
(including `narrativeEvents`) when present. Invalid links are reported. Prose,
scripts, quest sources, and schedules are not placement.

Records count once per location and once per region, even when links are repeated
or several linked locations share a region. Multi-region records contribute to
each region. Connections count distinct valid record-to-place links, including
faction presence and location-to-region links. Areas count at their parent place.

Authored words count whitespace-separated words in selected prose fields (including
hidden information) and area descriptions. Names, URLs, scripts, IDs, and numbers
are excluded. Missing descriptions count regions, locations, NPCs, factions, quests,
and story starts lacking principal descriptive fields. Neither metric rates quality.
Unlinked world lore stays unmapped. Unsupported collections are not interpreted.

Colors compare placed regions in the selected realm or valid location points in
the open region. Zero is transparent. Individual layers use raw counts. Combined
scores normalize each metric against its scope maximum before applying a weight
(0–5); all-zero weights produce no heat. Hotspot radius is a visual influence area,
not territorial extent. Empty wilderness and crowded capitals may be intentional.
The missing-description metric starts with weight zero in the combined view and
can be enabled separately when reviewing unfinished content.

Unmapped records have no route to a valid realm-grid region. Region-linked content
without valid local coordinates still counts at region scale and is listed as
region-only, never assigned an invented local hotspot. Analysis is entirely local.

## Verification

Run `npm run test:release`, `node --import tsx --test packages/core/features.test.ts`,
and `python3 -m unittest tests.test_map_editor tests.test_server` for focused checks.
The standalone browser checks are `tests/map_coverage_browser.mjs` (run with
`node --import tsx`) and `tests/map_zoom_browser.mjs` (run with `node`). They accept
`PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` when the browser is installed outside the
project. Use `npm run typecheck` and `npm run build` for integration validation.
