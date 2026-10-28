# Licensing

## Application code

The owner selected **GNU General Public License version 2 only** on October 12,
2026. The SPDX identifier is `GPL-2.0-only`. The complete, unmodified license is
in the repository-root `LICENSE` file. This grant applies to original Voyage
Workbench application code, tests, and build scripts for which the project has
the necessary rights. It is not a grant to use a later GPL version.

When distributing modified application binaries, preserve applicable notices,
provide GPLv2 license text, and provide complete corresponding source under
GPLv2 as required by the license. Running the application privately does not
require publishing private edits, projects, credentials, or authored worlds.

## Third-party boundaries

The root license does not relicense third-party dependencies, provider runtimes,
SDKs, imported documentation/reference data, trademarks, or user-created content.
Their owners' terms remain controlling. In particular:

- Production JavaScript dependencies have MIT, ISC, and 0BSD license metadata
  in `package-lock.json`; preserve their applicable notices.
- Codex is Apache-2.0; Electron and Chromium carry their own dependency notices.
- Rhino is MPL-2.0. Android runtime components include GPL/LGPL software and
  other licenses; retain their notices and corresponding-source/build obligations.
- Claude Code and the Cursor SDK are vendor software, not GPL-licensed Workbench
  source. Our adapters do not grant rights to modify or redistribute those vendors'
  software beyond their own terms. Provider subscriptions and inference are not
  included in this license.
- Imported Voyage/community schemas and reference documentation remain subject
  to their upstream terms; do not assume the application license grants additional
  rights over their content. Authored world content is distinct from application
  code and is not automatically GPL-licensed by use of the editor.

Apache-2.0 code is not compatible with incorporation into GPLv2-only code. Do not
copy Apache-2.0 implementation code into this application's GPLv2-only source.
Separate-process runtime distribution is not the same as relicensing or linking
that implementation into our application. Whether components form an independent
aggregate or one combined work depends on their actual integration, not merely
on using separate files or processes. Reassess licenses when changing boundaries.

## Release source access

Each release tag in `https://github.com/sign-out/voyage-workbench` provides the
corresponding application source, tests, and build scripts. Regular releases use
`vVERSION`; historical test builds use `vVERSION-test`. For example, `v0.2.18`
identifies the source for the 0.2.18 binaries.
GitHub provides downloadable source archives at that tag alongside the release.
Private signing keys, SDK installations, caches, account data, and downloaded
runtime binaries are intentionally excluded. Distributor signing keys are not
needed to build or modify the application.

The repository documents build prerequisites and local packaging assumptions;
it does not promise byte-identical reproduction of signed distributor binaries.
Bundled third-party notices and pinned source/build metadata are available inside
the applications. The separate covered-dependency source commitment remains in
`DEPENDENCY_SOURCE_OFFER.txt`; making our application public does not replace it.

This document records the project's license choice and engineering boundaries,
not a legal certification of every third-party distribution arrangement.

Primary references:

- https://www.gnu.org/licenses/old-licenses/gpl-2.0.html
- https://www.gnu.org/licenses/gpl-faq.html#MereAggregation
- https://www.apache.org/licenses/GPL-compatibility.html
- https://code.claude.com/docs/en/legal-and-compliance
- https://cursor.com/terms-of-service
