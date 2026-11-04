# Voyage Workbench — source-to-world preview

Tag: `v0.2.12-source-to-world-preview.20261104`

Package version: **0.2.12** · Android version code: **14**

Channel: **prerelease / isolated older-base feature preview**

## Important: not an upgrade to the stable release

The current stable release is **v0.2.18** (Android version code **20**). This
preview contains the source-to-world work developed against the older 0.2.12
workspace; it does not claim to include every later stable feature or fix.
Publishing it does not change `main`, the stable tag, or GitHub's Latest release.

Android normally rejects installing version code 14 over newer builds. **Do not
uninstall a newer installation to force this preview onto it**: uninstalling can
erase projects, credentials and settings. Use a separate test device/environment
without important Workbench data. Desktop preview builds also use normal app-data
locations; back up projects and do not share one data directory between versions.

## What's included

- **All tools → Create world**: attach Markdown/text research, enter a creative
  request, and approve source-to-world construction.
- Immutable source documents, cited canon decisions, explicit assumptions, canon
  locks and a persistent inventory linking adaptation plans to real world data.
- Shared agent creation tools, validated local edits/proposals, saved task
  progress, optional bounded delegation and guarded checkpoint continuation.
- Global geographic blueprints rendered into actual continuous 1,000 × 1,000 PNG
  region maps, with region/location-coordinate and coverage checks.
- Artwork/cover briefs using the configured Artwork route, explicit image-request
  limits, durable single-flight job reservations and no automatic uncertain retry.
- Publication title, blurb, descriptions and tags; approved upload/assignment and
  exact world JSON plus separate Workbench-package export.
- The supplied rubric v1.6.2, structural/evidence checks, section floors, mandatory
  gates and static-readiness checks before the creation project's publish action.

ComfyUI and a local GPU are not required. Generating images or running a model
can incur provider charges. Uploading and publication remain separate approvals.

## Downloads and verification

- Windows x64 portable EXE.
- Linux x64 `.tar.gz`; extract it and run `./run-linux.sh` as a normal user.
- Full/offline Android APKs for ARM64, x86-64 and both architectures (universal).
- `SHA256SUMS`, `checksums.json`, detached signatures and public verification keys.

Android and Windows retain the existing test-signing identities. Windows remains
self-signed and may show unknown-publisher/SmartScreen warnings; no public CA
trust or production-signing qualification is claimed.

From the download directory, verify downloaded files listed in the checksum file:

```sh
sha256sum -c SHA256SUMS
openssl dgst -sha256 -verify public-key.pem -signature SHA256SUMS.sig SHA256SUMS
```

The source snapshot corresponding to these binaries is available at this exact
preview tag in `sign-out/voyage-workbench`, including GitHub's source archives.
No private signing material, credentials, user projects, attached research worlds
or local execution logs are included. Dependency notices, pinned provenance and
the existing corresponding-dependency-source commitment remain applicable.

## Validation and limits

- 358 shared UI/core/host tests, 7 compiled-native harness tests, 12 release tests
  and 193 Python tests passed during implementation verification.
- Final shared build/typecheck, Android release assembly/release lint, packaged
  asset/runtime/signature checks and desktop offline-resource smoke checks passed.
- No current physical-device run, native Windows execution, paid-provider quality
  exercise, full supplied-research adaptation or live Voyage acceptance is claimed.
- Maps are schematic cartography, not illustrated or 3D terrain.
- Whole-package visual inspection is manual. Asset coordination is foreground,
  not an unattended OS worker; saved jobs can be continued after interruption.
- Full automated multimodal repair, archive restoration, richer illustrative
  maps and authenticated cross-device workers remain follow-ups.
- Creator integration remains Alpha-only. Static readiness is not playtesting,
  official acceptance or a prediction of popularity.

See `docs/SOURCE_TO_WORLD_2026-11-04.md` at this tag for the implementation contract,
workflow and detailed remaining work.
