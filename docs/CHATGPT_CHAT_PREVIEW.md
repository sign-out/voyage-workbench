# Desktop ChatGPT Chat preview

Run the normal desktop build and start Voyage. The **ChatGPT Chat · Preview**
button opens the real ChatGPT website in an isolated embedded view. Sign in
inside that view; this session is separate from Voyage's model-provider login.
Close Chat returns to the workspace. Reopening preserves the Chat session.
The embedded ChatGPT page's custom right-click menu (including **Ask ChatGPT**)
is replaced with standard editing actions. Both the chat view and local editors
have native Copy/Paste and selection menus, with Undo/Redo/Cut in editable fields.
Keyboard copy/paste and the response Copy button remain available.
The matching **Ask ChatGPT** button/menu item is also hidden when inserted
dynamically, including selection popups that do not use a right-click event.
Hiding **Ask ChatGPT** applies only to the embedded chat page, not sign-in pages
or local editors. Cut/Copy are disabled for password fields.

This is an embedded-chat prototype, not a provider integration. It sends no
world context or prompts automatically and does not scrape conversation content.
Usage accounting is not verified; this does not promise a separate allowance.

## Save response → review → build

1. Copy the response you want inside ChatGPT. Select **Save response as plan**.
2. Paste it into **Plan text**, add a title, and review/edit locally. The native
   remote page is hidden while this local editor is open. **Back to ChatGPT**
   returns to the same chat view/session.
3. **Save plan locally** saves one plan per project (replacing its previous
   version). Saved plans live in project metadata/history archives, never world
   JSON exports. Unsaved review drafts are stored separately on this device and
   restored when reopening; storage failures are shown, not silently ignored.
   Revision checks reject overwriting another saved revision. Save receipts
   update the project-scoped draft even if review closes before completion,
   preserving edits made after reopening. For genuine conflicts, **Keep my
   edits against saved revision** preserves the draft and explicitly rebases it
   before a separate Save; **Reload saved plan** instead discards the draft
   only after confirmation.
   Late responses cannot replace a newer loaded project snapshot or a reopened
   workspace's state; their draft acknowledgments remain project-scoped.
4. **Build this plan…** loads the saved title and plan into the existing Work
   Order form after confirmation before replacing a populated form. It resets
   scope and planner-suggestion links; no old approval or scope is inherited.
5. Review scope, stage/provider/model, and local apply settings, then explicitly
   start the Work Order. This uses the normal work pipeline/context and build
   allowance. Saving or loading a plan never starts a model task. The chat
   transcript is not transferred. Work Order limits currently require at most
   100 nonempty requirement lines, each at most 10,000 characters; oversized
   plans can be saved but must be shortened before handoff.

No automatic clipboard reading, account-token access, or remote-page bridge is
added. **Save response as plan** is disabled until a local project is open.
Run `tools/chat-plan-smoke.cjs` under Electron after building for an isolated
local workflow check. It uses a temporary profile, never the signed-in profile,
and does not start paid work.

The remote view has no preload or Voyage bridge, no Node integration, enabled
sandboxing and context isolation, a separate persistent browser session, denied
permissions/downloads, and restricted navigation/popups. Unsupported sign-in
providers or external destinations are blocked, not opened automatically.
The Open in browser control opens only the fixed ChatGPT home URL and does not
transfer the embedded session. No user-agent spoofing, private endpoint replay,
certificate exceptions, or challenge bypasses are used.

After building, run `node_modules/electron/dist/electron tools/chat-panel-smoke.cjs`
with `ELECTRON_RUN_AS_NODE` unset. The smoke test uses a fresh temporary profile,
checks isolation, navigation blocking, close/reopen behavior, and records the
anonymous page and screenshots under `.build-tools/chat-panel-qa/`. It cannot
verify authenticated chat without the user's sign-in.

Local validation on October 23, 2026: the anonymous ChatGPT home and email/
Google/Apple sign-in chooser rendered in Electron. Isolation, blocked external
navigation, and closing/reopening the same view passed. Authenticated responses,
account persistence across app restarts, and usage accounting were unverified
at that point. The user subsequently reported successful login, panel reopen,
and expected behavior after restarting the preview. Usage accounting remains
unverified; this is user-reported feasibility, not automated authenticated QA.

Follow-up: submitting a synthetic reserved-domain username reproduced the black
page during navigation to `auth.openai.com`. The auth destination was allowed,
not blocked by Voyage's navigation policy. A separate sandboxed Electron window
also failed to complete that navigation during the bounded comparison. The
authenticated flow was not yet validated during that reproduction. Home provides recovery; a
25-second loading watchdog replaces a stalled native view with an explanation.
Copy diagnostics contains only timestamps, origins and event/error codes; it
does not include URL paths, queries, credentials, cookies or conversation text.

A subsequent clean-profile control reached the authentication email form in
both an ordinary Electron window and an embedded view. The failure is therefore
not a demonstrated blanket rejection of Electron or an always-blocked origin.
If account-specific sign-in failures recur, collect the safe diagnostics.
The watchdog stops once the main document is ready, so a slow background
resource alone does not hide a working sign-in page.

`tools/chat-panel-recovery-smoke.cjs` tests the timeout without submitting a
login: it holds a test request, accelerates only the watchdog timer, and verifies
that a stall hides the native page, remains hidden on resize, and can be closed.

Regression audit on October 24, 2026: all 382 TypeScript/UI tests, typecheck,
web/desktop builds, and the plan, recovery, and context-menu Electron checks
passed. The live anonymous page and sign-in form also loaded in a fresh profile;
no credentials were submitted. Real right-click input opens editing menus in
both views, while the ChatGPT action is hidden and password Cut/Copy is disabled.
All five Electron fixtures explicitly return a nonzero exit code on failure;
intentional assertion failures verified this separately from the success paths.
Popup lifecycle regression checks reject delayed requests while Chat is hidden,
destroy stale popup creations even after reopening, retain allowed sign-in
popup communication, and ensure closing Chat cannot be canceled by a popup's
before-unload handler. Popups are created hidden and shown only while their
original panel generation is still active.
Actual middle-click/Ctrl-click link checks cover the separate browser-side
opening path, including referrer policy. Target-blank form submission checks
also verify that the destination receives the POST body and content type.
