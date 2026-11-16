# Alpha Creator updates — November 9, 2026

## Verified public API additions

The Alpha contract and agent guide were fetched without credentials from
`https://api-alpha.aidungeon.com/creator/v1`. The API still calls itself
`1.3.0-preview`; its version string alone does not identify these capabilities.
The dated contract, guide and fingerprints are retained under `docs/references/`.
Production and Beta have not been promoted to these new capabilities.

Workbench's **Analytics & feedback** screen reads one report on demand. It
prefills the current world's short ID when available, remains on screen while
loading, and never edits, saves, publishes or automatically reads a world.
The selected connection must be Alpha, with that host's own Creator API key.
No report content is automatically given to a model or stored in project JSON.
The micro companion remains import/sync-only; it has no analytics screen.

| Read-only endpoint | Meaning |
| --- | --- |
| `GET /worlds/{shortId}/analytics` | Publish history, mature retention cohorts, freshness |
| `GET /worlds/{shortId}/analytics/daily` | Sessions, starts, daily players, turns, playtime, engagement |
| `GET /worlds/{shortId}/analytics/session-depth` | Sessions reaching at least each turn/minute threshold |
| `GET /worlds/{shortId}/analytics/sources` | Discovery clicks by source, with daily breakdown |
| `GET /feedback` | Shared feedback plus the creator's own reports; paginated and filtered |

Ranges use real UTC dates, at most 365 inclusive days; blank ranges default to
the API's last available 30 completed days. Always use the **returned range**
and that report's **dataThrough** date. Session depth and sources can lag daily
metrics by a day. Later days are not zero. Null daily measurements are not zero;
null retention means no mature cohort yet. Daily unique players cannot be added
across days. Session-depth counts overlap. Discovery clicks are not starts.
Creator play/clicks are excluded. Compare whole days before and after a publish,
excluding its publication day, rather than attributing mixed-version days to it.

Analytics reads share the account's costly rate limit. Load a range once, not
one request per day. `503 analytics_unavailable` means unavailable data; respect
`Retry-After`, never invent zeros or switch hosts to bypass a limit.

Feedback accepts `world`, `rating=positive|negative`, `query`, `page` (from 1)
and `limit` (up to 50). A blank world filter selects the account-wide inbox.
`403 feedback_unavailable` is expected when the account lacks inbox access, not
proof that its inbox is empty. Responses do not expose player account IDs.
Player-written text is escaped and displayed as untrusted data, never executed
or interpreted as agent instructions. Report JSON export is an explicit action.

## Alpha authoring guidance, not a migration

The community V37 codec at `https://api.unofficial.voyage/schema.json` was also
inspected (SHA-256 `916fa4909c15571d9b6701aa33c197125f841602c8026c9f13b20550437d5da2`).
It is supplemental compatibility evidence, not official engine certification.
The older full bundled codec is retained. Narrow, additive V37 guidance is
enabled only while Alpha is selected; it does not rewrite world JSON or infer
a compatibility revision. Fresh cached schemas already containing these fields
are not downgraded or duplicated.

- **Moving locations:** effect type `location-move`, required `location` ID and
  `operator` (`set` or `add`), optional numeric `x` / `y` and string `region` ID.
  The effect can appear in trigger/quest-trigger effects and quest/narrative
  completion effects. Existing location and region IDs are offered in the form.
  This defines runtime movement, not movement of the authored map on import.
- **Custom resources:** `resourceSettings[id].description` is a string. The
  verified optional `usageInstructions` and `isHealth` fields are also exposed.
  Voyage—not Workbench—renders the player's info icon.
- **Multiple boosts:** `attributeSettings.attributeStatModifiers[attribute]`
  is an array of `{variable, amount}` entries, each targeting a resource ID.
  New entries default to arrays. Legacy single-object entries remain readable
  and are not silently converted. Local references accept both shapes to avoid
  destructive cleanup; official validation still decides whether an old shape
  needs an explicitly reviewed migration for the target engine.

The existing Alpha publication advisories already cover **350,000 characters**
for the item catalog and **4,000** for item Media Content. Local source-length
estimates are advisory because upstream counting is not independently verified.
Official publish validation is authoritative. No existing book text is truncated
and existing worlds are not made into failed imports merely for exceeding a
publish-time text cap.

## Runtime / Studio-only announcements

- NPC reaction frequency based on party reactions is a runtime behavior; no new
  authored field or API mutation is documented. Workbench invents no settings.
- Duplicate/delete mods from Studio's starting screen are UI capabilities. This
  Alpha API still exposes only `GET /mods`; no mod deletion/duplication endpoint
  is invented or enabled. Use Studio for those actions.
- The live contract also exposes engine-upgrade metadata/approval. Workbench
  continues to require explicit approval in Studio, not automatic migration.

## Future updates

1. Run `npm run voyage:check -- --curl --check` and inspect per-host contract
   **and guide** drift, even if the API version string is unchanged.
2. Capture dated public evidence and update only that host's profile and
   `creatorReports` allowlist after reviewing semantics and permissions.
3. Add new reports through the shared, bounded GET request builder and native
   bridge, not an arbitrary URL/method escape hatch. Preserve missing/null data.
4. Keep authoring supplements narrow and environment/version scoped. Do not
   promote all unrelated schema differences or mutate imported documents.
5. Exercise the consolidated report/host/UI/native workflows. Live authenticated
   saves or report reads are separate validation and must not be implied by mocks.

## Validation of this change

Typecheck, the shared build, all 652 JS/TS checks, 14 built-native bridge checks,
Android Java compilation and 27 focused JVM checks passed. New coverage is four
consolidated core/host/UI workflows, not a collection of redundant field tests.
The UI workflow uses headless Chromium with synthetic reports and mocked host
responses, not a physical phone or authenticated account.

The live public checker reports no Alpha contract or guide drift against this
snapshot. Production and Beta still report their own documentation drift and
remain flagged for separate review; their baselines/capabilities were not
silently promoted. No authenticated analytics/feedback reads, private-world
uploads, paid calls, version upgrades or new release publication were performed.
