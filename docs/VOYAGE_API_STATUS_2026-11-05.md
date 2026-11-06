# Voyage API and version compatibility — November 5, 2026

Implementation follow-up: the shared desktop/Android app now has explicit
Production opt-in, public contract refresh, compatibility status, scoped release
advisories, revision-aware reference caching and party-aware artwork assignment.
See [Maintaining Voyage compatibility](VOYAGE_UPDATES.md). The findings below
describe the pre-follow-up investigation; they are retained as historical
evidence, not a claim that Production is still blocked in the shared app.

## Summary

The official Creator API is deployed on the production host. Its live contract
explicitly recommends production for creating, editing, validating and publishing
production worlds. The API itself is still labelled `1.3.0-preview`; production
deployment is not a promise of universal account access or a stable API contract.

Workbench currently prevents production connections in desktop, Android and the
legacy Python host. Those restrictions are local product policy, not evidence
that Voyage lacks a production API. This investigation changes no connections,
credentials, worlds, reference caches or runtime defaults.

## Evidence and scope

Retrieved without credentials at approximately 18:00–18:07 UTC on November 5,
2026, using direct HTTPS requests to official Latitude endpoints:

- Production contract: <https://api.aidungeon.com/creator/v1/openapi.json>
- Production guide: <https://api.aidungeon.com/creator/v1/agent-guide.md>
- Alpha contract: <https://api-alpha.aidungeon.com/creator/v1/openapi.json>
- Alpha guide: <https://api-alpha.aidungeon.com/creator/v1/agent-guide.md>
- Requested announcement: <https://alpha.voyage.io/whats-new/patch/announcement%3Accd856e0-53fd-4a6c-8a63-76a34d24f79c>

All four documentation requests returned HTTP 200. An unauthenticated
`GET /creator/v1/worlds?page=0` returned HTTP 401 with code `unauthenticated`
on each API host. This establishes deployed documentation and an authenticated
route, not successful access for this user's account.

The alpha announcement returned a client-rendered shell, not its announcement
body. Its own read-only `GetWhatsNewEntry` GraphQL query returned
`UNAUTHENTICATED`. The production counterpart did not supply the announcement
either. Consequently the exact announcement text, date, exposed sub-version
labels and values have **not** been verified. No login credentials or stored
Workbench secrets were read. No world writes, validation POSTs, uploads, paid
generation, moderation or publication were attempted.

After that network investigation, the creator supplied the announcement text
directly in this conversation. The follow-up assessment below uses that text as
user-supplied release evidence, not as a successful authenticated retrieval.
It confirms the described Studio status/compatibility UI but supplies no JSON
field names, engine/schema version values or discovery API contract.

Raw fetched files and response headers are in
`/tmp/voyage-live-check-2026-11-05/` on the investigating machine. That temporary
directory is not a durable repository artifact. Upstream response SHA-256 hashes:

| Response | Bytes | SHA-256 |
| --- | ---: | --- |
| Production OpenAPI | 32210 | `2e002a431201777891dcd8eff01129613b14940e4c1d77af4a7b13efe8258340` |
| Alpha OpenAPI | 32268 | `22dd8eaa7a33665bd9e81f7c18928106aacf90357fdf29a62e7d93f11a8fced7` |
| Production guide | 13104 | `4ac7b4e473bec8309e12ccb342c1b0a03f74d4b2abc716c56a06819257e57397` |
| Alpha guide | 13104 | `4ac7b4e473bec8309e12ccb342c1b0a03f74d4b2abc716c56a06819257e57397` |

## Production versus alpha

Both live contracts advertise `1.3.0-preview`, the same 24 path templates and
27 HTTP operations. Recursive JSON comparison found only these differences:

| Contract value | Production | Alpha |
| --- | --- | --- |
| `x-media-constraints.targets.WORLD_COVER.recommendedWidth` | 1000 | 1280 |
| `x-media-constraints.targets.WORLD_COVER.recommendedHeight` | 1000 | 720 |
| `x-creator-studio-action-coverage.media.creator_studio_generate_music` | Absent | `{"excluded":"studio_only"}` |

There are no differences in published paths, request/response schemas, security
definitions or documented operation statuses in these two responses. This is
contract parity, not proof of identical rollout flags, runtime builds or schema
compatibility. An unchanged OpenAPI version also does not imply an unchanged
contract: these two distinct responses have the same API version string.

The cover sizes are recommendations, not mandatory aspect ratios. Both
contracts allow any positive cover dimensions and permit the same image MIME
types and 5 MiB upload cap. Gameplay image targets still require at least
600 × 600 pixels. Both guides are byte-identical and still recommend a square
1000 × 1000 cover, so alpha's guide currently disagrees with alpha's machine-readable
recommendation. The guide identifies `x-media-constraints` as the programmatic
source of upload rules.

