package dev.voyage.workbench;

import org.junit.Test;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import static org.junit.Assert.*;

public class HostSaveBoundaryTest {
 @Test public void actualSaveMethodSeparatesPutRejectionFromAcknowledgedReadbackFailure()throws Exception {
  Path root=Path.of("").toAbsolutePath();
  while(root!=null&&!Files.exists(root.resolve("android/app/src/main/java/dev/voyage/workbench/Host.java")))root=root.getParent();
  assertNotNull("Run from within the repository",root);
  Path sources=root.resolve("android/app/src/main/java/dev/voyage/workbench");
  String host=new String(Files.readAllBytes(sources.resolve("Host.java")),StandardCharsets.UTF_8);
  String save=host.lines().filter(line->line.startsWith(" Object save(String id)")).findFirst().orElseThrow();
  String apiError=host.lines().filter(line->line.startsWith(" static final class ApiError")).findFirst().orElseThrow();
  String fixture="""
   package dev.voyage.workbench;
   import java.util.*;
   public class HostSaveHarness {
    static class JSONObject {
     final Map<String,Object> values=new HashMap<>();
     JSONObject put(String key,Object value){values.put(key,value);return this;}
     JSONObject getJSONObject(String key){return (JSONObject)values.get(key);}
     JSONArray getJSONArray(String key){return (JSONArray)values.get(key);}
     String getString(String key){return (String)values.get(key);}
     String optString(String key){return values.getOrDefault(key,"").toString();}
     boolean optBoolean(String key){return Boolean.TRUE.equals(values.get(key));}
     JSONObject optJSONObject(String key){return (JSONObject)values.get(key);}
     Object opt(String key){return values.get(key);}
     boolean has(String key){return values.containsKey(key);}
     JSONArray optJSONArray(String key){Object value=values.get(key);return value instanceof JSONArray?(JSONArray)value:null;}
     boolean isNull(String key){return values.get(key)==null;}
    }
    static class JSONArray {final int size;JSONArray(){this(0);}JSONArray(int size){this.size=size;}int length(){return size;}JSONObject getJSONObject(int index){throw new AssertionError();}}
    static class Core {
     Object doc(String method,String value){return method.equals("invalidRevisionFailure")?value.startsWith("Voyage HTTP 400 (invalid_revision):"):value;}
     String hash(String source){return source;}
    }
    static class Store {
     final Core core=new Core();
     JSONObject project(String id){return new JSONObject().put("activeSource","world").put("candidates",new JSONArray()).put("remote",new JSONObject().put("etag","revision").put("worldId","WORLD"));}
     void checkpoint(String id,String label,Object ignored){}
     JSONObject dispatch(String id,JSONObject action){return action;}
     Object get(String id,int version){return null;}
    }
    final Store store=new Store();final List<String> states=new ArrayList<>();String detail="";Exception putFailure,readFailure;int puts,readbacks;
    JSONObject validationReport=new JSONObject().put("valid",true).put("errors",new JSONArray());
    void recoverInvalidRevision(String id){}
    String projectEnvironment(JSONObject project){return "alpha";}
    JSONObject pending(JSONObject project){return null;}
    Object request(String method,JSONObject payload){return new JSONObject().put("report",validationReport);}
    String projectPayload(JSONObject project){return "{}";}
    String encode(String value){return value;}
    JSONObject saveState(String id,String operation,String state,String detail,String etag){states.add(state);this.detail=detail;return new JSONObject();}
    Object api(String method,String path,String body,String etag,String target)throws Exception{puts++;if(putFailure!=null)throw putFailure;return null;}
    Object reconcile(String id)throws Exception{readbacks++;if(readFailure!=null)throw readFailure;return "confirmed";}
    public static String[] run(int status,String code,boolean readback)throws Exception {
     HostSaveHarness harness=new HostSaveHarness();
     Exception failure=status==0?new java.io.IOException("connection lost"):new ApiError(status,"Voyage HTTP "+status+" ("+code+"): rejected",code);
     if(readback)harness.readFailure=failure;else harness.putFailure=failure;
     try{harness.save("project");throw new AssertionError("Expected failure");}catch(Exception expected){}
     return new String[]{String.join(",",harness.states),harness.detail,""+harness.puts,""+harness.readbacks};
    }
    public static int validation(String mode,boolean wrapped)throws Exception {
     HostSaveHarness harness=new HostSaveHarness();JSONObject report=harness.validationReport;
     if(mode.equals("false"))report.put("valid",false);
     if(mode.equals("string"))report.put("valid","true");
     if(mode.equals("success")){report.values.remove("valid");report.put("success",true);}
     if(mode.equals("missingErrors"))report.values.remove("errors");
     if(mode.equals("wrongErrors"))report.put("errors","none");
     if(mode.equals("errors"))report.put("errors",new JSONArray(1));
     if(wrapped)harness.validationReport=new JSONObject().put("valid",true).put("errors",new JSONArray()).put("data",report);
     try{harness.save("project");}catch(Exception rejected){}
     return harness.puts;
    }
   """+apiError+"\n"+save+"\n}";
  Path temporary=Files.createTempDirectory("voyage-save-boundary-");
  try {
   Path fixturePath=temporary.resolve("HostSaveHarness.java");Files.write(fixturePath,fixture.getBytes(StandardCharsets.UTF_8));
   Object compiler=Class.forName("javax.tools.ToolProvider").getMethod("getSystemJavaCompiler").invoke(null);
   Object compiled=Class.forName("javax.tools.Tool").getMethod("run",java.io.InputStream.class,java.io.OutputStream.class,java.io.OutputStream.class,String[].class).invoke(compiler,null,null,null,new String[]{"-d",temporary.toString(),sources.resolve("VoyageHttpPolicy.java").toString(),fixturePath.toString()});
   assertEquals(0,compiled);
   try(URLClassLoader loader=new URLClassLoader(new java.net.URL[]{temporary.toUri().toURL()},null)){
    java.lang.reflect.Method run=loader.loadClass("dev.voyage.workbench.HostSaveHarness").getMethod("run",int.class,String.class,boolean.class);
    java.lang.reflect.Method validation=loader.loadClass("dev.voyage.workbench.HostSaveHarness").getMethod("validation",String.class,boolean.class);
    for(boolean wrapped:new boolean[]{false,true}){
     assertEquals(1,validation.invoke(null,"valid",wrapped));
     for(String mode:new String[]{"false","string","success","missingErrors","wrongErrors","errors"})assertEquals(mode,0,validation.invoke(null,mode,wrapped));
    }
    for(int status:new int[]{400,401,403,404,405,412,413,415,422,428,429}){
     String[] rejected=(String[])run.invoke(null,status,"rejected",false);assertEquals("SEND_ATTEMPTED,REJECTED",rejected[0]);assertEquals("0",rejected[3]);
     for(String code:new String[]{"request_status_unknown","request_in_progress"})assertEquals("SEND_ATTEMPTED,UNKNOWN",((String[])run.invoke(null,status,code,false))[0]);
    }
    assertEquals("SEND_ATTEMPTED,REJECTED",((String[])run.invoke(null,503,"studio_unavailable",false))[0]);
    assertEquals("SEND_ATTEMPTED,REJECTED",((String[])run.invoke(null,409,"studio_version_mismatch",false))[0]);
    assertEquals("SEND_ATTEMPTED,REJECTED",((String[])run.invoke(null,400,"invalid_revision",false))[0]);
    assertEquals("SEND_ATTEMPTED,UNKNOWN",((String[])run.invoke(null,0,"",false))[0]);
    assertEquals("SEND_ATTEMPTED,UNKNOWN",((String[])run.invoke(null,500,"",false))[0]);
    for(String code:new String[]{"invalid_revision","studio_unavailable","studio_version_mismatch","request_status_unknown","request_in_progress"}){
     String[] readback=(String[])run.invoke(null,400,code,true);assertEquals("SEND_ATTEMPTED,UNKNOWN",readback[0]);assertTrue(readback[1].startsWith("Voyage acknowledged the PUT"));assertTrue(readback[1].contains("reconcile"));assertEquals("1",readback[2]);assertEquals("1",readback[3]);assertFalse(readback[1].startsWith("Voyage HTTP 400 (invalid_revision):"));
    }
   }
  } finally {try(java.util.stream.Stream<Path> paths=Files.walk(temporary)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}}
 }
}
