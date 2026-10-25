# Agent API specification

A single-page agent contract covering access, safe mutation rules, Studio behavior, and every endpoint.

## Agent-facing contract

This is a local endpoint reference. The selected host's live OpenAPI and guide remain authoritative. The checked-in Alpha contract and guide were refreshed on October 24, 2026: see `docs/openapi.json` (`1.3.0-preview`) and `docs/voyage-agent-guide.md`. Production still reports `1.2.0-preview`; do not interchange their document layouts.

Base URL: `https://api-alpha.aidungeon.com/creator/v1`

Endpoint paths below are relative to `/creator/v1`. Use the API origin shown above, not the Voyage web origin.

Workbench currently retains its Alpha-only connection policy. The upstream guide now recommends production (`https://api.aidungeon.com/creator/v1`) by default for new integrations; this is not permission to retarget an existing Alpha world or reuse its credentials on another host. Alpha can upgrade shared drafts beyond production compatibility. Preview 1.3 keeps shared fields at the root and party-specific quests, arcs, narrative events and party state under `parties[partyId]`; preserve all parties and `triggerDefinitions`. Download a fresh document instead of reusing preview 1.2's flat layout. Never edit version fields to bypass compatibility checks.

### Authentication and access

- Create and manage keys in **Studio → Settings → API keys**.
- Send `Authorization: Bearer sk-voyage-v1-YOUR_KEY` on every authenticated request.
- Creator keys work only for their active owner. Developer accounts receive access by default; other accounts need both Creator Studio access and the Creator API rollout entitlement.
- Every world operation is owner-scoped, including for developers.
- Browser-origin requests are rejected. Use the API from a trusted server, CLI, or local development agent.

### Safe edit loop

1. List owned worlds with `GET /worlds`.
2. Download the live draft with `GET /worlds/{shortId}` and save its `ETag`.
3. Keep a local checkpoint.
4. Edit the complete `world` document while preserving `shortId` and `initialGameState`.
5. Check it with `POST /validate`.
6. Replace it with `PUT /worlds/{shortId}` and the current `If-Match` value.
7. Read the world again and verify the intended change.
8. Publish only when the creator explicitly asks.

A stale `If-Match` returns `412 revision_conflict`; re-read, reconcile, and retry. Never retry a stale full replacement blindly.

### Studio and legacy editor behavior

The API edits the same durable draft as Studio and the legacy world editor. When Studio is open, successful replacements and revision restores use its live room and broadcast changed files to connected Studio clients. The legacy editor and any surface that does not subscribe to room events must reload or reopen the world.

### Mutation safety

- Every side-effecting `POST` requires a unique `Idempotency-Key`. Reuse a key only for an exact retry of the same request.
- Pending keys and completed results remain protected for 24 hours.
- `request_in_progress` means the key is still protected; `Retry-After` is the earliest useful recheck.
- `request_status_unknown` means a durable effect may have happened. Reconcile observable world and Studio state before issuing another mutation.
- `studio_unavailable` is a clean pre-side-effect availability failure. Respect `Retry-After` and retry the unchanged request; repeated failures should be escalated with the request ID.
- `studio_version_mismatch` is not transient. Open the world in the selected environment's Studio once to confirm an upgrade, or explicitly choose a compatible environment for a newer draft. Do not automatically change hosts.
- `PUT` safety comes from `If-Match`; validation has no side effect and needs no idempotency key.
- The JSON request limit is 64 MiB.
- 480 total requests per account per minute.
- 120 mutation requests per account per minute.
- 20 costly requests per account per minute.
- 2,400 pre-auth requests per trusted client IP per minute.

World deletion, trash management, Creator Studio chat, Studio agent conversations, agent runs, cancellation, undo, and server-pushed event subscriptions are not exposed.

## Complete endpoint reference

## World lifecycle

World responses use `shortId` as the public identifier. A world download contains editable metadata plus the complete `initialGameState`.

### `GET /worlds`

Lists worlds and mods owned by the authenticated account.

| Query | Meaning |
| --- | --- |
| `page` | Zero-based page number. Defaults to `0`. |
| `type` | Optional `world` or `mod` filter. |

### `POST /worlds`

Creates a world or mod and returns `201`. Requires `Idempotency-Key`.

