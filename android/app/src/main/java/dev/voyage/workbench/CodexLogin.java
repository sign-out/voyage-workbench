package dev.voyage.workbench;

import org.json.*;
import java.util.UUID;

final class CodexLogin {
 private static final Object LOCK=new Object();
 private static String activeAttempt="";
 private static JSONObject read(Store store)throws Exception {
  String raw=store.setting("login");if(raw.isEmpty())return null;
  JSONObject state=new JSONObject(raw);
  if(!state.has("attempt")||!state.has("state")){store.setting("login","");return null;}
  return state;
 }
 private static boolean active(Store store,JSONObject state)throws Exception{return state!=null&&(Boolean)store.core.doc("codexLoginActive",state);}
 static JSONObject status(Store store)throws Exception {synchronized(LOCK){
  JSONObject state=read(store);if(state==null)return null;
  state=(JSONObject)store.core.doc("codexLoginExpire",state,System.currentTimeMillis());
  if(active(store,state)&&!state.getString("attempt").equals(activeAttempt)&&!("starting".equals(state.getString("state"))&&System.currentTimeMillis()-state.getLong("started")<10000))state=(JSONObject)store.core.doc("codexLoginFinish",state,"failed","The previous sign-in process stopped. Refresh status to reuse any saved credentials before starting another attempt.",System.currentTimeMillis());
  store.setting("login",state.toString());return new JSONObject(state.toString()).put("busy",state.getString("attempt").equals(activeAttempt));
 }}
 static JSONObject prepare(Store store)throws Exception {synchronized(LOCK){
  JSONObject state=status(store);if(active(store,state))return state;
  state=(JSONObject)store.core.doc("codexLoginStarting",UUID.randomUUID().toString(),System.currentTimeMillis());store.setting("login",state.toString());return state;
 }}
 static boolean claim(Store store,String attempt)throws Exception {synchronized(LOCK){
  JSONObject state=read(store);if(state==null||!state.getString("attempt").equals(attempt)||!active(store,state)||!activeAttempt.isEmpty())return false;
  activeAttempt=attempt;return true;
 }}
 static void release(String attempt){synchronized(LOCK){if(activeAttempt.equals(attempt))activeAttempt="";}}
 static boolean current(Store store,String attempt)throws Exception {synchronized(LOCK){JSONObject state=read(store);return state!=null&&attempt.equals(state.optString("attempt"))&&active(store,state);}}
 static JSONObject change(Store store,String attempt,String operation,Object...args)throws Exception {synchronized(LOCK){
  JSONObject state=read(store);if(state==null||!attempt.equals(state.optString("attempt"))||!active(store,state))return state;
  Object[] parameters=new Object[args.length+1];parameters[0]=state;System.arraycopy(args,0,parameters,1,args.length);
  JSONObject changed=(JSONObject)store.core.doc(operation,parameters);store.setting("login",changed.toString());return changed;
 }}
 static JSONObject finish(Store store,String attempt,String state,String error)throws Exception{return change(store,attempt,"codexLoginFinish",state,error,System.currentTimeMillis());}
 static void reused(Store store,String attempt)throws Exception {synchronized(LOCK){JSONObject state=finish(store,attempt,"complete","");if(state!=null&&attempt.equals(state.optString("attempt"))&&"complete".equals(state.optString("state")))store.setting("login",state.put("reused",true).toString());}}
 static JSONObject cancel(Store store,String attempt)throws Exception {finish(store,attempt,"canceled","");return status(store);}
}
