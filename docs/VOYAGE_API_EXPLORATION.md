# Voyage API exploration

## Authenticated follow-up

On October 24, 2026, a separate user-supplied test key authorized a bounded Alpha
pass. Ten requests returned HTTP 200: usage; owned-world pages 0 and 1; owned mod
filter; available mods; one owned-world download; its revision list; its existing
moderation result; and draft and publish validation of that unchanged downloaded
world. Both validation responses matched the documented shape and reported
`valid: true`, zero errors, and zero warnings. The world download supplied an
ETag, and all ten responses supplied request-ID headers.

No remote world writes, restores, publication, upload reservations, media PUTs,
image generation, or automatic retries were sent. No cooldown was forced. A
revision download was not dispatched because this pass did not identify a
supported revision identifier safely; revision download/restore remains
unverified. Production was not tested with the Alpha key. This is not complete
authenticated coverage and does not establish full remote rollback.

The test runner logs statuses, booleans and counts only, not credentials, world
contents, titles, identifiers, or raw errors. The redacted result is stored in
ignored `.build-tools/voyage-api-authenticated.json`. The supplied key was used
in memory, not added to app settings or repository files. Revoke a test key after
testing, especially if it was pasted into chat.

For future native runs using an app-stored key, first run `npm run build`, then:

```sh
env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/electron tools/voyage-api-authenticated.cjs --profile /absolute/path/to/app-profile
```

This reads only `credentials.bin` using the app's secure storage, never ChatGPT
cookies or provider profiles. It requires the original unlocked desktop session;
session-only keys cannot be recovered from a closed app. The runner stops on
authentication, access, throttling, server or response failures without replay.
Its synthetic safety checks run with
`node --test tools/voyage-api-authenticated.test.cjs`.

## Initial unauthenticated pass

Checked October 24, 2026, against the public Alpha and production Creator API.
This is a bounded, unauthenticated exploration, not a security audit or proof
that undocumented routes do not exist. No credentials, owned worlds, paid calls,
upload reservations, or mutations were used.

## Evidence and scope

Sixteen requests: on each host, GET the OpenAPI document, agent guide, usage,
world list, and mod list; OPTIONS the world list; GET the OpenAPI document with
an `Origin` header; and GET one deliberately nonexistent control route.
Redirects were disabled; each request had a 15-second timeout. No endpoint
enumeration, identifier guessing, authentication bypass, or rate-limit stress
testing was performed.

Sources are `/creator/v1/openapi.json` and `/creator/v1/agent-guide.md` on
`api-alpha.aidungeon.com` and `api.aidungeon.com`. Raw observations and downloaded
contracts from this run are local, ignored investigation artifacts:

- `.build-tools/voyage-api-exploration.json`
- `.build-tools/api-explore-api-alpha.aidungeon.com.json`
- `.build-tools/api-explore-api.aidungeon.com.json`

## Less-obvious capabilities, not hidden endpoints

Both contracts expose the same path set. Alpha identifies itself as
`1.3.0-preview`; production as `1.2.0-preview`. Identical route names do not
establish compatible world schemas or equivalent capabilities.

- `x-creator-studio-action-coverage` maps Studio action names to public REST
  operations and explicitly marks exclusions. Chat, conversation management,
  agent cancellation, and streaming are excluded. Alpha also explicitly excludes
  entity-wand inspect/complete/undo actions. These names are metadata, not callable
  public routes.
- Item image generation is explicitly Studio-only, although item image uploads
  are supported. Do not infer an `/images/item` endpoint from other image routes.
- `x-media-constraints` supplies per-target dimensions and MIME/size limits.
  Alpha includes `WORLD_COVER`; production's downloaded contract does not.
- `PATCH /worlds/{shortId}/order` reorders existing object keys without replacing
  values. It requires `If-Match`; unlisted keys retain relative order. This is a
  conditional mutation, not a read-only formatting operation.
- Revision listing is oldest-first and shared across environments. A listed
  revision may still be incompatible with the selected host when downloaded.
- `/mods` accepts pending-mod IDs and a remix-source ID, beyond a plain mod list.
- Image request metadata includes `excludedUrls`, `imageModelSource`, and
  per-entity `imagePromptConfiguration`. Supported model values and actual
  provider behavior were not verified; do not expose arbitrary guessed values.

These are documented but easy-to-miss features. No working undocumented endpoint
was established by this exploration.

## Confirmed behavior and contract gaps

1. **Origin rejection also applies to public documentation.** Both normal
   documentation GETs returned 200. Adding `Origin: https://example.invalid` to
   the OpenAPI GET returned 403 `browser_origin_forbidden` on both hosts. Fetch
   discovery through the native host, not renderer fetch. The guide warns against
   Origin generally, but “public documentation” must not be read as CORS-enabled.
2. **Authentication masks route existence.** Usage, worlds, mods, OPTIONS worlds,
   and the deliberately nonexistent route all returned 401 `unauthenticated`.
   A 401 is not evidence that a guessed endpoint exists. OPTIONS cannot be used
   anonymously as a route/capability discovery mechanism.
3. **Error response coverage is incomplete.** Each contract has 25 operations
   declaring security but omitting a 401 response. Runtime errors did consistently
   include `error.code`, `error.message`, body `requestId`, and matching
   `x-request-id`. Clients must handle the shared error envelope even where an
   operation does not enumerate that status.
4. **Most success shapes are not machine-described.** Each contract has 21 2xx
   responses without a `content` entry, including world downloads, revision
   reads, usage, mods, and image generation. Some component schemas exist but
   are not attached to those responses. This is a contract-completeness issue,
   not a verified server defect. Generated clients cannot establish those shapes
   from the operation definition alone; preserve defensive parsing and fixtures.
5. **Discovery responses were not cacheable.** Observed responses used
   `Cache-Control: no-store`; documentation GETs supplied no ETag. Fetch once per
   explicit discovery/check rather than repeatedly polling public documentation.

## What remains unverified

Authenticated pagination and response shapes, actual quota/cooldown headers,
revision restoration, publication convergence, image model selection, upload
expiry/replay behavior, and undocumented authenticated capabilities require a
separate authorized test pass. No findings here justify weakening journals,
replaying writes, changing environment bindings, or enabling excluded Studio
operations. No server-side vulnerability was demonstrated.

Recommended upstream fixes: attach concrete success schemas, document common
401/403 responses and Origin behavior, and provide model capability metadata
before clients offer model selection. Continue fetching each environment's own
contract rather than assuming Alpha and production are interchangeable.
