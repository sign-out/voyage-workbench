package dev.voyage.workbench;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

final class RuntimePacks {
    static final List<String> PROVIDERS = Arrays.asList("codex", "claude", "cursor");
    private static final AtomicBoolean RUNNING = new AtomicBoolean();
    private static final AtomicBoolean CANCEL = new AtomicBoolean();
    private static volatile long downloaded;
    private static volatile long total;
    private static volatile boolean initialized;
    static volatile Intent pendingApproval;

    static SharedPreferences preferences(Context app) { return app.getSharedPreferences("runtime-packs", 0); }

    static synchronized void initialize(Context app) {
        if (initialized) return;
        initialized = true;
        SharedPreferences state = preferences(app);
        String phase = state.getString("phase", "");
        if ("downloading".equals(phase)) save(app, "interrupted", "Download interrupted. Retry; installed providers are unchanged.");
        if ("installing".equals(phase) || "approval".equals(phase)) {
            PackageInstaller.SessionInfo session = app.getPackageManager().getPackageInstaller().getSessionInfo(state.getInt("session", -1));
            if (session == null) save(app, "complete", "Installation finished or was dismissed. Installed providers are checked below.");
        }
    }

    static boolean busy(Context app) {
        initialize(app);
        String phase = preferences(app).getString("phase", "idle");
        return RUNNING.get() || "installing".equals(phase) || "approval".equals(phase);
    }

