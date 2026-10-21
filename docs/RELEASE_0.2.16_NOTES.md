# Voyage Workbench 0.2.16 test hotfix

- Android restores the open world and saved workspace after WebView recreation,
  retries restoration on wake, and drains pending draft saves before navigation.
- Voyage world-list buttons load the selected save directly. Importing into an
  existing local project still requires reviewing a proposal.
- Android cancellation targets the exact project, task, and attempt rather than
  interrupting unrelated work or login sessions.
- Work Orders require explicit current-source scope approval. Older orders must
  be approved again. Local schema errors keep generated changes as reviewable
  proposals instead of automatically applying them.
- Image allowance, byte transfer, and moderation enforce project/world/environment
  binding. Interrupted transfers retain their exact allowance; ambiguous outcomes
  remain blocked rather than silently consuming another allowance.
- Completed uploads repair local library records without uploading again, and
  compatible hosted images are reused before requesting another allowance.
- Includes the map content coverage and lore heatmaps from 0.2.15.

Android version code is 18 and retains the existing update-signing identity.
Windows uses the existing self-signed test certificate; Linux archives and
checksums receive detached signatures. This is a prerelease, not a publicly
trusted production-signing claim.

Validation covers deterministic application/provider fixtures, release checks,
native engine/cancellation tests, responsive layouts, and desktop workflows.
No paid model calls or live image uploads were used. Physical-device sleep/resume
and native Windows execution remain unverified.
