package dev.voyage.workbench;

import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class ModelCatalogTest {
    @Test public void exactInferenceIdsAndLabelsSurviveCatalogNormalization() throws Exception {
        JSONArray result = ModelCatalog.normalize(new JSONArray("[{\"id\":\"internal\",\"model\":\"sol-fixture\",\"displayName\":\"Sol\",\"isDefault\":true},{\"id\":\"luna-fixture\",\"displayName\":\"Luna\"},{\"id\":\"luna-fixture\"},{\"id\":\"hidden\",\"hidden\":true},{\"name\":\"models/gemini-fixture\"},null]"));
        assertEquals(3, result.length());
        assertEquals("sol-fixture", result.getJSONObject(0).getString("id"));
        assertEquals("Sol", result.getJSONObject(0).getString("name"));
        assertTrue(result.getJSONObject(0).getBoolean("isDefault"));
        assertEquals("luna-fixture", result.getJSONObject(1).getString("id"));
        assertEquals("gemini-fixture", result.getJSONObject(2).getString("id"));
    }
}