    static JSONObject catalog(Context app) throws Exception {
        try (InputStream input = app.getAssets().open("runtime-pack-catalog.json")) {
            byte[] bytes = input.readNBytes(256 * 1024 + 1);
            if (bytes.length > 256 * 1024) throw new IOException("Runtime catalog is too large");
            JSONObject catalog = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            PackageInfo installed = app.getPackageManager().getPackageInfo(app.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
            if (catalog.getInt("format") != 1 || !app.getPackageName().equals(catalog.getString("package"))
                || installed.getLongVersionCode() != catalog.getLong("versionCode")
                || !Build.SUPPORTED_ABIS[0].equals(catalog.getString("abi"))) throw new IOException("Runtime catalog does not match this app and device");
            android.content.pm.Signature[] signers = installed.signingInfo.getApkContentsSigners();
            if (signers.length != 1 || !hex(MessageDigest.getInstance("SHA-256").digest(signers[0].toByteArray())).equals(catalog.getString("signerSha256")))
                throw new IOException("Runtime catalog signing identity differs from this app");
            JSONObject packs = catalog.getJSONObject("packs");
            if (packs.length() != 4) throw new IOException("Incomplete runtime catalog");
            for (String name : Arrays.asList("shared", "codex", "claude", "cursor")) {
                JSONObject pack = packs.getJSONObject(name);
                String filename = "Voyage-Workbench-" + catalog.getString("version") + "-android-runtime-" + catalog.getString("abi") + "-" + name + ".apk";
                String suffix = "/releases/download/v" + catalog.getString("version") + "-test/" + filename;
                String address = pack.getString("url");
                if (!filename.equals(pack.getString("file")) || pack.getLong("bytes") <= 0 || pack.getLong("bytes") > 256L * 1024 * 1024
                    || !pack.getString("sha256").matches("[0-9a-f]{64}") || !(address.equals("https://github.com/sign-out/voyage-workbench-downloads" + suffix)
                    || address.equals("https://github.com/sign-out/voyage-workbench" + suffix))) throw new IOException("Invalid pinned runtime metadata");
                JSONArray requires = pack.getJSONArray("requires");
                if ("shared".equals(name) ? requires.length() != 0 : requires.length() != 1 || !"shared".equals(requires.optString(0)))
                    throw new IOException("Invalid runtime dependency catalog");
            }
            return catalog;
        } catch (FileNotFoundException absent) { return null; }
    }

    static boolean sharedReady(Context app) {
        File directory = new File(app.getApplicationInfo().nativeLibraryDir);
        if (!new File(directory, "libproot.so").isFile() || !new File(directory, "libloader.so").isFile()) return false;
        try (InputStream input = app.getAssets().open("runtime-libs-" + Build.SUPPORTED_ABIS[0] + ".json")) {
            JSONObject libraries = new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
            Iterator<String> names = libraries.keys();
            while (names.hasNext()) if (!new File(directory, libraries.getString(names.next())).isFile()) return false;
            return true;
        } catch (Exception error) { return false; }
    }

    static boolean ready(Context app, String provider) {
        if (!PROVIDERS.contains(provider) || !sharedReady(app)) return false;
        File directory = new File(app.getApplicationInfo().nativeLibraryDir);
        if ("codex".equals(provider)) return new File(directory, "libcodex.so").isFile() && new File(directory, "libcodex-code-mode-host.so").isFile();
        if ("claude".equals(provider)) return new File(directory, "libclaude.so").isFile() && new File(directory, "libmusl-loader.so").isFile();
        if (!new File(directory, "libcursor-node.so").isFile()) return false;
        try {
            JSONObject metadata = CursorRuntime.metadata(app);
            for (String group : Arrays.asList("libraries", "native")) {
                JSONObject files = metadata.getJSONObject(group);
                Iterator<String> names = files.keys();
                while (names.hasNext()) if (!new File(directory, files.getString(names.next())).isFile()) return false;
            }
            JSONArray archives = metadata.getJSONArray("archives");
            for (int index = 0; index < archives.length(); index++) {
                try (InputStream ignored = app.getAssets().open(archives.getString(index))) { }
            }
            return true;
        } catch (Exception error) { return false; }
    }

    static void require(Context app, String provider) throws IOException {
        if (!ready(app, provider)) throw new IOException("The complete official " + provider + " runtime is not installed. Open Settings → Models & agents → On-device runtimes. No direct API fallback is used.");
    }

    static List<String> missing(Context app, String provider) throws IOException {
        if (!PROVIDERS.contains(provider)) throw new IOException("Unknown provider runtime");
        ArrayList<String> result = new ArrayList<>();
        if (!sharedReady(app)) result.add("shared");
        if (!ready(app, provider)) result.add(provider);
        return result;
    }

    static JSONObject status(Context app) throws Exception {
        initialize(app);
        JSONObject catalog = catalog(app);
        SharedPreferences saved = preferences(app);
        JSONArray providers = new JSONArray();
        for (String provider : PROVIDERS) {
            long bytes = 0;
            String version = "Bundled";
            if (catalog != null) {
                version = catalog.getJSONObject("packs").getJSONObject(provider).getString("version");
                for (String name : missing(app, provider)) bytes += catalog.getJSONObject("packs").getJSONObject(name).getLong("bytes");
            }
            providers.put(new JSONObject().put("id", provider).put("installed", ready(app, provider)).put("version", version).put("downloadBytes", bytes));
        }
        return new JSONObject().put("edition", catalog == null ? "full" : "lightweight").put("providers", providers)
            .put("busy", busy(app)).put("phase", saved.getString("phase", "idle")).put("message", saved.getString("message", ""))
            .put("downloaded", downloaded).put("total", total).put("canInstall", app.getPackageManager().canRequestPackageInstalls());
    }

    static void save(Context app, String phase, String message) {
        preferences(app).edit().putString("phase", phase).putString("message", message).commit();
    }

    static JSONObject install(Context context, String provider) throws Exception {
        Context app = context.getApplicationContext();
        initialize(app);
        JSONObject catalog = catalog(app);
        if (catalog == null) throw new IOException("The full/offline edition bundles provider runtimes. Reinstall the full APK if damaged.");
        if (!app.getPackageManager().canRequestPackageInstalls()) throw new IOException("Allow app installs for Voyage Workbench first, then return and press Install again.");
        List<String> needed = missing(app, provider);
        if (needed.isEmpty()) return status(app);
        long required = 0;
        for (String name : needed) required += catalog.getJSONObject("packs").getJSONObject(name).getLong("bytes");
        if (busy(app) || !RUNNING.compareAndSet(false, true)) throw new IOException("Another runtime installation is active");
        CANCEL.set(false);
        downloaded = 0;
        total = required;
        save(app, "downloading", "Downloading only " + provider + " and missing shared support. Installed providers are unchanged.");
        new Thread(() -> {
            File directory = new File(app.getCacheDir(), "runtime-pack-downloads");
            try {
                CliRuntime.delete(directory);
                if (!directory.mkdirs()) throw new IOException("Could not prepare private runtime download storage");
                if (directory.getUsableSpace() < total * 5 + 32L * 1024 * 1024) throw new IOException("Not enough free space for a safe download and Android installation. Free space and retry.");
                ArrayList<File> files = new ArrayList<>();
                for (String name : needed) {
                    File target = new File(directory, name + ".apk");
                    download(catalog.getJSONObject("packs").getJSONObject(name), target);
                    files.add(target);
                }
                if (CANCEL.get()) throw new IOException("Download canceled; installed providers are unchanged.");
                stageVerified(app, files, total);
            } catch (Exception error) {
                save(app, "failed", error.getMessage() == null ? "Runtime installation failed. Retry; installed providers are unchanged." : error.getMessage());
            } finally {
                try { CliRuntime.delete(directory); } catch (Exception ignored) { }
                RUNNING.set(false);
            }
        }, "runtime-pack-install").start();
        return status(app);
    }

    static void stageVerified(Context app, List<File> files, long bytes) throws Exception {
        PackageInstaller installer = app.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams parameters = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_INHERIT_EXISTING);
        parameters.setAppPackageName(app.getPackageName());
        parameters.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        parameters.setSize(bytes);
        int sessionId = installer.createSession(parameters);
        boolean committed = false;
        try (PackageInstaller.Session session = installer.openSession(sessionId)) {
            String token = UUID.randomUUID().toString();
            preferences(app).edit().putInt("session", sessionId).putString("token", token).commit();
            for (File file : files) {
                if (CANCEL.get()) throw new IOException("Download canceled; installed providers are unchanged.");
                try (InputStream input = new FileInputStream(file); OutputStream output = session.openWrite(file.getName(), 0, file.length())) {
                    input.transferTo(output);
                    session.fsync(output);
                }
            }
            if (CANCEL.get()) throw new IOException("Download canceled; installed providers are unchanged.");
            save(app, "installing", "Waiting for Android approval. The app may restart; saved projects and credentials are retained.");
            Intent callback = new Intent(app, RuntimeInstallReceiver.class).setAction(app.getPackageName() + ".runtime." + token);
            PendingIntent pending = PendingIntent.getBroadcast(app, sessionId, callback, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            session.commit(pending.getIntentSender());
            committed = true;
        } finally {
            if (!committed) try { installer.abandonSession(sessionId); } catch (Exception ignored) { }
        }
    }

    static JSONObject cancel(Context app) throws Exception {
        CANCEL.set(true);
        pendingApproval = null;
        int session = preferences(app).getInt("session", -1);
        if (!RUNNING.get() && session >= 0) {
            try { app.getPackageManager().getPackageInstaller().abandonSession(session); } catch (Exception ignored) { }
            save(app, "canceled", "Installation canceled. Previously installed providers are unchanged.");
        }
        return status(app);
    }

    static boolean allowedDownload(URL url) {
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null || url.getPort() != -1) return false;
        return Arrays.asList("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com").contains(url.getHost());
    }

