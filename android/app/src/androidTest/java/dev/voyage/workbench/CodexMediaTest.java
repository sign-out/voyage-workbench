package dev.voyage.workbench;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CodexMediaTest {
 private static final String IMAGE="data:image/png;base64,iVBORw0KGgo=";
 @Test public void bundledAppServerAcceptsImageThreadWithoutStartingAModelTurn()throws Exception{
  Host host=host();java.io.File cwd=new java.io.File(host.app.getFilesDir(),"media-handshake/"+java.util.UUID.randomUUID());
  try(Rpc rpc=new Rpc(host.app,cwd)){
   rpc.init();assertTrue(rpc.rpc("modelProvider/capabilities/read",new JSONObject(),60).getBoolean("imageGeneration"));
   JSONObject started=rpc.rpc("thread/start",(JSONObject)host.store.core.doc("codexMediaThread",cwd.toString(),"",true),60);
   assertEquals("never",started.getString("approvalPolicy"));assertEquals("readOnly",started.getJSONObject("sandbox").getString("type"));assertFalse(started.getJSONObject("sandbox").getBoolean("networkAccess"));
  }
 }
 static class Fake implements CodexMedia.Session {
  Rpc.Listener listener;boolean closed,capable=true,fail=false,started=false;JSONObject input,thread;int pumps;String analysis="";
  public void listen(Rpc.Listener value){listener=value;}
  public JSONObject request(String method,JSONObject params)throws Exception{
   if("initialize".equals(method))return new JSONObject();
   if("account/read".equals(method))return new JSONObject().put("account",new JSONObject().put("type","chatgpt"));
   if("modelProvider/capabilities/read".equals(method))return new JSONObject().put("imageGeneration",capable);
   if("thread/start".equals(method)){thread=params;started=true;return new JSONObject().put("thread",new JSONObject().put("id","media"));}
   if("turn/start".equals(method)){input=params;return new JSONObject();}
   throw new Exception("Unexpected request "+method);
  }
  public void pump()throws Exception{
   pumps++;
   if(pumps==1)listener.event(new JSONObject().put("method","item/completed").put("params",new JSONObject().put("threadId","other-thread").put("item",new JSONObject().put("type","imageGeneration").put("status","completed").put("result","/private/not-an-image.png"))));
   else if(pumps==2)listener.event(new JSONObject().put("method","item/completed").put("params",new JSONObject().put("threadId","media").put("item",analysis.isEmpty()?new JSONObject().put("type","imageGeneration").put("status","completed").put("result",IMAGE.split(",")[1]):new JSONObject().put("type","agentMessage").put("text",analysis))));
   else listener.event(new JSONObject().put("method","turn/completed").put("params",new JSONObject().put("threadId","media").put("turn",new JSONObject().put("status",fail?"failed":"completed").put("items",new JSONArray()))));
  }
  public void close(){closed=true;}
 }
 private Host host()throws Exception{return new Host(InstrumentationRegistry.getInstrumentation().getTargetContext());}
 private JSONObject route()throws Exception{return new JSONObject().put("protocol","codex").put("model","");}
 @Test public void generatedImageUsesReferenceAndRestrictedThreadWithoutWorldEdits()throws Exception{
  Host host=host();Fake fake=new Fake();JSONObject result=CodexMedia.run(host,route(),"Draw one cover",new JSONArray().put(new JSONObject().put("id","reference").put("dataUrl",IMAGE)),true,(app,cwd)->fake);
  assertEquals(IMAGE,result.getString("dataUrl"));assertTrue(fake.closed);assertEquals("read-only",fake.thread.getString("sandbox"));assertEquals(0,fake.thread.getJSONArray("dynamicTools").length());assertTrue(fake.thread.getJSONObject("config").getBoolean("features.image_generation"));assertEquals(IMAGE,fake.input.getJSONArray("input").getJSONObject(2).getString("url"));
 }
 @Test public void unavailableCapabilityAndFailedTurnCloseAndDoNotRetry()throws Exception{
  Host host=host();Fake unavailable=new Fake();unavailable.capable=false;
  try{CodexMedia.run(host,route(),"Draw one cover",new JSONArray(),true,(app,cwd)->unavailable);fail("Unsupported generation accepted");}catch(Exception expected){assertTrue(expected.getMessage().contains("no API fallback"));}assertFalse(unavailable.started);assertTrue(unavailable.closed);
  Fake failed=new Fake();failed.fail=true;try{CodexMedia.run(host,route(),"Draw one cover",new JSONArray(),true,(app,cwd)->failed);fail("Failed turn accepted");}catch(Exception expected){assertTrue(expected.getMessage().contains("failed"));}assertTrue(failed.closed);
 }
 @Test public void gradingSessionReceivesImagesButCannotGenerateOrEditWorldContent()throws Exception{
  Host host=host();Fake fake=new Fake();fake.analysis="{\"report\":\"observed\"}";
  JSONObject result=CodexMedia.run(host,route(),"Inspect the crop",new JSONArray().put(new JSONObject().put("id","original").put("dataUrl",IMAGE)),false,(app,cwd)->fake);
  assertEquals(fake.analysis,result.getString("text"));assertFalse(fake.thread.getJSONObject("config").getBoolean("features.image_generation"));assertEquals(0,fake.thread.getJSONArray("dynamicTools").length());assertTrue(fake.closed);
 }
 @Test public void gradingAcceptsCodexDefaultButGenerationRejectsFilesystemResults()throws Exception{
  Host host=host();JSONObject settings=(JSONObject)host.store.core.doc("defaultSettings");JSONObject grading=(JSONObject)host.store.core.doc("coverGradingRoute",settings,"codex","");assertEquals("codex",grading.getString("protocol"));
  try{host.store.core.doc("codexImageResult",new JSONObject().put("type","imageGeneration").put("status","completed").put("result","/private/key"));fail("Filesystem result accepted");}catch(Exception expected){assertTrue(expected.getMessage(),expected.getMessage().contains("unrecognized image format"));}
 }
}
