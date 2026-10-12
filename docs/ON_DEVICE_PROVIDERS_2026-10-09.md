# On-device provider execution — October 9, 2026

## Decision and scope

All provider execution is intended to stay on the Android device. A desktop
bridge is not an acceptable replacement. Direct API profiles remain distinct
choices, never fallback transports for CLI profiles.

The first additional implemented runtime is **the unmodified official Claude
Code CLI 2.1.295**. It runs through the existing PRoot infrastructure and a pinned
musl loader. Neither a Node installation nor the TypeScript Agent SDK is needed
to drive Anthropic's documented subprocess interface from Java.

### Architecture tournament

| Candidate | Strength | Disqualifier or cost | Outcome |
| --- | --- | --- | --- |
| Direct HTTP/API adapter | Already maintained; small | Not the requested CLI/subscription execution path | Keep as an explicitly separate profile |
| TypeScript Agent SDK plus Node/Bun | Official agent SDK and richer callbacks | Also requires Claude's binary; adds a runtime and different SDK authentication constraints | Defer until a concrete SDK-only capability is needed |
| Official native CLI plus existing PRoot | Official subprocess interface; preserves vendor auth; shares review/tool loop | Large binary; requires ABI, auth, cancellation and credential-file qualification | Winner for Claude |
| Desktop SDK bridge | Familiar desktop dependencies | Violates the user's fully on-device requirement | Reject |
| Reimplemented OAuth/inference transport | Small runtime | Not the provider's official inference path; creates security and policy risk | Reject |

This is an engineering choice, not a certification that every subscription plan,
use case, or provider agreement permits every integration. Anthropic's current
CLI product-embedding policy and its Agent SDK login policy are not identical.
The app uses the actual CLI's authentication and inference implementation, not
subscription tokens replayed through an API adapter. Each user authenticates and
is billed directly by their provider. No usage is resold or intermediated.

## Google follow-up: mirror T3 Code's Antigravity integration

Cursor now bundles the official TypeScript SDK 1.0.37 with pinned Node 24.5.0
and glibc 2.36 through PRoot. SDK startup, local credential status, browser-login
initialization and cancellation have passed on the x86_64 emulator and attached
ARM64 Samsung phone. Completed account sign-in and live Cursor inference remain
unverified; do not equate startup qualification with end-to-end qualification.
For Google, prefer T3
Code's official **Antigravity ACP agent** integration rather than assuming its
implementation is Gemini CLI. This is an implementation direction, not a claim
that Android support or redistribution permission has been established.

Reference inspected on October 9, 2026:

- T3 Code revision `ec80933ac8cd02fec5c97b342462ccc9567cdb1e`:
  `docs/user/providers-antigravity.md`,
  `apps/server/src/provider/AntigravityInstallation.ts`,
  `apps/server/src/provider/AntigravityAuth.ts`,
  `apps/server/src/provider/Drivers/AntigravityDriver.ts`, and
  `apps/server/src/provider/antigravityRelease.ts`.
- Official registry: <https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json>.
  At inspection it lists Google LLC's proprietary Antigravity ACP 1.3.0,
  including Linux x86_64 and ARM64 archives hosted on `dl.google.com`.
- T3's documented transport runs the official ACP executable alongside its
  same-version `localharness_external` helper. Google account authentication,
  account access verification, and available model discovery go through that
  runtime. Gemini Enterprise, Gemini API key, and Vertex authentication are
  separate choices, not silent fallback methods.

Follow the upstream runtime, ACP lifecycle, sign-in, model discovery,
cancellation, and provider error handling as closely as possible. Do not
reimplement subscription inference by replaying OAuth tokens against an API.
Keep each provider profile's account isolated, and wait for account verification
before showing a successful connection. Preserve direct image input where the
runtime supports it.

Deliberate adaptations for this app:

- Run on the phone, not a remote T3 environment. Linux distributions are not
  evidence that these executables work under Android. Qualify both the ACP
  executable and helper, their loader/dependencies, temporary extraction and
  executable-file requirements, before enabling the Android provider.
- Keep retained credentials encrypted with the AndroidKeyStore-backed vault;
  do not copy T3's documented plaintext API-key settings storage. Determine
  which private temporary auth files the official runtime requires, and apply
  cleanup/backup exclusions with the same caveats as the Claude runtime.
- Enforce this app's staged world-tool permissions. Verify ACP tool approvals,
  filesystem/process access, and cancellation before allowing a turn; merely
  asking the model not to use built-in tools is insufficient.
- Review Google's published integration and distribution terms before bundling.
  The user's report of Google approval for T3's method does not establish that
  approval automatically extends to this app's Android distribution.
- If copying upstream code rather than using it as an architectural reference,
  preserve T3's MIT attribution and license in distribution notices.

No Antigravity runtime, account sign-in, Android support flag, or inference
transport has been implemented by this research update. The existing Gemini
CLI and Gemini API profiles remain distinct and unchanged.

## Claude functionality

- Add **Claude Code** in Models & agents on Android. Planning, building and map
  reasoning can select it. Existing routes remain unchanged.
- Native Claude account, Console and SSO sign-in invoke `claude auth login` with
  the corresponding official flag. Browser URLs are accepted only for exact
  Anthropic authorization origins/paths, including the CLI's current
  `claude.com/cai/oauth/authorize` endpoint. Code entry goes only to the live
  process; codes and sign-in URLs are never saved in project state.
- An optional API key is injected into the official CLI's process environment.
  It is not written into CLI configuration. A configured key takes precedence
  over the CLI account session until removed.
- The Android connection test invokes `claude auth status --json`. It checks CLI
  authentication state without starting inference. It does not establish that a
  token has not been revoked, a model is available, or paid generation succeeds.
