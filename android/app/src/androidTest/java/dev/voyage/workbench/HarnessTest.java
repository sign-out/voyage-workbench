package dev.voyage.workbench;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class HarnessTest {
 private String prepare(Store store,String source)throws Exception{
  return prepare(store,source,false);
 }
 private String prepare(Store store,String source,boolean autoResume)throws Exception{
  String id=store.create("Native harness audit",source).getJSONObject("project").getString("id");
  store.dispatch(id,new JSONObject().put("type","workOrder").put("baseHash",store.core.hash(source)).put("order",new JSONObject().put("reviewedScope",true).put("objective","Update NPCs").put("requirements",new JSONArray()).put("allowedPaths",new JSONArray().put(new JSONArray().put("npcs")))));
  store.dispatch(id,new JSONObject().put("type","prepareTask").put("id","task").put("attempt","attempt").put("kind","work").put("autoResume",autoResume).put("route",new JSONObject().put("protocol","openai").put("model","fixed")).put("localEditMode","automatic"));
  store.dispatch(id,new JSONObject().put("type","taskRunning").put("taskId","task").put("attempt","attempt"));return id;
 }
 private JSONObject call(String id,JSONObject args)throws Exception{return new JSONObject().put("type","taskTool").put("taskId","task").put("attempt","attempt").put("callId",id).put("name","world_edit").put("args",args);}

 @Test public void nativeReceiptsReplayExactlyOnceAndRejectDifferentArguments()throws Exception{
  Store store=new Store(InstrumentationRegistry.getInstrumentation().getTargetContext());try{
   String source="{\"heroesVersion\":37,\"npcs\":{},\"exact\":9007199254740993}",id=prepare(store,source);
   JSONObject args=new JSONObject().put("action","insert").put("path",new JSONArray().put("npcs")).put("key","Guide").put("source","{\"name\":\"Guide\"}");
   store.dispatch(id,call("insert",args));String staged=store.project(id).getJSONArray("tasks").getJSONObject(0).getString("stagedSource");
   store.dispatch(id,call("insert",args));JSONObject task=store.project(id).getJSONArray("tasks").getJSONObject(0);
   assertEquals(staged,task.getString("stagedSource"));assertEquals(1,task.getJSONArray("toolJournal").length());assertTrue(staged.contains("9007199254740993"));assertEquals(source,store.project(id).getString("activeSource"));
   try{store.dispatch(id,call("insert",new JSONObject(args.toString()).put("source","{}")));fail("A conflicting call ID was accepted");}catch(Exception expected){assertTrue(expected.getMessage().contains("reused"));}
  }finally{store.close();}
 }

 @Test public void automaticApplyRetainsAProposalWhenHostSchemaChecksFail()throws Exception{
  Store store=new Store(InstrumentationRegistry.getInstrumentation().getTargetContext());try{
   String source="{\"heroesVersion\":37,\"npcs\":{}}",id=prepare(store,source);
   store.dispatch(id,call("invalid",new JSONObject().put("action","replace").put("path",new JSONArray().put("npcs")).put("source","[]")));
   store.dispatch(id,new JSONObject().put("type","taskDone").put("taskId","task").put("attempt","attempt").put("references",new JSONArray()));
   JSONObject project=store.project(id),task=project.getJSONArray("tasks").getJSONObject(0);
   assertEquals(source,project.getString("activeSource"));assertEquals("PROPOSAL_READY",task.getString("state"));assertEquals("blocked",task.getJSONObject("completionEvidence").getString("state"));assertFalse(task.getJSONObject("completionEvidence").getBoolean("official"));assertEquals(64,task.getJSONObject("completionEvidence").getString("schemaHash").length());
  }finally{store.close();}
 }

 @Test public void checkpointContinuationPreservesEvidenceAndRejectsOldCallbacks()throws Exception{
  Store store=new Store(InstrumentationRegistry.getInstrumentation().getTargetContext());try{
   String source="{\"heroesVersion\":37,\"npcs\":{},\"exact\":9007199254740993}",id=prepare(store,source,true);
   store.dispatch(id,call("insert",new JSONObject().put("action","insert").put("path",new JSONArray().put("npcs")).put("key","Guide").put("source","{\"name\":\"Guide\"}")));
   String staged=store.project(id).getJSONArray("tasks").getJSONObject(0).getString("stagedSource");
   store.dispatch(id,new JSONObject().put("type","recover"));
   JSONObject guidance=(JSONObject)store.core.doc("resumeGuidance",store.project(id),"task","android");assertTrue(guidance.getBoolean("allowed"));
   store.dispatch(id,new JSONObject().put("type","resumeTask").put("taskId","task").put("attempt","attempt").put("newAttempt","continued"));
   JSONObject task=store.project(id).getJSONArray("tasks").getJSONObject(0);assertEquals(staged,task.getString("stagedSource"));assertEquals("attempt",task.getJSONArray("toolJournal").getJSONObject(0).getString("attempt"));assertEquals(1,task.getJSONArray("resumes").length());
   store.dispatch(id,new JSONObject().put("type","taskRunning").put("taskId","task").put("attempt","continued"));
   try{store.dispatch(id,call("late",new JSONObject().put("action","remove").put("path",new JSONArray().put("npcs").put("Guide"))));fail("An old callback was accepted");}catch(Exception expected){assertTrue(expected.getMessage().contains("attempt"));}
   JSONObject capabilities=(JSONObject)store.core.doc("orchestrationCapabilities","android","openai");assertFalse(capabilities.getBoolean("delegation"));assertTrue(capabilities.getBoolean("checkpointResume"));assertEquals(source,store.project(id).getString("activeSource"));
  }finally{store.close();}
 }
}
