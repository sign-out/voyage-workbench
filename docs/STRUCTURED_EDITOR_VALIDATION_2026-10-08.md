# Structured editor validation — October 8, 2026

Form and JSON are peer views of one exact-source draft. The toolbar toggle does not apply, discard, parse/stringify the world, or change the selected path. The chosen view persists during in-app navigation. Invalid JSON remains intact; Form shows an explanation until JSON is repaired. Existing durable drafts, protected package metadata and Apply/Discard remain in charge.

Implemented forms use cached field/record/array schemas for optional-field additions, string enums and searchable named collections. Present unknown fields stay editable. Strings use textareas, booleans use checkboxes, and numbers retain lexical tokens rather than passing through JavaScript Number. Incomplete number input is explicitly identified as unfinished and not saved. Merely opening Form never inserts defaults.

Validation:

- TypeScript typecheck, 96 Node/UI tests and shared desktop/Android build pass. Nested forms mount lazily and collections render 50-entry pages with explicit Show more controls.
- Electron smoke verifies Form edits reflected in JSON, exact large numbers and unknown numeric notation, invalid-JSON view switching and Discard, plus all existing 48 tool/viewport layouts and provider/sync/map/character/preview regressions. Paid provider requests are fixture-backed.
- Collaborative browser verifies both directions of Form/JSON editing in Story Overview with a 20-digit number preserved, Apply through the existing draft flow, searchable World Lore entry/detail views, and retained collection detail when switching views. Bounds checks at 320, 412 and 1280 px show no horizontal page overflow. Only a neutral QA fixture is edited.
- Android debug and instrumented APK builds pass; the final app and tests are installed using `adb install -r` without clearing existing data. All 25 app-package native tests pass. The paid real-agent test is excluded. The Device panel cannot detect the installed SDK; native verification uses the configured SDK and ADB emulator instead.

Local debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
SHA-256: `0f24aa3919721ce26e8af8da8cd181e06e15bff62abbba879a638ee0410f2ddd`.

This is local implementation and validation, not a published release or a claim of complete Native Studio parity. See `STUDIO_PARITY.md` for remaining workflow gaps.
