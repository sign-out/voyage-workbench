package dev.voyage.workbench;

import org.junit.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import static org.junit.Assert.assertEquals;

public class CodexLoginCoreTest {
 @Test public void nativeLoginReusesAccountsAndRejectsStaleCompletionWithoutErasingCredentials()throws Exception {
  Context context=Context.enter();
  try {
   context.setOptimizationLevel(-1);context.setLanguageVersion(Context.VERSION_ES6);context.setClassShutter(name->false);
   Scriptable scope=context.initSafeStandardObjects();
   context.evaluateString(scope,new String(Files.readAllBytes(Paths.get("src/main/assets/core-native.js")),StandardCharsets.UTF_8),"core",1,null);
   String script="""
    function operation(name,args){return JSON.parse(VoyageCore.nativeRequest(JSON.stringify({operation:name,args:args})));}
    function check(value,message){if(!value)throw Error(message);}
    check(!operation('codexLoginNeedsAuthentication',[{account:{type:'chatgpt'}}]),'Existing auth creates a session');
    check(operation('codexLoginNeedsAuthentication',[{account:null,requiresOpenaiAuth:true}]),'Signed-out account not detected');
    check(!operation('codexLoginNeedsAuthentication',[{account:null,requiresOpenaiAuth:false}]),'Auth-free provider forces OpenAI login');
    var rejected=false;try{operation('codexLoginNeedsAuthentication',[{}]);}catch(error){rejected=true;}check(rejected,'Unknown auth started a new login');
    var waiting=operation('codexLoginStarting',['owned',1]);
    var response={type:'chatgptDeviceCode',loginId:'login',verificationUrl:'https://auth.openai.com/codex/device',userCode:'TEST-1234'};
    waiting=operation('codexLoginStarted',[waiting,response,2]);
    check(waiting.state==='waiting'&&waiting.userCode==='TEST-1234','No bounded pending attempt');
    var mismatch=operation('codexLoginEvent',[waiting,{loginId:'other',success:true},3]);check(JSON.stringify(mismatch)===JSON.stringify(waiting),'Foreign completion accepted');
    var verifying=operation('codexLoginEvent',[waiting,{loginId:'login',success:true},3]);check(verifying.state==='verifying'&&!verifying.userCode&&!verifying.verificationUrl,'Completion retained active code');
    ['canceled','failed','complete'].forEach(function(state){var terminal=operation('codexLoginFinish',[waiting,state,'',4]);var late=operation('codexLoginEvent',[terminal,{loginId:'login',success:true},5]);check(late.state===state&&!late.userCode&&!late.verificationUrl,'Late completion revived an attempt');});
    var expired=operation('codexLoginExpire',[waiting,waiting.expiresAt]);check(expired.state==='expired'&&!expired.userCode,'Pending login never expires');
    check(waiting.userCode==='TEST-1234','Pure state update mutated caller');
    'ok';
    """;
   assertEquals("ok",Context.toString(context.evaluateString(scope,script,"codex-login-core",1,null)));
  }finally{Context.exit();}
 }
}
