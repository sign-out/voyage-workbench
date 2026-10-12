package dev.voyage.workbench;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import java.util.regex.*;

final class CliLogin {
    private static String profile = "", state = "idle", url = "", error = "";
    private static Process process;

    static synchronized void prepare(String id) throws Exception {
        if ("starting".equals(state) || "waiting".equals(state)) throw new IOException("A CLI sign-in is already running.");
        profile = id;
        state = "starting";
        url = "";
        error = "";
    }

    static synchronized JSONObject status(String id) throws Exception {
        if (!profile.equals(id)) return new JSONObject().put("state", "idle");
        return new JSONObject().put("state", state).put("url", url).put("error", error);
    }

    static synchronized void forget(String id) throws Exception {
        if (profile.equals(id)) { state = "idle"; url = ""; error = ""; }
    }

    static synchronized void submit(String id, String code) throws Exception {
        if (!profile.equals(id) || !"waiting".equals(state) || process == null) throw new IOException("No sign-in is awaiting a code.");
        if (code.isEmpty() || code.length() > 2048 || code.contains("\n") || code.contains("\r")) throw new IOException("Paste the single authorization code from the provider.");
        process.getOutputStream().write((code + "\n").getBytes(StandardCharsets.UTF_8));
        process.getOutputStream().flush();
    }

    static synchronized void cancel(String id) throws Exception {
        if (!profile.equals(id)) throw new IOException("This connection has no active sign-in.");
        state = "canceled";
        url = "";
        if (process != null) { process.destroy(); process.destroyForcibly(); }
    }

    static void run(Context app, String id, String method, BooleanSupplier canceled) throws Exception {
        if ("cursor".equals(method)) { runCursor(app, id, canceled); return; }
        if (!Arrays.asList("claudeai", "console", "sso").contains(method)) throw new IOException("Unsupported Claude authentication method.");
        ExecutorService readers = Executors.newFixedThreadPool(2);
        try (CliRuntime runtime = new CliRuntime(app, id)) {
            Process child = runtime.start(Arrays.asList("auth", "login", "--" + method), "");
            synchronized (CliLogin.class) { process = child; }
            Future<?> output = readers.submit(() -> observe(child.getInputStream(), id));
            Future<?> errors = readers.submit(() -> observe(child.getErrorStream(), id));
            long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(10);
            while (!child.waitFor(200, TimeUnit.MILLISECONDS)) {
                if (canceled.getAsBoolean() || "canceled".equals(status(id).getString("state"))) throw new IOException("Sign-in canceled.");
                if (System.nanoTime() > deadline) throw new IOException("Claude sign-in timed out. Start it again.");
                if (output.isDone()) output.get();
                if (errors.isDone()) errors.get();
            }
            output.get(5, TimeUnit.SECONDS);
            errors.get(5, TimeUnit.SECONDS);
            if (child.exitValue() != 0 || canceled.getAsBoolean() || "canceled".equals(status(id).getString("state"))) throw new IOException("Claude sign-in did not complete. Try again using the provider's browser flow.");
            runtime.retainAuthentication();
            if (new Secrets(app).get("cli-auth-" + id).isEmpty()) throw new IOException("Claude did not produce reusable credentials. Sign-in was not saved.");
            synchronized (CliLogin.class) { state = "complete"; url = ""; }
        } catch (Exception failure) {
            synchronized (CliLogin.class) {
                if (!"canceled".equals(state)) { state = "failed"; error = "Claude sign-in failed or timed out. No credentials were sent to Voyage servers. Start a new sign-in."; }
                url = "";
            }
            throw failure;
        } finally {
            synchronized (CliLogin.class) { process = null; }
            readers.shutdownNow();
        }
    }