- Headless inference uses Anthropic's `-p` and structured JSON output interface.
  `--bare` is intentionally absent: the pinned CLI says it disables OAuth reads.
  That incorrect flag was also removed from the desktop Claude adapter.
- Built-in tools, discovered MCP servers, hooks, slash commands, auto memory,
  project settings and session persistence are disabled for world tasks. The
  shared host exposes only its scoped world tools through a validated response
  envelope. Planning cannot edit; work edits remain staged for human review.
- Android and desktop reuse the same Claude argument policy, input envelope and
  response validator. Malformed, duplicate or oversized call batches fail before
  response tools are applied. Native tool dispatch checks the stage's allowlist.
- One native CLI operation runs at a time. Cancellation, bounded input/output,
  per-turn timeouts, service lifetime and cleanup preserve the existing agent
  workflow. Removing or changing the active CLI connection is blocked.

## Credentials and limitations

Retained API keys and CLI authentication snapshots use the existing
AndroidKeyStore-backed, name-bound AES-GCM vault. The Keystore holds the
non-exportable encryption key; app preferences contain ciphertext, not raw
credentials. Secrets are excluded from cloud backup and device transfer.

**The official CLI requires credential files while it runs.** The app restores
only its fixed authentication-state filenames into a private per-operation cache
directory, encrypts updated retained state, and removes the entire directory on
exit. App/host initialization removes abandoned session directories after a
crash. Android excludes cache directories from backup. This is not a claim that
the unmodified CLI never holds plaintext credentials on disk: a process crash can
leave the temporary files until the next cleanup. This tradeoff is disclosed in
the sign-in UI rather than hidden behind a “Keystore only” claim.

Raw CLI stdout/stderr is not written to persistent diagnostic logs. Keys, tokens,
sign-in codes and auth URLs are not put into world documents, chat history,
checkpoints, task routes or public release artifacts.

## Packaging and provenance

`tools/android/package_provider_runtimes.py` pins both official musl npm packages
by SHA-512 integrity, the Alpine musl package by SHA-256, and its copyright notice
by SHA-256. It validates ELF architecture and copies the executables byte-for-byte
into Android's executable native-library directory. It does not patch, strip,
instrument or emulate the CLI's inference/authentication code.

Provenance and licenses are included by `tools/release-notices.py`, which verifies
that the bundled Claude binaries match their recorded hashes. Runtime downloads
are only a build-time operation; there is no arbitrary executable installer in
the app. Per-ABI release splitting is preserved. Claude adds approximately
248–250 MB of uncompressed executable data per ABI; bundled providers are not
free in APK size. The two-ABI debug APK is approximately 672 MB. Future runtime
additions must evaluate installer/storage costs before bundling more executables.

## Remaining providers — not falsely enabled

| Provider | Current status | Qualification still needed |
| --- | --- | --- |
| Codex | Existing native app-server and dedicated image workflows | Live account/model image qualification |
| Claude Code | Native Android runtime and managed sign-in implemented; startup/login/vault tested on ARM64 phone | Completed real account sign-in/inference |
| Gemini CLI | Existing desktop adapter; Android disabled | Pinned Android-compatible Node runtime, official CLI dependencies, Google sign-in and secure token lifecycle |
| OpenCode | Existing desktop adapter; Android disabled | Official native binary/server compatibility, permitted provider auth, persisted state isolation and lifecycle |
| Cursor Agent | Official SDK Android runtime; startup/login/vault tested on both ABIs | Completed real account sign-in/inference; dependency redistribution review |
| Other model APIs | Existing explicit API connections | Official SDK adoption only where it supplies a required capability; no invented subscription support |

The remaining providers are unfinished work, not “supported” because their names
appear in the catalog. They must retain official inference transports, scoped
review, credential isolation and the same fail-closed/no-fallback behavior.

## Validation

- Typecheck and **200** Node/core/UI/desktop tests pass, including exact model
  picker rendering, catalog normalization, saved-route preservation and SDK model
  request shape. See `MODEL_SELECTION.md` for discovery and fallback behavior.
- **52** Android instrumentation tests pass on the emulator, including actual official CLI
  startup under the app UID, constrained argument acceptance, unauthenticated
  status, native browser-sign-in URL generation/cancellation, encrypted credential
  snapshot restoration, orphan removal and concurrency rejection.
- Existing desktop smoke suites pass **75** responsive layouts/workflows.
- Both ABI artifacts are checksum/ELF-validated. Runtime tests run on the x86_64
  Android 16 emulator and the attached Samsung SM_A266B ARM64 Android 16 phone.
  **14** scoped tests pass on the phone: Cursor and Claude startup/login/vault
  qualification plus model-catalog normalization. Completed live inference is
  not claimed for either additional runtime.
- No real account authorization, paid Claude inference, paid image generation,
  credential transfer or remote-world publication is used in qualification.
- A local debug APK is built and installed on the emulator and phone. No new public
  installer is uploaded by this change.

Evidence: `/tmp/voyage-provider-research/model-{tests,build,native-build,native-tests,phone-tests,electron-smoke,studio-smoke}.log`.

## Primary references

- Official CLI embedding/authentication policy:
  `https://code.claude.com/docs/en/legal-and-compliance`
- Official Java/other-language subprocess guidance:
  `https://code.claude.com/docs/en/agent-sdk/overview`
- CLI arguments: `https://code.claude.com/docs/en/cli-reference`
- Headless execution: `https://code.claude.com/docs/en/headless`
- Agent SDK authentication restrictions:
  `https://code.claude.com/docs/en/agent-sdk/overview`
- The pinned executable's own `--help`, `auth login --help` and `auth status`
  output are tested; runtime behavior is not inferred from documentation alone.