```json
{
  "world": {
    "title": "Clockwork Coast",
    "isMod": false,
    "visibility": "private",
    "initialGameState": {}
  }
}
```

Metadata fields are optional at creation. If you supply `initialGameState`, it must match the current Voyage schema.

### `GET /worlds/{shortId}`

Downloads the authoritative live Studio draft. Save the response `ETag`; it represents the downloaded content and metadata and is required for a later replacement or restore.

```http
GET /creator/v1/worlds/WORLD1
Authorization: Bearer YOUR_KEY
```

### `PUT /worlds/{shortId}`

Replaces the full live draft. Send the current quoted ETag in `If-Match`. This is a conditional operation rather than a patch: start from a fresh download, edit that document, then send the complete world envelope.

```http
PUT /creator/v1/worlds/WORLD1
Authorization: Bearer YOUR_KEY
If-Match: "CURRENT_ETAG"
Content-Type: application/json

{"world":{"shortId":"WORLD1","title":"Clockwork Coast","initialGameState":{}}}
```

A stale ETag returns `412 revision_conflict`. A successful replacement is durable before connected Studio clients receive the changed-file event.

### `POST /worlds/{shortId}/duplicate`

Flushes the live Studio draft, then duplicates the owned world. Requires `Idempotency-Key`. The response identifies the new world.

### `POST /validate`

Validates a GameState without changing a world. This endpoint does not require an idempotency key because it has no side effect.

```json
{
  "stage": "draft",
  "world": {
    "initialGameState": {}
  }
}
```

`stage` is `draft` or `publish`. Publish validation applies the stricter rules required before publication.

## Immutable saved history

Revision IDs are opaque identifiers for immutable recovery copies. Revision downloads contain historical GameState, not historical world-row metadata.

### `GET /worlds/{shortId}/revisions`

Lists available saved draft revisions from oldest to newest. Each entry contains an opaque revision ID and creation time.

### `GET /worlds/{shortId}/revisions/{revisionId}`

Downloads one historical GameState after converting it through the current schema boundary. Generated embeddings are removed just as they are from a live world download.

### `POST /worlds/{shortId}/revisions/{revisionId}/restore`

Restores historical GameState through the normal live-room save funnel. Requires both the current `If-Match` value and an `Idempotency-Key`.

```http
POST /creator/v1/worlds/WORLD1/revisions/REVISION_ID/restore
Authorization: Bearer YOUR_KEY
If-Match: "CURRENT_ETAG"
Idempotency-Key: restore-WORLD1-REVISION_ID-1
```

Restore is forward-only:

- It appends a new durable head save and immutable recovery revision.
- It does not rewrite or delete the selected historical revision.
- It does not delete the state that was current before the restore.
- It preserves current world metadata because historical metadata is not stored in the revision patch.
- It updates connected Studio clients through the live room.

Even when the selected historical content already matches the live content, the deliberate restore still checkpoints a new durable revision. A stale `If-Match` returns `412 revision_conflict`.

## Publication

Publication operations use the same owned world and live Studio draft. Side-effecting POSTs require `Idempotency-Key`.

### `POST /worlds/{shortId}/publish`

Validates and publishes the live Studio world. The API reports success only after the durable publication mutation and live Studio room metadata have converged.

If the durable state may have changed but room convergence cannot be confirmed, the API returns `503 request_status_unknown`. Do not immediately issue a new mutation with a new key. Reload the world and Studio state, determine whether publication completed, then decide the next action.

### `POST /worlds/{shortId}/unpublish`

Unpublishes the world while retaining its draft. It has the same convergence and unknown-outcome rules as publish.

## Moderation

### `GET /worlds/{shortId}/moderation`

Reads the current Studio moderation result for the owned world.

### `POST /worlds/{shortId}/moderation`

Runs Studio world moderation. Requires `Idempotency-Key`.

```json
{
  "forceFullCheck": false
}
```

`forceFullCheck` is optional and defaults to `false`. Moderation may first flush a pending live Studio checkpoint so it evaluates the authoritative draft.

## Mods

### `GET /mods`

Lists the mod sets used by Studio: owned, bookmarked, pending, and remix-source mods.

| Query | Meaning |
| --- | --- |
| `pendingModShortId` | Repeatable values identifying pending mods to include. |
| `remixSourceShortId` | Optional remix source world used to resolve compatible mods. |

The endpoint is read-only and does not attach or apply a mod to a world.

