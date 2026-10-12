# Personal preview release verification — October 7, 2026

Version: 0.2.0. Existing staged work was preserved; verification covers the current working tree and rebuilt packages, not a committed release.

## Fixes included

- Map region names have transparent backgrounds and clip within their region cells.
- Character cards use full-width names and silhouette/initial placeholders, including when portrait loading fails.
- Voyage Creator API access errors explain the account entitlement requirement and retain the request ID. Local code cannot grant this entitlement.
- Provider setup saves newly entered credentials before discovery, offers a small connection test, and supports explicit stage routing.
- OpenAI uses Responses; compatible Chat Completions, Anthropic and Gemini adapters remain available. Desktop CLI adapters require installed, authenticated tools; Android hides unsupported CLI routes.
- Electron packages declare the correct main entry point.

## Verification completed

- TypeScript typecheck and all 37 TypeScript tests pass, including controlled HTTP tests for provider presets, discovery, probes, planning and staged edits.
- All 177 Python tests pass.
- Electron UI smoke passes for the bridge, editor, character layout/placeholder and transparent clipped map labels.
- Desktop Codex staged-edit smoke preserves the active document before acceptance and exact large numbers after acceptance.
- Android debug/test builds and instrumentation complete successfully: OK (9 tests), with the lifecycle-preparation test assumption-gated. API protocol tests and authenticated Codex execution pass.
- Android release build succeeds. ARM64, x86-64 and universal release APKs have verified signatures, native runtimes and byte-identical current UI/core assets.
- Linux and Windows desktop packages match the current entry point, host, preload, UI and reference assets. The packaged Linux application launches successfully.
- Browser checks cover provider configuration and a 412px mobile viewport without horizontal overflow.
- Release checksum entries for 0.2.0 are refreshed; 0.1.0 entries are preserved.

## Remaining release gates

These are personal preview builds, not a production/store certification.

- Windows native execution has not been tested on Windows.
- Physical ARM64 phones, other supported Android versions and vendor background-process restrictions have not been tested in this run.
- Every third-party account, paid inference entitlement and image endpoint has not been tested live. Contract tests do not establish account access.
- Voyage remote functionality requires a Creator API-enabled account/key; the reported HTTP 403 still requires account-side action.
- Android uses this machine's development signing certificate; Windows is unsigned.
- Android lifecycle testing was not explicitly rerun in this check; prior lifecycle evidence is not new evidence.
- The T3 Device panel was unavailable in this environment; Android verification used the configured SDK emulator and native instrumentation instead.

See `PERSONAL_APPS.md` for installation, provider setup and platform requirements.

## Environment-selector follow-up

- Connection now offers production and alpha, displays the API origin and persists the selection. Beta is visible but disabled: neither supplied specification confirms a beta Creator API origin.
- Credentials are isolated by environment; the existing production credential remains compatible. Downloads retain their environment, and validation/save/reconciliation reject a mismatched selection. Existing untagged links default to production.
- Typecheck and all 38 TypeScript tests pass, including environment routing, persistence, credential isolation, unsupported-host rejection and cross-environment guards.
- Updated Android instrumentation reports OK (10 tests); authenticated Codex and lifecycle preparation remain assumption-gated in this follow-up run, which did not supply a temporary login.
- The selector was exercised in the browser at 412px width: selecting alpha updates the displayed API endpoint without horizontal document overflow. The browser was restored to production afterward.
- Linux/Windows packages and all three Android release APKs were rebuilt with the selector. Desktop packaged assets, Electron UI smoke, Android assets/signatures and updated release checksums were verified.

## UX and Voyage-sync follow-up

