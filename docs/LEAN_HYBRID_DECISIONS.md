# Voyage Workbench: implementation decisions and Android feasibility

Date: 3 October 2026. Applies to the supplied [Lean Hybrid Final Plan](Voyage_Workbench_Lean_Hybrid_Final_Plan.md), preserved unchanged alongside this decision record.

## Decision

Proceed with the lean hybrid architecture. A real subscription-authenticated Codex task has now run **inside an Android 16 application** on this machine's x86-64 emulator. It called a Workbench-owned tool, produced a staged candidate, left the active world unchanged, and the candidate survived force-stop and explicit acceptance after restart.

This is a successful runtime experiment, not a completed Android or Windows Workbench. Physical ARM64 testing, the shared TypeScript migration, Windows packaging, performance qualification, and Android's own sign-in UX remain implementation work.

Engineering confidence after this experiment: Windows implementation **9/10**; Android product implementation **8.5/10**; reliable local Android Codex across supported physical devices **8/10**, subject to the device qualification below. These are judgments, not measured probabilities.

## Selected implementation

| Boundary | Choice | Reason |
| --- | --- | --- |
| Feature UI | React + Vite, shared features with DesktopShell and MobileShell | Preserve one product implementation while adapting navigation and review to each screen. |
| Shared core | TypeScript, lossless source/token representation, worker-based heavy processing | Preserve unknown fields and numeric spelling without blocking the UI. Port the existing document behavior and fixtures. |
| Windows container | Electron, with a restricted preload bridge and provider supervision outside the renderer | Direct Node process/stdio integration reduces the first desktop integration risk. Accept its higher idle memory and measure it. |
| Android container | Capacitor WebView, with Kotlin platform plugins | Reuse React while keeping file picking, secure storage, notifications, and background work native. |
| Android execution | Separate-process foreground service, SQLite journal, minimal PRoot compatibility layer, pinned Codex binaries | The experiment proves this combination can perform a real task without a complete Linux distribution. |
| Provider interface | Version-pinned Codex app-server over private stdio | Structured events and tools; no terminal-text scraping. Check actual capabilities on launch. |
| Planning | A separate Codex conversation exposing read/search tools only | Uses the supported subscription path already exercised; avoids assuming a separate consumer-chat API exists. |
| Work implementation | Work Order plus staged world and narrowly scoped editing tools | The first Android release does not need arbitrary shell execution to perform large structured edits. |
| Remote execution | Keep AgentHost compatible; bring the remote adapter forward as a fallback | Handles unsupported devices and long tasks without changing the review/accept workflow. Local execution remains a product target. |
| Durability | Platform-owned SQLite transactions with shared command contracts | The native host can preserve results when the React/WebView process disappears. |

The experiment is written in Java to avoid adding Gradle/Kotlin/plugin infrastructure before proving the runtime. It validates the service/process boundaries; it is not the production Capacitor plugin.

## What was actually tested

Machine: CachyOS Linux, Intel i7-6700, approximately 16 GiB RAM, usable KVM. Installed tooling is isolated under `~/.local/share/voyage-android`; no system package installation or shell-profile changes were required.

Environment: Android 16 / API 36 AOSP x86-64 image, emulator 37.2.12.0, 2 virtual CPUs, 2 GiB guest RAM, SELinux **Enforcing**. Tests did not use `adb root`, permissive SELinux, or a privileged application UID.

| Test | Result | Limit of the result |
| --- | --- | --- |
| Existing Python suite | 176 tests passed | Existing application baseline, not the proposed TypeScript app. |
| Real desktop Codex task | Passed; candidate produced, active source and unsafe integer preserved | Executed on Linux, not a Windows installation. |
| Direct Linux Codex launch from Android app | Failed with SIGSYS; traced to x86-64 `poll` | A development-shell launch succeeded, demonstrating why shell-only tests are inadequate. |
| Minimal PRoot + Codex app-server under Android app UID | Passed | No full Linux root filesystem was installed. |
| Real Android Codex task | Passed, using provider-advertised default `gpt-6-astra` | Used a temporary private copy of the existing local Codex login; not an Android OAuth/device-login UX test. |
| Real candidate after force-stop and reopen | Explicit acceptance passed | Synthetic world, not a live Voyage save. |
| Kill UI process during work | Service continued and heartbeat advanced | Deterministic native service job; not a multi-hour model benchmark. |
| Kill agent service process | Recovered as INTERRUPTED, with preserved world | No claim that killed providers always support native resume. |
| Force-stop whole app | Stayed stopped until reopened; recovered safely | Correct Android force-stop behavior; no promise of automatic resurrection. |
| Cancel work | CANCELED journal state persisted | Bounded synthetic job. |
| Accept stale proposal | Rejected without overwriting newer manual edit | Exact base/source comparison in the lab fixture. |
| Candidate persistence and numeric token | Survived restart and acceptance with `9007199254740993` preserved | Lexical preservation of a fixture, not a general Android lossless parser benchmark. |
| ARM64 emulator on this Intel host | Explicitly unsupported by Google's emulator | Physical ARM64 validation remains necessary. |

