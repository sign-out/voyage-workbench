package dev.voyage.workbench;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class VoyageRevisionTest {
 @Test public void nativeSaveAutomaticallyReconcilesWithoutBlindlyResending()throws Exception{
  String source="{\"title\":\"Test\",\"initialGameState\":{\"second\":2,\"first\":1}}";
  AtomicReference<String> remoteSource=new AtomicReference<>("{\"title\":\"Test\",\"initialGameState\":{\"first\":1,\"second\":2}}");AtomicInteger writes=new AtomicInteger();
  Host host=new Host(InstrumentationRegistry.getInstrumentation().getTargetContext()){
   @Override JSONObject api(String method,String endpoint,String body,String etag,String target)throws Exception{
    assertEquals("alpha",target);
    if(endpoint.equals("/validate"))return new JSONObject().put("text","{\"data\":{\"valid\":true,\"errors\":[]}}");
    if(method.equals("PUT")){assertEquals("W/\"revision-2\"",etag);writes.incrementAndGet();remoteSource.set((String)store.core.doc("read",body,new JSONArray().put("world")));return new JSONObject().put("text","{}");}
    assertEquals("GET",method);return new JSONObject().put("text","{\"data\":{\"world\":"+remoteSource.get()+"}}").put("etag","W/\"revision-2\"");
   }
  };
  String id=host.store.create("Auto reconcile fixture",source).getJSONObject("project").getString("id");host.store.dispatch(id,new JSONObject().put("type","remoteLink").put("environment","alpha").put("worldId","test").put("etag","W/\"revision-1\""));
  prepareUncertain(host,id,"already-saved");host.save(id);assertEquals(0,writes.get());assertEquals("CONFIRMED",host.store.project(id).getJSONObject("remote").getJSONArray("operations").getJSONObject(0).getString("state"));
  prepareUncertain(host,id,"older-save");host.store.dispatch(id,new JSONObject().put("type","edit").put("path",new JSONArray().put("title")).put("source","\"New local edit\"").put("baseHash",host.store.core.hash(source)));
  host.save(id);assertEquals(1,writes.get());assertEquals("CONFIRMED",host.store.project(id).getJSONObject("remote").getJSONArray("operations").getJSONObject(0).getString("state"));
  prepareUncertain(host,id,"real-difference");remoteSource.set(remoteSource.get().replace("New local edit","Other remote edit"));
  JSONObject blocked=(JSONObject)host.save(id);assertEquals("UNKNOWN",blocked.getJSONObject("project").getJSONObject("remote").getJSONArray("operations").getJSONObject(0).getString("state"));
  assertEquals(1,writes.get());assertEquals("UNKNOWN",host.pending(host.store.project(id)).getString("state"));
 }
 private void prepareUncertain(Host host,String id,String operation)throws Exception{
  JSONObject project=host.store.project(id);host.store.dispatch(id,new JSONObject().put("type","savePrepare").put("id",operation).put("baseHash",host.store.core.hash(project.getString("activeSource"))).put("payload",host.projectPayload(project)));
  host.saveState(id,operation,"SEND_ATTEMPTED","","");host.saveState(id,operation,"UNKNOWN","Remote content differs; do not retry automatically","");
 }
 @Test public void nativeReadbackIgnoresReorderingButRetainsLargeNumberAndArrayChanges()throws Exception{
  Host host=new Host(InstrumentationRegistry.getInstrumentation().getTargetContext());
  String submitted="{\"world\":{\"initialGameState\":{\"second\":2,\"first\":[{\"name\":\"test\",\"count\":1.0}],\"exact\":9007199254740993}}}";
  String remote="{\"world\":{\"initialGameState\":{\"exact\":9007199254740993,\"first\":[{\"count\":1,\"name\":\"test\"}],\"second\":2e0}}}";
  assertTrue(((JSONObject)host.store.core.doc("compareRemoteWorlds",submitted,remote)).getBoolean("matches"));
  JSONObject changed=(JSONObject)host.store.core.doc("compareRemoteWorlds",submitted,remote.replace("9007199254740993","9007199254740992"));assertFalse(changed.getBoolean("matches"));assertEquals(1,changed.getInt("total"));
  assertFalse(((JSONObject)host.store.core.doc("compareRemoteWorlds","[1,2]","[2,1]")).getBoolean("matches"));
 }
 @Test public void nativeTransportSendsQuotedRevisionInsteadOfWeakEtag()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();Host host=new Host(app);
  AtomicReference<String> sent=new AtomicReference<>();AtomicReference<Throwable> failure=new AtomicReference<>();
  try(ServerSocket server=new ServerSocket(0)){
   server.setSoTimeout(10000);
   Thread worker=new Thread(()->{try(Socket socket=server.accept()){
    socket.setSoTimeout(10000);BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.UTF_8));
    String header;while((header=reader.readLine())!=null&&!header.isEmpty())if(header.toLowerCase(java.util.Locale.ROOT).startsWith("if-match:"))sent.set(header.substring(header.indexOf(':')+1).trim());
    socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".getBytes(StandardCharsets.UTF_8));
   }catch(Throwable error){failure.set(error);}});
   worker.start();host.http("PUT","http://127.0.0.1:"+server.getLocalPort()+"/worlds/test","{}","W/\"revision-1\"",false);worker.join(15000);
   assertFalse(worker.isAlive());assertNull(failure.get());assertEquals("\"revision-1\"",sent.get());
  }
 }
 @Test public void oldInvalidRevisionFailureUnblocksWithoutReplacingLocalSource()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();Host host=new Host(app);String source="{\"initialGameState\":{\"local\":true}}";
  String id=host.store.create("Rejected revision fixture",source).getJSONObject("project").getString("id");
  host.store.dispatch(id,new JSONObject().put("type","remoteLink").put("environment","alpha").put("worldId","test").put("etag","W/\"revision-1\""));
  host.store.dispatch(id,new JSONObject().put("type","savePrepare").put("id","old-error").put("baseHash",host.store.core.hash(source)).put("payload",host.projectPayload(host.store.project(id))));
  host.saveState(id,"old-error","SEND_ATTEMPTED","","");host.saveState(id,"old-error","UNKNOWN","Voyage HTTP 400 (invalid_revision): If-Match must contain the quoted world revision","");
  host.reconcile(id);assertEquals("REJECTED",host.store.project(id).getJSONObject("remote").getJSONArray("operations").getJSONObject(0).getString("state"));assertEquals(source,host.store.project(id).getString("activeSource"));
  host.store.dispatch(id,new JSONObject().put("type","savePrepare").put("id","network-error").put("baseHash",host.store.core.hash(source)).put("payload",host.projectPayload(host.store.project(id))));
  host.saveState(id,"network-error","SEND_ATTEMPTED","","");host.saveState(id,"network-error","UNKNOWN","Connection lost after send","");host.recoverInvalidRevision(id);
  assertEquals("UNKNOWN",host.pending(host.store.project(id)).getString("state"));
 }
}
