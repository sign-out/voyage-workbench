# 0.2.18 regression and release audit

## Scope

This is a focused regression, dependency, and release-packaging audit, not an
independent security certification. It covers the shared core/UI, desktop host,
Android JVM code, release metadata, signed artifacts, and synthetic recovery
workflows. Tests use disposable projects/profiles and mocked network services.
No personal ChatGPT session, real provider inference, or authenticated Voyage
mutation was used.

## Findings fixed

1. Seven npm advisories (three high, four moderate) in the prior dependency tree:
   updated Electron, Vite, undici, fast-uri, and the Xcode helper's uuid dependency.
   The uuid override remains scoped to Xcode and has a CommonJS UUID-generation
   compatibility regression. A clean `npm ci` was used, not the old workspace's
   linked dependency tree. Final `npm audit` reports zero known vulnerabilities
   across runtime and development dependencies.
2. Hardcoded Electron notices could ship an old runtime version/source and
   Chromium license file. Notice generation now uses the locked/installed
   runtime; package verification checks the version, upstream source URL, and
   exact current Chromium notices. Tests reject stale/tampered notice metadata.
3. The desktop ChatGPT launcher could cover the final All tools entry at the
   761-pixel layout boundary. Its stacking level is now below workspace
   navigation. Responsive testing checks the final menu item's actual hit target.
4. Test-only release staging could not represent a regular release consistently.
   Explicit stable/test channels now produce matching source tags, directories,
   and checksum metadata; tests preserve backwards compatibility and reject
   unsupported channels.
5. Stale smoke assertions expected the old Mods label and unsupported world-cover
   upload text. Fixtures now exercise the current UI. Native-view/menu readiness
   waits replace timing assumptions; popup fixtures load the synthetic parent
   document before simulating input. Screenshot capture has a bounded fallback
   when a hidden compositor does not schedule animation frames. The legacy
   cancellation test now cancels after the synthetic turn-start notification,
   rather than assuming process startup completes within 250 milliseconds.

## Passing checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 444 passed, zero failed/skipped |
| `python3 -m unittest discover -s tests -v` | 192 passed |
| `npm run test:release` | 26 passed |
| `node --test tools/voyage-api-authenticated.test.cjs` | Five synthetic safety tests passed; no live authentication |
| Electron application smoke | Editor/source precision, maps, imports, sync recovery, providers, cover/artwork, local-editing workflows passed |
| Studio smoke | Bulk import/deduplication, partial failures, music/proposal review, hosted reuse, Mods, publication identity, 15 layouts passed |
| Chat plan smoke | Delayed saves, revision ownership, reopen, canceled navigation, scope-reset handoff, no automatic model task passed |
| Chat popup/menu/recovery smokes | Hidden/stale popup rejection, opener, modified links, referrer/POST preservation, native edit menus, password protection, stalled-page recovery passed |
| Section checkpoint/settings/Voyage API smokes | Durable history, failed-draft preservation, recovery settings, bounded reads/cooldowns, no mutation replay passed |
| Responsive smoke | 26 viewports, 282 layout checks, zero failed; also grading, magic wand, Android-style workspace restoration, gestures, and draft reflow scenarios |
| `npm run build` | Production UI/desktop/native core build passed |
| Android `:app:testDebugUnitTest` | 45 tests across 13 suites, zero failures/errors/skips |
| Android `:app:assembleRelease` | ARM64, x86-64, universal release APKs built; release lint passed |
| Android `:app:compileDebugAndroidTestJavaWithJavac` | Instrumentation compiled |
| Windows/Linux Electron packaging | x64 portable EXE and Linux application directory built |
| `npm run verify:artifacts` | Package/source/resource identity, version/ABI metadata, source/privacy exclusions, provider resources, and signatures verified |
| Packaged-resource smoke | Both ASARs' references and offline notices loaded successfully |
| `git diff --check` | Passed |

Electron fixtures ran with Electron 44.10.0 / Chromium 152.0.7977.169. Synthetic
failure cases intentionally log rejected IPC operations; a logged mock failure
is not itself a test failure. Final exit status and assertions determine results.

## Release gates and remaining limits

- Release version 0.2.18 matches the package/lockfile, desktop binaries, Android
  version name, and notices. Android version code is 20.
- The final staging operation verifies artifacts again and produces SHA-256
  checksums plus detached signatures. Upload sizes/digests are checked against
  local assets before the GitHub draft becomes a published regular release.
- Windows signatures verify against the existing self-signed test certificate;
  Android signatures verify against the existing debug-keystore certificate.
  Neither is a publicly trusted/store distribution identity. No private signing
  material is distributed.
- Windows is cross-packaged on Linux; native Windows runtime execution was not
  tested. Physical Android/emulator execution was unavailable, so real device
  sleep/resume and instrumentation execution remain unverified. Synthetic
  Android-style lifecycle scenarios and JVM tests do not replace device tests.
- macOS and iOS packages are not configured/supported. This release does not
  introduce them or a lightweight Android provider-pack edition.
- `npm audit` does not audit every native/provider runtime. Build warnings about
  bundle chunk size, Gradle deprecations, and flatDir repositories remain; they
  were not treated as passing security checks or silently fixed out of scope.
- Bundled upstream runtimes retain their existing versions, licensing/source
  offers, and integration limitations. No new live API compatibility claim is
  made by this regression audit.
