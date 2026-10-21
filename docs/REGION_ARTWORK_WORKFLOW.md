# Region artwork workflow

The region’s local map and realm-grid inspector expose a region-image attachment
section. It opens the shared asset picker, including inline file import. A local
file enters the global asset library first; attaching it to a Voyage map requires
an explicitly approved upload and moderation. Existing hosted URLs can be reused
without another upload. Detaching an image only clears the region’s map URL, not
the library asset.

Desktop map editing has a library sidebar. Drag an image onto an existing region
cell or the open region’s local map. Empty realm cells reject image drops; dragging
regions between cells continues to move them. Artwork also exposes draggable
library images and region drop targets. Mobile uses image and region dropdowns
plus an Apply action, followed by URL selection or explicit upload. Both routes
reject stale project content before applying the attachment.

Map artwork additionally supports master-map slicing. Select/import a local
master, choose a realm, grid dimensions (up to 16×16), and the north-west anchor.
Columns increase x; rows decrease y. Preview lists existing and planned regions.
Create missing regions is enabled by default: a 12×12 grid assigns 144 tiles,
reusing occupied cells and creating regions for empty cells. Generated names avoid
existing region-key collisions, including other realms. Turn creation off to keep
empty-cell crops locally without uploading or creating regions. Overlapping target
regions are rejected. Original images, unknown JSON fields, and exact
numeric values are preserved.

Before any crops are saved, master dimensions must support at least 600×600 pixels
per tile, without upscaling: 12×12 requires a master of at least 7200×7200 pixels.
The existing image decoder also caps masters at 64 megapixels and imports at
32 MiB; large grid dimensions remain subject to these limits.
Splitting saves PNG crops to the shared library without uploading. The completed
batch is retained per project. Upload & assign preflights all needed local tiles
against Voyage’s 600×600 / 5 MiB requirements, shows the new-upload count, and
asks explicitly before proceeding. Uploads run sequentially using the existing
journal; completed hosted URLs are reused on retry. Region URLs change together
and missing regions are created in a single local edit only after all mapped tiles
are ready. Confirmation shows creation, replacement, and upload counts. Old saved
batches retain their original skip-empty behavior. Stopping or an
error retains crops/receipts without publishing the world. Changed world content
requires a new batch. The author still saves or syncs the world explicitly.

Map artwork displays at full opacity in both realm and local maps. Dark mode
does not tint the image; contrast is localized to text labels. The existing
image-edge feathering setting remains respected.

Both map toolbars have a Show labels toggle. It hides region names, coordinate
text, and location-name callouts while retaining interactive tiles and markers.
Accessible names remain available. The preference is remembered on the device
and does not edit exported world JSON or discard unsaved inspector input.

## Upload isolation and interrupted uploads

Image allowances, signed-byte uploads, and moderation are bound to the local
project, linked world, and Voyage environment. Switching the Creator connection
to another environment cannot retarget a pending upload. Reconnect to the
recorded environment before resuming it. Older pending receipts without an
environment binding require explicit investigation rather than a guessed target.

An interrupted byte transfer may have succeeded remotely even if its response
was lost. Recovery uses the same upload allowance and moderation operation to
resolve that outcome; it does not silently request a replacement allowance.
Unresolved outcomes stay blocked with their receipt retained. A completed upload
whose local library write failed can repair the library on resume without
uploading the bytes or requesting another allowance.
