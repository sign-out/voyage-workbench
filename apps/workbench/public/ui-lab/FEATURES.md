# Feature requirements taken from the application

The existing application, not a new product concept, defines these mockups. All five layouts expose all 15 existing tool areas. HTML only represents the UI; backend-dependent controls remain visibly disconnected.

| Existing tool | Requirements represented | Source |
|---|---|---|
| World | Object search, source inspection, editable values, separate local draft, Apply edit, Discard draft, related reference fields | apps/workbench/src/main.tsx; ValueEditor.tsx |
| Map | Realm selection/grid, region/local map, region width, coordinates, unplaced regions/locations, parent-region inspection | web/map-editor.js; LegacyViews.tsx |
| Characters | Character selection, description, name, current location, known state, JSON inspection | web/character-explorer.js; LegacyViews.tsx |
| Mod overlays | Ordered references, version, attached local source, apply stack, export without references | FeatureViews.tsx: Mods |
| Changes | Compare active world with imported baseline; expose source paths, not fake activity analytics | FeatureViews.tsx: Checks |
| Validation | Local/community checks, official draft and publish validation, schema refresh, results empty until run | FeatureViews.tsx: Checks |
| Planning | Read-only discussion, Work Order, building/map stage, objective, requirements, allowed paths, world-agent memory | main.tsx: plan |
| Proposals | Candidate queue, original/replacement, per-change selection, accept/reject, scope, checks, exported candidate | main.tsx: review |
| Artwork | Cover premise/direction, vision grader and model, generate/refine/regrade; map plan, strategy, density, composition, rows/columns | FeatureViews.tsx: Artwork; CoverStudio.tsx |
| Publish | Private draft creation, active-world save, publish validation, moderation, explicit publication/unpublication, journal and replay | FeatureViews.tsx: Publication |
| Base template | Derive current/file, candidate source, validation, activate, minimization/probe controls, export | FeatureViews.tsx: BaseWorld |
| History | Rename/archive/trash, checkpoints, review restore, exported history; real mockup checkpoints created only by actual local actions | main.tsx: history |
| Models & agents | Stage routing, connections/protocol, text/image models, endpoint, API key storage, availability/model discovery/test controls | Providers.tsx; packages/core/providers.ts |
| Voyage sync | Environment/API connection, owned-world listing/short ID import, draft refresh/save, stale-revision and uncertain-save reconciliation | main.tsx; features-api.ts |
| Connection | Codex subscription sign-in, existing CLI login, status refresh, sign-out | main.tsx: connection |

## State rules

- Fixture data is real repository sample content. No production accounts or projects are read.
- Editing text creates an unapplied draft. Saving preserves it; applying changes the demo world and keeps a local checkpoint. Export exports active source, not an unapplied draft.
- Proposal acceptance is blocked until pending editor drafts are applied or discarded, matching the app's protection.
- The supplied fixture has no realm or location coordinates. Map mockups show an unplaced location, not fabricated plotted data.
- No connected model, graded cover, passed validation, remote draft, moderation result, or publication success is invented.
- Backend actions retain their real control labels but are disabled with a mockup explanation. External credentials are not collected.
- Different layouts reorganize the same application features; they do not omit tools to achieve a cleaner screenshot.
