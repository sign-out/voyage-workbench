package dev.voyage.workbench;

import android.content.Context;
import org.json.*;
import java.util.*;
import java.util.function.BooleanSupplier;

final class CursorHarness {
    static JSONObject input(Context app, String id, String operation) throws Exception {
        JSONObject input = new JSONObject().put("operation", operation).put("key", new Secrets(app).get("provider-" + id));
        String saved = new Secrets(app).get("cli-auth-" + id);
        if (!saved.isEmpty()) input.put("credentials", new JSONObject(saved));
        return input;
    }

    static JSONObject response(String output, String type) throws Exception {
        JSONObject found = null;
        for (String line : output.split("\n")) {
            if (line.trim().isEmpty()) continue;
            JSONObject event = new JSONObject(line);
            if (event.optInt("voyageCursor") != 1 || "error".equals(event.optString("type"))) throw new Exception("Cursor returned an unsuccessful SDK response. No world tools were applied.");
            if (type.equals(event.optString("type"))) {
                if (found != null) throw new Exception("Cursor returned multiple final responses.");
                found = event;
            }
        }
        if (found == null) throw new Exception("Cursor did not return a complete SDK response.");
        return found;
    }

    static JSONObject turn(Context app, Core core, JSONObject route, JSONArray messages, boolean work, BooleanSupplier canceled) throws Exception {
        if (route.optString("model").trim().isEmpty()) throw new Exception("Choose an explicit Cursor model in Models & agents before starting a task.");
        String id = route.getString("id");
        JSONObject input = input(app, id, "turn").put("context", core.doc("harnessInput", messages, work)).put("model", route.optString("model"));
        try (CliRuntime runtime = new CliRuntime(app, id, "cursor")) {
            String output = runtime.execute(Collections.emptyList(), input.toString() + "\n", "", canceled, 300, true);
            return (JSONObject)core.doc("harnessResponse", response(output, "turn-complete").getString("result"));
        }
    }

    static JSONObject status(Context app, String id) throws Exception {
        try (CliRuntime runtime = new CliRuntime(app, id, "cursor")) {
            return response(runtime.execute(Collections.emptyList(), input(app, id, "status").toString() + "\n", "", () -> false, 30, true), "status");
        }
    }
    static JSONArray models(Context app, String id) throws Exception {
        try (CliRuntime runtime = new CliRuntime(app, id, "cursor")) {
            return response(runtime.execute(Collections.emptyList(), input(app, id, "models").toString() + "\n", "", () -> false, 30, true), "models").getJSONArray("models");
        }
    }
}
