# Release publication policy

## Public application repository authorization — October 12, 2026

The owner explicitly authorized a separate public application-source repository
with the latest test release, excluding anything that should not be public.
Publish a reviewed, clean source snapshot to `sign-out/voyage-workbench`, not local
Git history or the pre-existing index. Include application source, tests, build
scripts, public reference data, and authored sample fixtures. Exclude credentials,
private projects/world exports, account state, signing material, local SDKs,
downloaded runtimes, retained third-party archives, caches, internal screenshots,
device captures, and execution logs. Attach verified release artifacts separately.

This authorization supersedes the earlier application-source prohibition for the
new source repository only. The existing downloads repository remains binary-only.
The owner subsequently selected GNU GPL version 2 only (`GPL-2.0-only`) for the
original application code. Preserve third-party license boundaries as documented
in `LICENSING.md`; do not claim provider runtimes or imported reference material
are relicensed under GPLv2.

## Historical downloads-repository policy

The owner does not authorize publishing application source or third-party source archives to the public downloads repository.

At the owner's request, public releases v0.2.0 through v0.2.3, including binaries and third-party archives, are withdrawn. Local builds remain available; do not delete local project data or build artifacts as part of this withdrawal.

The owner subsequently authorized test-build publication with a written offer to provide third-party dependency source on request. Release assets must be installers and checksums only; do not upload separate source archives. Include license notices, the authorized offer, and pinned upstream source/build-recipe access information inside the apps. Retain corresponding dependency materials privately so requests can be fulfilled. Where an offer alone is insufficient, provide direct access to already-public upstream corresponding sources and build recipes; do not describe an offer as sufficient for every license.

Application source is not part of the dependency-source offer. Do not upload the application source repository, original-source maps, private projects, credentials, or signing material. Compiled JavaScript remains inspectable inside the built applications.

The owner also authorized self-signing desktop test builds with the same underlying
key as the existing Android development build. Windows uses an embedded Authenticode
signature; Linux archives and the checksum manifest use detached signatures. Public
verification metadata and signature files may accompany binaries/checksums, never
private keys, PFX files, passwords, or keystores. This does not grant public certificate
trust or production-signing qualification. Do not silently rotate either identity.

The downloads repository must not advertise withdrawn builds as available. No credentials, private worlds, user exports, account state, or signing material may be published.