Alpha's music coverage annotation does not add a music generation endpoint.
Direct music upload/finalization exists on both hosts; Creator API music
generation is not exposed. The four documented generation operations are for
area images, location images, NPC portraits and region maps. Direct image uploads
also support world covers and item images.

Both guides require an active, eligible account, a current key in the selected
environment's Player API key store and appropriate scopes. The account must be a
developer or retain both Creator Studio and Creator API rollout access. World
operations remain owner-only. API-generated media requires a paid Voyage plan;
direct uploads have separate eligibility/limits.

Production world work must remain on the production host throughout. Alpha/Beta
can upgrade shared drafts beyond production's supported Voyage version or
compatibility revision. Publication is not a downgrade operation. Never retry a
mutation on another host, edit version metadata to force compatibility, or
silently repoint an existing project.

## API version is not a world or engine version

Keep these concepts separate:

- **API contract version:** presently `1.3.0-preview` on both checked hosts.
- **Authored world version:** existing documents use `heroesVersion`.
- **Compatibility revision:** existing documents can carry
  `compatibilityRevision`; the official guide explicitly warns that revisions
  can differ across environments even when an API is available on both.
- **Engine/schema sub-version display:** the supplied announcement confirms that
  Studio's new status chip displays its engine version and can show whether every
  Voyage version can play the latest edits. It does not name a separate schema
  sub-version, serialized field or machine-readable capability endpoint. Do not
  assume it is identical to `compatibilityRevision`, or invent a dotted version
  format, upgrade rule or new authored field. The release label `Voyage 2.55.0`
  is not evidence that an authored `heroesVersion` should become `2.55.0`.

Neither checked OpenAPI document defines a typed world codec or a dedicated
engine-version discovery endpoint. `initialGameState` allows additional
properties. OpenAPI request compatibility alone therefore cannot establish that
two environments accept the same authored world schema.

Both live OpenAPI documents describe canonical authored state as shared fields
at the root with party fields under `parties[partyId]`, and historical flat
uploads converted at the request import boundary. This deserves a separate
layout audit: do not infer which registries moved or automatically relocate
fields without representative canonical exports. The guide's flat item-image
example is not a complete party-layout specification.

## Workbench findings

1. **Production is explicitly disabled.** `hosts/desktop/service.ts:20` and
   `android/app/src/main/java/dev/voyage/workbench/Host.java:6` always select
   alpha; their API-base functions reject production. `workbench/voyage.py:42`
   rejects it too. Merely changing a URL would bypass intentional safety policy.
2. **Existing docs already know about production.** The live production contract
   is structurally identical to checked-in `docs/openapi.json`, and the live
   production guide is byte-identical to `docs/voyage-agent-guide.md`. Production
   support is unfinished integration work, not a newly discovered endpoint.
   The captured October 29 alpha contract no longer equals today's alpha.
3. **Reference selection is major-only.**
   `packages/core/document.ts:5` selects from `heroesVersion` alone.
   `packages/core/references.ts:74` merges by `schemaVersion`, and
   `packages/core/references.ts:85` selects by that value. Two reference sets for
   different revisions/environments of the same major cannot safely coexist
   under this scheme; a refresh can replace the other set.
4. **Some version safeguards already exist.**
   `packages/core/document.ts:79` protects `heroesVersion` and
   `compatibilityRevision` in linked-world edits. The shared API failure guidance
   handles `studio_version_mismatch` without host fallback or metadata tampering.
   These safeguards should remain, not be replaced by a version-number override.
5. **Artwork recommendations are global.** `packages/core/artwork.ts:5` uses
   a square 1000 × 1000 world-cover recommendation for all environments. It
   remains upload-valid under both fetched contracts, but does not reflect the
   new alpha recommendation. Avoid treating this as an upload rejection rule.
6. **Canonical party layouts need targeted fixtures.** Existing envelope lookup
   finds `initialGameState`, but artwork categorization and missing-artwork
   destinations assume registries at that root. Inspect representative exports
   before asserting party-local character/location image support. Preserve full
   paths and explicit party identity rather than flattening or guessing them.

## Recommended implementation order

1. **Production connections with isolation.** Add explicit environment selection
   across supported hosts. Use separate keys, fetch the selected host's contract
   and guide, preserve existing alpha selections/links, bind validation and
   uploads to the selected environment, and keep all writes conditional. Add
   host/credential/link regression tests before allowing production operations.
2. **Composite compatibility identity.** After obtaining authoritative metadata,
   cache references by environment, authored version, verified compatibility
   revision and any separately exposed schema/engine identifiers. Retain source,
   retrieval time and content hashes. Preserve unknown fields verbatim and mark
   incomplete compatibility evidence unknown rather than falling back across
   revisions. Do not force engine and schema identifiers into one guessed field.
3. **Canonical layout and artwork audit.** Obtain paired flat/canonical exports
   and verify party-local versus shared paths. Exercise character/image
   attachment, navigation, durable reload, remote conditional save and read-back
   for each supported shape. Treat this as separate from image generation.
