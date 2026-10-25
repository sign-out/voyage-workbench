# Voyage Workbench 0.2.17 test release

- Desktop ChatGPT panel supports saving a response as a local plan, reviewing
  and editing it, and handing it to a Work Order. Running remains explicit.
  This panel is desktop-only; Android provider workflows remain unchanged.
- Assistant recovery is enabled by default with three corrective attempts,
  configurable from one to ten. One shared task budget covers correctable tool
  and supported completion-format errors. Cancellation, scope, authentication,
  and transport failures do not silently restart tasks or replay mutations.
- Work tasks can preserve durable local section checkpoints, isolate newly
  introduced validation errors, and correct a failing group without discarding
  completed sections. History restores as a reviewable proposal. Local rollback
  is not a guarantee of remote rollback.
- Voyage API transport, publication recovery, validation gates, and image upload
  constraints have stronger retry boundaries and actionable recovery messages.
  Alpha-only routing remains deliberate.
- Includes a disposable local V36 sandbox fixture for checkpoint and review
  testing; it is not a remotely created or published world.

Validation: 444 regression tests, five authenticated-runner synthetic safety
tests, typecheck, production build, and Android JVM tests passed. Android
instrumentation compiled but was not run on a device. Ten bounded authenticated
Alpha reads/validations passed previously; no remote writes, publication, live
uploads, or paid generation were included in those checks.

Android version code is 19 and retains the existing update-signing identity.
Windows uses the existing self-signed test certificate. Linux archives and
checksums use detached signatures. This is a prerelease, not a publicly trusted
production-signing claim. Native Windows execution and physical-device testing
remain unverified.
