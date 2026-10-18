# Contextual assistant and portrait workflow fixes

## Reported problems

The Android screenshots showed a planner treating a conversational “Yes” as
image-generation approval, later admitting that it could not generate images;
an `account/read` workspace-routing discovery failure; and a panel whose
guidance/error content competed with the conversation and composer.

## Changes

- Planning can now propose durable, destination-specific artwork briefs through
  `propose_artwork`. The host validates the destination, brief size, current
  planning attempt and unchanged task source. Proposals do not generate images,
  spend image-provider usage, edit world content, upload, or attach artwork.
- The assistant links to **Review artwork requests**. Reviewing a request loads
  the named destination and proposed brief into the existing Artwork generator.
  Generation still requires its own provider/charge confirmation. Generated
  images stay in the local library; uploads and attachment remain separate.
  Generation history retains the originating proposal ID.
- Planner instructions distinguish chat, Work Orders and image generation. A
  chat reply is not an image-generation approval. Existing portraits should be
  preserved unless the user explicitly requests replacement.
- Planning packets contain bounded destination identifiers, labels and an
  existing-artwork flag, not hosted image URLs. Artwork-inspection limit errors
  are nonfatal and explicitly reported as an incomplete inventory. Work packets
  do not enumerate artwork. A regression covers a valid world above the
  100,000-node artwork-inspection limit.
- Desktop and Android preserve structured Codex RPC errors. Only the exact
  `account/read`, `-32603`, `workspace routing discovery failed` response gets
  one account-only retry after 250 ms. This retains `refreshToken:false`; it
  never bypasses authentication, forces credential refresh, switches providers,
  or automatically replays a task/image turn. Persistent failures explain the
  isolated Workbench sign-in and connectivity checks. Stopped/superseded tasks
  cannot proceed to a provider turn after account verification.
- The assistant uses a bounded flex panel with independent transcript,
  guidance and notice scrolling. Close/composer/actions remain reachable,
  including short keyboard-sized viewports, long errors and safe-area insets.
  Guidance starts collapsed. Provider/artwork navigation closes the panel.
  The real viewport requests content resizing for the keyboard, and Android's
  activity explicitly uses `adjustResize`.
- Artwork catalog code now compiles into the ES5 native bundle without an
  iterable-only URLSearchParams expression or an Array.at dependency.

## Validation

- TypeScript typecheck passes.
- 259 core/UI/host/provider tests pass, including the local HTTP planning-tool
  integration, exact account-only retry behavior, proposal validation, and
  40 rendered assistant state/viewport combinations.
- 12 release/map/world-list checks pass.
- Production UI, desktop host and native document-engine builds pass.
- Android JVM tests pass, including the actual bundled Rhino engine creating a
  planning packet and artwork proposal without changing exact source text.
  Release and instrumentation Java compilation pass.
- Browser verification at 412 CSS pixels confirms that artwork review closes
  the assistant and loads the correct destination-specific brief without
  generating an image or overflowing the page.

## Boundaries

The real signed-in workspace-routing failure and the physical Pixel 8 are not
reproduced here. The bounded account retry mitigates transient failures; it
cannot repair a persistent provider/network problem. T3 device support fails
to initialize on this host, and no ADB device is connected. No paid model call,
real Voyage upload/save, credential modification, phone installation, new APK
distribution, or public release is performed in this pass. The existing
bundle-size and Gradle warnings remain.

## Inline artwork approvals — October 18 follow-up

- Artwork proposals now include actionable approval controls inside assistant
  chat: approve one reviewed brief or all currently eligible requests. The
  controls disclose the Artwork provider/model and potential per-image charges.
  This replaces the requirement to leave chat just to approve generation.
- Clicking approval generates and saves local images. Typing “yes” alone does
  not trigger image generation; planner guidance directs users to the controls.
  Uploading, attaching, and saving to Voyage still require separate actions.
- Before generation, the shared executor verifies the saved proposal, current
  world hash, active project, absence of a draft, and displayed provider route.
  A durable compare-and-set reservation prevents duplicate calls, including
  double clicks, concurrent approvals, and remounts after an interrupted call.
- Batch generation is sequential, stops on errors, and supports stopping after
  the current image. Uncertain provider outcomes are never retried automatically.
- Typecheck, all 267 core/UI/host/provider tests, 12 release checks, and the
  production build pass. Rendered interaction tests cover single and batch
  approval, double clicks, stopping, failure, provider drift, and remounts;
  all provider calls are mocked. No paid generation or APK distribution occurs.