4. **Environment-aware media guidance.** Read recommendations from the selected
   contract, show the requested art target and destination, and distinguish local
   generation, local attachment, upload/moderation, draft save and publication.
   A selected preview or moderated URL is not a persisted remote attachment.
5. **Bounded live acceptance.** With an eligible environment-specific key, first
   perform read-only access checks. Test validation and then approved mutations
   only on an explicitly selected disposable world. Do not claim production
   upload, save or publish success from documentation or local test results.

## Follow-up: supplied Voyage 2.55.0 announcement

The supplied text explains several changes relevant to Workbench. These notes
were supplied for alpha; they do not independently establish production rollout
for each feature, nor add Creator API endpoints beyond the fetched contract.

### Changes that affect authoring or validation

- **Resource descriptions and multiple resource boosts per attribute.** Our
  October 29 V37 codec's `resourceSettings` has no resource-description field,
  and its `attributeSettings.attributeStatModifiers` maps each attribute to one
  object containing `variable` and `amount`, not a verified multi-boost shape.
  This is concrete evidence that the bundled codec cannot fully describe the
  announced features. Obtain a current codec/export before building controls or
  converting objects to arrays. Preserve unfamiliar fields and do not remove
  them to satisfy an older reference.
- **Item catalog increases from 250,000 to 350,000 characters.** Record this as
  an announcement-derived authored catalog limit for the applicable release,
  not a runtime 1.5× multiplier or universal limit for every cached schema. The
  current shared validator checks cached types and does not implement this
  publish limit. Verify the upstream counting/serialization convention and
  environment before presenting an exact local character-budget blocker.
- **Item Media Content is limited to 4,000 characters.** The captured codec has
  `itemTypes` entries with `mediaContent` typed as a plain string, without this
  cap. The release text says oversized content prevents publication while
  existing worlds continue working. A future local rule should therefore be
  stage/environment-aware: explain the publish blocker without refusing to
  load, truncating content or claiming a legacy save is invalid. Boundary tests
  should cover the upstream-defined 4,000-character counting convention.
- **Unpublishable covers must be replaced or removed before publishing.** Keep
  safety/moderation evidence distinct from artistic quality and source fidelity.
  A passing art review must never override a server moderation rejection; a
  changed cover invalidates evidence bound to its previous bytes/URL. The
  announcement does not establish a new endpoint for this check.

### Changes that affect artwork and usability

- **Generated Studio covers become widescreen to avoid cropping.** This explains
  the live alpha contract's 1280 × 720 recommendation. Workbench should preview
  the cover in its destination frame and use environment-aware recommendations;
  do not silently crop existing images or treat square covers as upload-invalid.
- **Qwen Image 3 speed and retired GPT Image 2 Low/Medium options are Voyage
  service changes.** They do not establish Codex CLI model IDs, capabilities or
  image-generation commands. The Workbench Codex model picker uses its CLI's
  discovered catalog; do not inject Voyage's display names into it or substitute
  a direct OpenAI API for the user's CLI workflow.
- **Image loading and hidden portrait animation improvements are UI guidance.**
  Thumbnail/full-size inspection, visible generation state and persistent asset
  association remain independent Workbench responsibilities. An upstream image
  delivery optimization does not repair our local attachment/save path.
- **Studio's status chip separates persistence from compatibility.** Workbench
  should distinguish unsaved form/editor changes, durable local save, pending
  Voyage upload/save and confirmed remote read-back. Offline or locally saved
  must not appear as remotely synchronized. A separate compatibility detail
  panel should show environment, known authored/compatibility metadata, cached
  reference provenance and the age/unknown status of compatibility evidence.
  Do not promise the exact engine build until a verified source provides it.

### Changes that do not establish new creator tools

- **Realm/travel-point map navigation** describes the player map and an action
  shortcut. It does not specify new authored travel-point fields or a map
  generation API. Map authoring should still plan realms, cross-realm links,
  reachable destinations and images, and clearly separate viewing another
  realm from actually moving a party.
- **Save-copy, paragraph actions/reactions and Creative Mode undo** are player
  workflows. They are not evidence that Creator API world duplication/history
  endpoints can duplicate live saves or undo player turns.
- **Trash retention and deletion** are service lifecycle/UI changes. The fetched
  Creator API still does not expose world deletion or trash management. Do not
  add a guessed deletion endpoint or model Studio's undo as a supported API.
- **Legacy editor removal** means future integration guidance should point to
  Studio, not propose restoring the old editor. The existing official agent
  guide already points production users at Studio.

The highest-value new prerequisites are a current resource/attribute codec,
representative exports showing the compatibility metadata and party layout,
and verified release-specific publish limits. The supplied prose is enough to
plan these changes, but not enough to invent serialized fields or certify
production parity. No runtime code was changed or production enabled as part
of this investigation.
