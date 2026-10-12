package dev.voyage.workbench;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.zip.*;

final class CursorRuntime {
    static boolean available(Context app) {
        return new File(app.getApplicationInfo().nativeLibraryDir, "libcursor-node.so").isFile();
    }

    static JSONObject metadata(Context app) throws Exception {
        try (InputStream input = app.getAssets().open("cursor-runtime-" + android.os.Build.SUPPORTED_ABIS[0] + ".json")) {
            return new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    static synchronized File prepare(Context app, JSONObject metadata) throws Exception {
        File root = new File(app.getNoBackupFilesDir(), "cursor-sdk-" + metadata.getString("sdkVersion"));
        File marker = new File(root, ".complete");
        if (!marker.isFile()) {
            CliRuntime.delete(root);
            if (!root.mkdirs()) throw new IOException("Could not prepare the Cursor SDK.");
            long total = 0;
            int count = 0;
            try (ZipInputStream input = new ZipInputStream(app.getAssets().open("cursor-sdk-" + android.os.Build.SUPPORTED_ABIS[0] + ".zip"))) {
                ZipEntry entry;
                byte[] buffer = new byte[8192];
                while ((entry = input.getNextEntry()) != null) {
                    File file = new File(root, entry.getName());
                    if (++count > 5000 || !file.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) throw new IOException("Invalid Cursor runtime archive.");
                    if (entry.isDirectory()) { file.mkdirs(); continue; }
                    if (!file.getParentFile().isDirectory() && !file.getParentFile().mkdirs()) throw new IOException("Could not extract Cursor dependencies.");
                    try (OutputStream output = new FileOutputStream(file)) {
                        int size;
                        while ((size = input.read(buffer)) != -1) {
                            total += size;
                            if (total > 100L * 1024 * 1024) throw new IOException("Cursor runtime exceeds its extraction limit.");
                            output.write(buffer, 0, size);
                        }
                    }
                }
            }
            Files.write(marker.toPath(), new byte[]{1});
        }
        JSONObject nativeFiles = metadata.getJSONObject("native");
        Iterator<String> names = nativeFiles.keys();
        while (names.hasNext()) {
            String name = names.next();
            File target = new File(root, name);
            if (!target.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator) && !Files.isSymbolicLink(target.toPath())) throw new IOException("Invalid Cursor native dependency.");
            target.getParentFile().mkdirs();
            Files.deleteIfExists(target.toPath());
            Files.createSymbolicLink(target.toPath(), new File(app.getApplicationInfo().nativeLibraryDir, nativeFiles.getString(name)).toPath());
        }
        for (String name : Arrays.asList("cursor-runner.cjs", "cursor-sdk.cjs")) {
            try (InputStream input = app.getAssets().open(name)) { Files.copy(input, new File(root, name).toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING); }
        }
        return root;
    }
}
