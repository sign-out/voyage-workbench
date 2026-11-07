# Scrollable lists and reachable editors

Character browsing, the asset library, Music and Mechanics now give their lists
bounded scrollports. Long lists must not stretch a parent behind the fixed
workspace shell or push the selected entry's editor far away.

`ListDetail` is shared by assets, track families and mechanics sections. Desktop
keeps list and details side by side with independent scrolling. Compact layouts
show the list or the selected details, with an explicit back control. The list's
scroll position and keyboard focus are restored when returning. Search and
pagination reset the list deliberately; filtering does not leave an invisible
result list behind selected details.

Asset changes respect unsaved library names and tags, and saving normalizes the
displayed fields to the stored values. Mechanics navigation stays locked while a
draft is being saved or needs review/discard. Existing saved mechanics drafts
reopen their own section instead of presenting an entirely disabled list.

The Create World host has a bounded flex layout while visible. Its hidden state
still uses the native `hidden` attribute; showing it must not grow the form
behind the workspace or prevent access to its delivery controls. Asset-picker
headers stay visible while long content scrolls, keeping Close available.

Layout checks use synthetic long lists and actual rendered components in desktop,
phone and short-window sizes. They cover browsing, selection, back navigation,
unsaved metadata, normalization after saving, draft restoration, creation scroll
access and asset-picker dismissal without generation or remote world writes.
