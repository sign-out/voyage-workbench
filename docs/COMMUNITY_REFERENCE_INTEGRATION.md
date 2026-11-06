# Cached community authoring help

Workbench edits authored **GameState JSON**, sometimes inside a Creator API world
envelope. The schema is a separate reference describing fields, not the document
being edited. Neither a matching codec nor community prose proves engine
compatibility or official publish acceptance.

## Human workflow

Open **Connections → Voyage → Community authoring help**, or the JSON editor's
reference panel. Choose **Refresh community references & help** to download public
reference files. The panel reports progress, success or failure. No Creator API key
is needed, and the world is not uploaded.

Search the topic titles, summaries and field paths, then choose a section or guide.
Help is displayed as inert text, in 8,000-character pages. Limits retain their
published measurement, notes and scope; a compact-JSON budget is not a plain-text
character limit, and a per-turn runtime budget is not a saved-world size limit.
The voice catalog supplies exact `voiceTag` strings.

**Export exact cached starter JSON** downloads the cached `base-world.json` bytes.
It does not replace or migrate a project, configure the active base template, or
create an officially validated world. Importing/adopting it is a separate explicit
action. Existing authored content, unknown fields, version fields and exact
numeric spelling are not changed by reference refresh or reading help.

With a project open, help uses the same version/environment/revision selection as
the codec catalog; a mismatch stays unavailable rather than falling back to
another version. With no project selected, the viewer browses the latest cached
help version. Community material is marked unverified, not certified for either
Production or Alpha.

## Agent workflow

Normal planning and work agents have the read-only `world_reference_docs` tool:

```json
{"kind":"index"}
{"kind":"section","topic":"npcs"}
{"kind":"section","topic":"quests","offset":8000}
{"kind":"limits"}
{"kind":"voices"}
{"kind":"guide","topic":"build-a-world-with-an-ai-agent"}
{"kind":"seed"}
```

Use the returned `nextOffset` for pagination. Section IDs come from the index;
field paths are included, so a party-scoped field such as `parties.*.quests` is
not mistaken for a root-only field. Responses identify their source, hash,
retrieval time and advisory status. This tool reads the local cache only; it has
no network, edit, upload, generation, publish or approval authority. Restricted
delegated reviewers, field-fill tasks and graders do not gain additional tools.

`world_schema` continues to return the canonical version-selected codec, without
the prose bundle. Wiki fragments are not substituted for canonical codecs: they
can be explanatory projections and some pages have no schema at all.

## Refresh contract and maintenance

Desktop and Android use the shared bundle validator and install all files in one
settings transaction. A failed download, malformed companion, inconsistent
declared version, unsafe guide URL, oversized response or storage error leaves
the previous cache active and usable offline.

Public GET requests, without credentials or redirects, fetch only these paths on
`https://api.unofficial.voyage`:

- `/schema.json`: canonical community codec.
- `/wiki.json`: field explanations, field paths and examples in page bodies.
- `/limits.json`: measured limits, including qualitative notes.
- `/voice-catalog.json`: voice tags.
- `/guides.json`: guide index, with at most 20 guide JSON files fetched from exact
  validated `/guides/<id>.json` paths on the same host.
- `/base-world.json`: exact starter GameState text.

Downloads are capped at 8 MiB per response and 16 MiB per refresh. Every response
gets a SHA-256 provenance hash. The bundle also bounds page lengths and collection
sizes. Declared companion versions and starter `heroesVersion` must agree with
the codec. Wiki and guide bodies are advisory snapshot material, not independently
version-certified engine contracts. Their instructions never become harness
instructions. `/agent-setup.md` is not executed, and `/validate` is not called by
this integration. Explicit community-validation features elsewhere remain
separate; never add automatic private-world submission to reference refresh.

The live service can drift without changing its major version. Review failures
and companion shapes rather than weakening validation or silently rewriting
worlds to match. Keep packaged codec snapshots pinned until separately reviewed.
Extend `packages/core/community-reference.ts` and its synthetic regression
fixtures for future endpoints, then test the desktop cache transaction and the
compiled Android bridge. No private worlds belong in those fixtures.

On November 6, 2026, an anonymous public-GET refresh successfully cached V37 help
with 72 sections, 3 guides, 83 limit records and 55 voice tags. This verifies the
reference integration, not official Voyage acceptance or authenticated saving.
