package dev.voyage.workbench;

import org.junit.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import static org.junit.Assert.assertEquals;

public class RecoveryCoreTest {
 @Test public void nativeSettingsSnapshotsAndCompletionPreflightAreSafe()throws Exception {
  Context context=Context.enter();
  try {
   context.setOptimizationLevel(-1);context.setLanguageVersion(Context.VERSION_ES6);context.setClassShutter(name->false);
   Scriptable scope=context.initSafeStandardObjects();
   context.evaluateString(scope,new String(Files.readAllBytes(Paths.get("src/main/assets/core-native.js")),StandardCharsets.UTF_8),"core",1,null);
   String script="""
    function operation(name,args){return JSON.parse(VoyageCore.nativeRequest(JSON.stringify({operation:name,args:args})));}
    var defaults=operation('assistantRecoverySettings',[]);
    if(defaults.enabled!==true||defaults.maxAttempts!==3)throw Error('Wrong defaults');
    var badArguments='{"path":[',parsed=operation('apiResponse',['openai',{choices:[{message:{tool_calls:[{id:'bad',function:{name:'world_read',arguments:badArguments}}]}}]}]);
    if(parsed.calls[0].args!==null||parsed.calls[0].id!=='bad'||parsed.calls[0].rawArguments!==badArguments)throw Error('Malformed tool arguments bypass recovery');
    [null,[],false,{enabled:'true',maxAttempts:3},{enabled:true,maxAttempts:0},{enabled:true,maxAttempts:11},{enabled:true,maxAttempts:1.5},{enabled:true,maxAttempts:'3'}].forEach(function(input){
     var rejected=false;try{operation('assistantRecoverySettings',[input]);}catch(error){rejected=true;}
     if(!rejected)throw Error('Malformed settings accepted');
    });
    var settings={enabled:false,maxAttempts:7},source='{"description":""}',project=VoyageCore.create('p','World',source,1);
    project=VoyageCore.reduce(project,{type:'prepareTask',id:'plan',attempt:'one',kind:'plan',assistantRecovery:settings});
    settings.enabled=true;settings.maxAttempts=1;
    if(project.tasks[0].assistantRecovery.enabled!==false||project.tasks[0].assistantRecovery.maxAttempts!==7)throw Error('Settings not snapshotted');
    project.tasks=[];
    project=VoyageCore.reduce(project,{type:'prepareTask',id:'fill',attempt:'two',kind:'plan',assistantRecovery:{enabled:true,maxAttempts:2},fieldFill:{source:source,path:[],instructions:'Harbor mystery.',defaults:[]}});
    project=VoyageCore.reduce(project,{type:'taskRunning',taskId:'fill',attempt:'two'});
    var before=JSON.stringify(project),task=project.tasks[0],failed=false;
    try{operation('assistantCompletionValidation',[project,task,'not JSON']);}catch(error){failed=true;}
    if(!failed||JSON.stringify(project)!==before)throw Error('Invalid completion mutated task');
    operation('assistantCompletionValidation',[project,task,JSON.stringify([{path:['description'],value:'A harbor.'}])]);
    if(JSON.stringify(project)!==before)throw Error('Preflight completed task or applied world');
    if(task.assistantRecovery.maxAttempts!==2)throw Error('Field fill lost snapshot');
    project.tasks=[];
    project=VoyageCore.reduce(project,{type:'prepareTask',id:'grade',attempt:'three',kind:'plan',assistantRecovery:{enabled:false,maxAttempts:5},grading:{path:'universal',overlay:'standard',rationale:'Native recovery test.'}});
    project=VoyageCore.reduce(project,{type:'taskRunning',taskId:'grade',attempt:'three'});
    before=JSON.stringify(project);failed=false;
    try{operation('assistantCompletionValidation',[project,project.tasks[0],'{}']);}catch(error){failed=true;}
    if(!failed||JSON.stringify(project)!==before)throw Error('Grading preflight mutated task');
    if(project.tasks[0].assistantRecovery.enabled!==false||project.tasks[0].assistantRecovery.maxAttempts!==5)throw Error('Grading lost snapshot');
    'ok';
    """;
   assertEquals("ok",Context.toString(context.evaluateString(scope,script,"recovery-native-core",1,null)));
  } finally {Context.exit();}
 }
}
