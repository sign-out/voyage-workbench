package dev.voyage.workbench;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import java.io.*;
import java.util.*;
import static org.junit.Assert.*;

public class CursorRuntimeTest {
    final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test public void officialSdkLoadsUnderAppUidWithoutCredentialsOrInference() throws Exception {
        assertTrue(CursorRuntime.available(app));
        assertEquals("1.0.37", CursorRuntime.metadata(app).getString("sdkVersion"));
        JSONObject status = CursorHarness.status(app, "cursor-runtime-test");
        assertFalse(status.toString(), status.getBoolean("loggedIn"));
        assertFalse(status.has("apiKey"));
    }

    @Test public void encryptedCursorCredentialsStayOutOfRuntimeFilesAndExpireLocally() throws Exception {
        String id = "cursor-vault-test";
        Secrets secrets = new Secrets(app);
        try {
            secrets.set("cli-auth-" + id, new JSONObject().put("apiKey", "private-cursor-fixture").put("apiKeyExpiresAtMs", System.currentTimeMillis() + 60000).toString());
            assertFalse(app.getSharedPreferences("secrets", 0).getString("cli-auth-" + id, "").contains("private-cursor-fixture"));
            assertTrue(CursorHarness.status(app, id).getBoolean("loggedIn"));
            File session;
            try (CliRuntime runtime = new CliRuntime(app, id, "cursor")) {
                session = runtime.home;
                assertFalse(new File(session, "config/.credentials.json").exists());
                assertFalse(new File(session, ".cursor/sdk/auth.json").exists());
            }
            assertFalse(session.exists());
            secrets.set("cli-auth-" + id, new JSONObject().put("apiKey", "private-cursor-fixture").put("apiKeyExpiresAtMs", 1).toString());
            assertFalse(CursorHarness.status(app, id).getBoolean("loggedIn"));
            secrets.set("provider-" + id, "manual-fixture");
            assertEquals("api-key", CursorHarness.status(app, id).getString("authMethod"));
        } finally { secrets.set("cli-auth-" + id, ""); secrets.set("provider-" + id, ""); }
    }

    @Test public void cursorResponseRejectsFailedAndDuplicateFinalEvents() throws Exception {
        String event = "{\"voyageCursor\":1,\"type\":\"turn-complete\",\"result\":\"ok\"}";
        assertEquals("ok", CursorHarness.response(event, "turn-complete").getString("result"));
        for (String output : Arrays.asList(event + "\n" + event, "{\"voyageCursor\":1,\"type\":\"error\"}", "{\"type\":\"turn-complete\"}")) {
            try { CursorHarness.response(output, "turn-complete"); fail("Invalid SDK response accepted"); }
            catch (Exception expected) { assertNotNull(expected.getMessage()); }
        }
    }

    @Test public void officialSdkBrowserSignInInitializesAndCancelsWithoutSavingCredentials() throws Exception {
        String id = "cursor-login-handshake-test";
        CliLogin.prepare(id);
        Thread login = new Thread(() -> { try { CliLogin.run(app, id, "cursor", () -> false); } catch (Exception expected) {} });
        login.start();
        try {
            long deadline = System.currentTimeMillis() + 45000;
            while (!"waiting".equals(CliLogin.status(id).getString("state")) && System.currentTimeMillis() < deadline) {
                if ("failed".equals(CliLogin.status(id).getString("state"))) fail(CliLogin.status(id).optString("error"));
                Thread.sleep(100);
            }
            assertEquals("waiting", CliLogin.status(id).getString("state"));
            java.net.URI url = new java.net.URI(CliLogin.status(id).getString("url"));
            assertEquals("https", url.getScheme());assertEquals("cursor.com", url.getHost());assertEquals("/loginDeepControl", url.getPath());
            CliLogin.cancel(id);
        } finally { CliLogin.cancel(id); login.join(10000); }
        assertFalse(login.isAlive());
        assertEquals("", new Secrets(app).get("cli-auth-" + id));
        assertFalse(CliRuntime.active(id));
    }

    @Test public void canceledCursorSubprocessCannotReturnSuccess() throws Exception {
        try (CliRuntime runtime = new CliRuntime(app, "cursor-cancel-test", "cursor")) {
            try { runtime.execute(Collections.emptyList(), "{\"operation\":\"status\"}\n", "", () -> true, 30, true); fail("Canceled Cursor operation returned success"); }
            catch (IOException expected) { assertTrue(expected.getMessage().contains("canceled")); }
        }
    }
}
