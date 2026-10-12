package dev.voyage.workbench;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;

final class CliRuntime implements AutoCloseable {
    static final int OUTPUT_LIMIT = 32 * 1024 * 1024;
    private static final Semaphore SLOT = new Semaphore(1);
    private static volatile String activeProfile = "";
    private static final String[] AUTH_FILES = {"config/.credentials.json", "config/.claude.json", ".claude.json"};
    final Context app;
    final String profileId;
    final String provider;
    final File home;
    volatile Process process;
    private boolean closed;

    static boolean available(Context app) {
        String libs = app.getApplicationInfo().nativeLibraryDir;
        return new File(libs, "libclaude.so").isFile() && new File(libs, "libmusl-loader.so").isFile();
    }

    static boolean available(Context app, String provider) {
        return "cursor".equals(provider) ? CursorRuntime.available(app) : available(app);
    }

    static void cleanupOrphans(Context app) throws IOException {
        if (!SLOT.tryAcquire()) return;
        try { delete(new File(app.getCacheDir(), "cli-sessions")); }
        finally { SLOT.release(); }
    }

    CliRuntime(Context context, String id) throws Exception {
        this(context, id, "claude-code");
    }

    CliRuntime(Context context, String id, String protocol) throws Exception {
        if (!available(context, protocol)) throw new IOException("The official provider runtime is not packaged for this device.");
        if (!SLOT.tryAcquire()) throw new IOException("Another on-device CLI operation is running. Stop or finish it first.");
        app = context.getApplicationContext();
        profileId = id;
        provider = protocol;
        activeProfile = id;
        File root = new File(app.getCacheDir(), "cli-sessions");
        home = new File(root, UUID.randomUUID().toString());
        try {
            delete(root);
            if (!new File(home, "config").mkdirs()) throw new IOException("Could not create the private CLI session.");
            String saved = new Secrets(app).get("cli-auth-" + profileId);
            if (!saved.isEmpty()) {
                JSONObject snapshot = new JSONObject(saved);
                for (String name : AUTH_FILES) if (snapshot.has(name)) {
                    Files.write(new File(home, name).toPath(), snapshot.getString(name).getBytes(StandardCharsets.UTF_8));
                }
            }
        } catch (Exception error) {
            try { delete(home); }
            finally { activeProfile = ""; SLOT.release(); }
            throw error;
        }
    }

    static boolean active(String profileId) { return activeProfile.equals(profileId); }

