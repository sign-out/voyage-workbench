# New-world copies and artwork workspace audit

## Implemented

- Publish can create a separate local copy and a new private Alpha world. The original source, link, revision and save journal remain unchanged. Downloaded server metadata is staged for explicit review.
- An uncertain create retains its exact payload and idempotency key. The publication journal blocks creating another copy until the prior operation is resolved; replay does not generate a new key.
- Artwork is organized by named destinations: NPCs, playable characters, regions, locations, nested areas, items and world covers. Existing nullable image fields remain assignable; malformed parent structures are not silently replaced.
- Import, library selection, generation, hosted-URL attachment, local downloads and explicit upload/moderation are separated. Generation is durably journaled before a billable request. Drafts and stale source snapshots block attachment.
- All five documented image upload purposes are supported, including `ITEM_IMAGE`. Cover files can be imported, generated, graded and downloaded locally; a hosted cover URL can be assigned. No undocumented cover upload purpose is fabricated.
- Cover generation retains weighted-rubric grading, public crop evidence and the effective Building vision route default. Imported covers can be graded without image generation.

## Validation

- TypeScript typecheck: passed.
- TypeScript/UI/provider regression suite: 247 passed.
- Release/map/world-list regression suite: 12 passed.
- Production web/desktop/native-core build: passed; existing bundle-size warning remains.
- Electron smoke: full existing regression flows plus destination selection, local file import, explicit item-purpose selection, mocked generation, unchanged source before attachment, exact-number-preserving hosted-URL assignment, cover limitations and 320/412/1280-pixel destination layouts.
- Mocked API tests exercise allowance, bytes, moderation, hosted URL retention and reuse for every supported image purpose. They reject invented cover/prototype targets. Creation tests assert private requests, original-world isolation and exact uncertain replay.
- Android debug and instrumentation APKs compile. The app launches on the local x86-64 emulator. All 60 tests in the app's `dev.voyage.workbench` package pass, including artwork-journal persistence and compare-and-swap protection.
- Running the unfiltered Android suite also includes an unrelated generated Capacitor example test: it still expects `com.getcapacitor.app` instead of `dev.voyage.workbench` and fails. That scaffold was not changed.
- A later, redundant Android repack collided with a separate release build using the same intermediates and failed in `packageDebug` with a missing `linked-resources-binary-format-debug.ap_`. The earlier debug compilation and 60 app-specific native tests passed. The queued retry was cancelled to avoid interfering with the other build; this audit does not claim a fresh final distributable.

## Boundaries

No real world creation, upload, billable model generation or remote publication was performed for this audit. API/provider behavior was mocked. The collaborative preview could not reach the local development server; Electron exercised the real rendered app instead. T3 device support failed to initialize, so Android validation used the installed SDK emulator and ADB. Windows packaging was not rerun. This work does not itself publish a downloadable release or push source.
