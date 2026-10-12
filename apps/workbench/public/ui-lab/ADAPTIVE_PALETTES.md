# Adaptive master/detail — five muted variants

The approved adaptive layout is held fixed. All five share its application shell, master/detail behavior, all 15 tools, property forms, contextual sidebar, draft/apply/discard, proposals, and mobile bottom navigation. Only palette changes. These are isolated app mockups, not production theme changes.

## Before-build palette tournament

Each palette was compared with two alternatives before building. These are single-author design judgments, not user tests or independent-agent votes. Selection prioritizes restrained surfaces, readable secondary text, and sufficient separation between fields and panes.

| Variant | Winner | Rejected alternatives | Reason |
|---|---|---|---|
| Graphite | Neutral charcoal / steel accents | Pure black; violet-gray | Pure black makes borders harsh; violet adds unnecessary color. Neutral charcoal is the closest dark translation of the approved layout. |
| Slate | Desaturated blue-gray / steel-blue accents | Bright cobalt; midnight navy | Cobalt is too vivid; near-black navy loses pane separation. Blue-gray keeps a cool tone without glowing controls. |
| Olive | Charcoal green / muted moss accents | Saturated forest green; khaki light surfaces | Forest green reads as a decorative skin; khaki stays too bright. Olive keeps color mostly in selection and primary actions. |
| Umber | Warm brown-gray / subdued bronze accents | Orange highlights; cream surfaces | Orange attracts too much attention; cream repeats the brightness problem. Brown-gray gives a genuinely warmer dark option. |
| Fog | Mid-dark gray / washed sage accents | Pale gray; black/white high contrast | Pale gray is still bright; black/white feels severe. Fog is the duller, less black-heavy alternative. |

## Implementation boundaries

- The existing adaptive mockup remains available, unchanged in its original light palette.
- Each new variant has its own HTML route and browser persistence key.
- The five variants use exactly the same adaptive renderer, not five copied applications.
- Primary actions use subdued fills rather than the light accent color as a bright button background.
- No gradients, illustrations, new branding, or invented feature changes.
- The comparison launcher is at `adaptive.html`; variants can also be switched through the app's layout selector or mobile More menu.
