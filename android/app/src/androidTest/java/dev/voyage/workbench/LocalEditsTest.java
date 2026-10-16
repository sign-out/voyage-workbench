package dev.voyage.workbench;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import org.json.*;

@RunWith(AndroidJUnit4.class)
public class LocalEditsTest {
 @Test public void automaticLocalChangesHaveAtomicRestorableCheckpointsAndPersistedModes()throws Exception{
  Host host=new Host(InstrumentationRegistry.getInstrumentation().getTargetContext());String originalMode=host.store.setting("localEditMode");
  try{
   host.store.setting("localEditMode","");assertEquals("automatic",((JSONObject)host.request("localEditingSettings",new JSONObject())).getString("mode"));
   host.request("saveLocalEditingSettings",new JSONObject().put("mode","proposal-only"));assertEquals("proposal-only",host.store.setting("localEditMode"));
   host.request("saveLocalEditingSettings",new JSONObject().put("mode","automatic"));
   String source="{\"title\":\"Before\",\"exact\":9007199254740993,\"fraction\":1.000}";
   String id=host.store.create("Automatic native fixture",source).getJSONObject("project").getString("id");
   host.store.dispatch(id,new JSONObject().put("type","workOrder").put("order",new JSONObject().put("objective","Change title").put("requirements",new JSONArray()).put("allowedPaths",new JSONArray().put(new JSONArray().put("title")))));
   host.store.dispatch(id,new JSONObject().put("type","prepareTask").put("id","work").put("attempt","attempt").put("kind","work").put("localEditMode","automatic"));
   host.request("saveLocalEditingSettings",new JSONObject().put("mode","proposal-only"));
   host.store.dispatch(id,new JSONObject().put("type","taskRunning").put("taskId","work").put("attempt","attempt"));
   host.store.dispatch(id,new JSONObject().put("type","taskEdit").put("taskId","work").put("attempt","attempt").put("action","replace").put("path",new JSONArray().put("title")).put("source","\"After\""));
   host.store.getWritableDatabase().execSQL("CREATE TRIGGER reject_auto_checkpoint BEFORE INSERT ON checkpoints BEGIN SELECT RAISE(FAIL, 'Checkpoint unavailable'); END");
   try{
    try{host.store.dispatch(id,new JSONObject().put("type","taskDone").put("taskId","work").put("attempt","attempt"));fail("Auto apply must fail when the checkpoint cannot be saved");}catch(android.database.SQLException expected){}
    assertEquals(source,host.store.project(id).getString("activeSource"));assertEquals("RUNNING",host.store.project(id).getJSONArray("tasks").getJSONObject(0).getString("state"));assertEquals(0,host.store.history(id).length());
   }finally{host.store.getWritableDatabase().execSQL("DROP TRIGGER reject_auto_checkpoint");}
   host.store.dispatch(id,new JSONObject().put("type","taskDone").put("taskId","work").put("attempt","attempt"));
   JSONObject project=host.store.project(id);assertEquals("APPLIED",project.getJSONArray("tasks").getJSONObject(0).getString("state"));assertEquals(source.replace("Before","After"),project.getString("activeSource"));assertEquals(0,project.getJSONArray("candidates").length());assertEquals(0,project.getJSONObject("remote").getJSONArray("operations").length());
   JSONArray checkpoints=host.store.history(id);assertEquals(1,checkpoints.length());host.store.restore(id,checkpoints.getJSONObject(0).getString("id"));project=host.store.project(id);String proposal=project.getJSONArray("candidates").getJSONObject(0).getString("id");
   host.store.dispatch(id,new JSONObject().put("type","accept").put("id",proposal));assertEquals(source,host.store.project(id).getString("activeSource"));assertEquals(2,host.store.history(id).length());
  }finally{host.store.setting("localEditMode",originalMode);}
 }
}
