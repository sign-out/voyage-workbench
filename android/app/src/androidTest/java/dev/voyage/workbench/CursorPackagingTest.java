package dev.voyage.workbench;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipEntry;
import static org.junit.Assert.*;

public class CursorPackagingTest {
    @Test public void sharedArchivesExtractExactVendorFilesAndReusePreparedState() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject metadata = CursorRuntime.metadata(context);
        metadata.put("sdkVersion", "packaging-test-" + UUID.randomUUID());
        File root = new File(context.getNoBackupFilesDir(), "cursor-sdk-" + metadata.getString("sdkVersion"));
        try {
            assertEquals(root, CursorRuntime.prepare(context, metadata));
            JSONArray archives = metadata.getJSONArray("archives");
            assertEquals(2, archives.length());
            for (int index = 0; index < archives.length(); index++) {
                try (ZipInputStream input = new ZipInputStream(context.getAssets().open(archives.getString(index)))) {
                    ZipEntry entry;
                    while ((entry = input.getNextEntry()) != null) {
                        if (entry.isDirectory()) continue;
                        byte[] expected = MessageDigest.getInstance("SHA-256").digest(input.readAllBytes());
                        byte[] actual = MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(new File(root, entry.getName()).toPath()));
                        assertArrayEquals(entry.getName(), expected, actual);
                    }
                }
            }
            File marker = new File(root, ".complete");
            long modified = marker.lastModified();
            assertTrue(marker.isFile());
            assertEquals(root, CursorRuntime.prepare(context, metadata));
            assertEquals(modified, marker.lastModified());
        } finally {
            CliRuntime.delete(root);
        }
    }
}
