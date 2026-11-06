# World-backed forms and visible work

## Fill from data, not guesses

Cover briefs, map artwork, creation briefs, public-details forms and publication
previews share the same metadata/default selectors. Existing character and
destination forms continue to read their exact authored records.

- An active API envelope is authoritative for its public fields.
- Bare GameState uses separately saved publication details, then available JSON
  fields, a preserved envelope for the same linked world, or planned creation
  details. A different world's envelope is never used.
- Authoring premises can use `storySettings.worldBackground`; image direction
  uses existing image prompt configuration or explicit creation art direction.
  This does not turn private lore into a public blurb automatically.
- Available values update untouched form fields when the world changes. Manual
  edits and intentionally cleared inputs survive refreshes. Switching projects
  resets the form to that project's defaults. Cover Studio also offers an
  explicit **Use current world details** action.
- Public previews and private-draft creation use the same saved/defaulted public
  metadata. Reading or prefilling never edits GameState, publishes, uploads, or
  starts generation. Loading failures are visible and cannot silently replace
  saved publication details.

Missing information stays missing. A bare GameState without a title cannot
establish a public title; the local project name is only a fallback. Provider
selection, permissions and whether a world is original are not guessed from lore.

## Activity while work takes time

The header Activity control shows running image requests, model tasks, Voyage
operations and other host work, with elapsed time and recent outcomes. Image
labels identify their target and configured route. It remains available across
workspace views. Cover Studio also shows its generation/review phase inline;
saved pending cover history refreshes without sending another model request.

The indicator uses actual running requests and persisted task states, not invented
percentages. Clearing finished activity only clears the on-screen request list.
It never cancels work, deletes receipts, or retries a possibly paid request.
Generic request activity is session-local. After a restart, durable agent and
artwork histories remain the authority; an interrupted image request may have an
uncertain provider outcome and must not be retried blindly.

## Expected open score bounds

`successLevelSettings.tiers[0].minScore: null` and the final tier's
`maxScore: null` express open-ended bounds, not invalid numbers. Local validation
accepts these precise cases in bare and wrapped worlds. Interior null bounds,
strings where numbers are required, and unrelated null numeric fields still fail.
Validation does not rewrite nulls to invented sentinel numbers.

## Automatic Voyage additions

After an explicit save, a verified read-back can add canonical world/publication
fields, GameState records, fields inside array records, or trailing array entries automatically when every
submitted value and existing array position remains unchanged. The operation must
still match the submitted local source, world, environment and revision, with no
editor draft in flight. The API can also supply a previously absent GameState
version field. Changes to an existing version or identity, overwrites, removals,
array reordering and mixed differences remain unresolved for explicit review.

Automatic adoption records a distinct **server additions adopted** receipt,
updates the linked baseline/revision, and preserves the original submission and
a local History checkpoint. It does not pretend to be exact confirmation and
does not send another write. Desktop and Android enforce the same shared checks.
