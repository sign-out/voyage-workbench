# Studio editor parity pass — October 8, 2026

## Implemented

- JSON is an editing peer, not a preview: syntax colors, virtualized line-number gutter, native textarea selection/undo, contained horizontal scrolling, explicit formatting, and draft copy/export in either view. Highlighting never parses numbers into JavaScript numbers. Formatting preserves original scalar tokens and escaped key tokens; only whitespace changes. Invalid drafts remain editable/copyable/exportable. Formatting is disabled for invalid or protected source.
- Copy uses the trusted Electron host or Android clipboard service; Android marks the clipboard item sensitive to suppress content previews on supported versions. Browser development uses the browser clipboard API and reports failures. Clipboard use is explicit, not automatic. Selection exports use existing atomic/native document-export flows and include the current draft, not stale active source.
- Full-screen text editing uses a modal with character count, Escape/Done, and focus return. All edits feed the same durable draft. Done does not apply the world or discard edits.
- Reference suggestions come from actual authored world entries. Factions, NPC types, regions, realms, locations and voices show names with exact IDs. NPC area choices are scoped by the current location in the combined draft. Missing references remain intact and are explained; changes do not auto-clear other fields.
- Collection cards show available portrait/map/establishing-shot thumbnails and parent names. Detail forms offer existing full-size image inspection. Unsafe URL schemes and credential-bearing URLs do not become image requests.
- Health displays preserve exact source tokens. Proportional bars appear only for safe nonnegative integer current values and positive safe integer maxima; other values show exact text without pretending a reliable percentage.

## Evidence

- Typecheck passes; 102 Node/UI tests pass.
- Shared UI, desktop host and Android document engine build pass.
- Electron smoke passes: full-screen text edits and Escape focus restoration, exact JSON formatting/copy/export, invalid-draft recovery, and the existing 48 tool/viewport layouts plus provider/sync/map/character/preview workflows. Provider/network responses are fixtures; no paid real agent request is run. Clipboard formats are restored after the clipboard test.
- Browser checks at 320 px confirm bounded toolbar controls, contained JSON horizontal scrolling, preserved 20-digit numbers after formatting, and a full-screen text modal that fits the viewport.
- Android app and test APK build, install-over-existing and all 25 app-package native tests pass. Native clipboard integration is build-verified; these tests do not establish physical-device clipboard behavior. The paid agent test remains excluded.
- Device panel still cannot discover the installed Android SDK; native verification uses the configured SDK and ADB emulator directly.

Local APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
SHA-256: `0bc23c109dd1302396c20dc687bf8d2ea282543fc2120058e89f1926504a4b1e`.

No release was published, version bumped, source committed, or project data reset. Complete Studio parity is not claimed; remaining gaps are listed in `STUDIO_PARITY.md`.
