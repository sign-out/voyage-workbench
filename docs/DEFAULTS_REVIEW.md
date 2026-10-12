# Workbench defaults review — October 8, 2026

This review covers the app's current workspace, agent, storage, sync and preview defaults. It describes repository behavior, not assumptions about the live Voyage UI.

## Defaults retained

| Area | Default | Assessment |
| --- | --- | --- |
| Appearance | Graphite; existing Light/System preferences preserved | Appropriate for the selected design. Appearance is now in Settings, not a persistent header control. |
| Desktop shortcuts | World, Map, Characters, Planning, Proposals, Artwork | Broad creation workflow, with review directly accessible. Now replaceable and reorderable. |
| Phone shortcuts | World, Map, Characters, Proposals | Four shortcuts plus All tools keeps a small screen usable. Planning versus Proposals is subjective; users can now choose. |
| Tool access | Every tool remains in All tools | No customization can hide access to Settings or remove a feature. Empty shortcut bars are valid. |
| Preferences | Per app/device; automatically saved locally | Does not alter world JSON or sync layout preferences to Voyage. Reset only resets tool placement, not appearance, providers or data. |
| New projects | Active, local, no linked remote world | Safe; opening or creating a project does not publish it. |
| Voyage imports | New project unless explicitly targeting the current project | Avoids accidental replacement; existing selective import review is retained. |
| Planning | World-read-only with structured Work Order suggestions | The planner may propose objective, requirements and verified scope paths, but cannot approve/start work or edit world content. Current suggestions load into a human-reviewed form; stale suggestions are disabled. |
| Providers | Codex for planning/building/map; harness-selected text model; no artwork route | Avoids guessing a paid image model or endpoint. Requires account setup; image generation requires explicit configuration. |
| Publication | Private draft first; explicit save and publish | Appropriate. Remote writes, uncertain-save reconciliation and publication approvals remain unchanged. |
| Checkpoints | Automatic before active-source changes; retained until project deletion | Prioritizes recoverability. Long-lived large worlds can use significant disk space. No automatic pruning was introduced. |

## Defaults that deserve follow-up

- **Work Order scope:** new UI approvals require selected existing authored paths or explicit whole-authored-world permission. The picker defaults to the current entry (optionally current system); it does not default to whole-world access. Advanced JSON paths remain available. Legacy saved orders retain their previous semantics until explicitly updated; reviewed scopes and suggestion provenance are revalidated when work starts.
- **Proposal/task retention:** silent count-based trimming has been removed. Pending candidates, task provenance, note queues and applied-note receipts persist until explicit removal or project deletion. Rendering remains bounded; long-lived projects can grow on disk. Explicit history-management controls remain follow-up work, not an automatic pruning policy.
- **Cover grading:** the initial grader follows the Building route. The default Codex CLI route is not supported for visual grading, so initial setup requires a vision-capable API profile. The app warns about that incompatibility rather than silently picking a potentially paid provider.
- **Artwork grid:** new map-artwork plans retain master-image generation, a 2×2 grid and medium detail. The detail selector now affects art direction only; it does not silently change row/column counts or multiply generation requests. Grid dimensions remain explicit controls, and existing saved plans are unchanged.
- **Package metadata:** imported envelopes now open at authored GameState. Identity and server state are separated into read-only metadata; reducer guards protect them from direct edits, legacy drafts and agent proposals. Authored nested fields with the same names remain editable. Full-source exports and explicit import/sync flows retain metadata.

## Preview changes

- Publication layouts no longer appear as squeezed subpanels inside the editing page. A separate full-screen modal contains discovery, world-page, listing and profile examples.
- Reference phone width is 396 CSS pixels; reference desktop width is 1038 CSS pixels. Actual-size mode keeps those dimensions even on a smaller display and allows horizontal scrolling. Fit-width mode scales the whole canvas uniformly rather than reflowing it.
- Fixed preview typography removes dependence on the surrounding editor's viewport. Approximate Alpha layouts remain explicitly labeled; this is not a live-site screenshot or proof of exact production rendering.
- Original covers, saved cover art, grading evidence, generated map art and selected uploads offer full-screen uncropped inspection, with Fit screen and Actual pixels modes.
- Small grading-evidence tiles remain browsing thumbnails, not evidence of real-size readability. Actual-pixel inspection uses the saved grading input without regenerating or regrading it.
- Map and character editors remain working editing surfaces, not publication simulations. Diff and template panes remain textual inspection tools; they should not be turned into scaled visual previews.

No provider settings, world data, remote-write permissions or publication defaults are changed by tool-layout or preview controls.
