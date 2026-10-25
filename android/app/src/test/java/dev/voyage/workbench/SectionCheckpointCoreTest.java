package dev.voyage.workbench;

import org.junit.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import static org.junit.Assert.*;

public class SectionCheckpointCoreTest {
 @Test public void nativeSectionCheckpointsPreservePriorSectionsAndFailedDrafts()throws Exception {
  Context context=Context.enter();
  try {
   context.setOptimizationLevel(-1);context.setLanguageVersion(Context.VERSION_ES6);context.setClassShutter(name->false);
   Scriptable scope=context.initSafeStandardObjects();
   context.evaluateString(scope,new String(Files.readAllBytes(Paths.get("src/main/assets/core-native.js")),StandardCharsets.UTF_8),"core",1,null);
   String script="""
    var original='{"title":"Before","aiInstructions":{},"exact":9007199254740993}',project=VoyageCore.create('project','World',original,1);
    function command(type,extra){extra=extra||{};extra.type=type;extra.taskId='task';extra.attempt='attempt';project=VoyageCore.reduce(project,extra);}
    command('workOrder',{baseHash:VoyageCore.hash(original),order:{reviewedScope:true,objective:'Improve sections',requirements:[],allowedPaths:[],wholeWorld:true}});
    command('prepareTask',{id:'task',kind:'work'});command('taskRunning');
    command('taskEdit',{path:['title'],source:'"After"',action:'replace'});
    command('taskSectionCheckpoint',{paths:[['title']],label:'Title',sectionCheckpointId:'one'});
    var baseline=project.tasks[0].stagedSource;
    command('taskSectionCheckpoint',{paths:[['title']],label:'Title',sectionCheckpointId:'duplicate',sectionBaseSource:baseline});
    if(project.tasks[0].sectionCheckpoints.length!==1)throw Error('Duplicate receipt');
    command('taskEdit',{path:['aiInstructions'],source:'42',action:'replace'});
    var before=JSON.stringify(project),failed=false;
    try{command('taskSectionCheckpoint',{paths:[['aiInstructions']],label:'Instructions',sectionBaseSource:baseline,sectionCheckpointId:'two'});}catch(error){failed=String(error).indexOf('Section checkpoint failed after')>=0;}
    if(!failed||JSON.stringify(project)!==before)throw Error('Failed checkpoint changed task');
    command('taskEdit',{path:['aiInstructions'],source:'{"story":{"tone":"Gentle"}}',action:'replace'});
    command('taskSectionCheckpoint',{paths:[['aiInstructions']],label:'Instructions',sectionBaseSource:baseline,sectionCheckpointId:'two'});
    if(project.tasks[0].sectionCheckpoints.length!==2||project.activeSource!==original||project.remote.operations.length!==0)throw Error('Unexpected apply or remote state');
    if(project.tasks[0].stagedSource.indexOf('9007199254740993')<0)throw Error('Exact number lost');
    var tools=JSON.parse(VoyageCore.nativeRequest(JSON.stringify({operation:'toolDefinitions',args:[true]})));
    if(!tools.some(function(tool){return tool.name==='world_checkpoint';}))throw Error('Native tool missing');
    'ok';
    """;
   assertEquals("ok",Context.toString(context.evaluateString(scope,script,"section-checkpoints",1,null)));
  } finally {Context.exit();}
 }
 @Test public void authoredDiagnosticWordsDoNotDisableCheckpointRecovery()throws Exception {
  Recovery budget=new Recovery(true,1);
  assertEquals(1,budget.correctiveOpportunity(new Exception("Error: Section checkpoint failed after checkpoint 1 (Authentication and network). New validation errors.")));
  assertFalse(Recovery.eligible(new Exception("HTTP 401 Section checkpoint failed after baseline")));
  assertFalse(Recovery.eligible(new java.io.IOException("Section checkpoint failed after baseline")));
 }
}
