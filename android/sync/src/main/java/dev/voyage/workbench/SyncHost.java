package dev.voyage.workbench;

import android.content.Context;
import org.json.*;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class SyncHost {
 final SyncStore store;final Secrets secrets;final JSONObject profiles;
 SyncHost(Context context)throws Exception{
  store=new SyncStore(context);secrets=new Secrets(context);
  try(InputStream input=context.getAssets().open("voyage-profiles.json")){profiles=new JSONObject(new String(SyncStore.bytes(input,128*1024),StandardCharsets.UTF_8)).getJSONObject("environments");}
  JSONObject state=store.load(),pending=state.optJSONObject("pending");
  if(pending!=null&&Arrays.asList("sending","validating").contains(pending.optString("state"))){boolean sent="sending".equals(pending.getString("state"));pending.put("state",SyncPolicy.recovered(pending.getString("state"))).put("detail",sent?"The app stopped during saving. Read back the original host before another write.":"The app stopped during validation. No world write was recorded.");store.write(state,state.getLong("revision"));}
 }
 String environment(JSONObject state)throws Exception{String environment=state.getString("environment");profile(environment);return environment;}
 JSONObject profile(String environment)throws Exception{if(!profiles.has(environment))throw new Exception("Unknown Voyage connection");return profiles.getJSONObject(environment);}
 String secret(String environment){return "production".equals(environment)?"voyage":"voyage-"+environment;}
 String worldId(String value)throws Exception{if(!value.matches("[A-Za-z0-9_-]{1,160}"))throw new Exception("Enter a valid Voyage world short ID");return value;}
 JSONObject api(String method,String endpoint,String body,String etag,String environment)throws Exception{
  String key=secrets.get(secret(environment));if(key.isEmpty())throw new Exception("Connect a Creator API key for "+environment+" first.");
  Map<String,String> headers=new LinkedHashMap<>();headers.put("Authorization","Bearer "+key);headers.put("Accept","application/json");if(body!=null)headers.put("Content-Type","application/json");if(etag!=null){if(!SyncPolicy.revision(etag))throw new Exception("Invalid saved revision");headers.put("If-Match",etag);}
  VoyageHttpPolicy.Response response=new VoyageHttpPolicy().execute(method,profile(environment).getString("apiBase")+endpoint,headers,body==null?null:body.getBytes(StandardCharsets.UTF_8),text->{try{JSONObject error=new JSONObject(text).optJSONObject("error");return error==null?"":error.optString("code");}catch(Exception ignored){return "";}},16*1024*1024);
  if(response.text.length()>16*1024*1024)throw new Exception("Voyage response exceeds this companion's 16 MiB safety limit");
  if(response.status<200||response.status>=300){String message="Request rejected.",requestId="";try{JSONObject payload=new JSONObject(response.text),error=payload.optJSONObject("error");if(error!=null)message=error.optString("message",message);requestId=payload.optString("requestId");}catch(Exception ignored){}throw new ApiFailure(response.status,response.code,VoyageHttpPolicy.errorMessage(response.status,response.code,message,requestId,response.retryAfter));}
  return new JSONObject().put("text",response.text).put("etag",response.etag==null?"":response.etag);
 }
 static final class ApiFailure extends Exception {final int status;final String code;ApiFailure(int status,String code,String message){super(message);this.status=status;this.code=code;}}
 JSONObject pending(JSONObject state,String id)throws Exception{JSONObject pending=state.optJSONObject("pending");if(pending==null||!pending.getString("id").equals(id))throw new Exception("The recorded save changed. Reload it before continuing.");return pending;}
 boolean unresolved(JSONObject pending){return pending!=null&&!"rejected".equals(pending.optString("state"));}
 Object request(String method,JSONObject payload)throws Exception{
  JSONObject state=store.load();String environment=environment(state);
  switch(method){
   case "state":return state;
   case "connection":return new JSONObject().put("environment",environment).put("connected",!secrets.get(secret(environment)).isEmpty()).put("apiBase",profile(environment).getString("apiBase"));
   case "connect":{String key=payload.getString("key").trim();if(key.contains("\n")||key.contains("\r"))throw new Exception("Invalid API key");secrets.set(secret(environment),key);return request("connection",new JSONObject());}
   case "commit":{
    JSONObject next=payload.getJSONObject("state"),previous=state.optJSONObject("pending"),incoming=next.optJSONObject("pending");environment(next);
    if(unresolved(previous)){
     if(incoming==null||!incoming.toString().equals(previous.toString())||!next.optString("draft").equals(state.optString("draft"))||!String.valueOf(next.opt("world")).equals(String.valueOf(state.opt("world"))))throw new Exception("An unfinished save cannot be discarded or retargeted. Read back its original result first.");
    }else if(incoming!=null&&"prepared".equals(incoming.optString("state"))){
     JSONObject world=state.optJSONObject("world");if(!SyncPolicy.revision(incoming.getString("etag")))throw new Exception("Invalid prepared revision");if(world==null||!world.getString("id").equals(incoming.getString("worldId"))||!environment.equals(incoming.getString("environment")))throw new Exception("The prepared target changed");
     String body=incoming.getString("payload");JSONObject parsed=new JSONObject(body).getJSONObject("world");if(!world.getString("id").equals(parsed.optString("shortId"))||parsed.optJSONObject("initialGameState")==null)throw new Exception("Invalid world replacement envelope");
    }else if(incoming!=null&&!"rejected".equals(incoming.optString("state")))throw new Exception("Only a fresh prepared save can be created locally");
    return store.write(next,payload.getLong("expectedRevision"));
   }
   case "worlds":return new JSONObject(api("GET","/worlds?page="+Math.max(0,payload.optInt("page")),null,null,environment).getString("text"));
   case "readWorld":{if(!environment.equals(payload.getString("environment")))throw new Exception("Connection changed. Retry on the selected host.");return api("GET","/worlds/"+worldId(payload.getString("worldId")),null,null,environment);}
   case "sendSave":{
    JSONObject pending=pending(state,payload.getString("id"));if(!"prepared".equals(pending.getString("state")))throw new Exception("This write was already attempted. Check its saved result; do not send it again.");
    if(!environment.equals(pending.getString("environment")))throw new Exception("Restore the prepared save's original connection first.");
    pending.put("state","validating");state=store.write(state,state.getLong("revision"));boolean sending=false;
    try{
     String world=SyncJson.field(pending.getString("payload"),"world"),gameState=SyncJson.field(world,"initialGameState");
     JSONObject validation=new JSONObject(api("POST","/validate","{\"stage\":\"draft\",\"world\":{\"initialGameState\":"+gameState+"}}",null,environment).getString("text"));JSONObject report=validation.optJSONObject("data");if(report==null)report=validation;JSONArray errors=report.optJSONArray("errors");if(!Boolean.TRUE.equals(report.opt("valid"))||errors==null||errors.length()!=0)throw new Exception("Official validation did not pass: "+report.toString().substring(0,Math.min(report.toString().length(),3000)));
     pending.put("state","sending");state=store.write(state,state.getLong("revision"));sending=true;
     api("PUT","/worlds/"+worldId(pending.getString("worldId")),pending.getString("payload"),pending.getString("etag"),environment);
     pending.put("state","acknowledged").put("detail","Voyage acknowledged the update. Read-back confirmation is still needed.");
    }catch(Exception failure){boolean clean=!sending||failure instanceof ApiFailure&&VoyageHttpPolicy.cleanRejection(((ApiFailure)failure).status,((ApiFailure)failure).code);pending.put("state",clean?"rejected":"unknown").put("detail",failure.getMessage()==null?"Save could not be confirmed":failure.getMessage());}
    return store.write(state,state.getLong("revision"));
   }
   case "discardUnsent":{JSONObject pending=pending(state,payload.getString("id"));if(!SyncPolicy.canDiscard(pending.optString("state")))throw new Exception("An attempted save must be reconciled, not discarded.");state.remove("pending");state.put("notice","No world write is pending. Your local update is kept.");return store.write(state,state.getLong("revision"));}
   case "readback":{
    JSONObject pending=pending(state,payload.getString("id"));if(!SyncPolicy.canReadBack(pending.optString("state")))throw new Exception("No dispatched save needs read-back");if("sending".equals(pending.optString("state"))){pending.put("state","unknown");state=store.write(state,state.getLong("revision"));}
    JSONObject response=api("GET","/worlds/"+worldId(pending.getString("worldId")),null,null,pending.getString("environment"));if(response.optString("etag").isEmpty())throw new Exception("Voyage read-back did not include a revision");pending.put("readback",response);return store.write(state,state.getLong("revision"));
   }
   case "resolveSave":{
    JSONObject pending=pending(state,payload.getString("id")),readback=pending.optJSONObject("readback");if(readback==null||!Arrays.asList("acknowledged","unknown").contains(pending.optString("state")))throw new Exception("Read back this save before resolving it");
    String source=SyncJson.world(readback.getString("text"));if(!source.equals(payload.getString("source"))||!readback.getString("etag").equals(payload.getString("etag")))throw new Exception("The saved read-back changed");
    if(!Arrays.asList("confirmed","accepted","additions").contains(payload.optString("resolution")))throw new Exception("Choose a valid save resolution");
    JSONArray history=new JSONArray().put(new JSONObject().put("name","Submitted update before read-back").put("source",pending.getString("source")));JSONArray previous=state.optJSONArray("history");if(previous!=null&&previous.length()>0)history.put(previous.getJSONObject(0));
    state.put("history",history).put("world",new JSONObject().put("id",pending.getString("worldId")).put("source",source).put("etag",readback.getString("etag")).put("environment",pending.getString("environment"))).put("notice","confirmed".equals(payload.getString("resolution"))?"Saved and confirmed by Voyage read-back.":"Voyage read-back adopted. Your submitted update is backed up locally.");state.remove("draft");state.remove("pending");return store.write(state,state.getLong("revision"));
   }
   default:throw new Exception("Unsupported sync action");
  }
 }
}