- Clicking an occupied map region opens its region map; Back returns to the realm. Transparent region labels remain clipped within their cells. Marker/coordinate selection brings its inspector into view.
- Clicking a character opens editing immediately. Phones/tablets use a focused detail view with All characters navigation; desktop retains the split view. Portrait fallbacks and full-width names remain intact.
- Voyage sync and desktop header actions expose Import from Voyage and Save to Voyage. Mobile Files & sync exposes those actions alongside local JSON import/export. Local autosaving remains separate and never automatically uploads.
- API imports default to an independent local project; importing into the current project stages a reviewable proposal. Both native hosts block remote saving while a remote-import proposal remains unreviewed. Saving confirms the linked world/environment and uses validation, conditional save and read-back safeguards.
- Mobile All tools exposes every screen. World editing has Browse fields / Edit JSON drill-in, recovered drafts open the editing view, and validation issues navigate to their fields.
- Character, map and provider forms warn before navigation discards unapplied changes. Failed JSON draft saves retain retry data. Provider Save settings persists newly entered keys as well as configuration.
- Typecheck and all 39 TypeScript tests pass. Electron smoke verifies actual character editing/local persistence, full-tile region navigation, mocked Voyage import/save, provider settings/key persistence, unsaved-edit cancellation and 30 screen/viewport layouts (15 screens at 412px and 1280px). Mobile header and menu bounds are checked explicitly.
- Latest Android instrumentation reports OK (11 tests), including the unreviewed-import save guard. Authenticated Codex and lifecycle preparation are assumption-gated in this run; no temporary login was supplied. All 177 Python tests also pass in the final follow-up run (with an existing SQLite ResourceWarning).
- Final desktop and Android packages include the UX follow-up. Packaged source/assets and Android signatures are checked, and only the 0.2.0 checksum entries are refreshed.
- Browser visual review confirms the 412px character detail layout. The Electron smoke emits a destroyed-window IPC warning during shutdown after reporting success; this is not a live connection or interaction failure.

The UX review does not establish official-editor feature parity: complex generic values still use exact JSON, and live paid inference, Voyage account entitlements, publication/moderation and every media endpoint are not certified. The remaining release gates above still apply.

## Alpha-only follow-up

- Supersedes the Production/Alpha selection described above: all active desktop, Android and companion connections now use Alpha. Production is disabled in the selectors and host configuration; stored Production preferences cannot re-enable it.
- Legacy Production credentials and world links are preserved, not copied or retargeted. Non-Alpha linked-world saves remain blocked; import the Alpha world separately.
- A user-authorized read-only live test against Alpha successfully listed five owned worlds. No import, save, publication or other remote mutation was performed. The key was held only in the preview's in-memory credential store and is not bundled in the app.
- Typecheck and all 39 TypeScript tests pass, including Alpha-only routing, legacy Production credential isolation and non-Alpha save guards. All 178 Python tests pass. The 30-layout Electron smoke passes and asserts that mocked Voyage traffic targets only the Alpha hostname.
- Android instrumentation reports OK (11 tests), including rejection of Production configuration and retention of legacy-link save guards. Authenticated Codex and lifecycle preparation remain assumption-gated, with no temporary login supplied.
- Windows/Linux packages and all three Android release APKs are rebuilt with the Alpha-only policy. Desktop packaged assets, Android UI/core assets and APK signatures are verified; 0.2.0 checksums are refreshed without changing 0.1.0 entries. The combined Android debug/release build emits split debug APKs, so instrumentation used the generated universal debug APK.

## Large-world JSON export follow-up

- Android previously retained the complete JSON/image export payload in the Capacitor call while launching the document picker. Capacitor includes that call data in saved activity state. The regression fixture demonstrates that a 3 MiB world produces a saved-state parcel larger than 1 MiB; this explains the reported large-world picker/lifecycle crash and empty destination.
- JSON and image bytes are now staged in private app storage before opening the picker. The pending call contains only a filename and opaque token; restored callbacks reopen and stream the staged bytes. The corresponding regression saved-state parcel is under 4 KiB. Successful and cancelled exports remove the staged payload. Missing payloads/invalid input fail before opening or truncating the destination.
- Android tests check exact UTF-8 bytes, an integer larger than JavaScript's safe range, saved-call serialization/restoration, cancellation, invalid source/token rejection and image-export restoration. Local worlds are not changed or uploaded.
- Desktop JSON export now validates the source and writes to a temporary sibling, flushes it, then renames it over the selected destination. Invalid input or failed writes do not truncate an existing file. Controlled Electron UI testing imports an API-shaped world, exports it through the actual header/IPC handler and checks byte fidelity and cancellation.
- Typecheck and all 41 TypeScript tests pass. Android instrumentation reports OK (14 tests), including three new export regressions; authenticated Codex and lifecycle preparation remain assumption-gated. The Electron smoke still covers 30 screen/viewport layouts. This is emulator regression coverage, not a new physical-device or Windows-runtime certification.
- Windows/Linux builds and ARM64, x86-64 and universal Android release APKs are refreshed with the export fix. Packaged desktop assets, current Android UI/core assets, native runtimes and APK signatures are verified. Only the 0.2.0 checksum entries change.

