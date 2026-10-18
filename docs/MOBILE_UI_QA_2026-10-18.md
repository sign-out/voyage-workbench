# Mobile UI verification, 18 October 2026

The native debug app was built and installed on `emulator-5554`, an Android 15 x86-64 emulator with a 1080 by 2400 display at 420 dpi. The WebView reported a 412-pixel-wide viewport. No physical handset appeared in ADB. Tests used newly created local projects and the bundled Lantern Coast example.

## Defects reproduced and fixed

Expanded content categories could not scroll. The navigator's automatic minimum height let the list grow behind the bottom bar. A native WebView test reproduced a list bottom of 2653 pixels against a bottom-bar top of 750 pixels, with `scrollTop` stuck at zero. Setting the mobile navigator's `min-height` to zero restored scrolling. Touch scrolling was then verified in the app.

The editor's sticky action strip wrapped onto multiple rows and covered the focused text when Android's keyboard opened. A native regression reproduced only four pixels of visible text area in a keyboard-sized WebView. Apply and Discard now share one row, with secondary actions in More. The regression passed, and real-keyboard typing was visually checked after installing the rebuilt app.

The native regressions exercise production CSS in the Android WebView through `MobileLayoutTest`. The compact-viewport test reproduces keyboard geometry without depending on emulator hardware-keyboard preferences; the real keyboard was checked separately through device interaction.

Follow-up testing reproduced a focused field with only seven visible pixels after portrait-to-landscape rotation. The editor now checks its focused field after its scrollport or visual viewport resizes and scrolls the field above the action bar when needed. A third native regression rotates the activity with a focused field, verifies its text and focus, then reduces the landscape WebView to 200 pixels tall and checks field/action visibility. It passed after the fix. Very short viewports hide the header and top navigation while an editor input is focused; Apply/Discard and Chat/Editor remain available. Real Android keyboard visibility was confirmed in portrait and landscape.

Android's actual `font_scale=2.0` setting exposed a toolbar shrinking beneath its wrapped contents. Preventing toolbar shrinkage fixed the overlap. The responsive matrix now checks toolbar containment, and the rebuilt Android toolbar was visually checked again at 200%. The editor's secondary menu was also opened at that font setting.

A sample-world marker was placed and dragged from `(0, 0)` to `(11.2, 9.4)`. The marker label, local-position inspector, and saved status reflected the change. Realm-grid pinch zoom initially stayed at 100% and panned instead. The map now tracks both touch pointers, scales around their midpoint, and lets a remaining finger continue panning without a jump. The rebuilt Android app zoomed from 100% to 151% with an outward pinch and back to 105% with an inward pinch.

## Completed checks

- Native app and instrumentation APK builds passed.
- Content categories, drill-down, touch scrolling, and text input were checked.
- An unapplied draft survived switching to Chat and back to Editor.
- Applying the edit changed the status from Draft to Saved locally and disabled Apply/Discard.
- All three native layout regressions passed.
- Native Map realm creation, zoom from 100% to 120%, and touch panning were checked using a new test realm. Panning changed the visible grid cells.
- Native Mods opened and added a pending local reference row. Publish opened with its checks collapsed and local publication fields reachable. No remote actions were submitted.
- Android system font scaling at 200% was visually checked. Font scale and automatic rotation were restored after testing.
- After integrating the current main branch, typecheck, 269 application tests, and 12 release tests passed. The assistant viewport fixture pins its device scale, and the Codex wire fixture runs through Node and waits for child-process exit so both tests work on Windows.

## Responsive coverage

Run `npm run build` followed by `npm run test:responsive`. The responsive smoke test uses the compiled UI, real Electron preload, and an isolated local project. It blocks network requests and does not use account credentials. Evidence and the JSON report are written under `.build-tools/responsive-qa`.

The Chromium 152 matrix passes 26 cases: portrait widths from 280 to 480 CSS pixels, neighboring widths around 360 and 412 pixels, four landscape sizes, a 320 by 360 reduced viewport, widths 759/760/761 around the layout breakpoint, and a 1280 by 900 desktop viewport. Additional cases cover 150% browser zoom, simulated 200% text enlargement, long shortcut labels, and portrait/landscape safe-area insets. These text and inset simulations do not certify Android system font scaling or physical display cutouts.

The checks cover content scrolling, reachable editor controls and secondary menus, chat input, Map/Mods/Publish overflow, and the All tools menu. The editor check scrolls the field's first line into view, then verifies visible space and action bounds. A separate live resize check retains an unapplied draft through portrait, landscape, tablet, and desktop layouts without reloading; it also verifies local persistence and that the source world remains unchanged. A real Chromium touch-input regression checks pinch scaling, midpoint anchoring, one-finger continuation, cancellation, suppression of accidental region opening, and unchanged world source. This regression failed before pinch handling was added.

The matrix reproduced clipped shortcuts, a fractional-width breakpoint gap, desktop controls on short landscape phones, covered secondary menus, enlarged action labels overflowing, and content under landscape cutouts. The layout now uses scrolling shortcuts, a shared compact-layout query, measured bar heights, safe-area padding, and controls that wrap when text grows.

## Remaining checks

A physical handset did not appear in ADB. Physical display cutouts and touch dragging of whole region tiles remain unverified. The Chromium matrix verifies layout geometry and simulated insets; it does not certify every phone or every combination of keyboard and accessibility settings. No remote publication, provider sign-in, or model inference was attempted. The debug APK does not contain the separately packaged provider runtimes.
