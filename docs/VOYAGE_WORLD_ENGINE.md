# Shared worlds, selected connections and engine versions

A local project links to a Voyage world ID, not to Alpha, Beta or Production.
Choose the desired connection for new validation, save, image-upload and
publication operations. No re-import or environment-specific project copy is
required. Keys remain separate because account access may differ by host.

`remote.environment` remains backward-compatible provenance for the most recent
download or confirmed sync. It does not decide where new actions are sent.
Cover recommendations and newly started assistant reference contexts use the
selected connection. Approved artwork briefs and already running model tasks
keep their own frozen inputs.

## Actual engine warnings

World engine identity is the numeric pair `heroesVersion` and
`compatibilityRevision`, not the API version or an Alpha/Beta/Production label.
Workbench checks `GET /worlds/{shortId}` on the selected connection and reads:

- `data.savedVersion`: persisted world engine, when supplied.
- `data.pendingVersionUpgrade.sourceVersion` and `.targetVersion`: a real
  upgrade requiring approval, when supplied.
- The returned draft's engine fields, separately from saved metadata. A newer
  converted draft is not proof that an upgrade was persisted.

Engine reads run only when explicitly requested or during an explicit save.
Opening a local project or switching connections does not open the remote world
in the background. The inline check shows progress, discards results from an older connection,
and warns when a reported target is newer than the saved or local engine.
Switching labels at the same version does not generate an upgrade warning.
Missing metadata never certifies compatibility; failed checks explain that the
engine is unverified rather than pretending an upgrade was confirmed. Local
GameState and version fields are unchanged by the check.

Save confirmation includes fresh engine warnings. If Voyage requires approval
before editing, use the explicitly labeled Studio link to review and approve
the real upgrade there, then refresh/import the updated draft before saving
older local content. Workbench does not call the version-upgrade endpoint or
invent a local migration. Production can update older worlds automatically when
they open, so even a GET cannot promise that Voyage itself made no upgrade.

## Unfinished requests are different from worlds

A prepared/sent/uncertain operation retains its original host, request key,
payload and revision. It is unsafe to replay it on a different host merely
because the connection changed. Save reconciliation reads the original host;
publication/upload continuation asks for the original connection. Once the
operation is resolved, new work uses the current selection normally.

Conditional `If-Match` saves and stale-source checks remain enforced. A real
revision conflict or Voyage rejection of a too-new draft is not a local
environment binding. Upgrade-required rejections are clean rejections, not
uncertain writes; they do not reserve the world behind a false unknown save.
