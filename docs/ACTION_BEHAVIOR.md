# Actions stay where you invoked them

A button named for an action must perform that action from the current screen.
It must not silently navigate to a different workspace and require a second
button to start the promised work. Buttons that open tools say **Open…**.
Explicit setup, approval and image inspection can happen in place.

- **Generate portrait** starts the shared artwork workflow from Characters,
  shows named preparation/generation/saving feedback and previews the actual
  result there. Generation stores the asset and journal; it does not upload or
  attach it. Failed requests are not retried automatically.
- Header and Files & sync **Save to Voyage** invoke the same save action as the
  Voyage panel, with approval, official validation, conditional saving and
  read-back recovery. Progress and results appear on the current screen.
  Missing links or the matching environment's key explain the setup required
  without navigating. **Open Voyage connections** and **Open private-draft
  setup** are explicit navigation choices. Unapplied edits block the save.
- **Suggest Work Order** creates the suggestion and reports it on the grading
  screen. Planning is opened through normal navigation when the creator chooses.
- The asset library uses **Open artwork studio** and **Open soundtrack editor**;
  the assistant uses **Open provider connections**. These labels promise tool
  navigation, rather than generation, editing or a connection test.

For future actions, share the operation implementation between its full editor
and contextual controls. Keep the exact target, source/revision checks,
duplicate-click protection, durable receipts and uncertainty handling. Keep
navigation out of operation helpers. Test the resulting workflow with delayed
success/failure and stale context, rather than asserting only button text.

See [scrollable lists and reachable editors](UX_LAYOUTS.md) for the shared
list/detail layout and controls that must remain accessible in short windows.
