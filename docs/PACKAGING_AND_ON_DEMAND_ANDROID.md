# Packaging cleanup and an on-demand Android edition

## Release 0.2.11 implementation

The conservative cleanup is now the standard packaging path. Full/offline APKs
remain the default; the lightweight APK is an explicit additional download, not
an automatic migration. The prototype findings below are historical background.

The lightweight edition now has Settings → Models & agents → On-device runtimes.
It installs only an explicitly requested provider and missing shared dependencies,
using normal Android PackageInstaller approval. It does not fetch raw executables
into writable storage or substitute direct inference APIs. Active tasks and
unsaved connection settings block installation. Existing projects and Android
Keystore credentials stay attached to the same package/signing identity.

An embedded, base-signature-protected catalog pins complete pack hashes, sizes,
ABI, app version and signer. Downloads use the versioned Workbench GitHub release
channel; provider payloads come from the qualified upstream packages used by the
full build. The downloader verifies bytes before staging; Android verifies the
APK package/version/signature atomically. This is deliberately not an unchecked
`latest` downloader: compatible vendor updates require another qualified release.
There are no bundled signing secrets or extra linked verification libraries.

Dependency closure is checked by both the install planner and runtime readiness,
including the negative incomplete-split case Android itself accepts. Download
failure/cancellation removes partial bytes. Progress, system-install permission,
approval, interrupted state and retry are surfaced in settings. See
`RELEASE_0.2.11_AUDIT.md` for final evidence and remaining platform limitations.

Release packs are produced with `tools/android/prototype_provider_packs.py
--release-url https://github.com/sign-out/voyage-workbench-downloads/releases/download/v0.2.11-test`
and included through `tools/assemble-test-release.py --provider-packs <root>`.
The root contains `arm64-v8a` and `x86_64` build/catalog directories. Download the
lightweight APK for the device ABI; individual runtime split APKs are installer
inputs, not independently launchable applications.

## Conservative changes

Desktop now stores reference data and third-party notices only in `app.asar/dist`.
The desktop service reads the same reference files as the renderer. The offline
notice viewer remains at `dist/third-party/index.html`; legal notices are retained,
not stripped. The extra copies formerly under `resources/references` and
`resources/third-party` are no longer packaged. Provider binaries, language packs,
code-mode helpers, voice components, signing identities, and app features are
unchanged. `VOYAGE_ARTIFACT_ROOT` lets the desktop verifier inspect a separate build
directory without replacing a previously staged release.

Android stores identical Cursor SDK JavaScript/data once in
`cursor-sdk-common.zip`. Small ABI-specific archives retain their original paths
and any ABI-specific or differing contents. The installer extracts common files
and only the current ABI's remainder. The resulting per-device SDK files are
byte-identical to the previous complete ABI archive. Existing prepared SDK caches
remain usable, and native libraries remain untouched. The APK verifier reconstructs
each ABI's SDK and compares every path/hash with the full upstream-derived archive.
Do not remove or rewrite the native executables to chase further size reductions.

The factored source archives are build-cache inputs, not public release assets.
`package_cursor_runtime.py` recreates them from integrity-checked official packages.
Run it before packaging; `retain_cursor_sources.py` retains the factoring recipe
with the other dependency build materials. This is separate from an on-demand
provider downloader: the full/offline APK still contains every supported provider.

### Measured results — October 15, 2026

Compared with the previously staged 0.2.10 full build (MiB, not decimal MB):

| Package or layout | Before | After |
| --- | ---: | ---: |
| ARM64 APK download | 308.24 | 302.57 |
| x86-64 APK download | 316.01 | 310.33 |
| Universal APK download | 600.80 | 595.12 |
| Linux unpacked files | 663.11 | 642.66 |
| Windows unpacked files | 831.28 | 810.83 |
| Windows portable download | 171.86 | 171.85 |

The Windows portable compressor already handles the repeated resources very
efficiently, so its download barely changes even though extracted files shrink.
APK uncompressed contents shrink by about 6.46 MiB; their actual installed/device
storage is not measured in this pass. This cleanup is deliberately modest: it
does not remove any bundled provider or alter offline availability.

Validation: 235 core/UI/provider tests, 12 release/map/list tests, and 180 Python
tests pass. Typecheck, the production build, Electron UI smoke (60 workspace
layouts), Android release/instrumentation compilation, app JVM tests, and release
lint pass. All 64 packaged native runtime files remain byte-identical; both ABIs'
1,624 extracted SDK files match their original complete archive exactly. The
new instrumentation extraction/cache-reuse test compiles but is not executed:
T3 device support failed and no ADB device was attached. No paid inference or
provider login is performed, and no release is uploaded as part of this cleanup.

## Feasibility: smaller, provider-on-demand edition

**Feasible direction: a small base app plus signed provider feature packs. A raw
"download latest SDK and unzip it" implementation is not a drop-in replacement.**
The local prototype below does not introduce a downloader or change full-build behavior.

