package dev.voyage.workbench;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import static org.junit.Assert.*;

public class CliRuntimeTest {
    final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test public void officialBinaryStartsUnderAppUid() throws Exception {
        assertTrue(CliRuntime.available(app));
        try (CliRuntime runtime = new CliRuntime(app, "runtime-test")) {
            String output = runtime.execute(Arrays.asList("--version"), "", "", () -> false, 30, true);
            assertTrue(output, output.contains("2.1.295 (Claude Code)"));
        }
    }

    @Test public void officialCliRecognizesConstrainedHarnessArguments() throws Exception {
        Core core = new Core(app);
        JSONObject route = new JSONObject().put("model", "");
        JSONArray wire = (JSONArray)core.doc("claudeArguments", route);
        List<String> args = new ArrayList<>();
        for (int index = 0; index < wire.length(); index++) args.add(wire.getString(index));
        args.add("--help");
        try (CliRuntime runtime = new CliRuntime(app, "runtime-test")) {
            String output = runtime.execute(args, "", "", () -> false, 30, true);
            assertTrue(output, output.contains("--no-session-persistence"));
        }
    }

    @Test public void credentialsAreEncryptedAndTransientStateRemoved() throws Exception {
        Secrets secrets = new Secrets(app);
        String profile = "runtime-vault-test";
        File session;
        try {
            try (CliRuntime runtime = new CliRuntime(app, profile)) {
                session = runtime.home;
                Files.write(new File(session, "config/.credentials.json").toPath(), "{\"testToken\":\"private-fixture\"}".getBytes(StandardCharsets.UTF_8));
                runtime.retainAuthentication();
                String ciphertext = app.getSharedPreferences("secrets", 0).getString("cli-auth-" + profile, "");
                assertFalse(ciphertext.contains("private-fixture"));
            }
            assertFalse(session.exists());
            try (CliRuntime runtime = new CliRuntime(app, profile)) {
                assertTrue(new String(Files.readAllBytes(new File(runtime.home, "config/.credentials.json").toPath()), StandardCharsets.UTF_8).contains("private-fixture"));
            }
        } finally { secrets.set("cli-auth-" + profile, ""); }
    }

    @Test public void parallelSessionsFailClosedAndOrphansAreRemoved() throws Exception {
        File root = new File(app.getCacheDir(), "cli-sessions"), orphan = new File(root, "orphan");
        orphan.mkdirs();
        Files.write(new File(orphan, "secret").toPath(), new byte[]{1});
        try (CliRuntime runtime = new CliRuntime(app, "runtime-test")) {
            assertFalse(orphan.exists());
            try { new CliRuntime(app, "other"); fail("Concurrent CLI accepted"); }
            catch (IOException expected) { assertTrue(expected.getMessage().contains("Another on-device")); }
        }
        try (CliRuntime runtime = new CliRuntime(app, "other")) { assertTrue(runtime.home.exists()); }
    }

    @Test public void consoleCliCredentialsAreEncryptedWithoutSubscriptionTokens() throws Exception {
        String profile = "runtime-console-vault-test";
        Secrets secrets = new Secrets(app);
        try {
            try (CliRuntime runtime = new CliRuntime(app, profile)) {
                Files.write(new File(runtime.home, "config/.claude.json").toPath(), "{\"primaryApiKey\":\"console-fixture-key\"}".getBytes(StandardCharsets.UTF_8));
                runtime.retainAuthentication();
                assertTrue(secrets.get("cli-auth-" + profile).contains("console-fixture-key"));
                assertFalse(app.getSharedPreferences("secrets", 0).getString("cli-auth-" + profile, "").contains("console-fixture-key"));
            }
        } finally { secrets.set("cli-auth-" + profile, ""); }
    }

    @Test public void unauthenticatedStatusIsNotAnInferenceTest() throws Exception {
        JSONObject status = ClaudeHarness.status(app, "runtime-no-credentials");
        assertFalse(status.toString(), status.getBoolean("loggedIn"));
        assertFalse(status.has("email"));
    }

    @Test public void canceledSubprocessCannotReturnSuccess() throws Exception {
        try (CliRuntime runtime = new CliRuntime(app, "runtime-cancel-test")) {
            try { runtime.execute(Arrays.asList("--version"), "", "", () -> true, 30, true); fail("Canceled CLI returned success"); }
            catch (IOException expected) { assertTrue(expected.getMessage().contains("canceled")); }
            assertNull("An already-canceled operation must not launch the Claude subprocess", runtime.process);
        }
    }

    @Test public void nativeSignInProducesProviderUrlAndCancelsWithoutSavingCredentials() throws Exception {
        String profile = "runtime-login-handshake-test";
        CliLogin.prepare(profile);
        Thread login = new Thread(() -> { try { CliLogin.run(app, profile, "claudeai", () -> false); } catch (Exception expected) {} });
        login.start();
        try {
            long deadline = System.currentTimeMillis() + 45000;
            JSONObject status;
            do { Thread.sleep(200); status = CliLogin.status(profile); }
            while ("starting".equals(status.getString("state")) && System.currentTimeMillis() < deadline);
            assertEquals(status.toString(), "waiting", status.getString("state"));
            java.net.URI url = new java.net.URI(status.getString("url"));
            assertEquals("https", url.getScheme());
            assertTrue(Arrays.asList("claude.com", "claude.ai", "platform.claude.com", "console.anthropic.com").contains(url.getHost()));
        } finally { CliLogin.cancel(profile); login.join(10000); }
        assertFalse(login.isAlive());
        assertEquals("", new Secrets(app).get("cli-auth-" + profile));
        assertEquals("canceled", CliLogin.status(profile).getString("state"));
    }
}
