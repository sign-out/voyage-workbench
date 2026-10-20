# Voyage Workbench 0.2.14 test hotfix

## World grading

- A separate **All tools → World grading** assistant bundles the supplied
  Voyage Static World Rubric v1.6 and accepts compatible updated JSON rubrics.
- Explicit grading and regrading use the configured Planning model. Reports
  retain their committed assessment lens, source evidence, score intervals,
  strengths, missing information, and prioritized improvement opportunities.
- Reports and rubric settings persist per project. Source or rubric changes
  mark earlier reports stale; failed or canceled runs preserve prior reports.
- Optional **Suggest Work Order** creates an unapproved proposal for human
  review. Grading never edits the world or appends to Planning chat.

## Magic-wand field completion

- Supported text fields and sections can request contextual completion with
  explicit instructions using the configured Planning model.
- Only eligible blank text and provenance-tracked untouched text defaults are
  fillable. Existing authored text, identifiers, references, media URLs, code,
  and non-text choices are preserved.
- Generated text updates the local editor draft, not the applied or remote
  world. Completed fields are highlighted; Undo preserves subsequent edits.
- Changed fields, canceled tasks, and stale editor responses are not blindly
  applied. Model requests are explicit and may incur provider charges.

## Packaging and limitations

Android version code is 16. APKs retain the existing update-signing identity;
Windows uses the existing self-signed test certificate, and Linux archives and
checksums have detached signatures. This remains a test release, not a
publicly trusted production signing certificate.

World grading assesses static source only: it does not certify runtime
behavior, player engagement, or release readiness. A cover URL is not inspected
image evidence. Updated rubrics must retain the supported scoring formulas;
weights, caps, descriptions, and supplemental instructions may change.

Validation uses deterministic model fixtures rather than paid live grading or
completion requests. Responsive browser checks and native engine tests do not
replace physical-device testing.
