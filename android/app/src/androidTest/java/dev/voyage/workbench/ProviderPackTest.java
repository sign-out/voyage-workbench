package dev.voyage.workbench;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.io.File;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import static org.junit.Assert.*;
import static org.junit.Assume.*;

public class ProviderPackTest {
    @Test public void incompleteProviderNeverBecomesAnApiFallback() throws Exception {
        assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("incomplete")));
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(new File(app.getApplicationInfo().nativeLibraryDir, "libclaude.so").isFile());
        assertFalse(RuntimePacks.sharedReady(app));
        assertFalse(CliRuntime.available(app));
        assertTrue(RuntimePacks.missing(app, "claude").contains("shared"));
        try { new CliRuntime(app, "incomplete-runtime-test"); fail("Incomplete provider started"); }
        catch (java.io.IOException expected) { assertNotNull(expected.getMessage()); }
    }

    @Test public void installedPacksExposeOnlySelectedOfficialRuntimes() throws Exception {
        String selected = InstrumentationRegistry.getArguments().getString("providers");
        assumeNotNull(selected);
        boolean sharedOnly = "shared".equals(selected);
        Set<String> providers = "editor".equals(selected) || sharedOnly ? Collections.emptySet() : new HashSet<>(Arrays.asList(selected.split(",")));
        assertTrue(new HashSet<>(Arrays.asList("codex", "claude", "cursor")).containsAll(providers));
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String state = InstrumentationRegistry.getArguments().getString("packState");
        if (state != null) {
            Secrets secrets = new Secrets(app);
            android.content.SharedPreferences fixture = app.getSharedPreferences("provider-pack-tests", 0);
            if ("initialize".equals(state)) {
                secrets.set("provider-pack-fixture", "encrypted-install-fixture");
                assertTrue(fixture.edit().putString("draft", "retained-local-edit").commit());
            } else {
                assertEquals("preserve", state);
            }
            assertEquals("retained-local-edit", fixture.getString("draft", ""));
            assertEquals("encrypted-install-fixture", secrets.get("provider-pack-fixture"));
            assertFalse(app.getSharedPreferences("secrets", 0).getString("provider-pack-fixture", "").contains("encrypted-install-fixture"));
        }
        File libraries = new File(app.getApplicationInfo().nativeLibraryDir);
        assertEquals(providers.contains("codex"), new File(libraries, "libcodex.so").isFile());
        assertEquals(providers.contains("claude"), CliRuntime.available(app));
        assertEquals(providers.contains("cursor"), CursorRuntime.available(app));
        assertEquals(sharedOnly || !providers.isEmpty(), new File(libraries, "libproot.so").isFile());
        if (providers.contains("claude")) {
            try (CliRuntime runtime = new CliRuntime(app, "provider-pack-test")) {
                String version = runtime.execute(Arrays.asList("--version"), "", "", () -> false, 30, true);
                assertTrue(version, version.contains("Claude Code"));
            }
        }
        if (providers.contains("cursor")) {
            assertFalse(CursorHarness.status(app, "provider-pack-test").getBoolean("loggedIn"));
        }
        if (providers.contains("codex")) {
            File task = new File(app.getCacheDir(), "provider-pack-test");
            try (Rpc runtime = new Rpc(app, task)) {
                runtime.init();
            } finally {
                CliRuntime.delete(task);
            }
        }
    }
}
