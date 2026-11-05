# Source-to-world preview integration with main

This branch integrates `v0.2.12-source-to-world-preview.20261104` into the newer
0.2.18 source tree. It is not a replacement of main with the older preview tree
and does not publish another binary release. Application version 0.2.18 and
Android version code 20 remain unchanged. The downgrade warning in the historical
preview release notes applies to those already-published 0.2.12 binaries only.

## Retained behavior

- Map content coverage layers and the current responsive/mobile workspace layout.
- Desktop chat planning, prose field filling, and isolated read-only world grading.
- Explicit, source-hash-bound Work Order approval, protected package metadata,
  local validation, and atomic before-change checkpoints.
- Section-at-a-time work and durable section checkpoint receipts. The shared tool
  registry now journals `world_checkpoint` and commits its receipt and SQLite
  source checkpoint in the same host transaction on desktop and Android.
- Bounded local corrective opportunities, including asynchronous journaled tools
  and delegated reviews. Cancellation, stale attempts, hidden tools, and scope
  violations remain fatal rather than granting corrective retries. A delegated
  scope escape fails the child and parent without applying world changes.
- Identity-bound Android service cancellation and startup, immutable provider
  routing, current upload/environment checks, and the publication replay journal.

## Added preview behavior

The [source-to-world workflow](SOURCE_TO_WORLD_2026-11-04.md) includes immutable
research sources, evidence-linked canon and adaptation inventories, full-world
construction, deterministic planned/rasterized maps, separately approved cover
and artwork generation, publishing copy, and the v1.6.2 quality gates. Creation
publication checks run within the current publication queue and verify both
fresh readiness and actual saved asset hashes before a publish request is sent.

Automatic local application now also requires host-calculated matching-schema
completion evidence. Unversioned worlds or unavailable/advisory schemas retain a
reviewable proposal instead of being silently treated as validated. Human review
and local proposal acceptance remain available; cached checks never establish
official Voyage acceptance.

Delegation and interrupted-task continuation remain separate opt-in controls.
Local corrective opportunities do not authorize additional work, expand scope,
retry remote writes, or enable automatic checkpoint continuation.

## Validation

The optional [source-validation GitHub Actions template](ci/source-validation.example.yml)
runs a clean install, typecheck,
shared/desktop/native builds, Capacitor asset synchronization, serial shared/host/
provider/rendered UI tests under Xvfb, compiled native bridge tests, release
contracts, authenticated-API mock tests, and the legacy Python suite. It does not
use account credentials, charge image/model providers, publish worlds, sign
binaries, or release artifacts.

The template is not enabled automatically. An account with permission to modify
workflows can copy it to `.github/workflows/source-validation.yml`. This
integration records local test evidence, not a claim that remote CI has run.

Android Java and instrumentation compilation and JVM tests are also checked
locally with the existing Android SDK/JDK. Device instrumentation execution and
live provider/Voyage acceptance are not implied by compilation or mock tests.
The preview's documented limits (schematic maps, manual visual inspection,
foreground/resumable asset coordination, and no archive restore UI) still apply.

The broad responsive smoke runner completes the initial 26-viewport layout checks
on this machine, then times out loading lazy map thumbnails in its hidden Electron
window. The same thumbnail timeout reproduces against unmodified main at
`34cbeb5`; it is not reported as a passing full smoke test. The separate rendered
assistant/creation UI tests and actual map-raster seam checks pass.
