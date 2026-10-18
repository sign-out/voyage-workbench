# Voyage Workbench 0.2.12 test build

This test build includes the assistant fixes already merged in `ae23869`:

- Inline artwork approval controls generate one image or all eligible requests
  without leaving chat. Provider/model and possible charges appear before
  approval. Images stay local until separately uploaded and attached.
- Durable generation reservations prevent duplicate requests and automatic
  retries after uncertain provider outcomes. Batches run sequentially and can
  stop after the current image.
- Mobile assistant controls remain reachable with independently scrolling
  transcript, guidance, and error areas, including keyboard-sized viewports.
- A narrowly scoped account-only retry handles transient Codex workspace-routing
  discovery errors without replaying a task or image-generation turn.

Android uses version code 14 and the existing update-signing identity. The
Pixel test artifact is the full `arm64-v8a` APK, not the x86-64 or universal APK.
This version bump does not publish a GitHub release or new provider packs. The
existing on-demand provider-pack catalog remains pinned to its prior release.

Validation for the underlying fixes: 267 automated tests, 12 release checks,
typecheck, production build, Android JVM tests, and Java compilation pass.
Physical Pixel execution and real paid provider calls are not claimed by these
checks. Receiving the APK by Taildrop does not install or launch it.
