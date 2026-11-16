# Codex sign-in and active-session handling

Workbench uses Codex CLI's managed authentication, not a direct OpenAI API-key
fallback or a custom OAuth client. All Workbench Codex profiles, model catalogs,
assistant tasks and artwork operations use its one retained provider/auth store.

## Reuse before signing in

- A user-requested sign-in first calls `account/read` with `refreshToken:false`.
  If Codex already has an account, Workbench reuses it and does **not** call
  `account/login/start`. An auth-free CLI provider does not trigger a ChatGPT
  login either. An unreadable or failed account check never becomes permission
  to allocate a new sign-in session.
- An already connected account disables another sign-in in the UI. Switching
  between Codex profiles, planning and artwork does not initiate authentication.
- Repeated clicks or requests while a login is pending return the **same**
  attempt. There is no automatic retry of device-code creation or of a remote
  active-session limit. No automatic logout is used to make room for a login.
- Desktop's explicit **Reuse existing CLI login** imports a file-based cache
  without requesting another OAuth login. A valid Workbench account takes
  precedence; it is not overwritten with a potentially older copied cache.
  This is a copy, not live synchronization. System-keychain-only CLI credentials
  are not importable by this file-based operation. Credentials never enter world
  JSON or history exports.

Codex app-server **processes**, model threads and authenticated account sessions
are different things. Reading status or spawning a CLI process with saved
credentials is not, by itself, a new OAuth sign-in. The public documentation
does not establish a universal numeric active-session cap; Workbench does not
invent one or attempt to bypass an account's limit.

## One bounded, owned attempt

The host creates a local attempt ID before it starts any asynchronous work.
Only after Codex confirms there is no existing account does it request a device
code. Completion is matched to the **returned loginId**, including notifications
that arrive before the start response. Old processes and mismatched or duplicate
events cannot complete or overwrite a newer attempt.

The UI displays the current code and official verification page, monitors the
local `loginStatus` endpoint, and refreshes account status after completion.
Polling that endpoint does not spawn Codex or create another authentication
session. Leaving and returning to the screen reconnects to the pending attempt;
it does not start over. Device-code login must be enabled in the account or
workspace's ChatGPT security settings.

Cancel targets that attempt's `account/login/cancel`, not `account/logout`.
Desktop waits for cancellation/cleanup before starting another attempt; Android
keeps a busy indicator until its foreground-service owner releases it. Stale
codes disappear on success, failure, cancellation or timeout. Workbench's own
15-minute pending-attempt window is a local cleanup policy, **not** a claim about
OpenAI's authenticated-session lifetime or session quota.

On Android, a stopped service/app process leaves an interrupted attempt, never
a restored working device code or automatic sign-in. Saved credentials remain
available for the next account check. Sign-out and credential replacement are
blocked while Codex model work is active. Closing the desktop app closes its
pending login process as well as its running agent processes.

## Limits of session management

A session-limit response is shown without generating new codes, forcing token
refresh, deleting credentials, signing out automatically, or falling back to
API billing. Refresh status to see whether an existing sign-in is usable first.
If the account still requires session management, use OpenAI's own account
controls or support for sessions you no longer need.

The documented app-server interface has no global session inventory or endpoint
for revoking other applications' sessions. Workbench does not pretend that
canceling a device code, closing a local process, or clearing a local cache
revokes those sessions. **Sign out of Workbench Codex** is an explicit action
against the CLI auth store used by this app, not an account-wide cleanup button.
Uninstalling Android removes that app-private store; do not uninstall merely to
try to resolve a remote active-session cap. Updating in place preserves it.

## Protocol evidence and validation

Official OpenAI documentation checked November 14, 2026:

- [Codex authentication](https://developers.openai.com/codex/auth/): managed
  credential storage, headless/device authentication, and explicit credential
  cache copying.
- [Codex app-server authentication](https://developers.openai.com/codex/app-server/):
  `account/read`, managed device-code login, completion `loginId`, cancel, and
  logout. These calls use Codex CLI; they are not model inference requests.

Consolidated tests exercise actual host call counts and ownership, early/stale
notifications, saved-auth reuse, malformed/uncertain account reads, cancellation
before replacement, session-limit non-retry, UI completion/code cleanup, and the
same state helpers through the Android Rhino bridge. Fixtures use synthetic
credentials and mocked Codex RPC; they do not create real account sessions,
revoke a user's login, test an actual account cap or exercise a physical phone.

Local validation: the 654-check JS/TS suite passed, along with the shared build,
typecheck, 14 built-native bridge checks, Android Java compilation and seven
focused Android JVM checks. Focused login/connection workflows were rerun after
the final stale-status/UI adjustments. This implementation validation did not
perform any real login or logout. The changes are included in Workbench's
`v0.2.25-test` prerelease; see its release notes for distribution checks and limits.
