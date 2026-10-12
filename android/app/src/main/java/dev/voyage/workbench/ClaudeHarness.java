package dev.voyage.workbench;

import android.content.Context;
import org.json.*;
import java.util.*;
import java.util.function.BooleanSupplier;

final class ClaudeHarness {
    static JSONObject turn(Context app, Core core, JSONObject route, JSONArray messages, boolean work, BooleanSupplier canceled) throws Exception {
        JSONArray wire = (JSONArray)core.doc("claudeArguments", route);
        ArrayList<String> arguments = new ArrayList<>();
        for (int index = 0; index < wire.length(); index++) arguments.add(wire.getString(index));
        String key = new Secrets(app).get("provider-" + route.getString("id"));
        try (CliRuntime runtime = new CliRuntime(app, route.getString("id"))) {
            try {
                String response = runtime.execute(arguments, (String)core.doc("harnessInput", messages, work), key, canceled, 300, true);
                return (JSONObject)core.doc("harnessResponse", new JSONObject(response));
            } finally { runtime.retainAuthentication(); }
        }
    }

    static JSONObject status(Context app, String profileId) throws Exception {
        try (CliRuntime runtime = new CliRuntime(app, profileId)) {
            String result = runtime.execute(Arrays.asList("auth", "status", "--json"), "", new Secrets(app).get("provider-" + profileId), () -> false, 30, false);
            JSONObject raw = new JSONObject(result);
            return new JSONObject().put("loggedIn", raw.optBoolean("loggedIn")).put("authMethod", raw.optString("authMethod"));
        }
    }
}
