# Character portraits and artwork review

## Start from a character

Open **Characters**, select an NPC or premade character, and choose **Generate
portrait…** near the character heading. This opens Artwork with that character's
exact portrait destination and a brief based on its saved appearance information.
It does not start a provider request. Apply or discard pending character/editor
changes first so the brief represents the saved character.

Review or edit the brief and choose **Generate artwork locally**. The confirmation
names the character, purpose, provider, and model, and explains the potential
charge. An optional reference image is sent only when explicitly selected. The
full world is not sent with this artwork request.

To reuse an image without generating, choose **Choose or upload portrait…** in the
character details. The shared library includes generated and imported artwork.
Choosing a hosted image saves the exact character's portrait URL immediately to
the local project; no separate **Apply character edits** step is needed. The
picker stays open and reports an error if saving fails. Switching characters or
reopening the project retains a successfully saved portrait. Pending form edits
must be applied or discarded first; a stale picker cannot change another character.

## Know what is happening

The progress panel names the destination, artwork purpose, provider/model, and
elapsed time. Its stages distinguish preparation, waiting for generation, and
saving the returned image bytes. Progress is indeterminate: the image provider
does not supply a trustworthy percentage. Duplicate clicks are disabled while the
action runs. Completion and failure messages identify the destination.

Generation history is recorded before the image request. Changing the world or
Artwork route during preparation blocks the request. Failures after sending are
treated as uncertain and are never retried automatically. A second explicitly
approved attempt warns when an earlier request for the destination has an
unconfirmed outcome; it may incur another charge.

## Review the images

**Generated artwork** is a visible preview gallery, not just a list of request
names. Each saved image can be inspected full size, with fit-screen and actual
pixel views. Cards retain their destination, saved brief, timestamp, and provider
metadata when available. Six requests are shown initially; **Show more artwork**
reveals additional cards without loading the entire archive at once.

**Select saved artwork for [name]** selects the image and its original destination
together. It does not leave a different character selected or silently attach an
image to another character. Missing/ambiguous destinations and missing image bytes
are reported; the history record is retained. Unsaved brief changes require
confirmation before replacement.

Requests approved in the assistant also show saved-image previews and named
generation feedback. If a journal says generation started but this screen cannot
confirm a running worker, it says **Awaiting confirmed outcome**, not that it is
definitely interrupted. While such requests are recorded, Artwork checks the local
journal every three seconds; **Refresh artwork history** is also available. These
are local reads, not new image requests.

## Attach only when ready

The selected local image is previewed alongside the currently attached image.
Choose **Upload & attach selected artwork…** to review the library/upload flow.
Uploading, moderation, local attachment, saving to Voyage, and publication remain
separate actions. Generating or reviewing a portrait does not replace the
character's current portrait automatically.

A successful attachment reports **Artwork saved locally to [name]** and updates
the currently attached image, not just the selected-image preview. It is kept in
the project when you switch destinations or reopen it. If persistence fails, the
picker remains open with an error instead of reporting attachment success. A
world change while the picker or metadata read is pending blocks stale artwork
assignments. The same exact-path save is used for NPCs, playable characters,
regions, locations, areas, items, and envelope covers; raw-world covers use the
project's saved creation metadata.
