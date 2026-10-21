# Voyage Workbench 0.2.15 — Map content coverage

## Lore and world heatmaps

- Map coverage overlays reveal sparse areas and local content hotspots without
  modifying world data.
- Ten metrics include NPCs, lore, locations, interactions, and spatial links;
  inspect individual metrics or a weighted combined density view.
- Adjust overlay opacity and preserve realm tinting, camera position, and
  unsaved map editor drafts while inspecting coverage.
- Unmapped records and broken spatial links remain visible in diagnostics so
  missing placement does not silently disappear from coverage totals.

See `docs/map-content-coverage.md` for metric definitions and limitations.
Coverage is a planning aid, not an assessment of narrative quality.

## Packaging

Android version code is 17. APKs retain the existing update-signing identity.
Windows retains the existing self-signed test certificate. Linux archives and
the checksum manifest have detached signatures. This remains a test release,
not a publicly trusted production signing certificate.

Install the ARM64 APK over the previous Android version to preserve app data.
Phone delivery via Taildrop transfers the installer; installation still needs
to be confirmed on the phone.
