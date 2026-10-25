# Disposable Workbench sandbox

Import `workbench-sandbox.json` into a new local project named
`DISPOSABLE - Workbench sandbox`. Never replace an existing project.

This independent copy of the repository Lantern Coast fixture retains its
original **heroesVersion 36** and contains no account credentials or remote
world identifier. It is for local checkpoint, correction, rollback, grading,
and plan handoff tests. It has not been created or published on Voyage.
Do not change its version number to force compatibility with Alpha.

Suggested exercise: edit world background, checkpoint it, introduce an invalid
instruction field, verify that checkpoint rejection preserves the first
checkpoint and failed draft, then correct only the instruction section.
Restore history as a proposal and review before applying.

Authenticated API write tests require a separately created private world on
the selected host using that host’s current schema/defaults and an authorized
Alpha key. Local history does not establish remote rollback.
