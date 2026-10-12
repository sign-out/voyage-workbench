# Source repository and test downloads

As of October 12, 2026, the owner authorizes a reviewed public application-source
snapshot in `sign-out/voyage-workbench`, with verified binaries attached as releases.
The exclusions in `RELEASE_POLICY.md` still apply. The following installer-only
rules describe the separate `sign-out/voyage-workbench-downloads` repository, not
the newly authorized application-source repository. Application visibility does
not change dependency licenses or the corresponding-source commitment.

The public release assets are the Windows portable executable, Linux application archive, Android APKs, and checksums. Application-source archives and separate third-party-source archives are not release assets. GitHub's automatically generated tag archives describe the downloads repository, which contains download documentation, not the application-source repository.

`docs/DEPENDENCY_SOURCE_OFFER.txt` records the owner's authorized third-party source-on-request commitment. `tools/release-notices.py` verifies privately retained sources and generates bundled notices, pinned source/build-access metadata, and an offline notice viewer. Run it before building release installers. Inputs are retained under the ignored `.release-compliance/retained/third-party` directory; outputs are generated under the ignored `apps/workbench/public/third-party` directory.

An offer is not treated as sufficient for every component. PRoot has GPL-2.0-or-later notices; talloc is LGPL-3.0-or-later; elfutils exposes LGPL-3.0-or-later and GPL-2.0-or-later alternatives; Rhino uses MPL-2.0. The bundled metadata also supplies direct existing upstream source access, the pinned Termux build-system/recipe/patch snapshot, and the exact Codex voice source/build commit. Preserve these materials and hashes for source requests. This engineering record is not a legal certification.

The notice viewer is available under Models & agents. Desktop packages additionally place notices in `resources/third-party`; Android APKs contain them in `assets/public/third-party`. The generated files contain license text, an offer, provenance, and links, not dependency source archives. Desktop application-source maps are excluded from packaged apps. Compiled JavaScript remains part of the executable application.

Never include API keys, account state, private world exports, or signing keys in public uploads. Do not upload application source to the separate downloads repository. Publish binaries from an explicit artifact allowlist and check server-reported hashes before making the release available.
