package dev.voyage.workbench;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import static org.junit.Assert.*;

public class RuntimePackSecurityTest {
    final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test public void systemApprovalUsesInheritedSessionAndExplicitReceiver() throws Exception {
        org.junit.Assume.assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("approvalProbe")));
        org.junit.Assume.assumeNotNull(app.getApplicationInfo().splitSourceDirs);
        assertNotNull(RuntimePacks.catalog(app));
        File shared = null;
        for (String path : app.getApplicationInfo().splitSourceDirs) if (path.endsWith("split_provider_shared.apk")) shared = new File(path);
        assertNotNull(shared);
        android.app.Activity activity = InstrumentationRegistry.getInstrumentation().startActivitySync(
            new android.content.Intent(app, MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
        RuntimePacks.stageVerified(app, java.util.Collections.singletonList(shared), shared.length());
        long deadline = System.currentTimeMillis() + 45000;
        while (!"approval".equals(RuntimePacks.preferences(app).getString("phase", "")) && System.currentTimeMillis() < deadline) {
            assertNotEquals(RuntimePacks.preferences(app).getString("message", ""), "failed", RuntimePacks.preferences(app).getString("phase", ""));
            Thread.sleep(100);
        }
        assertEquals("approval", RuntimePacks.preferences(app).getString("phase", ""));
        assertNotNull(RuntimePacks.pendingApproval);
    }

    @Test public void downloadOriginsRejectDowngradesCredentialsAndLookalikeHosts() throws Exception {
        for (String address : new String[]{"https://github.com/sign-out/voyage-workbench-downloads/releases/download/test/file.apk", "https://release-assets.githubusercontent.com/file"})
            assertTrue(address, RuntimePacks.allowedDownload(new URL(address)));
        for (String address : new String[]{"http://github.com/file", "https://github.com.evil.example/file", "https://user:password@github.com/file", "https://github.com:444/file", "https://localhost/file", "file:///tmp/file"})
            assertFalse(address, RuntimePacks.allowedDownload(new URL(address)));
    }

    @Test public void verificationRejectsCorruptTruncatedOversizedAndCanceledFiles() throws Exception {
        byte[] bytes = "official-file-fixture".getBytes(StandardCharsets.UTF_8);
        String hash = RuntimePacks.hex(MessageDigest.getInstance("SHA-256").digest(bytes));
        File file = File.createTempFile("runtime-pack-fixture", ".apk", app.getCacheDir());
        try {
            RuntimePacks.writeVerified(new ByteArrayInputStream(bytes), file, bytes.length, hash, () -> false);
            assertArrayEquals(bytes, Files.readAllBytes(file.toPath()));
            for (int scenario = 0; scenario < 4; scenario++) {
                final int selected = scenario;
                try {
                    RuntimePacks.writeVerified(new ByteArrayInputStream(bytes), file,
                        bytes.length + (scenario == 1 ? 1 : scenario == 2 ? -1 : 0), scenario == 0 ? "0".repeat(64) : hash, () -> selected == 3);
                    fail("Unverified bytes accepted: " + scenario);
                } catch (IOException expected) { assertFalse("Partial file must be removed", file.exists()); }
            }
        } finally { file.delete(); }
    }

    @Test public void fullEditionReportsCompleteDependencySetsAndDoesNotInstall() throws Exception {
        if (RuntimePacks.catalog(app) != null) return;
        assertEquals("full", RuntimePacks.status(app).getString("edition"));
        for (String provider : RuntimePacks.PROVIDERS) assertEquals(provider, RuntimePacks.ready(app, provider),
            new File(app.getApplicationInfo().nativeLibraryDir, "libcodex.so").isFile() && RuntimePacks.sharedReady(app));
        try { RuntimePacks.install(app, "claude"); fail("Full edition must not fetch packs"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("full/offline")); }
    }

    @Test public void unsolicitedInstallerCallbacksCannotChangeState() throws Exception {
        String before = RuntimePacks.preferences(app).getString("phase", "idle");
        new RuntimeInstallReceiver().onReceive(app, new android.content.Intent("forged.runtime.callback")
            .putExtra(android.content.pm.PackageInstaller.EXTRA_STATUS, android.content.pm.PackageInstaller.STATUS_SUCCESS));
        assertEquals(before, RuntimePacks.preferences(app).getString("phase", "idle"));
    }
}
