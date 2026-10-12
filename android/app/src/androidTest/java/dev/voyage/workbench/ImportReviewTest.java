package dev.voyage.workbench;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONArray;
import org.json.JSONObject;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ImportReviewTest {
 @Test public void rawImportReviewPreservesEnvelopeAndPersistentSelectiveChoices()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();Host host=new Host(app);
  String source="{\"shortId\":\"native-review\",\"title\":\"API metadata\",\"initialGameState\":{\"keep\":9007199254740993,\"change\":\"old\"}}";
  String id=host.store.create("Import review fixture",source).getJSONObject("project").getString("id");host.store.dispatch(id,new JSONObject().put("type","remoteLink").put("worldId","native-review").put("environment","alpha").put("etag","v1").put("envelopeSource",source));
  JSONObject staged=host.store.dispatch(id,new JSONObject().put("type","stage").put("id","import-review").put("kind","import").put("source","{\"keep\":9007199254740995,\"change\":\"new\"}")).getJSONObject("project");assertEquals(source,staged.getString("activeSource"));
  JSONObject candidate=staged.getJSONArray("candidates").getJSONObject(0);assertTrue(candidate.getString("importNote").contains("metadata"));
  host.store.dispatch(id,new JSONObject().put("type","candidateChange").put("id","import-review").put("kind","changed").put("path",new JSONArray().put("initialGameState").put("keep")).put("reject",true).put("candidateHash",host.store.core.hash(candidate.getString("source"))));
  Host reopened=new Host(app);assertEquals(1,reopened.store.project(id).getJSONArray("candidates").getJSONObject(0).getJSONArray("rejectedChanges").length());
  JSONObject accepted=reopened.store.dispatch(id,new JSONObject().put("type","accept").put("id","import-review")).getJSONObject("project");String payload=reopened.projectPayload(accepted);
  assertEquals("9007199254740993",reopened.store.core.doc("read",payload,new JSONArray().put("world").put("initialGameState").put("keep")));assertEquals("\"new\"",reopened.store.core.doc("read",payload,new JSONArray().put("world").put("initialGameState").put("change")));assertEquals("\"API metadata\"",reopened.store.core.doc("read",payload,new JSONArray().put("world").put("title")));
 }
 @Test public void oldRawStateReplacementRecoversOriginalDownloadedEnvelope()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();Host host=new Host(app);String source="{\"shortId\":\"legacy-review\",\"title\":\"Metadata\",\"initialGameState\":{\"exact\":9007199254740993}}";
  String id=host.store.create("Legacy raw fixture",source).getJSONObject("project").getString("id");host.store.dispatch(id,new JSONObject().put("type","remoteLink").put("worldId","legacy-review").put("environment","alpha").put("etag","v1"));
  try{host.store.dispatch(id,new JSONObject().put("type","edit").put("path",new JSONArray()).put("source","{\"exact\":9007199254740995}").put("baseHash",host.store.core.hash(source)));fail("New edits cannot remove package identity");}catch(org.mozilla.javascript.JavaScriptException expected){assertTrue(expected.getMessage().contains("metadata shortId is read only"));}
  assertEquals(source,host.store.project(id).getString("activeSource"));host.store.checkpoint(id,"Legacy root replacement",source);JSONObject legacy=host.store.project(id);legacy.put("activeSource","{\"exact\":9007199254740995}");host.store.getWritableDatabase().execSQL("UPDATE projects SET body=? WHERE id=?",new Object[]{legacy.toString(),id});JSONObject project=host.store.project(id);String payload=host.projectPayload(project);
  assertEquals("\"legacy-review\"",host.store.core.doc("read",payload,new JSONArray().put("world").put("shortId")));assertEquals("9007199254740995",host.store.core.doc("read",payload,new JSONArray().put("world").put("initialGameState").put("exact")));
 }
}
