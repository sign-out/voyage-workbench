package dev.voyage.workbench;

import org.junit.Test;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.net.URLClassLoader;
import java.util.Comparator;
import static org.junit.Assert.*;

public class RecoveryBoundaryTest {
 private static final Path SOURCES=Path.of("src/main/java/dev/voyage/workbench");
 private static String source(String name)throws Exception{return new String(Files.readAllBytes(SOURCES.resolve(name)),StandardCharsets.UTF_8);}
 private static String method(String source,String prefix){return source.lines().filter(line->line.startsWith(prefix)).findFirst().orElseThrow();}

 @Test public void actualToolBoundarySharesBudgetAndNeverRecoversStaleOrDeniedCalls()throws Exception {
  String agent=source("AgentService.java");
  String fixture="""
   package dev.voyage.workbench;
   import java.util.*;
   class JSONObject {
    static final Map<String,Map<String,Object>> saved=new HashMap<>();
    final Map<String,Object> values=new HashMap<>();
    JSONObject(){}
    JSONObject(String text){values.putAll(saved.get(text));}
    JSONObject put(String key,Object value){values.put(key,value);return this;}
    Object get(String key){return values.get(key);}
    boolean has(String key){return values.containsKey(key);}
    public String toString(){String key=UUID.randomUUID().toString();saved.put(key,new HashMap<>(values));return key;}
   }
   public class AgentRecoveryHarness {
    Recovery recovery=new Recovery(true,3);boolean active=true,stopDuringTool=false;int calls;
    String projectId="project";FakeStore store=new FakeStore();
    JSONObject task(){return new JSONObject().put("fieldFill",new JSONObject());}
    static class FakeStore {
     FakeCore core=new FakeCore();JSONObject project(String id){return new JSONObject();}
    }
    static class FakeCore {
     Object doc(String operation,Object...args)throws Exception{if("bad completion".equals(args[2]))throw new Exception("Invalid completion JSON");return new JSONObject();}
    }
    void ensureTaskRunning()throws Exception{if(!active)throw new Exception("Task stopped");}
    void requireTool(String name)throws Exception{ensureTaskRunning();if(!"allowed".equals(name))throw new Exception("Tool is unavailable for this stage");}
    Object tool(String name,JSONObject args)throws Exception{calls++;if(stopDuringTool)active=false;if(args.get("error")!=null)throw new Exception(args.get("error").toString());return args;}
   """+method(agent," JSONObject correctiveOpportunity(")+"\n"+method(agent," Object executeTool(")+"\n"+method(agent," String completionCorrection(")+"\n"+"""
    public static String run()throws Exception {
     AgentRecoveryHarness host=new AgentRecoveryHarness();
     for(int number=1;number<=3;number++){
      JSONObject error=(JSONObject)host.executeTool("allowed",new JSONObject().put("error","Invalid JSON"));
      if(!Integer.valueOf(number).equals(((JSONObject)error.get("recovery")).get("attempt")))throw new AssertionError("Wrong opportunity number");
      if(!Integer.valueOf(3).equals(((JSONObject)error.get("recovery")).get("maxAttempts")))throw new AssertionError("Wrong limit");
      for(int success=0;success<4;success++)host.executeTool("allowed",new JSONObject().put("valid",false).put("errors","diagnostic findings"));
     }
     try{host.executeTool("allowed",new JSONObject().put("error","Invalid JSON"));throw new AssertionError("Budget reset after success");}catch(Exception exhausted){if(!exhausted.getMessage().contains("exhausted after 3"))throw exhausted;}
     try{host.completionCorrection("bad completion");throw new AssertionError("Completion got separate budget");}catch(Exception exhausted){if(!exhausted.getMessage().contains("exhausted after 3"))throw exhausted;}
     host=new AgentRecoveryHarness();
     if(host.completionCorrection("good completion")!=null)throw new AssertionError("Valid completion retried");
     if(host.completionCorrection("bad completion")==null)throw new AssertionError("Invalid completion not retried");
     JSONObject second=(JSONObject)host.executeTool("allowed",new JSONObject().put("error","Invalid JSON"));
     if(!Integer.valueOf(2).equals(((JSONObject)second.get("recovery")).get("attempt")))throw new AssertionError("Completion budget not shared with tools");
     host=new AgentRecoveryHarness();host.recovery=new Recovery(false,3);
     try{host.executeTool("allowed",new JSONObject().put("error","Invalid JSON"));throw new AssertionError("Disabled recovered");}catch(Exception disabled){if(!disabled.getMessage().contains("disabled"))throw disabled;}
     for(String state:new String[]{"stopped","denied","scope","canceled-during-tool"}){
      host=new AgentRecoveryHarness();
      if(state.equals("stopped"))host.active=false;
      if(state.equals("canceled-during-tool"))host.stopDuringTool=true;
      String name=state.equals("denied")?"denied":"allowed";
      try{host.executeTool(name,new JSONObject().put("error",state.equals("scope")?"This path is outside the approved Work Order scope.":"Invalid JSON"));throw new AssertionError("Recovered "+state);}catch(Exception expected){}
      host.active=true;host.stopDuringTool=false;
      JSONObject error=(JSONObject)host.executeTool("allowed",new JSONObject().put("error","Invalid JSON"));
      if(!Integer.valueOf(1).equals(((JSONObject)error.get("recovery")).get("attempt")))throw new AssertionError("Terminal denial consumed budget");
     }
     host=new AgentRecoveryHarness();
     JSONObject malformed=(JSONObject)host.executeTool("allowed","bad arguments");
     if(!Integer.valueOf(1).equals(((JSONObject)malformed.get("recovery")).get("attempt"))||host.calls!=0)throw new AssertionError("Malformed arguments reached tool");
     return "ok";
    }
   }
   """;
  Path temporary=Files.createTempDirectory("voyage-assistant-recovery-");
  try {
   Path harness=temporary.resolve("AgentRecoveryHarness.java");Files.write(harness,fixture.getBytes(StandardCharsets.UTF_8));
   Object compiler=Class.forName("javax.tools.ToolProvider").getMethod("getSystemJavaCompiler").invoke(null);
   Object compiled=Class.forName("javax.tools.Tool").getMethod("run",java.io.InputStream.class,java.io.OutputStream.class,java.io.OutputStream.class,String[].class).invoke(compiler,null,null,null,new String[]{"-d",temporary.toString(),SOURCES.resolve("Recovery.java").toString(),harness.toString()});
   assertEquals(0,compiled);
   try(URLClassLoader loader=new URLClassLoader(new java.net.URL[]{temporary.toUri().toURL()},null)){assertEquals("ok",loader.loadClass("dev.voyage.workbench.AgentRecoveryHarness").getMethod("run").invoke(null));}
  } finally {try(java.util.stream.Stream<Path> paths=Files.walk(temporary)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}}
 }