## Import shape and selective-review follow-up

- A read-only Alpha check confirmed the reported owned world is returned inside `data.world` with metadata and `initialGameState`. No remote modification was made during this investigation.
- Raw GameState imports into an API-envelope document now stage changes under `initialGameState`, retaining its metadata and identity. Wrapped envelopes align to the current wrapper; envelope imports into a raw-state document review its GameState rather than replacing its link metadata. Review notes explain the alignment.
- Each diff item has Keep current / Use proposed controls. Exclusions are persisted in the proposal and reversible. Acceptance, proposal validation and proposal export use the selected result; no choice changes the active world before acceptance. Object order can be excluded independently of value edits, and arrays remain atomic. Diffs over 2,000 items are paginated, with choices retained across pages and an explicit reminder that unexcluded items will be included.
- New downloads retain a private envelope baseline. Remote payload creation recovers older raw-state replacements from that baseline or the original downloaded source. Missing baselines and conflicting short IDs are rejected rather than guessing metadata. Exact numeric spelling, linked environment, conditional ETag saves and read-back reconciliation remain intact.
- Typecheck and all 49 TypeScript tests pass, including a controlled download → raw import → selective acceptance → conditional save → read-back flow and legacy-envelope recovery. The Electron UI smoke verifies file-picker JSON import, exclusion/undo, selected acceptance, metadata preservation and the existing remote-save flow, alongside 30 screen/viewport layouts. A transient desktop viewport-resize timeout occurred on the first smoke attempt; the unchanged rerun passed.
- Android instrumentation reports OK (16 tests), including persistent selective choices and recovery from an older raw-state replacement. Authenticated Codex and lifecycle-preparation tests remain assumption-gated; no temporary login was supplied. T3's Device panel is unavailable here, so Android verification uses the configured SDK emulator, not a physical phone.
- Windows/Linux packages and all three Android release APKs are refreshed with the import/review changes. Desktop packaged assets, Android UI/core assets, native runtimes and APK signatures are verified. Only 0.2.0 release checksum entries are updated; 0.1.0 entries are preserved.

## Alpha revision-header fix — 0.2.1

- Live Alpha GET responses return weak ETags (`W/"revision"`) alongside the same opaque revision in `data.revision`. The replacement endpoint rejects that weak prefix with HTTP 400 `invalid_revision`. Both hosts now use the shared revision formatter to send the quoted revision without `W/`; malformed revisions and wildcards fail before write dispatch.
- Old persisted UNKNOWN operations with an explicit HTTP 400 `invalid_revision` rejection can be cleared by reconciliation or by starting a new save. That specific error is now recorded as REJECTED. Other uncertain network writes still block subsequent saves, and the original revision is not replaced with a newer one to bypass conflict detection.
- An unchanged live Alpha draft passed download, official validation, corrected-header save and read-back confirmation through the desktop host. A subsequent read confirmed its revision remained unchanged. Private world contents and the API key were not written into release assets.
- Typecheck, all 53 TypeScript tests and Electron UI smoke checks pass. Android emulator instrumentation reports OK (18 tests), including actual native HTTP transport with a weak ETag and persistent legacy rejection recovery. No physical-device or Windows-runtime certification is implied.
- Version is now 0.2.1; Android version code is 3. The previous development signing certificate is preserved so APKs can update existing installations without clearing local projects. Windows/Linux and all three Android builds are refreshed; previous release assets remain available.

## Read-back confirmation and status feedback — 0.2.2