The signed x86-64 debug probe APK is approximately **133 MiB**, including Codex, its code-mode companion, PRoot, and diagnostic dependencies. This is an observed test-build size, not a promised production download size. The provider binaries dominate the package; no large local model or full Linux distribution is included.

The provider processes exited after completion. The temporary Android authentication copy was removed. No real Voyage world was uploaded or saved.

Machine-readable results: [evidence/android-runtime-2026-10-03.json](evidence/android-runtime-2026-10-03.json).

## Android runtime details that are now resolved

1. Package executable payloads as extracted native libraries in the APK. The lab launches the installed `libcodex.so` from `nativeLibraryDir`; do not design around executing arbitrary downloaded binaries from writable app storage.
2. Use the minimal PRoot launcher on demand. It supplies the Linux compatibility needed by the tested binary while keeping the existing Android app security boundary. PRoot itself is **not** an additional security sandbox.
3. Supply the active Android network's DNS servers through a generated, bound `resolv.conf`. Refresh network configuration when networks change in the production implementation.
4. Supply trusted certificate material from Android's certificate store to the provider runtime. TLS verification stays enabled.
5. Include Codex's **code-mode host companion**, not just its main executable. The main server can start and call the model without this companion, but tool execution then fails. The lab binds the companion's expected filename to its packaged executable.
6. Supervise through private stdio, with bounded event queues and timeouts. Persist the candidate before declaring a proposal ready; stop the runtime after the task.
7. Start with Workbench-owned structured editing tools. The test does **not** prove general shell execution, a functioning Linux bubblewrap sandbox, or arbitrary third-party coding CLIs on Android. Codex emitted a bubblewrap prerequisite diagnostic; the tested task did not require shell access.

Pin and qualify the provider/runtime versions together. The experiment used Codex `0.156.1` and Termux PRoot `5.1.107.96`. Runtime changes ship through a controlled signed application/runtime update, with appropriate third-party notices and source obligations handled before distribution.

## Required corrections to the plan

### Separate draft recovery from checkpoints

Keep the active working representation in memory, but durably recover ordinary edits, including invalid raw JSON drafts. Use debounced draft persistence or a bounded edit journal; named checkpoints remain the stronger intentional history boundary. Do not claim a draft is saved on-device until the database commit is acknowledged.

Before launching a task, atomically store its exact base source, base hash, Work Order, reference fingerprint, provider version, and attempt ID. A hash alone is not a recoverable base world. The service cannot depend on the UI's in-memory copy.

### Native background ownership

The UI submits a committed task ID to the native host. The host owns the process, cancellation, event persistence, and final candidate capture. React reads durable state after reconnecting. It does not have to remain alive to make a result durable.

Use task attempt IDs to reject late events from an obsolete run. A recovered task is either genuinely resumed by its provider or explicitly restarted from its persisted base and Work Order. Never relabel a restart as a resume.

Suggested transactional boundary methods:

```text
prepareTask(baseSource, baseHash, workOrder, referenceFingerprint, attemptId)
appendTaskEvents(taskId, attemptId, sequence, events)
publishCandidateIfCurrentAttempt(taskId, attemptId, candidate)
acceptCandidateIfBaseMatches(candidateId, expectedActiveHash)
prepareRemoteSave(frozenPayload, validationFingerprint, expectedETag)
markSendAttempted(operationId)
```

The core owns policy; the platform store atomically enforces the preconditions. Implement the same behavioral tests against both platforms.

### Correct the remote-write crash window

Section 45 currently puts `SAVE_DISPATCHED` after the network write. Replace this with a durable **SEND_ATTEMPTED** transition *before* issuing the request:

```text
freeze accepted source and revision
→ validate that exact source
→ atomically persist payload + expected ETag + SAVE_PREPARED
→ commit SEND_ATTEMPTED
→ conditional HTTP write
→ record response
→ reread and compare the expected content/revision
→ SAVE_CONFIRMED + checkpoint
```

After a crash, every unresolved SEND_ATTEMPTED operation is potentially sent, even if the process died before opening a socket. Reconcile by reading the remote state; do not blindly replay. A read that still shows the old world does not by itself prove that a previously dispatched request cannot finish later.

Task state and remote-save state should be separate. An accepted agent task can finish without a Voyage connection or a remote save.

### Reject stale candidates and stale validation

