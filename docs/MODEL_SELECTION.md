# Exact model selection

Models & agents separates a provider connection from its model. Every connection
has a default text-model picker and an exact-ID input. Each stage has its own
override; an empty override inherits the connection default. Refresh models on
the connection to populate both pickers. Refresh saves the current connection
draft and supplied key, but never selects a new model or rewrites stage routes.

Before discovery, or when discovery returns an empty catalog, both text-model
pickers offer the user-supplied fallback lists for OpenAI/Codex, Claude and Grok.
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
routes continue to capture the chosen model when a task starts. Artwork keeps
its separate image-model field; text catalogs are not offered as image models.
Changing the connection for a stage intentionally clears that stage's override,
as before. Model refresh is non-inference; API connection tests may run inference.
