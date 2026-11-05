package dev.voyage.workbench;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SchemaReferencesTest {
 @Test public void refreshAcceptsIntersectionCodecsAndRetainsValidCacheOnFailure()throws Exception{
  AtomicReference<String> response=new AtomicReference<>("{\"_type\":\"intersection\",\"parts\":[{\"_type\":\"required\",\"fields\":{\"heroesVersion\":{\"_type\":\"literal\",\"value\":37}}},{\"_type\":\"partial\",\"fields\":{\"triggerDefinitions\":{\"_type\":\"record\",\"codomain\":\"unknown\"}}}]}");
  Host host=new Host(InstrumentationRegistry.getInstrumentation().getTargetContext()){
   @Override JSONObject http(String method,String url,String body,String etag,boolean authenticated)throws Exception{
    assertEquals("GET",method);assertEquals("https://api.unofficial.voyage/schema.json",url);assertFalse(authenticated);
    return new JSONObject().put("text",response.get());
   }
  };
  String previous=host.store.setting("references"),previousMeta=host.store.setting("referenceMeta");
  try{
   assertTrue(((JSONObject)host.request("refreshReferences",new JSONObject())).getBoolean("ok"));
   JSONObject installed=(JSONObject)host.request("references",new JSONObject());
   assertEquals(37,installed.getJSONObject("meta").getInt("schemaVersion"));
   assertEquals(2,((JSONArray)host.store.core.doc("selectReferences","{\"heroesVersion\":37}",installed.getJSONArray("sections"))).length());
   assertFalse(installed.getBoolean("official"));
   JSONArray warnings=(JSONArray)host.store.core.doc("validate","{\"heroesVersion\":999}",installed.getJSONArray("sections"));
   assertTrue(warnings.toString().contains("Schema checks were skipped"));
   response.set("{\"_type\":\"intersection\",\"parts\":[]}");
   JSONObject failed=(JSONObject)host.request("refreshReferences",new JSONObject());
   assertFalse(failed.getBoolean("ok"));assertTrue(failed.getBoolean("retainedPrevious"));
   assertEquals(installed.toString(),host.request("references",new JSONObject()).toString());
  }finally{host.store.setting("references",previous);host.store.setting("referenceMeta",previousMeta);host.store.close();}
 }
}