The current Android target is API 36. The large runtimes are Linux executables
packaged as installed native libraries, not official provider Android APKs. Codex,
Claude, Cursor's Node runtime, their loaders, and native SDK dependencies execute
from the OS-installed code location. Android restricts executing files downloaded
into writable app-private storage. Changing file permissions or retaining the
current unpacker is not enough to reproduce the existing execution arrangement.

Android supports installable splits and on-demand feature delivery. For a
sideloaded/GitHub edition, investigate system PackageInstaller sessions for signed
provider splits. A session's installed/new APKs must share package name, version
code, and signing certificate. The existing full app and the smaller edition
should remain the same product identity so projects and encrypted credentials
do not need migrating. Updating/installing a pack may require a system install
confirmation; do not promise silent installs, hot installation during a running
agent, or byte-identical APKs to the monolithic full edition.

### Download only what is actually selected

1. Install the base editor without agent runtimes. Local authoring, imports,
   validation, previews, and asset management must work without installing one.
2. Provider authentication and inference must use the permitted official CLI/SDK,
   never a direct inference API shortcut or fallback. Merely displaying a connection
   preset or listing a model must not download a provider. Missing or broken runtime
   installation must produce an actionable error, not change the inference transport.
3. When a user explicitly selects an on-device provider or starts a routed task
   that needs it, resolve that provider's ABI-specific dependency closure and show
   its version, download/storage requirements, source, and an install action.
4. Install only the requested provider and missing shared prerequisites:
   - Codex: official Codex executable, its code-mode helper, and its required
     PRoot/loader/library dependencies.
   - Claude Code: official Claude executable, the musl loader, and required shared
     execution dependencies. Do not fetch Codex or Cursor for Claude.
   - Cursor: official SDK, Node, ABI-specific native modules, and required shared
     execution dependencies. Do not fetch Codex or Claude for Cursor.
5. Reuse already verified dependencies and installed providers. Fetch another
   provider only after it is explicitly needed. Never prefetch every preset,
   every configured-but-unused connection, or the other CPU architecture.
6. Separate installation from account sign-in and inference. Do not send API keys
   or login tokens to package registries, GitHub downloads, or a pack builder.
   Downloading installation packages from official registries/CDNs is distinct
   from making inference requests; it does not authorize direct inference calls.

### Official upstream sources and "latest"

Our current recipes already obtain provider packages from the vendors' official
npm namespaces, Node from nodejs.org, and compatibility libraries from their
upstream distribution sources. Retain those origins and exact upstream bytes.
Packaging them into a Workbench-signed split does not turn the runtime into a
vendor-issued Android package or grant redistribution rights beyond vendor terms.

For reliable execution, track the newest upstream release, validate it against the
adapter/ABI, then publish a signed compatible pack. An unqualified npm `latest`
cannot safely be installed blindly: versions, authentication protocols, loader
requirements, and model/tool behavior can change. Display both the newest known
upstream version and the latest qualified available pack if they differ.

Fetching raw upstream archives on the phone would still leave the native-code
installation/signature problem. Never ship our private APK signing key inside the
app to solve it. The maintainable candidate is to build/sign packs from official
sources outside the phone and let the phone fetch only qualified signed packs.
This does not meet a literal requirement that every runtime byte be downloaded
directly from a vendor's server by the phone; that stricter variant remains
unproven and must not be advertised as equivalent to the full install.

### Local signed-pack prototype

`tools/android/prototype_provider_packs.py` now builds an isolated editor-only
base, shared execution support, and individual Codex, Claude, and Cursor feature
splits from an already qualified full APK. It does not fetch a new vendor version,
modify vendor files, change the normal Gradle build, or publish anything. All
runtime payload paths and SHA-256 hashes are checked against the full APK; every
output APK is aligned and signed with the same certificate as that APK. Unknown
native files fail packaging rather than silently landing in the wrong pack.
Legal notices and existing editor resources stay in the base.

The prototype catalog records exact APK sizes/hashes, signing identity, source
APK hash, ABI, payload hashes, and dependency/install sets. It is explicitly marked
`prototype: true` and `distributionApproved: false`. It is a local test manifest,
**not a remotely trusted update catalog**. `plan_packs` resolves only the selected
providers and missing prerequisites, reusing installed shared support.