    Process start(List<String> args, String key) throws Exception {
        if (closed || process != null) throw new IOException("CLI session is already running or closed.");
        String libs = app.getApplicationInfo().nativeLibraryDir;
        File aliases = new File(home, "libraries");
        if (!aliases.mkdirs()) throw new IOException("Could not prepare runtime libraries.");
        try (InputStream manifest = app.getAssets().open("runtime-libs-" + android.os.Build.SUPPORTED_ABIS[0] + ".json")) {
            JSONObject names = new JSONObject(new String(manifest.readAllBytes(), StandardCharsets.UTF_8));
            Iterator<String> keys = names.keys();
            while (keys.hasNext()) {
                String name = keys.next();
                Files.createSymbolicLink(new File(aliases, name).toPath(), new File(libs, names.getString(name)).toPath());
            }
        }
        File cursorRoot = null;
        JSONObject cursorMetadata = null;
        if ("cursor".equals(provider)) {
            cursorMetadata = CursorRuntime.metadata(app);
            cursorRoot = CursorRuntime.prepare(app, cursorMetadata);
            JSONObject names = cursorMetadata.getJSONObject("libraries");
            Iterator<String> keys = names.keys();
            while (keys.hasNext()) {
                String name = keys.next();
                File alias = new File(aliases, name);
                Files.deleteIfExists(alias.toPath());
                Files.createSymbolicLink(alias.toPath(), new File(libs, names.getString(name)).toPath());
            }
        }
        ArrayList<String> command = new ArrayList<>(Arrays.asList(libs + "/libproot.so", "--kill-on-exit"));
        String architecture = android.os.Build.SUPPORTED_ABIS[0].equals("arm64-v8a") ? "aarch64" : "x86_64";
        if (cursorMetadata != null) {
            String loader = "aarch64".equals(architecture) ? "ld-linux-aarch64.so.1" : "ld-linux-x86-64.so.2";
            Collections.addAll(command, "-b", libs + "/" + cursorMetadata.getJSONObject("libraries").getString(loader) + ":" + ("aarch64".equals(architecture) ? "/lib/" : "/lib64/") + loader);
        } else Collections.addAll(command, "-b", libs + "/libmusl-loader.so:/lib/ld-musl-" + architecture + ".so.1");
        android.net.ConnectivityManager connectivity = app.getSystemService(android.net.ConnectivityManager.class);
        android.net.LinkProperties properties = connectivity.getLinkProperties(connectivity.getActiveNetwork());
        if (properties != null && !properties.getDnsServers().isEmpty()) {
            StringBuilder resolver = new StringBuilder("options timeout:2 attempts:2\n");
            for (java.net.InetAddress server : properties.getDnsServers()) resolver.append("nameserver ").append(server.getHostAddress()).append("\n");
            File config = new File(home, "resolv.conf");
            Files.write(config.toPath(), resolver.toString().getBytes(StandardCharsets.UTF_8));
            Collections.addAll(command, "-b", config + ":/etc/resolv.conf");
        }
        if (cursorRoot != null) {
            command.add(libs + "/libcursor-node.so");
            command.add("--preserve-symlinks");
            command.add(new File(cursorRoot, "cursor-runner.cjs").toString());
        } else command.add(libs + "/libclaude.so");
        command.addAll(args);
        ProcessBuilder builder = new ProcessBuilder(command).directory(home);
        Map<String, String> environment = builder.environment();
        environment.clear();
        environment.put("HOME", home.toString());
        environment.put("CLAUDE_CONFIG_DIR", new File(home, "config").toString());
        environment.put("PATH", "/system/bin");
        environment.put("TMPDIR", home.toString());
        environment.put("LANG", "C.UTF-8");
        environment.put("LD_LIBRARY_PATH", aliases + ":" + libs);
        environment.put("PROOT_TMP_DIR", home.toString());
        environment.put("PROOT_LOADER", libs + "/libloader.so");
        environment.put("PROOT_NO_SECCOMP", "1");
        environment.put("DISABLE_AUTOUPDATER", "1");
        environment.put("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");
        environment.put("TERM", "dumb");
        if (cursorRoot != null) {
            environment.remove("CLAUDE_CONFIG_DIR");
            environment.put("GLIBC_TUNABLES", "glibc.pthread.rseq=0");
            environment.put("NODE_NO_WARNINGS", "1");
            environment.put("NO_OPEN_BROWSER", "1");
        }
        java.security.KeyStore store = java.security.KeyStore.getInstance("AndroidCAStore");
        store.load(null);
        StringBuilder certificates = new StringBuilder();
        Enumeration<String> names = store.aliases();
        while (names.hasMoreElements()) {
            java.security.cert.Certificate cert = store.getCertificate(names.nextElement());
            certificates.append("-----BEGIN CERTIFICATE-----\n").append(android.util.Base64.encodeToString(cert.getEncoded(), android.util.Base64.NO_WRAP)).append("\n-----END CERTIFICATE-----\n");
        }
        File ca = new File(home, "ca.pem");
        Files.write(ca.toPath(), certificates.toString().getBytes(StandardCharsets.UTF_8));
        environment.put("SSL_CERT_FILE", ca.toString());
        environment.put("NODE_EXTRA_CA_CERTS", ca.toString());
        if (!key.isEmpty()) environment.put("ANTHROPIC_API_KEY", key);
        process = builder.start();
        return process;
    }

