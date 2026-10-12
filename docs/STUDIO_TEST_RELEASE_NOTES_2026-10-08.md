# Voyage Workbench — Studio feature test build

New Android test installers, built from the current Studio feature pass. These
replace neither the older desktop installers nor the older v0.2.6 APK assets.
The Android application version remains 0.2.6 / version code 8; the distinct
`v0.2.6-studio-test` download tag identifies this newer build.

## Included

- Global asset library with bulk imports, content/URL deduplication, local originals,
  retained Latitude URLs, previews, export and reviewed assignments.
- First-class soundtrack editing, variants/cues and character-creation selection,
  plus explicit resumable music uploads and reuse of existing hosted URLs.
- Publication author-field forms and peer JSON with protected package identity.
- Targeted Mechanics/runtime-AI editors and reviewed mod stacks with exact-path
  conflict/shared-value inspection and explicit unknown coverage.
- Phone publication scrolling fixes, durable drafts, upload recovery and encrypted
  signed-upload credential handling. Nothing uploads or publishes automatically.

## Installing

Choose the **arm64 APK for most Android phones**; x86_64 is for matching devices
and emulators. Android 13 or newer is required.

Install over the existing app. **Do not uninstall**: uninstalling deletes local
app data. Export important worlds before testing. Existing development signing is
retained; these remain personal test installers, not certified production builds.

## Validation and boundaries

- Typecheck, production build and 176 automated app/core/desktop-host tests passed.
- Desktop smoke suites passed 75 layout checks and editing/review regression flows.
- Android debug and x86_64 release instrumentation each passed 33 tests, excluding
  the paid/live agent fixture. Release UI/notices match the current build and the
  signing certificate matches the previous installer. GitHub asset sizes and
  SHA-256 digests are verified before making this release available.
- No live music upload, paid model request or remote world publication was used to
  qualify this build. Physical ARM64-phone execution is not certified.
- Complete Native Studio parity is not claimed. Mod conflicts are advisory overlap
  analysis, not engine precedence; unsaved music upload reservations still expire.

## Distribution

Only APK installers and SHA-256 checksums are uploaded. No application-source
repository, source maps, separate dependency-source archives, credentials, private
worlds or signing material are uploaded. Compiled JavaScript remains inspectable.

Bundled third-party notices include the distributor's authorized corresponding
dependency-source offer and pinned existing upstream source/build access. The
corresponding dependency materials remain privately retained for requests through
this downloads repository's issue tracker. The offer covers dependencies, not
application source, and is not treated as sufficient for every license on its own.
