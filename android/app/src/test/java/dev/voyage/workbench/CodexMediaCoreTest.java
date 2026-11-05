package dev.voyage.workbench;

import org.junit.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import static org.junit.Assert.assertEquals;

public class CodexMediaCoreTest {
 private String evaluate(String script)throws Exception{
  Context context=Context.enter();
  try{
   context.setOptimizationLevel(-1);context.setLanguageVersion(Context.VERSION_ES6);context.setClassShutter(name->false);
   Scriptable scope=context.initSafeStandardObjects();
   context.evaluateString(scope,new String(Files.readAllBytes(Paths.get("src/main/assets/core-native.js")),StandardCharsets.UTF_8),"core",1,null);
   return Context.toString(context.evaluateString(scope,script,"codex-media",1,null));
  }finally{Context.exit();}
 }
 @Test public void preflightKeepsTheCliDefaultAndRejectsIncompatibleModels()throws Exception{
  assertEquals("vision:3",evaluate("var account={type:'chatgpt',planType:'plus'},caps={imageGeneration:true,namespaceTools:true},models=[{id:'vision',isDefault:true,inputModalities:['text','image']},{id:'text-only',inputModalities:['text']}];"
   +"var invoke=function(account,model){return JSON.parse(VoyageCore.nativeRequest(JSON.stringify({operation:'codexMediaPreflight',args:[account,caps,models,model,true]})));};"
   +"var result=invoke(account,'');if(result.model!=='')throw Error('Default rewritten');var rejected=0;"
   +"try{invoke(account,'text-only');}catch(error){rejected++;}try{invoke(account,'gpt-image-2');}catch(error){rejected++;}try{invoke({type:'apiKey'},'vision');}catch(error){rejected++;}result.resolvedModel+':'+rejected;"));
 }
 @Test public void imageThreadUsesTheActualCliToolAndQuotaFailuresRemainFailures()throws Exception{
  assertEquals("true:true",evaluate("var thread=JSON.parse(VoyageCore.nativeRequest(JSON.stringify({operation:'codexMediaThread',args:['/private','',true]})));"
   +"var rejected=false;try{VoyageCore.nativeRequest(JSON.stringify({operation:'codexImageResult',args:[{type:'imageGeneration',status:'failed',failure:{type:'usageLimitExceeded',resetsAt:1800000000},result:''}]}));}catch(error){rejected=String(error).indexOf('usage limit reached')>=0;}"
   +"String(thread.developerInstructions.indexOf('image_gen.imagegen')>=0&&thread.config['features.omit_app_server_notification_media']===false)+':'+rejected;"));
 }
 @Test public void cliAvailabilityNoticesSurviveTheNativeBridge()throws Exception{
  assertEquals("true",evaluate("var result=JSON.parse(VoyageCore.nativeRequest(JSON.stringify({operation:'codexMediaPreflight',args:[{type:'chatgpt',planType:'plus'},{imageGeneration:true,namespaceTools:true},[{id:'vision',isDefault:true,inputModalities:['text','image'],availabilityNux:{message:'Account access notice'}}],'',true]})));String(result.detail.indexOf('CLI notice: Account access notice')>=0);"));
 }
}