Compare the current active source/revision with the proposal's base at acceptance inside the same database transaction that applies the candidate. If it changed, require a new proposal or an explicit merge review. Revalidate when the candidate or relevant validation references change.

Distinguish an exact-source hash used for local recovery from remote content comparison. Voyage can change formatting or its response envelope; neither arbitrary key sorting nor raw HTTP-body equality is a universally correct semantic comparison. Treat unexplained read-back differences as unresolved rather than synchronized.

### Make reference provenance explicit

The official production OpenAPI endpoint was fetched successfully during this experiment and reports `1.2.0-preview`, including conditional world replacement and validation. The current community schema URL returned **403** from this machine. That does not establish a universal outage, but it proves fresh reference access cannot be required for startup.

Bundle a versioned seed reference set; load a last-known-good cache; replace a complete reference bundle only after validation. Show source, age, fingerprint, and unresolved bindings. Official remote validation, community schema checks, and inferred routing rules are different evidence sources and must stay distinguishable.

### Set measurable performance gates

Initial benchmark matrix: the real supplied world, then synthetic **5 MiB, 20 MiB, and 50 MiB** worlds with large strings, arrays, unsafe integers, and unknown fields. Test import, tree navigation, raw editing, diff, validation, task staging, and recovery. Measure peak memory across active source, candidate, index, and diff, not just parser time.

Proposed first qualification target: Android 12+ ARM64, 6 GiB RAM or more, with 20 MiB worlds; stress larger documents and lower-memory devices before claiming support. These are targets, not performance results from this experiment. Keep parsing/diffing off the UI thread and virtualize trees/diffs.

## Build sequence

1. **Completed feasibility gate:** real desktop and Android Codex tool calls, minimal Android host, foreground lifecycle, interrupted-task recovery, and candidate acceptance checks.
2. Port the existing lossless document behavior into a shared TypeScript core, using current fixtures/tests as compatibility requirements. Define durable command contracts and corrected save states at this stage.
3. Build the React editor/review features and Electron desktop container. Exercise the first complete workflow on Windows; sign/package only after that test passes.
4. Build the Capacitor shell and Kotlin service/store bridge; reuse the proven host arrangement. Test Android's actual sign-in flow and ARM64 binaries on a physical device, including screen-off, battery restrictions, network changes, cancellation, and restart.
5. Add separate planning conversations and Work Order creation on the same supported Codex account integration. Keep planning tools read-only.
6. Add the remote host adapter using the same task/result contracts, then qualify long tasks and unsupported-device fallback.
7. Qualify large-world performance, live authenticated Voyage validation/save on a disposable world, installers, upgrades, and recovery. Additional providers follow the stable Codex path.

Do not replace the existing working Python/browser app wholesale before parity is demonstrated. Its document logic, save guards, provider integration, and fixtures are useful implementation specifications. The attached plan still requires a substantial migration.

## Remaining release gates

- Physical ARM64 Android testing, including devices with 16 KiB memory pages and manufacturer battery policies.
- Android-native provider sign-in, credential refresh, and logout; the lab tested existing credentials rather than a complete sign-in UI.
- Windows-native build, provider launch, cancellation, installer, and update testing.
- Large-world performance and arbitrary JSON correctness in the shared TypeScript implementation.
- Real Voyage authenticated save/read-back validation; only the public API contract was fetched here.
- Production foreground-service classification, distribution/update method, and any store-specific review. The lab uses `specialUse` for a user-started experiment; this does not establish Play approval.

## Reproduce the lab

From the repository root, on this Linux machine:

```bash
python3 tools/android/bootstrap.py
python3 tools/android/fetch_termux.py
python3 tools/android/build_probe.py --codex "$HOME/.t3/tools/codex/0.156.1/bin/codex"
python3 tools/android/emulator.py start
~/.local/share/voyage-android/sdk/platform-tools/adb -s emulator-5556 install -r -g .android-lab/build/voyage-runtime-probe.apk
python3 tools/android/test_lifecycle.py
python3 tools/android/test_model.py
python3 tools/android/emulator.py stop
```

Use `python3 tools/android/emulator.py start --window` to show the emulator after it has been stopped. `test_model.py` requires an existing local Codex login and uses subscription capacity for one small synthetic task. It removes the temporary provider authentication file afterwards; do not replace the synthetic fixture with a real world for this feasibility test.

Source is under `experiments/android-agent/`. Build output, downloaded binaries, logs, and screenshots are under ignored `.android-lab/`. The probe is a debuggable diagnostics APK, not a distributable Workbench release. The existing app's production files were not migrated by this experiment.

Relevant contracts: [Codex app-server](https://developers.openai.com/codex/app-server), [Codex authentication](https://developers.openai.com/codex/auth), [Voyage production OpenAPI](https://api.aidungeon.com/creator/v1/openapi.json).
