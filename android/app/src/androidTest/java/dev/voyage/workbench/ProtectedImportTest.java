package dev.voyage.workbench;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import org.json.*;

@RunWith(AndroidJUnit4.class)
public class ProtectedImportTest {
 @Test public void importingOverLinkedWorldPreservesVoyageIdentityAndSchemaVersions()throws Exception{
  Host host=new Host(InstrumentationRegistry.getInstrumentation().getTargetContext());
  String source="{\"shortId\":\"WORLD\",\"loadStatus\":\"ready\",\"initialGameState\":{\"heroesVersion\":\"alpha\",\"compatibilityRevision\":9007199254740993,\"name\":\"Before\"}}";
  String id=host.store.create("Protected import",source).getJSONObject("project").getString("id");
  host.store.dispatch(id,new JSONObject().put("type","remoteLink").put("environment","alpha").put("worldId","WORLD").put("etag","v1").put("envelopeSource",source));
  String incoming="{\"world\":{\"shortId\":\"OTHER\",\"loadStatus\":\"broken\",\"initialGameState\":{\"heroesVersion\":\"old\",\"compatibilityRevision\":1,\"name\":\"After\"}}}";
  host.store.dispatch(id,new JSONObject().put("type","stage").put("id","import").put("kind","import").put("source",incoming));
  assertTrue(host.store.project(id).getJSONArray("candidates").getJSONObject(0).getString("importNote").contains("Protected Voyage fields retained"));
  host.store.dispatch(id,new JSONObject().put("type","accept").put("id","import"));
  JSONObject project=host.store.project(id),world=new JSONObject(project.getString("activeSource"));
  assertEquals("WORLD",world.getString("shortId"));assertEquals("ready",world.getString("loadStatus"));assertEquals("alpha",world.getJSONObject("initialGameState").getString("heroesVersion"));assertEquals("After",world.getJSONObject("initialGameState").getString("name"));assertTrue(project.getString("activeSource").contains("9007199254740993"));assertEquals("WORLD",project.getJSONObject("remote").getString("worldId"));assertEquals("v1",project.getJSONObject("remote").getString("etag"));assertEquals(1,host.store.history(id).length());
 }
}
