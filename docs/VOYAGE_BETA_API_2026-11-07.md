# Beta Creator API verification — November 7, 2026

## Public evidence

- Website: <https://beta.voyage.io> returned HTTP 200.
- Contract: <https://api-beta.aidungeon.com/creator/v1/openapi.json> returned
  HTTP 200, `Voyage Creator API`, version `1.3.0-preview`, 32,268 bytes.
- Guide: <https://api-beta.aidungeon.com/creator/v1/agent-guide.md> returned
  HTTP 200 and matched the bundled `docs/voyage-agent-guide.md` byte for byte.
- A credential-free GET of `/worlds` returned HTTP 401, as expected for an
  authenticated endpoint. This is not a failure to expose the Creator API.

The contract snapshot and source/bundled hashes are recorded in
`docs/references/creator-beta-2026-11-07.meta.json`. No key was read or sent;
no private worlds were downloaded, uploaded, generated or published.

## Contract distinctions

Beta's contract matches the previously captured November 5 Alpha contract.
Relative to current Production, it recommends a 1280 × 720 cover instead of
1000 × 1000, and its Studio action coverage mentions music generation. That
coverage entry is not a public music-generation endpoint. Both contracts expose
music uploads; this change does not implement music synthesis.

Current Alpha has drifted despite also reporting `1.3.0-preview`: it additionally
describes engine-version data, pending version upgrades, world-read response
content, richer error details and a version-upgrade endpoint. Those additions
are not advertised by Beta's captured contract. Beta is not an alias for Alpha.
The update checker continues reporting that Alpha drift rather than silently
promoting its snapshot or enabling world upgrades.

The contract warns that opting into Beta/Alpha may upgrade shared drafts beyond
Production compatibility. Switching environments must be explicit; automatic
fallback and replay on another host remain forbidden. Schema and engine versions
must not be inferred from the API's version string. Alpha's release-specific
limits are not treated as verified Beta rollout evidence.

## Workbench behavior

Choose **Connections → Voyage environment → Beta**, then connect a key for
Beta. Listing and importing an owned world links its shared world ID, not a
Beta-only project. Validation, conditional save/read-back, new image uploads and
publication use the selected host and its separate credential. Pending writes
retain their original environment and request key. No action publishes merely
because Beta was selected.

Cover Studio, Artwork and source-to-world briefs recognize Beta's widescreen
recommendation. Source-to-world artwork targets are pinned separately from the
API connection; selecting Beta does not rewrite existing approved briefs.

`packages/core/voyage-compatibility.json` supplies supported environments,
selectors, snapshot sources, recommendations and public-documentation curl
URLs. The update report includes Beta's own drift and Production comparison.
Android's native host mapping is explicitly allowlisted and tested separately.

## Validation limits

Validated locally:

- Typecheck and production build passed.
- Full existing suite: 641 passed; environment workflows were expanded rather
  than adding redundant single-assertion tests.
- Built native JavaScript harness: 14 passed, including Beta profile behavior.
- Android `VoyageEnvironmentTest` passed; Android host and instrumentation
  sources compiled. Instrumentation was not executed on a device.
- Public update checker confirmed no Beta contract/guide drift against the new
  baseline while continuing to flag current Alpha changes.

Live verification used public documentation and unauthenticated reads only.
Automated host workflows use mock responses and temporary stores to verify
credentials, host selection, restart persistence, conditional saves/read-back,
upload bindings and publication request routing. These are not authenticated
Beta acceptance, paid generation, live publication or physical-phone results.
