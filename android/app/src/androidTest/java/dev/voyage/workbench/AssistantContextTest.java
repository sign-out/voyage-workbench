package dev.voyage.workbench;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import org.json.*;

@RunWith(AndroidJUnit4.class)
public class AssistantContextTest {
 @Test public void nativeAssistantSnapshotsSelectionAndRetainsConversationWithoutEditing()throws Exception{
  Host host=new Host(InstrumentationRegistry.getInstrumentation().getTargetContext());
  String source="{\"initialGameState\":{\"npcs\":{\"mara\":{\"name\":\"Mara\",\"exact\":9007199254740993}},\"regions\":{\"coast\":{\"name\":\"The Coast\"}}}}";
  String id=host.store.create("Native assistant context",source).getJSONObject("project").getString("id");
  JSONObject focus=new JSONObject().put("screen","characters").put("label","Mara").put("path",new JSONArray().put("initialGameState").put("npcs").put("mara")).put("hasUnappliedEdits",true);
  host.store.dispatch(id,new JSONObject().put("type","prepareTask").put("id","plan").put("attempt","attempt").put("kind","plan").put("prompt","How can we improve this?").put("editorContext",focus));
  JSONObject project=host.store.project(id),task=project.getJSONArray("tasks").getJSONObject(0);
  JSONObject packet=(JSONObject)host.store.core.doc("assistantPacket",project,task);
  assertEquals("Mara",packet.getJSONObject("editorContext").getString("label"));
  assertTrue(packet.getJSONObject("editorContext").getJSONArray("excerpts").getJSONObject(0).getString("source").contains("9007199254740993"));
  assertTrue(packet.getJSONObject("editorContext").getBoolean("hasUnappliedEdits"));
  assertEquals(source,project.getString("activeSource"));
  assertFalse(packet.has("workOrder"));
  assertTrue(((String)host.store.core.doc("agentSystem",false)).contains("Editor focus is not permission"));
  host.store.dispatch(id,new JSONObject().put("type","taskRunning").put("taskId","plan").put("attempt","attempt"));
  host.store.dispatch(id,new JSONObject().put("type","taskDone").put("taskId","plan").put("attempt","attempt").put("text","Improve motivation"));
  host.store.dispatch(id,new JSONObject().put("type","prepareTask").put("id","map-plan").put("attempt","map-attempt").put("kind","plan").put("prompt","And this?").put("editorContext",new JSONObject().put("screen","map").put("section","regions").put("key","coast").put("label","The Coast")));
  project=host.store.project(id);packet=(JSONObject)host.store.core.doc("assistantPacket",project,project.getJSONArray("tasks").getJSONObject(0));
  assertEquals("The Coast",packet.getJSONObject("editorContext").getString("label"));
  assertEquals("Mara",packet.getJSONArray("history").getJSONObject(0).getJSONObject("editorContext").getString("label"));
  assertEquals(source,project.getString("activeSource"));
 }
}
