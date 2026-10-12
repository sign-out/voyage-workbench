# Authoring completion plan

All five implementation/validation steps are complete. The post-implementation audit
and its fixes are recorded in `AUTHORING_COMPLETION_AND_AUDIT_2026-10-08.md`.

Finish the approved workflows using the existing exact-source document engine,
project reducer, staged selective review, worker and transactional checkpoint store.
No Git migration, new history engine, paid model calls or automatic remote writes.

1. Shared deterministic authoring services: entry catalogue, relationship registry,
   completeness/readiness, asset references, guarded duplication/batch proposals,
   entity grouping and project bookmarks. Test preservation and stale-source guards.
2. Scope picker and contextual authoring workspace: navigation, guidance, references,
   assets, duplication and batch previews. Form and JSON remain peer views.
3. Checkpoint labels/comparison and entity-grouped review over the existing diff.
4. Settings for advisory checks, recent navigation, scope/review defaults, asset and
   impact filters, note-context inclusion. Existing saved content is not rewritten.
5. Validate Node/UI/host tests, typecheck/build, Electron regression and Android.

Boundaries: known structural references only, not script/prose interpretation;
unknown schema and remote asset size remain unknown; duplication preserves external
relationships and excludes notes; batch edits support existing scalar fields only;
restore is a proposal, never immediate replacement. Local readiness cannot certify
official moderation/publication. Every new mutation requires explicit review.
