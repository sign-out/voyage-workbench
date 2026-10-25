package dev.voyage.workbench;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SectionCheckpointStoreTest {
 @Test public void sectionReceiptAndSourceRollbackTogetherOnStorageFailure()throws Exception {
  Store store=new Store(InstrumentationRegistry.getInstrumentation().getTargetContext());
  String source="{\"title\":\"Before\",\"description\":\"Original\",\"aiInstructions\":{}}";
  String id=store.create("Section checkpoint fixture",source).getJSONObject("project").getString("id");
  try {
   store.dispatch(id,new JSONObject().put("type","workOrder").put("baseHash",store.core.hash(source)).put("order",new JSONObject().put("reviewedScope",true).put("objective","Improve sections").put("requirements",new JSONArray()).put("allowedPaths",new JSONArray()).put("wholeWorld",true)));
   store.dispatch(id,new JSONObject().put("type","prepareTask").put("kind","work").put("id","task").put("attempt","attempt"));
   command(store,id,"taskRunning");
   store.dispatch(id,new JSONObject().put("type","taskEdit").put("taskId","task").put("attempt","attempt").put("path",new JSONArray().put("title")).put("source","\"After\"").put("action","replace"));
   checkpoint(store,id,"title");checkpoint(store,id,"title");
   assertEquals(1,store.history(id).length());assertEquals(source,store.project(id).getString("activeSource"));
   store.dispatch(id,new JSONObject().put("type","taskEdit").put("taskId","task").put("attempt","attempt").put("path",new JSONArray().put("description")).put("source","\"Better\"").put("action","replace"));
   String before=store.get(id,-1).toString();
   store.getWritableDatabase().execSQL("CREATE TEMP TRIGGER fail_section BEFORE INSERT ON checkpoints BEGIN SELECT RAISE(ABORT,'simulated section disk failure'); END");
   try {checkpoint(store,id,"description");fail("Expected storage failure");}catch(Exception expected){assertTrue(expected.getMessage().contains("simulated section disk failure"));}
   assertEquals(before,store.get(id,-1).toString());assertEquals(1,store.history(id).length());
   store.getWritableDatabase().execSQL("DROP TRIGGER fail_section");checkpoint(store,id,"description");assertEquals(2,store.history(id).length());
  } finally {
   store.getWritableDatabase().execSQL("DROP TRIGGER IF EXISTS fail_section");
   store.getWritableDatabase().execSQL("DELETE FROM checkpoints WHERE project_id=?",new Object[]{id});
   store.getWritableDatabase().execSQL("DELETE FROM projects WHERE id=?",new Object[]{id});store.close();
  }
 }
 private void command(Store store,String id,String type)throws Exception {store.dispatch(id,new JSONObject().put("type",type).put("taskId","task").put("attempt","attempt"));}
 private void checkpoint(Store store,String id,String section)throws Exception {store.dispatch(id,new JSONObject().put("type","taskSectionCheckpoint").put("taskId","task").put("attempt","attempt").put("label",section).put("paths",new JSONArray().put(new JSONArray().put(section))));}
}
