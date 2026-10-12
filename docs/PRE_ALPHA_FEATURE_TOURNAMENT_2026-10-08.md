# Pre-alpha feature tournament — October 8, 2026

## Criteria and elimination rules

Compare user value (V), preservation/safety (S), maintenance simplicity (M), and
desktop/Android coverage (P), each out of five. Safety is a gate, not something a
high average can compensate for. No paid requests, remote publication, source
upload, automatic asset deletion, or new model/provider assumptions in this pass.

## Broad round

| Candidate | V/S/M/P | Decision |
| --- | --- | --- |
| Project-owned duplicate media libraries | 3/3/4/5 | Reject: reuploads and duplicate storage |
| Global metadata catalog with separate immutable local payloads | 5/5/5/5 | Winner: reuse existing SQLite feature storage and assets |
| New filesystem service, transcoder and thumbnail daemon | 4/3/2/3 | Defer: unnecessary new lifecycle/platform machinery |
| Cloud-synchronized asset manager | 4/2/1/2 | Defer: account, privacy and availability complexity |
| Content-hash deduplication plus exact hosted-URL identity | 5/5/4/5 | Winner: retain hosted references, local source, and upload receipts |
| Automatic download/reupload of every remote asset | 2/1/2/3 | Reject: quotas, rights, bandwidth, and expiring reservations |
| Dedicated soundtrack editor over actual track/cue/variant schema | 5/5/4/5 | Winner |
| Generic JSON as the only music UI | 2/5/5/5 | Reject as primary UI; retain peer JSON view |
| Music generation, mixer, waveform editor | 3/2/1/2 | Defer; supported API explicitly has no music generation |
| Publication editor using verified authored fields | 5/5/5/5 | Winner |
| Independent publication document replacing the world envelope | 3/2/3/4 | Reject: two authoritative copies and unsafe identity handling |
| Exact-path mod overlap review using supplied full mod sources | 5/5/4/5 | Winner with explicit unknown coverage |
| Automatic semantic mod merge / inferred engine precedence | 4/1/1/3 | Reject: cannot infer runtime behavior from JSON |
| Focused Mechanics/AI section navigation with schema-based peer editor | 4/5/5/5 | Winner |
| Handcrafted editor and defaults for every game subsystem | 3/2/1/3 | Defer: undocumented semantics and duplicated validation |

## Adversarial final round

- Global catalog must work without an open project. Project deletion must not delete
  catalog entries, source bytes, or hosted URLs. Do not fetch remote media on discovery.
- Hash local bytes, not names or data-URL spelling. URL identity retains the exact
  value; no query stripping, hostname guessing, or automatic upload on selection.
- Local and hosted are capabilities, not mutually exclusive copies: one asset can
  retain its original bytes and several canonical uploaded URLs.
- Already hosted image selection does not issue another upload. A recorded failed
  upload resumes its exact operation; it does not silently consume another slot.
- Music allowance/PUT/finalization must be a durable, explicit, resumable sequence.
  Keep URLs after reservation expiry, but never describe an unsaved reservation as
  permanent. Durable remote save evidence is distinct from local assignment.
- Bulk import is bounded, sequential, individually reported, and content-deduplicated.
  One invalid file does not discard successfully imported files.
- Assignment stages an exact-source proposal. No local data URL is silently inserted
  into publishable world fields. Existing uploaded URLs are reusable, not guaranteed
  reachable or authorized just because their hostname looks familiar.
- Music preserves unknown fields, cue values and numeric lexemes. The editor does
  not claim to emulate the game's automatic music selection or crossfading.
- Publication fields live in the existing envelope. Bare GameState publication uses
  explicit creation details; server identity remains protected. Changes are reviewed.
- Mod overlap means two supplied sources author the same path differently, including
  incompatible ancestor shapes. Equal values are shared, not conflicts. Missing or
  unverified-version sources mean unknown, not a green check. Never flatten overlays.
- Mechanics/AI use actual cached schemas and reference summaries; runtime tasks are
  not confused with the workbench's planning providers.

## Build and verification order

1. Shared exact-source music, publication and mod analysis; unit tests.
2. Global asset catalog, legacy discovery, content deduplication, hosted receipts;
   both host allowlists and bounded audio transport.
3. Shared library/assignment UI, soundtrack editor, publication controls, mod review,
   and focused systems navigation, preserving configurable shortcuts.
4. Typecheck, full tests, production/native build, desktop browser/mobile-layout QA
   and Android checks where the installed SDK permits. Record limits honestly.
