package dev.voyage.workbench;

import org.junit.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import static org.junit.Assert.assertEquals;

public class FieldFillCoreTest {
 @Test public void isolatedFieldFillAndSelectiveUndoWorkInRhino()throws Exception {
  Context context=Context.enter();
  try {
   context.setOptimizationLevel(-1);context.setLanguageVersion(Context.VERSION_ES6);context.setClassShutter(name->false);
   Scriptable scope=context.initSafeStandardObjects();
   context.evaluateString(scope,new String(Files.readAllBytes(Paths.get("src/main/assets/core-native.js")),StandardCharsets.UTF_8),"core",1,null);
   String script="function operation(name,args){return JSON.parse(VoyageCore.nativeRequest(JSON.stringify({operation:name,args:args})));}"
    +"var source='{\"title\":\"World\",\"description\":\"\",\"npcs\":{\"one\":{\"name\":\"New character\",\"description\":\"\",\"gender\":\"\"}},\"exact\":9007199254740993123}';"
    +"var input={source:source,path:[],instructions:'A maritime mystery.',defaults:[{path:['npcs','one','name'],value:'New character'}]};"
    +"var project=VoyageCore.create('p','World','{\"description\":\"\"}',1);project.memory='secret';project.chat=[{role:'user',text:'secret'}];"
    +"project=VoyageCore.reduce(project,{type:'prepareTask',id:'fill',attempt:'one',kind:'plan',fieldFill:input});"
    +"var packet=operation('assistantPacket',[project,project.tasks[0]]);"
    +"if(packet.memory!==''||packet.history.length||packet.artworkDestinations)throw Error('Context leaked');"
    +"if(project.tasks[0].baseSource!==source)throw Error('Wrong snapshot');"
    +"var defs=operation('toolDefinitions',[false,false,true]);if(defs.length!==5)throw Error('Unsafe tools');"
    +"if(operation('agentSystem',[false,false,true]).indexOf('field filler')<0)throw Error('Wrong system');"
    +"project=VoyageCore.reduce(project,{type:'taskRunning',taskId:'fill',attempt:'one'});"
    +"var blocked=false;try{VoyageCore.reduce(project,{type:'proposeWorkOrder',taskId:'fill',attempt:'one',id:'bad',order:{}});}catch(error){blocked=true;}if(!blocked)throw Error('Allowed write');"
    +"var values=[{path:['description'],value:'A harbor.'},{path:['npcs','one','name'],value:'Captain Vale'}];"
    +"project=VoyageCore.reduce(project,{type:'taskDone',taskId:'fill',attempt:'one',text:JSON.stringify(values)});"
    +"if(project.activeSource!=='{\"description\":\"\"}'||project.chat.length!==1)throw Error('World mutated');"
    +"var snapshot=project.tasks[0].fieldFill;var applied=operation('applyFieldFill',[source,snapshot,snapshot.result]);"
    +"if(applied.changes.length!==2||applied.source.indexOf('9007199254740993123')<0)throw Error('Invalid apply');"
    +"var undone=operation('undoFieldFill',[applied.source.replace('Captain Vale','Later edit'),applied.changes]);"
    +"if(undone.changes.length!==1||undone.source.indexOf('Later edit')<0)throw Error('Clobbered later edit');"
    +"var invalid=false;try{operation('parseFieldFill',[JSON.stringify([{path:['title'],value:'Bad'}]),snapshot]);}catch(error){invalid=true;}if(!invalid)throw Error('Accepted authored value');"
    +"project.tasks=[];project=VoyageCore.reduce(project,{type:'prepareTask',id:'cancel',attempt:'two',kind:'plan',fieldFill:input});project=VoyageCore.reduce(project,{type:'taskRunning',taskId:'cancel'});project=VoyageCore.reduce(project,{type:'taskStop',taskId:'cancel',state:'CANCELED'});"
    +"var late=false;try{VoyageCore.reduce(project,{type:'taskDone',taskId:'cancel',text:'[]'});}catch(error){late=true;}if(!late)throw Error('Accepted canceled result');'ok';";
   assertEquals("ok",Context.toString(context.evaluateString(scope,script,"field-fill-test",1,null)));
  }finally{Context.exit();}
 }
}
