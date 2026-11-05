# Exact model selection

Models & agents separates a provider connection from its model. Every connection
has a default text-model picker and an exact-ID input. Each stage has its own
override; an empty override inherits the connection default. Refresh models on
the connection to populate both pickers. Refresh saves the current connection
draft and supplied key, but never selects a new model or rewrites stage routes.

Before discovery, or when discovery returns an empty catalog, API text-model
pickers offer the user-supplied fallback lists for OpenAI, Claude and Grok.
These lists are labelled “Author suggestions” with unverified availability,
not advertised as account access.
OpenAI-compatible API connections use these lists only for the official
`api.openai.com` and `api.x.ai` hostnames; local/custom APIs and OpenRouter are
not assigned another provider's catalog. A nonempty discovered catalog replaces
the suggestions. Claude Code alias-only responses keep the exact-ID suggestions
alongside the CLI aliases. Nothing is selected automatically and custom IDs
remain available. These lists do not change transports or model access rights.

- Codex: asks the app-owned, signed-in app-server for `model/list`, following
  cursor pagination and using `model` as the inference identifier when present.
  Connections loads this CLI catalog automatically for saved Codex profiles;
  explicit refresh remains available. No hardcoded API-model list is offered as
  Codex availability. Discovery never saves settings or changes a selection;
  a slow initial response cannot replace a newer explicit refresh or leak into
  a connection whose provider type has changed.
  Discovered labels such as Sol/Luna come from the runtime. The live list
  is a runtime catalog, not a guarantee that a later inference request succeeds.
- Cursor on Android: uses the official SDK's `Cursor.models.list` with the
  retained encrypted user key or explicitly supplied key. Execution requires an
  exact model and passes `{id: model}` to the SDK, not a string or implicit default.
- API connections: use their existing authenticated `/models` endpoint and
  preserve provider display names and exact IDs, including Gemini's `models/`
  prefix normalization. Providers that do not expose this endpoint can still
  use exact manual IDs. API catalogs may include non-text models; access and
  suitability still require the explicit connection test.
- Claude Code: supplies documented Sonnet/Opus/Haiku CLI aliases, clearly
  labelled as aliases rather than discovered account access. An exact version ID
  can replace the alias. Subscription credentials are not replayed into REST.
- Other desktop CLI harnesses: exact-ID input remains available when catalog
  discovery is unsupported. Refresh reports that limitation rather than inventing
  a model list or silently substituting an API transport.

Saved model IDs missing from a refreshed catalog remain visible and editable.
Provider-default flags are informational; they never auto-select a model. Task
routes continue to capture the chosen model when a task starts. API artwork keeps
its separate image-model field; API text catalogs are not offered as image models.
Codex artwork instead selects a **CLI text/orchestrator model** that calls the
CLI-managed `image_gen.imagegen` tool. It is not an image-engine selector. Both
hosts retain the CLI's `inputModalities`; models explicitly lacking image input
are excluded from the artwork choices, while existing incompatible or unlisted
saved IDs remain visible with warnings rather than being silently rewritten.
CLI-supplied model availability notices are retained and displayed for explicit
and inherited choices; a listed model is still not proof of account access.
An empty override accurately displays the inherited connection model or CLI
default. Custom pins remain possible but do not establish account access.

With Codex selected for artwork, **Save & check Codex image setup (no generation)**
saves the current routes and checks CLI sign-in, provider image/namespace support,
and model metadata without starting a thread or model turn. The same preflight
runs before image requests on desktop and Android. It rejects known image-engine
IDs in the orchestrator field, text-only selections, and CLI account modes that
do not expose the bundled image tool. A successful setup check is not a live
generation, model-access, quota, or output-quality test. No API transport or
automatic retry is substituted on failure.
Changing the connection for a stage intentionally clears that stage's override,
as before. Model refresh is non-inference; API connection tests may run inference.