    private static void runCursor(Context app, String id, BooleanSupplier canceled) throws Exception {
        ExecutorService readers = Executors.newFixedThreadPool(2);
        try (CliRuntime runtime = new CliRuntime(app, id, "cursor")) {
            Process child = runtime.start(Collections.emptyList(), "");
            synchronized (CliLogin.class) { process = child; }
            Future<JSONObject> output = readers.submit(() -> {
                JSONObject credentials = null;
                int total = 0;
                try (BufferedReader input = new BufferedReader(new InputStreamReader(child.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = input.readLine()) != null) {
                        total += line.length();
                        if (total > 256 * 1024) throw new IOException("Unexpectedly large Cursor sign-in response.");
                        JSONObject event = new JSONObject(line);
                        if (event.optInt("voyageCursor") != 1 || "error".equals(event.optString("type"))) throw new IOException("Cursor sign-in failed.");
                        if ("login-url".equals(event.optString("type"))) {
                            String candidate = event.getString("url");
                            java.net.URI parsed = new java.net.URI(candidate);
                            if (!"https".equals(parsed.getScheme()) || !"cursor.com".equals(parsed.getHost()) || parsed.getPort() != -1 || parsed.getUserInfo() != null || !"/loginDeepControl".equals(parsed.getPath())) throw new IOException("Unexpected Cursor sign-in origin.");
                            synchronized (CliLogin.class) { if (profile.equals(id) && !"canceled".equals(state)) { url = candidate; state = "waiting"; } }
                        } else if ("login-complete".equals(event.optString("type"))) {
                            if (credentials != null) throw new IOException("Duplicate Cursor sign-in result.");
                            credentials = event.getJSONObject("credentials");
                            if (credentials.getString("apiKey").isEmpty() || credentials.getString("apiKey").length() > 8192 || credentials.getLong("apiKeyExpiresAtMs") <= System.currentTimeMillis()) throw new IOException("Invalid Cursor sign-in credentials.");
                        }
                    }
                }
                return credentials;
            });
            Future<String> errors = readers.submit(() -> CliRuntime.readBounded(child.getErrorStream()));
            try (OutputStream input = child.getOutputStream()) { input.write("{\"operation\":\"login\"}\n".getBytes(StandardCharsets.UTF_8)); }
            long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(10);
            while (!child.waitFor(200, TimeUnit.MILLISECONDS)) {
                if (canceled.getAsBoolean() || "canceled".equals(status(id).getString("state"))) throw new IOException("Sign-in canceled.");
                if (System.nanoTime() > deadline) throw new IOException("Cursor sign-in timed out.");
                if (output.isDone()) output.get();
                if (errors.isDone()) errors.get();
            }
            JSONObject credentials = output.get(5, TimeUnit.SECONDS);
            errors.get(5, TimeUnit.SECONDS);
            synchronized (CliLogin.class) {
                if (child.exitValue() != 0 || credentials == null || canceled.getAsBoolean() || "canceled".equals(state)) throw new IOException("Cursor sign-in did not complete.");
                new Secrets(app).set("cli-auth-" + id, credentials.toString());
                state = "complete";
                url = "";
            }
        } catch (Exception failure) {
            synchronized (CliLogin.class) { if (!"canceled".equals(state)) { state = "failed"; error = "Cursor sign-in failed or timed out. Start a new sign-in; no API fallback was used."; } url = ""; }
            throw failure;
        } finally { synchronized (CliLogin.class) { process = null; } readers.shutdownNow(); }
    }

    private static void observe(InputStream stream, String id) {
        try (InputStream input = stream) {
            StringBuilder buffer = new StringBuilder();
            byte[] bytes = new byte[4096];
            int count, total = 0;
            while ((count = input.read(bytes)) != -1) {
                total += count;
                if (total > 256 * 1024) throw new IOException("Unexpectedly large sign-in output.");
                buffer.append(new String(bytes, 0, count, StandardCharsets.UTF_8));
                Matcher links = Pattern.compile("https://(?:claude\\.com|claude\\.ai|platform\\.claude\\.com|console\\.anthropic\\.com)/[^\\s\\u001b]+(?=\\s|\\u001b)").matcher(buffer);
                while (links.find()) {
                    String candidate = links.group();
                    java.net.URI parsed = new java.net.URI(candidate);
                    if (parsed.getUserInfo() != null || parsed.getPort() != -1 || !Arrays.asList("/oauth/authorize", "/cai/oauth/authorize").contains(parsed.getPath())) continue;
                    synchronized (CliLogin.class) {
                        if (profile.equals(id) && !"canceled".equals(state)) { url = candidate; state = "waiting"; }
                    }
                }
                if (buffer.length() > 16384) buffer.delete(0, buffer.length() - 8192);
            }
        } catch (Exception failure) { throw new RuntimeException("Could not read the provider's sign-in flow."); }
    }
}
