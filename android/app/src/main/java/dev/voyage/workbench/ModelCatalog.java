package dev.voyage.workbench;

import android.content.Context;
import java.io.File;
import java.util.HashSet;
import org.json.*;

final class ModelCatalog {
    static JSONArray normalize(JSONArray entries) throws Exception {
        JSONArray result = new JSONArray();
        HashSet<String> seen = new HashSet<>();
        for (int index = 0; index < Math.min(entries.length(), 2000); index++) {
            JSONObject entry = entries.optJSONObject(index);
            if (entry == null || entry.optBoolean("hidden")) continue;
            String id = entry.optString("model", entry.optString("id", entry.optString("name"))).replaceFirst("^models/", "");
            if (id.trim().isEmpty() || id.length() > 300 || !seen.add(id)) continue;
            result.put(new JSONObject().put("id", id).put("name", entry.optString("displayName", entry.optString("name", id))).put("description", entry.optString("description")).put("isDefault", entry.optBoolean("isDefault")));
        }
        return result;
    }

    static JSONArray codex(Context app) throws Exception {
        try (Rpc rpc = new Rpc(app, new File(app.getFilesDir(), "auth"))) {
            rpc.init();
            JSONArray entries = new JSONArray();
            String cursor = "";
            for (int page = 0; page < 20; page++) {
                JSONObject params = new JSONObject().put("limit", 100).put("includeHidden", false);
                if (!cursor.isEmpty()) params.put("cursor", cursor);
                JSONObject response = rpc.rpc("model/list", params, 20);
                JSONArray data = response.getJSONArray("data");
                for (int index = 0; index < data.length(); index++) entries.put(data.getJSONObject(index));
                String next = response.isNull("nextCursor") ? "" : response.optString("nextCursor");
                if (next.isEmpty()) return normalize(entries);
                if (next.equals(cursor)) throw new Exception("Model catalog pagination did not advance.");
                cursor = next;
            }
            throw new Exception("Model catalog exceeds the supported page limit.");
        }
    }
}