Measured signed APK sizes (MiB; download size, not Android's installed size):

| Payload | ARM64 | x86-64 |
| --- | ---: | ---: |
| Editor-only base | 11.58 | 11.58 |
| Shared execution support | 1.13 | 1.22 |
| Codex pack | 123.81 | 130.69 |
| Claude pack | 108.12 | 108.18 |
| Cursor pack | 57.89 | 58.61 |
| Base + support + Codex | 136.52 | 143.49 |
| Base + support + Claude | 120.83 | 120.99 |
| Base + support + Cursor | 70.60 | 71.41 |

These packs reuse the currently qualified upstream versions, not untested
`latest` packages. Building all packs locally is not prefetching every provider
on a user's phone. The normal full/offline APK remains unchanged.

Build a local prototype with the existing signing identity; supply the password
through an environment variable, never a command-line password or source file:

```sh
python3 tools/android/prototype_provider_packs.py \
  --full-apk android/app/build/outputs/apk/release/app-arm64-v8a-release.apk \
  --abi arm64-v8a --sdk "$ANDROID_HOME" \
  --keystore "$HOME/.android/debug.keystore" --alias androiddebugkey \
  --password-env VOYAGE_PACK_KEY_PASSWORD \
  --output .android-lab/provider-packs-arm64-prototype
```

Use a fresh output directory; existing outputs are never replaced. Signing keys
remain outside the source tree and are never included in an APK or catalog.

`tools/android/probe_provider_packs.py` exercises the install/runtime lifecycle
through ADB. It refuses physical phones and all AVDs except the dedicated
`voyage-provider-packs-api36` lab emulator. It checks payload hashes and certificates
before installation. It replaces only that disposable emulator's test app, never
uninstalls it, and checks that a local-edit fixture and a Keystore-encrypted secret
survive full/base/split/full transitions. For an x86-64 prototype:

```sh
python3 tools/android/probe_provider_packs.py \
  --serial emulator-5558 --sdk "$ANDROID_HOME" \
  --packs .android-lab/provider-packs-x86_64-0.2.10 \
  --full-apk android/app/build/outputs/apk/release/app-x86_64-release.apk \
  --test-apk android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
```

The lab installation uses privileged ADB, not the end-user PackageInstaller
approval UI. This does not establish a silent in-app installation capability.
The probe tests Claude's CLI version, Cursor SDK status, and Codex app-server
initialization without login or inference. It also checks absent providers are
not installed. T3's device integration failed, so the lab uses the existing
Android SDK emulator directly; it is not a test on the user's physical phone.

On October 15, 2026, the API 36 x86-64 emulator passed all seven lifecycle smoke
checks: full install, full-to-editor transition, editor restoration after the
incomplete-pack experiment, Claude-only install, adding Cursor, adding Codex,
and returning to the full build. The encrypted-secret and local-edit fixtures
survived every transition. Both architectures' pack builds passed APK signature,
alignment, and exact-payload checks. ARM64 execution, end-user installation
approval, real login/inference, and interrupted/update recovery remain unqualified.

An important finding: this non-isolated split layout's `uses-split` declaration
does **not** make Android reject a provider installed without its shared pack on
the tested API 36 emulator. Therefore the future installer must enforce the
catalog dependency closure itself and runtime readiness checks must verify the
entire dependency set. Do not expose a provider as usable merely because its main
executable exists. The probe deliberately observes this case, restores the editor
base, and then installs the complete provider closure.

### Historical prototype qualification checklist

- Prototype one provider on ARM64 and x86-64 using OS-installed signed code, first
  from a clean base and then when switching between full and smaller editions.
- Verify native library lookup and PRoot execution across base/feature splits;
  our current single `nativeLibraryDir` assumption needs explicit testing.
- Validate user install approval, interrupted download/install, cancellation,
  insufficient storage, reinstall, app/pack updates, and rollback behavior.
- Use a trusted catalog with provider ID, exact version, host compatibility,
  ABI, dependency graph, sizes, hashes, official origin, and license metadata.
  Validate the APK signing certificate and package/version before installation.
- Enforce dependency closures in both installation planning and runtime readiness;
  do not rely on this prototype's `uses-split` declaration alone. The production
  settings/download UI, catalog trust/update path, and system install approval flow
  have not been implemented by this prototype.
- Keep active tasks on their existing runtime; stage updates for the next safe
  restart. A failed update must leave the previous working installation usable.
- Compare the prepared SDK tree, native binaries, helper commands, credential
  isolation, tools, images, model discovery, cancellation, and outputs against
  the full build. Installing all providers should yield equivalent runtime files
  and behavior, not a claim that the OS's package layout is identical.
- Recheck each provider's distribution/SDK terms and dependency source obligations.
  Existing permission to use a subscription is not blanket redistribution consent.
- For Google Play, review Feature Delivery and executable-download policies
  separately; GitHub sideload feasibility does not establish Play compliance.

Do not create a second package ID, introduce root/Termux requirements, downgrade
the Android target, embed a signing key, bypass platform execution restrictions,
or remove current offline/full-build capabilities to make the prototype work.

Primary Android references:

- https://developer.android.com/about/versions/10/behavior-changes-10#execute-permission
- https://developer.android.com/reference/android/content/pm/PackageInstaller.Session
- https://developer.android.com/guide/playcore/feature-delivery/on-demand
- https://developer.android.com/privacy-and-security/risks/dynamic-code-loading
