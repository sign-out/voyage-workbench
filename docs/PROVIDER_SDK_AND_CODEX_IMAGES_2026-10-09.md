# Provider SDK execution and Codex images — October 9, 2026

## Implemented: native Codex image integration

The Android and desktop workbench now use the same bundled Codex app-server
transport for explicitly requested artwork, reference-image refinement and cover
grading. This reuses the existing CLI/agent integration; it does not add a second
Node runtime or pretend that an API key is a subscription session.

- Models & agents → Artwork can select Codex. Selection is explicit; existing
  artwork routes and the unconfigured default are not silently replaced.
- A Codex model override is optional. An explicit Artwork override wins, otherwise
  the Codex profile's text model is used, otherwise Codex selects its default.
- The current Codex sign-in is checked. Generation also checks the bundled
  `modelProvider/capabilities/read` endpoint before starting a turn.
- Generation is enabled only in a dedicated media thread. Ordinary planning/work
  threads retain their existing disabled image tool and staged-edit permissions.
- Grading supplies the real original/crop/stress-test images and the existing
  rubric; it does not enable generation or grant world-edit tools.
- Generated `imageGeneration` results must contain bounded PNG/JPEG/WebP bytes.
  Assistant prose, URLs and arbitrary saved filesystem paths are not accepted as
  generated assets. Native validation avoids sending full base64 payloads through
  Rhino merely to inspect a header.
- Failed/unsupported requests do not silently switch to a paid API provider or
  retry. A missing/failed artifact is an error, not a pretend successful image.
- Current cover/map job storage, original preservation, global library indexing,
  explicit paid-use confirmations, grading recovery and upload review are reused.

The implementation uses the existing app-server protocol directly, not the
`@openai/codex-sdk` npm package. CLI/SDK interfaces are not themselves image
models: actual generation still depends on account/model access and usage limits.

## Not completed: other on-device SDK runtimes

**Historical image-pass status:** the subsequent explicit request selected fully
on-device execution. The official Claude CLI is now implemented on Android;
see `ON_DEVICE_PROVIDERS_2026-10-09.md` for current scope, credential limitations,
qualification and remaining providers. The paragraphs below describe the state
before that follow-up, not the current Claude runtime.

Do not describe this pass as completing all provider SDK execution on Android.
Existing API connections still run the guarded native agent/tool loop on both
platforms. Existing Claude Code, Cursor, Gemini CLI and OpenCode subprocess
adapters remain installed-desktop-CLI integrations; they have not been replaced
with bundled Android SDK runtimes.

SDK execution, CLI execution and HTTP API connections are distinct capabilities:

- Claude's TypeScript Agent SDK uses a Node/Bun runtime and requires supported SDK
  authentication. It is not permission to copy consumer CLI sign-in tokens into a
  new third-party app integration or silently bill a different API credential.
- OpenCode's SDK is a client for an OpenCode server; adding the client alone does
  not supply an Android executable, managed server lifecycle or provider sign-in.
- Native API agents already cover Anthropic, Google, OpenAI, xAI/OpenRouter/local
  compatible endpoints through reviewed work orders. Using an agent SDK instead
  would need to retain those tool/approval/credential boundaries.
- Provider adapters must not advertise available Android SDK execution until their
  actual runtime, ABI, auth, transport, cancellation, isolated tools and packaging
  are validated. No executable downloads or new remote SDK bridge were added here.

A follow-up needs an explicit architecture choice: entirely on-device bundled
runtimes, or an optional authenticated desktop SDK bridge. No bridge, credential
transfer, token import, native-availability flag or billing fallback is inferred
from the user's ambiguous SDK correction.

## Validation

- Typecheck and **184** Node/core/UI/desktop-host tests pass.
- Desktop smoke suites exercise **75** layouts plus existing authoring/review,
  provider, cover generation/grading and global library workflows.
- **38** native instrumentation tests pass, covering generated artifact/refinement inputs, unavailable
  capability, failed turns, grading isolation, path rejection and cleanup.
- Actual desktop and Android bundled app-server handshakes accept the dedicated
  image thread with read-only sandboxing and approval policy `never`. The desktop
  capability endpoint reports image generation support. These probes do not start
  a model turn.
- No paid generation/vision request or remote world publication is used for
  validation. Live account/model image qualification remains pending.
- No new installer is publicly published by this pass. The existing Studio test
  release is unchanged; it does not contain these new image changes.

Local evidence: `/tmp/voyage-provider-{typecheck,tests,sync,smoke,studio-smoke,native-build,native-tests}.log`.

## Primary integration references

- OpenAI Codex app server: `https://developers.openai.com/codex/app-server/`
- OpenAI Codex SDK: `https://developers.openai.com/codex/sdk/`
- OpenCode SDK and managed/server client modes: `https://opencode.ai/docs/sdk/`
- Claude Agent SDK overview and authentication:
  `https://platform.claude.com/docs/en/agent-sdk/overview`
- Bundled Codex 0.156.1 experimental JSON schema, generated locally; its image
  result, capability and user-input shapes are tested rather than guessed.
- Existing Python prototype `workbench/codex_rpc.py` and `workbench/assets.py`
  already use the native image-result contract; the workbench host integration
  preserves the same no-arbitrary-file-read boundary.
