# Voyage Workbench 0.2.13 test build

The studio now adapts to narrow phones, short landscape screens, keyboard
resizing, larger text, and safe-area insets.

- Content, Map, Mods, and Publish have compact shortcuts. All tools opens the
  remaining navigation, and the bottom bar switches between Chat and Editor.
- Expanded content lists scroll inside the available space. Apply and Discard
  share one row, and More contains secondary editor actions.
- Focused fields remain visible after rotation or keyboard resizing. Unapplied
  drafts survive viewport changes and switching between Chat and Editor.
- Notes, Work Orders, and publishing checks start collapsed on phones.
- Maps support two-finger pinch zoom anchored between the fingers, including
  continuing with one finger and cancelling a gesture without changing source.

Android uses version code 15. Release APKs must retain the existing Android
update-signing identity and complete provider runtimes. The provider-pack
catalog remains pinned to its existing release.

Validation covers 269 application tests, 12 release checks, typecheck, production
build, 26 Chromium viewport cases, live draft-preserving resizing, touch gestures,
and three native layout regressions on an Android 15 emulator. Manual emulator
checks cover the real keyboard, rotation, 200% system text, map controls, and
Mods/Publish navigation. See `MOBILE_UI_QA_2026-10-18.md` for evidence and limits.
Physical display cutouts and dragging whole region tiles on a handset remain
unverified. Taildrop delivery does not install or launch the APK.
