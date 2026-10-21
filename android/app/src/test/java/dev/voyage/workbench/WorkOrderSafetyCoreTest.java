package dev.voyage.workbench;

import org.junit.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import static org.junit.Assert.assertEquals;

public class WorkOrderSafetyCoreTest {
 @Test public void packagedReducerRequiresApprovalAndReviewsInvalidAutomaticChanges()throws Exception {
  Context context=Context.enter();
  try {
   context.setOptimizationLevel(-1);context.setLanguageVersion(Context.VERSION_ES6);context.setClassShutter(name->false);
   Scriptable scope=context.initSafeStandardObjects();
   context.evaluateString(scope,new String(Files.readAllBytes(Paths.get("src/main/assets/core-native.js")),StandardCharsets.UTF_8),"core",1,null);
   String script="var source='{\"worldBackground\":\"Before\",\"combatSettings\":{\"minCombatXP\":0,\"baseCombatXP\":0,\"abilityCooldown\":0,\"abilityBonus\":0,\"npcDailyHealingAmount\":0,\"damageTypes\":[],\"damageTypePresentation\":{}},\"exact\":9007199254740993}';"
    +"var project=VoyageCore.create('world','Safety',source,1);"
    +"project.workOrder={objective:'Legacy unrestricted order',requirements:[],allowedPaths:[]};"
    +"var rejected=false;try{VoyageCore.reduce(project,{type:'prepareTask',id:'legacy',attempt:'one',kind:'work'});}catch(error){rejected=true;}"
    +"if(!rejected)throw Error('Packaged reducer accepted legacy unapproved work');"
    +"project=VoyageCore.reduce(project,{type:'workOrder',baseHash:VoyageCore.hash(source),order:{objective:'Improve combat',requirements:[],allowedPaths:[['combatSettings']],reviewedScope:true}});"
    +"project=VoyageCore.reduce(project,{type:'prepareTask',id:'invalid',attempt:'two',kind:'work',localEditMode:'automatic'});"
    +"project=VoyageCore.reduce(project,{type:'taskRunning',taskId:'invalid',attempt:'two'});"
    +"project=VoyageCore.reduce(project,{type:'taskEdit',taskId:'invalid',attempt:'two',path:['combatSettings'],source:'\"Invalid combat settings\"'});"
    +"project=VoyageCore.reduce(project,{type:'taskDone',taskId:'invalid',attempt:'two',text:'Review this change'});"
    +"if(project.activeSource!==source||project.tasks[0].state!=='PROPOSAL_READY'||!project.tasks[0].localApplyBlockedReason||project.candidates.length!==1)throw Error('Packaged reducer automatically applied invalid schema');"
    +"project=VoyageCore.reduce(project,{type:'workOrder',baseHash:VoyageCore.hash(source),order:{objective:'Improve background',requirements:[],allowedPaths:[['worldBackground']],reviewedScope:true}});"
    +"project=VoyageCore.reduce(project,{type:'prepareTask',id:'valid',attempt:'three',kind:'work',localEditMode:'automatic'});"
    +"project=VoyageCore.reduce(project,{type:'taskRunning',taskId:'valid',attempt:'three'});"
    +"project=VoyageCore.reduce(project,{type:'taskEdit',taskId:'valid',attempt:'three',path:['worldBackground'],source:'\"After\"'});"
    +"project=VoyageCore.reduce(project,{type:'taskDone',taskId:'valid',attempt:'three',text:'Done'});"
    +"if(project.tasks[0].state!=='APPLIED'||project.activeSource!==source.replace('Before','After'))throw Error('Valid approved work failed or changed exact numbers');'safe';";
   assertEquals("safe",Context.toString(context.evaluateString(scope,script,"work-order-safety",1,null)));
  }finally {Context.exit();}
 }
}
