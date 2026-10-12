# Verification — 29 September 2026

## Automated

`python3 -m unittest discover -s tests`: **37 tests passed**, 5.36 seconds in this environment.

Coverage includes lossless large numeric tokens, source-span edits, duplicates, Unicode escapes, nesting bounds, object/array edits, order diffs, all bundled fixture round trips, documented references, cached schema warnings, invalid draft retention, restart recovery, checkpoint restore, optimistic version conflicts, request boundaries, exact remote envelopes/ETags, read-back, uncertain-save blocking, staged proposal replacement, durable agent states, and cancellation of a live owned subprocess.

Python compilation and browser JavaScript syntax checks passed.

## Browser checks performed against the running application

- Created the Lantern Coast project from its template.
- Navigated NPC and lore sections and nested records.
- Edited an NPC description using the full-value field dialog, saved, and reviewed the exact path diff.
- Ran local validation and inspected source/limitation labeling.
- Created a named checkpoint and restored an earlier checkpoint with a safety snapshot.
- Generated a real Codex NPC proposal, reviewed it, accepted and saved locally.
- Restarted the companion and reopened the saved world successfully.
- Added a new lore record through the object editor and exported current JSON.
- Generated another real Codex proposal, refreshed the browser during the run, recovered it from project-scoped history, reviewed and accepted it with a safety checkpoint.
- Inspected the desktop layout and browser error logs; no current JavaScript errors were reported.

The browser cancellation attempt raced with completion; it correctly returned the completed result. Actual process cancellation is covered by an integration test with a live controlled child process.

## Live external checks

- Official production OpenAPI and guide downloaded successfully, version 1.2.0-preview.
- User-provided community JSON builder HTML fetched directly.
- Codex CLI 0.155.0-alpha.16.4 completed real structured section-edit proposals.
- T3 Code architecture and Codex provider documentation reviewed; durable proposal lifecycle patterns applied independently.

## Not claimed

No authenticated Voyage world was supplied for live validation/save verification. Those paths were tested with controlled responses. No publication, gameplay execution, paid media, mobile-device test, Windows launch test, or near-64-MiB performance test was performed. A 3.32-MB document-engine benchmark measured approximately 0.41 seconds parse, 0.42 seconds targeted replacement, and 1.22 seconds diff; it is not an end-to-end UI performance guarantee.

## World conversation and Git revisions

66 automated tests pass after the world-agent integration. Coverage includes real local Git worktrees, exact bytes and CRLF, staged isolation, atomic failed batches, accept/restore, stale and cross-project rejection, follow-up proposal refinement, persistent transcripts/memory/thread IDs, cancellation with retained partial commits, authenticated chat/revision routes, and subprocess protocol behavior. The browser renders the new World agent workspace and initial Git revision correctly.

Live Codex app-server testing passed: a real dynamic tool returned a synthetic value, and a new process resumed the same native thread and recalled that value without another tool call. In the browser, a real world-agent request read references, committed narratorStyle and storySettings.worldBackground together, remembered the Tideglass setting, validated, and reviewed the two-field diff. Applying the proposal created an accepted Git revision. Restoring Initial import through the UI created another commit and recovered the exact original source; the accepted version remained in history. Late callback rejection and crash-between-Git-and-SQLite recovery have regression coverage.

## Native artwork and private access

Tailscale Serve registration succeeded at the private `*.ts.net:8443` URL. The HTTPS page and session route returned 200, including a Secure session cookie; the local listener remained on loopback. The native Codex image-generation probe produced a real PNG. A browser world-agent request then generated and captured a 1536×1024 Lantern Coast harbor map; its gallery preview loaded and the world JSON stayed unchanged. The image is stored immutably with an authenticated project-scoped download. Automated tests cover image decoding, immutable revisions, cross-project read denial, legacy conversation upgrade, native image event deduplication, and secured routing.

## Portable setup

Linux installation was run on this host with prerequisites already present, and `--check` made no changes. The new launcher restarted the app successfully; local HTTP and private Tailscale HTTPS both returned 200. Automated tests cover connected Tailscale, first-time `tailscale up` login flow, headless guidance, and recovery of visible agent context when a copied workspace has a missing native Codex thread. Windows installer and launcher scripts were checked statically here; they require verification on an actual Windows machine before claiming Windows runtime acceptance.