- The privately supplied export and the live Alpha draft differ only in `initialGameState` object key order. Exact edit/review diffs correctly preserve source ordering, but using those source diffs for remote confirmation produced a false UNKNOWN result. Shared remote comparison now ignores object key order at every depth, including inside arrays, and equivalent number spelling. Numeric coefficient comparison uses strings so distinct large integers cannot collapse through floating-point rounding. Actual differences still remain unconfirmed; at most 20 differing paths are retained for feedback.
- Desktop and Android use the shared comparator. Reconciliation confirmed the supplied export against Alpha with no remote write and no local source change. Private content is not added as a repository fixture or bundled into releases.
- The UI no longer displays success for every returned save call. Persistent feedback separates confirmed success, unconfirmed results with differing paths, rejection and action failures. Pending feedback explains the current operation, previous attempts are collapsed separately and check timestamps are displayed. Existing false mismatches can be resolved with **Reconcile save**; genuine uncertain writes are not automatically resent.
- Typecheck and 58 TypeScript tests pass. Android emulator instrumentation covers 20 tests, including automatic reconciliation without duplicate uploads, conditional saving of newer local edits after confirming an older write, and retaining write blocks for genuine differences. Expanded Electron checks verify confirmed success, genuine mismatch/path feedback, explicit and automatic read-only reconciliation, rejection feedback without stale success, and recovery, in addition to the existing editor/layout checks. T3's Device panel remains unavailable; native checks use the configured SDK emulator.
- A later read-only Alpha check found actual trigger-condition changes relative to the supplied export, not just key ordering. Automatic save preparation kept that result unconfirmed and did not upload anything. No remote revision is blindly refreshed to overwrite conflicting content.
- Version is 0.2.2 and Android version code is 4. Update signing is unchanged. Windows/Linux and ARM64, x86-64 and universal Android builds are prepared for the public preview downloads repository. Physical-device and Windows-runtime qualifications remain unchanged.

## Cover studio and publication previews — 0.2.3

- Release version is 0.2.3; Android version code is 5. The header shows the human-readable world title. Publish shows public descriptions and approximate original/card/listing/profile/phone/desktop cover views. Artwork separates cover generation and weighted-rubric grading from map artwork.
- Grading defaults to the effective Building text model, preserves manual overrides and saved-job settings, and never substitutes the Artwork image model. CLI Building profiles remain visible with an explicit API-grading limitation.
- Typecheck, 66 TypeScript tests, and the shared UI/desktop/native-engine build pass. Electron smoke passes all 45 screen/viewport layouts and covers mocked generation/grading, Building defaults, manual override, grading-only retries, and preserved images after failures. No paid live image/vision calls were made.
- All 23 Android instrumentation tests pass against the x86_64 release APK. All three release APKs have version code 5, are non-debuggable, preserve the previous signing certificate, and contain byte-identical current UI/native-engine assets. T3's Device panel is unavailable; verification uses the configured SDK emulator directly.
- Linux and Windows packaged host/preload/UI/reference assets match the current build; the Linux download archive contains the verified app archive. Package checks found no supplied Voyage API key, private world identifier, or signing material. Corresponding runtime notices/sources and six-artifact SHA-256 checksums accompany the download builds.
- Physical ARM64-phone and Windows execution remain uncertified. Windows is unsigned; Android uses the existing development signing certificate. Alpha-only Voyage behavior and remote-save conflict safeguards remain unchanged.

## Installer-only personal testing downloads — 0.2.4

- The owner authorized a third-party dependency-source-on-request offer while retaining the restriction against separate source archives in public downloads. The apps now bundle notices, the offer, and pinned upstream source/build-recipe access information. Existing corresponding dependency materials and additional Windows voice sources are retained privately with checked hashes. This is not a legal certification.
- Android retains bundled Codex and its compatibility runtime; no provider feature was removed. The notice viewer is accessible under Models & agents. Desktop packages exclude original application-source maps. Compiled JavaScript remains inspectable inside the apps.
- Version is 0.2.4; Android version code is 6. Typecheck and 66 TypeScript tests pass. All 23 Android instrumentation tests pass against the x86_64 release APK. All three APKs retain update signing, are non-debuggable, and contain the current UI/native engine, source offer, and full Codex runtime. Package checks found no dependency-source archives, supplied Voyage key, private world identifier, or signing material.
- Desktop packages match the current host/UI/reference assets and bundled notices. Electron smoke passes 45 layouts and verifies the notice viewer alongside existing editor, provider, Voyage-sync, publication-preview, and cover-generation/grading checks. Windows and physical ARM64 execution remain uncertified; no paid live vision requests were made.
- Publication uses an explicit allowlist: three Android APKs, Windows portable executable, Linux application archive, and checksums. No separate source or third-party-material archive is a release asset. Verify GitHub's asset digests and anonymous public access before announcing availability.
