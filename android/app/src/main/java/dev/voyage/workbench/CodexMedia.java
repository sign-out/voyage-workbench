package dev.voyage.workbench;

import android.content.Context;
import java.io.File;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

final class CodexMedia {
 interface Session extends AutoCloseable {
  void listen(Rpc.Listener listener);
  JSONObject request(String method,JSONObject params)throws Exception;
  void pump()throws Exception;
  void close();
 }
 interface Factory {Session create(Context app,File cwd)throws Exception;}
 private static final AtomicBoolean active=new AtomicBoolean();
 static Session session(Context app,File cwd)throws Exception{
  Rpc rpc=new Rpc(app,cwd);
  return new Session(){
   public void listen(Rpc.Listener listener){rpc.listener=listener;}
   public JSONObject request(String method,JSONObject params)throws Exception{JSONObject result=rpc.rpc(method,params,60);if("initialize".equals(method))rpc.send(new JSONObject().put("method","initialized").put("params",new JSONObject()));return result;}
   public void pump()throws Exception{rpc.pump();}
   public void close(){rpc.close();}
  };
 }
 static JSONObject run(Host host,JSONObject route,String prompt,JSONArray images,boolean generation)throws Exception{return run(host,route,prompt,images,generation,CodexMedia::session);}
 static JSONObject run(Host host,JSONObject route,String prompt,JSONArray images,boolean generation,Factory factory)throws Exception{
  JSONArray input=(JSONArray)host.store.core.doc("codexMediaInput",prompt,images);
  if(!active.compareAndSet(false,true))throw new Exception("A Codex image request is already running. Wait before starting another.");
  File cwd=new File(host.app.getFilesDir(),"media-tasks/"+UUID.randomUUID());
  try(Session session=factory.create(host.app,cwd)){
   session.request("initialize",new JSONObject().put("clientInfo",new JSONObject().put("name","voyage_media").put("version","0.2.6")).put("capabilities",new JSONObject().put("experimentalApi",true)));
   JSONObject account=session.request("account/read",new JSONObject().put("refreshToken",false));
   if(account.isNull("account")||!account.has("account"))throw new Exception("Sign into Codex in Connection first.");
   if(generation&&!session.request("modelProvider/capabilities/read",new JSONObject()).optBoolean("imageGeneration"))throw new Exception("This Codex connection does not expose image generation. Choose a supported image provider; no API fallback was sent.");
   JSONObject thread=session.request("thread/start",(JSONObject)host.store.core.doc("codexMediaThread",cwd.toString(),route.optString("model"),generation));
   String threadId=thread.getJSONObject("thread").getString("id");
   JSONObject result=new JSONObject();StringBuilder text=new StringBuilder();AtomicBoolean done=new AtomicBoolean();
   session.listen(event->{
    if(event.has("id")&&event.has("method"))throw new Exception("Unapproved provider request during image work");
    JSONObject params=event.optJSONObject("params");if(params==null||!threadId.equals(params.optString("threadId")))return;
    String method=event.optString("method");
    if("item/agentMessage/delta".equals(method)){text.append(params.optString("delta"));if(text.length()>1024*1024)throw new Exception("Codex image response is too large");}
    if("item/completed".equals(method))collect(params.optJSONObject("item"),result,text);
    if("turn/completed".equals(method)){
     JSONObject turn=params.getJSONObject("turn");if(!"completed".equals(turn.optString("status")))throw new Exception("Codex image request failed; retry explicitly after inspecting account usage.");
     JSONArray items=turn.optJSONArray("items");if(items!=null)for(int index=0;index<items.length();index++)collect(items.getJSONObject(index),result,text);
     done.set(true);
    }
   });
   session.request("turn/start",new JSONObject().put("threadId",threadId).put("input",input));
   long deadline=System.currentTimeMillis()+10*60*1000;
   while(!done.get()){
    if(System.currentTimeMillis()>deadline)throw new Exception("Codex image request timed out. It may have consumed account usage; retry explicitly.");
    try{session.pump();}catch(java.io.IOException error){if(!error.getMessage().startsWith("Timed out waiting"))throw error;}
   }
   if(generation)return generatedImage(host,result.optJSONObject("image"));
   if(text.toString().trim().isEmpty())throw new Exception("Codex returned no image analysis");
   return new JSONObject().put("text",text.toString());
  }finally{active.set(false);}
 }
 private static void collect(JSONObject item,JSONObject result,StringBuilder text)throws Exception{
  if(item==null)return;
  if("imageGeneration".equals(item.optString("type")))result.put("image",item);
  if("agentMessage".equals(item.optString("type"))){String value=item.optString("text");if(value.length()>1024*1024)throw new Exception("Codex image response is too large");if(!value.isEmpty()){text.setLength(0);text.append(value);}}
 }
 static JSONObject generatedImage(Host host,JSONObject item)throws Exception{
  if(item==null)throw new Exception("Codex did not return a generated image");
  String encoded=item.optString("result");
  if(encoded.startsWith("data:")){int comma=encoded.indexOf(',');if(comma<0||!encoded.substring(0,comma).matches("data:image/(png|jpeg|webp);base64"))throw new Exception("Unsupported image result");encoded=encoded.substring(comma+1);}
  if(encoded.isEmpty()||encoded.length()>4*((32*1024*1024+2)/3)||encoded.length()%4!=0)throw new Exception("Empty or oversized image result");
  for(int index=0;index<encoded.length();index++){char value=encoded.charAt(index);if(value=='='&&index>=encoded.length()-2){if(index==encoded.length()-2&&encoded.charAt(index+1)!='=')throw new Exception("Invalid image padding");continue;}if(!(value>='A'&&value<='Z'||value>='a'&&value<='z'||value>='0'&&value<='9'||value=='+'||value=='/'))throw new Exception("Unsupported image result; file paths are not accepted");}
  long bytes=(long)encoded.length()/4*3-(encoded.endsWith("==")?2:encoded.endsWith("=")?1:0);if(bytes>32*1024*1024)throw new Exception("Image exceeds 32 MiB");
  JSONObject header=new JSONObject().put("type",item.optString("type")).put("status",item.optString("status")).put("result",encoded.substring(0,Math.min(16,encoded.length())));if(item.has("failure"))header.put("failure",item.get("failure"));
  JSONObject inspected=(JSONObject)host.store.core.doc("codexImageResult",header);String prefix=inspected.getString("dataUrl").split(",",2)[0];
  return new JSONObject().put("dataUrl",prefix+","+encoded).put("revisedPrompt",item.optString("revisedPrompt"));
 }
 static JSONObject generate(Host host,JSONObject route,String prompt,String reference)throws Exception{
  JSONArray images=new JSONArray();if(!reference.isEmpty())images.put(new JSONObject().put("id","Reference image").put("dataUrl",reference));
  return run(host,route,prompt,images,true).put("route",route);
 }
}