 @Test public void everyProviderUsesTheSameNativeBudgetAndPreservesValidationDiagnostics()throws Exception {
  String agent=source("AgentService.java"),providers=source("Providers.java"),host=source("Host.java");
  assertTrue(agent.contains("Object result=executeTool(p.getString(\"tool\"),p.opt(\"arguments\"))"));
  assertTrue(providers.contains("agent.executeTool(call.getString(\"name\"),call.opt(\"args\"))"));
  assertFalse(providers.contains("new Recovery("));
  assertEquals(1,agent.split("new Recovery\\(",-1).length-1);
  assertTrue(method(agent," Object executeTool(").indexOf("requireTool(name)")<method(agent," Object executeTool(").indexOf("try{"));
  assertTrue(agent.contains("case \"world_validate\":return store.core.doc(\"validate\",source,references());"));
  assertTrue(agent.contains("!attempt.equals(current.getString(\"attempt\"))"));
  assertTrue(agent.contains("if(nativeTurns>=80)"));
  assertTrue(providers.contains("turn<80"));
  assertTrue(agent.contains("30*60*1000"));assertTrue(providers.contains("30*60*1000"));
  assertTrue(agent.contains("assistantCompletionValidation\",store.project(projectId),current,text"));
  assertTrue(providers.contains("agent.completionCorrection(reply.toString())"));
  assertTrue(agent.contains("pendingCorrection=completionCorrection(reply.toString())"));
  assertTrue(host.contains(".put(\"assistantRecovery\",assistantRecoverySettings())"));
  assertEquals(1,host.split("\\\"type\\\",\\\"prepareTask\\\"",-1).length-1);
  assertTrue(host.contains("if(!(p.opt(\"enabled\") instanceof Boolean)||!p.has(\"maxAttempts\"))"));
  assertTrue(host.contains("JSONObject next=(JSONObject)store.core.doc(\"assistantRecoverySettings\",p);store.setting(\"assistantRecovery\",next.toString());return next;}"));
  assertTrue(method(host," JSONObject assistantRecoverySettings(").contains("catch(Exception invalid){return (JSONObject)store.core.doc(\"assistantRecoverySettings\");}"));
 }
}
