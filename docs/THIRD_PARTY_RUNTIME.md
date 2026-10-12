# Runtime provenance for personal builds

- Codex 0.156.1: https://github.com/openai/codex — Apache-2.0. Official npm platform archives; Windows archive metadata/integrity is recorded in `.desktop-runtime/provenance.json`.
- Electron 44.5.1: https://www.electronjs.org/ — MIT; packaged Electron/Chromium license files accompany the desktop executable.
- PRoot 5.1.107.96, from Termux: https://github.com/termux/proot — GPL-2.0. Termux recipes and patches: https://github.com/termux/termux-packages/tree/master/packages/proot .
- Termux dependencies: exact versions, source homepages, archive URLs and SHA-256 checksums are in `.android-lab/termux/packages.json` and `.android-lab/termux-arm64/packages.json`.
- Rhino 1.8.0: https://github.com/mozilla/rhino — MPL-2.0.
- Capacitor, React, lucide-react, js-sha256 and other JavaScript packages: versions are pinned by `package-lock.json`; upstream package license files are in `node_modules`.

The binaries generated here are for the user's local evaluation. Before public redistribution, collect the complete applicable license notices and corresponding source/build recipes, including GPL/LGPL dependencies and patches. This provenance note is not a substitute for those materials.