    String execute(List<String> args, String input, String key, BooleanSupplier canceled, int seconds, boolean requireSuccess) throws Exception {
        if (input.getBytes(StandardCharsets.UTF_8).length > 8 * 1024 * 1024) throw new IOException("CLI context exceeds 8 MiB. Narrow the work order.");
        Process child = start(args, key);
        ExecutorService readers = Executors.newFixedThreadPool(2);
        Future<String> output = readers.submit(() -> readBounded(child.getInputStream()));
        Future<String> errors = readers.submit(() -> readBounded(child.getErrorStream()));
        Future<?> writer = null;
        ExecutorService writers = Executors.newSingleThreadExecutor();
        try {
            writer = writers.submit(() -> {
                try (OutputStream stdin = child.getOutputStream()) { stdin.write(input.getBytes(StandardCharsets.UTF_8)); }
                catch (IOException error) { throw new UncheckedIOException(error); }
            });
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
            while (!child.waitFor(200, TimeUnit.MILLISECONDS)) {
                if (canceled.getAsBoolean()) throw new IOException("Task canceled.");
                if (System.nanoTime() > deadline) throw new IOException("On-device CLI timed out.");
                if (output.isDone()) output.get();
                if (errors.isDone()) errors.get();
            }
            if (canceled.getAsBoolean()) throw new IOException("Task canceled.");
            String response = output.get(5, TimeUnit.SECONDS);
            errors.get(5, TimeUnit.SECONDS);
            writer.get(5, TimeUnit.SECONDS);
            if (requireSuccess && child.exitValue() != 0) throw new IOException(("cursor".equals(provider) ? "Cursor SDK" : "Claude Code") + " exited with status " + child.exitValue() + ". Check its sign-in, model access, or usage limits; no API fallback was used.");
            return response;
        } finally {
            child.destroy();
            child.destroyForcibly();
            if (writer != null) writer.cancel(true);
            writers.shutdownNow();
            readers.shutdownNow();
        }
    }

    static String readBounded(InputStream stream) throws IOException {
        try (InputStream input = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (bytes.size() + count > OUTPUT_LIMIT) throw new IOException("CLI output exceeds 32 MiB.");
                bytes.write(buffer, 0, count);
            }
            return bytes.toString("UTF-8");
        }
    }

    void retainAuthentication() throws Exception {
        JSONObject snapshot = new JSONObject();
        for (String name : AUTH_FILES) {
            File source = new File(home, name);
            if (source.isFile()) {
                if (source.length() > 1024 * 1024) throw new IOException("CLI authentication state is unexpectedly large.");
                String value = new String(Files.readAllBytes(source.toPath()), StandardCharsets.UTF_8);
                new JSONObject(value);
                snapshot.put(name, value);
            }
        }
        boolean credentials = snapshot.has("config/.credentials.json");
        for (String name : new String[]{"config/.claude.json", ".claude.json"}) if (snapshot.has(name)) {
            JSONObject config = new JSONObject(snapshot.getString(name));
            if (!config.optString("primaryApiKey").isEmpty()) credentials = true;
        }
        if (credentials) new Secrets(app).set("cli-auth-" + profileId, snapshot.toString());
    }

    static void delete(File file) throws IOException {
        if (!Files.exists(file.toPath(), java.nio.file.LinkOption.NOFOLLOW_LINKS)) return;
        File[] children = Files.isSymbolicLink(file.toPath()) ? null : file.listFiles();
        if (children != null) for (File child : children) delete(child);
        if (!file.delete()) throw new IOException("Could not remove private CLI session state.");
    }

    public synchronized void close() throws IOException {
        if (closed) return;
        closed = true;
        try {
            if (process != null) {
                process.destroy();
                process.destroyForcibly();
                try {
                    if (!process.waitFor(5, TimeUnit.SECONDS)) throw new IOException("CLI process did not stop. Private session cleanup could not be confirmed.");
                } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IOException("Interrupted while stopping the CLI.", error); }
            }
            delete(home);
        } finally { activeProfile = ""; SLOT.release(); }
    }
}