    static void download(JSONObject pack, File target) throws Exception {
        long expected = pack.getLong("bytes");
        if (expected <= 0 || expected > 256L * 1024 * 1024 || !pack.getString("sha256").matches("[0-9a-f]{64}")) throw new IOException("Invalid pinned runtime download metadata");
        URL url = new URL(pack.getString("url"));
        HttpURLConnection connection = null;
        try {
            for (int redirects = 0; redirects <= 5; redirects++) {
                if (!allowedDownload(url)) throw new IOException("Runtime download origin is not permitted");
                if (CANCEL.get()) throw new IOException("Download canceled; installed providers are unchanged.");
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(20000);
                connection.setRequestProperty("User-Agent", "Voyage-Workbench-Runtime-Installer");
                connection.setRequestProperty("Accept-Encoding", "identity");
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("Runtime redirect has no destination");
                    url = new URL(url, location);
                    connection.disconnect();
                    connection = null;
                    continue;
                }
                if (status != 200) throw new IOException("Runtime download returned HTTP " + status + ". Retry later or install the full/offline APK.");
                long length = connection.getContentLengthLong();
                if (length >= 0 && length != expected) throw new IOException("Runtime download size differs from the signed catalog");
                try (InputStream input = connection.getInputStream()) {
                    writeVerified(input, target, expected, pack.getString("sha256"), CANCEL::get);
                }
                return;
            }
            throw new IOException("Too many runtime download redirects");
        } finally { if (connection != null) connection.disconnect(); }
    }

    static void writeVerified(InputStream input, File target, long expected, String sha256, java.util.function.BooleanSupplier canceled) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long received = 0;
        byte[] buffer = new byte[128 * 1024];
        boolean verified = false;
        try (FileOutputStream output = new FileOutputStream(target)) {
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (canceled.getAsBoolean()) throw new IOException("Download canceled; installed providers are unchanged.");
                received += count;
                if (received > expected) throw new IOException("Runtime download exceeds its pinned size");
                digest.update(buffer, 0, count);
                output.write(buffer, 0, count);
                downloaded += count;
            }
            if (canceled.getAsBoolean()) throw new IOException("Download canceled; installed providers are unchanged.");
            if (received != expected || !hex(digest.digest()).equals(sha256)) throw new IOException("Runtime download integrity check failed; nothing was installed.");
            output.getFD().sync();
            verified = true;
        } finally { if (!verified) target.delete(); }
    }

    static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }
}
