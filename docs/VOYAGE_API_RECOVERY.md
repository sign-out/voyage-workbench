# Voyage API recovery

Public Alpha and production contracts were checked on October 24, 2026. Alpha reports `1.3.0-preview`; production reports `1.2.0-preview`. `openapi.json` and `voyage-agent-guide.md` in this directory snapshot the currently selected Alpha host. Workbench does not silently switch hosts or retarget existing world links. Production support remains disabled in the current host policy despite upstream availability.

## Reads versus writes

Settings includes **Assistant recovery**, enabled by default with **3 corrective
attempts per task** (configurable from 1 to 10). This lets the assistant inspect
and correct recoverable local tool failures or malformed grading/field-fill
responses within its existing permissions.
The initial failed action is not a corrective attempt; successful calls do not
reset the task's budget. Preferences are device-local and affect new tasks.
Additional assistant calls may consume provider credits.

### Incremental local section recovery

Work assistants now have `world_checkpoint`: after editing one section (or an
approved atomic dependency group), they validate it and save its exact staged
source as a local History entry before continuing. Checkpoint receipts and source
are committed in the same database transaction on desktop and Android. Duplicate
requests do not create extra history entries. These snapshots can be restored as
reviewable proposals; they never overwrite the active world without review.

New local validation errors reject the checkpoint with the suspect changed group,
issue paths, and last successful section. Existing imported errors are counted
separately, not misreported as newly introduced. The failed staged draft remains
available for correction; successful groups need not be repeated. Checkpoint
failures use the same task-total assistant recovery budget. Read-only
`world_validate` still returns diagnostic data without consuming that budget.

These checks use bundled local reference validation, not an authenticated Voyage
save. A failure after a section identifies a suspect change boundary, not proof
that every cause is inside that section. Dependencies must stay within approved
scope and be checkpointed together. Final local application retains the existing
draft/concurrency/validation gates. Remote saves, revision restores, publication,
uploads, and provider charges are not rolled back by local History.

This is separate from the bounded HTTP read retries below. It does not grant the
assistant permission to publish, upload, generate paid images, or replay a Voyage
write, and it does not retry failed provider connections. Remote failures still
follow the inspection, cooldown, exact-request and unknown-outcome rules here.

- World lists, downloads and other GETs retry temporary connection failures, HTTP 408/429 and transient 500/502/503/504 responses up to three attempts within one 45-second budget.
- A server `Retry-After` cooldown is honored, including strictly validated HTTP dates. Automatic waits are limited to five seconds per delay; a longer or malformed cooldown stops the operation and provides guidance instead of retrying early or freezing the UI. A 429 without a cooldown also stops rather than guessing a daily-limit reset. Other transient failures without a cooldown use 500/1000 ms backoff.
- Authentication, ownership, validation, revision conflicts and schema-version mismatches are not retried automatically. Neither are `request_in_progress` or `request_status_unknown` responses.
- POST, PUT and signed media uploads are never automatically replayed by this transport. Mutation recovery retains the existing operation journal and exact request key. Validation POSTs also remain explicitly initiated.

## Fix paths

| Problem | Recovery |
| --- | --- |
| Expired or wrong key | Reconnect the selected environment's Creator API key in Connections. Check ownership, scopes and rollout access for a 403. |
| Rate limit | Wait for the supplied cooldown or daily-limit reset. Retry the unchanged request; never use new keys to bypass a limit. |
| `studio_unavailable` | Clean rejection before side effects. Retry unchanged after the cooldown. Contact Voyage support with the request ID if it persists. |
| `studio_version_mismatch` | Open the world in the selected Studio to confirm an upgrade, or explicitly choose a compatible environment for a newer draft. Never patch version fields. |
| Revision conflict | Download the latest world as a proposal, review/merge it, then save with the new revision. Do not blindly replay the old replacement. |
| Lost response / unknown write | Use **Reconcile save** or the recorded publication operation. Acknowledged writes with failed read-back remain uncertain, not rejected. |
| Image PUT outcome unknown | Resume the existing upload; moderation checks the original upload ID. Do not request another allowance while unresolved. |

Errors preserve the server's sanitized request ID and cooldown in their displayed message, including across native bridges. Local editing remains available when Voyage is unavailable.

The **Publication journal** separates **Inspect remote state** (GET only), **Retry exact request** (the original payload/key, guarded by source/world/revision/host and cooldown), and **Finish acknowledged action** (read-back/linking only, never a second POST). Clean rejections are distinct from unknown outcomes. Durable compare-and-swap reservations prevent concurrent callers from replacing another operation's journal receipt. Expired or unbound legacy unknown operations stay blocking rather than silently getting a new key.

World saving and publication require official `valid: true` validation with an empty `errors` array. A generic `success` flag, contradictory errors, or an incomplete validation response never authorizes a write.

## Current upload contract

`WORLD_COVER` is supported alongside gameplay image targets. Covers accept any positive dimensions (1000×1000 recommended); gameplay images require at least 600×600. Every image is limited to 5 MiB. Workbench additionally retains its local 64-megapixel decoding safety limit. Moderation returns an image URL, not a saved/published world: assign it locally, review and save the world separately.

The regression fixtures use synthetic keys and responses. They do not spend account quota, upload media, publish worlds, or establish live authenticated acceptance.
