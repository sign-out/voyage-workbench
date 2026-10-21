# Native cancellation regression

Run `python3 tools/android/test_cancellation.py` from the repository root.
It uses `JAVA_HOME`, defaulting to `~/.local/share/voyage-android/jdk`.
No device, SDK, network access, or provider credentials are needed.

The harness compiles the production `AgentTaskTarget` helper and extracts the
actual Host start/stop and AgentService start/command/startup-check methods.
Only Android infrastructure, storage, RPC, and worker scheduling are faked.
Workers and main-thread cleanup are advanced deterministically to test stops
before worker startup, before run-intent delivery, and during cleanup.

Coverage includes completed B while A runs, wrong projects with identical task
IDs, stale or missing attempts, matching cancellation, superseded starts,
login isolation, terminal/missing Host targets, and latest-start-ID cleanup.
`AgentTaskTargetTest` also runs in the Android project's normal JVM JUnit suite.