## Creator Studio AI usage

### `GET /usage`

Returns the authenticated account's current Creator Studio AI usage and limits. It is informational; the Creator API does not expose Studio chat or agent-run operations.

## Upload workflow

Media responses return URLs or media records; they do not edit the world. Put the returned URL into a fresh world download and use the conditional replacement flow.

### `POST /uploads`

Creates a direct image-upload allowance. Requires `Idempotency-Key`.

```json
{
  "target": "WORLD_COVER",
  "width": 1000,
  "height": 1000,
  "mimeType": "image/png"
}
```

Supported types are PNG, JPEG/JPG, and WebP. All image files are limited to 5 MiB. `WORLD_COVER` accepts any positive dimensions; gameplay targets require at least 600×600. The response contains a signed upload URL, upload ID and expiry. PUT the raw bytes to that URL with the matching Content-Type before expiry and before moderation. Consult OpenAPI's `x-media-constraints` for the selected host's current rules.

### `POST /worlds/{shortId}/uploads/{uploadId}/moderate`

Moderates a completed direct upload for its intended use. Requires `Idempotency-Key`.

```json
{
  "target": "NPC_PORTRAIT"
}
```

`target` is `WORLD_COVER`, `AREA_IMAGE`, `ITEM_IMAGE`, `LOCATION_IMAGE`, `NPC_PORTRAIT`, or `REGION_MAP_IMAGE`, matching the allowance. Set the returned canonical `imageUrl` on the appropriate field (`world.image` for a cover), then conditionally save the world; moderation does not save or publish it. `422 studio_media_failed` is a settled image rejection: fix the image and use a new upload. `DELETE /uploads/{uploadId}` cleans up rejected or unmoderated objects; successfully moderated images cannot be deleted through that endpoint.

## Generated images

Every generation endpoint requires `Idempotency-Key`. Shared optional fields include `excludedUrls`, `imageModelSource`, and `imagePromptConfiguration`.

### `POST /worlds/{shortId}/images/area`

Generates an area image from optional area, location, region, world-background, and prompt context.

### `POST /worlds/{shortId}/images/location`

Generates a location image from optional location, region, world-background, and prompt context.

### `POST /worlds/{shortId}/images/npc`

Generates an NPC portrait. `npcName` and `npcType` are required; optional fields include basic info, gender, visual description, and portrait prompt.

```json
{
  "npcName": "Mara Venn",
  "npcType": "Human",
  "visualDescription": "A weathered harbor pilot in a brass-button coat"
}
```

### `POST /worlds/{shortId}/images/region-map`

Generates a region map from optional realm, region, coordinate, size, location, surrounding-region, world-background, and prompt context.

## Contract endpoints

These endpoints are unauthenticated representations of the current API contract.

### `GET /openapi.json`

Returns the OpenAPI 3.1 description used as the canonical machine-readable list of paths, parameters, request schemas, and response statuses.

### `GET /agent-guide.md`

Returns the compact agent workflow and safety policy as Markdown.

## Shared headers

| Header | Used for |
| --- | --- |
| `Authorization: Bearer <key>` | Every authenticated operation. |
| `Content-Type: application/json` | Requests with JSON bodies. |
| `If-Match: "<etag>"` | Full world replacement and revision restore. |
| `Idempotency-Key: <unique value>` | Side-effecting POST requests. |

## Error envelope

```json
{
  "error": {
    "code": "revision_conflict",
    "message": "World changed since it was downloaded."
  },
  "requestId": "..."
}
```

Use `requestId` when correlating a failed request with server logs.

## Retry and outcome rules

- `400` means the request shape or content was rejected.
- `401` or `403` means the key or account lacks access.
- `404` does not reveal worlds or revisions outside the authenticated owner scope.
- `412 revision_conflict` means re-read and reconcile before trying again.
- `428 revision_required` means a required `If-Match` header is absent.
- `429` includes rate-limit or retry guidance.
- `request_in_progress` means the key is still protected; `Retry-After` is the earliest useful time to check the identical request again.
- `request_status_unknown` means a durable effect may have happened. Reconcile observable state before any new mutation.

Only errors explicitly proven to occur before side effects release a pending idempotency key. Unmarked errors, server failures, and unknown outcomes keep the key pending so an automatic retry cannot duplicate a mutation.
