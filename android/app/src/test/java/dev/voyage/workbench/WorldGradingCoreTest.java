package dev.voyage.workbench;

import org.junit.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import static org.junit.Assert.assertEquals;

public class WorldGradingCoreTest {
 @Test public void gradingRemainsReadOnlyAndPersistsReportsInTheNativeEngine()throws Exception {
  Context context=Context.enter();
  try {
   context.setOptimizationLevel(-1);context.setLanguageVersion(Context.VERSION_ES6);context.setClassShutter(name->false);
   Scriptable scope=context.initSafeStandardObjects();
   context.evaluateString(scope,new String(Files.readAllBytes(Paths.get("src/main/assets/core-native.js")),StandardCharsets.UTF_8),"core",1,null);
   String script="var source='{\"title\":\"Native grading fixture\",\"storyStarts\":{\"opening\":\"Open the gate.\"}}';"
    +"var project=VoyageCore.create('p','World',source,1);"
    +"project=VoyageCore.reduce(project,{type:'prepareTask',id:'grade',attempt:'one',kind:'plan',grading:{path:'universal',overlay:'standard',rationale:'Cross-genre native test.'}});"
    +"project=VoyageCore.reduce(project,{type:'taskRunning',taskId:'grade',attempt:'one'});"
    +"var rubric=project.tasks[0].grading.rubric;"
    +"var report={summary:'Required design evidence is missing.',strengths:[],criteria:rubric.criteria.map(function(item){return {id:item.id,grade:'NE',feedback:'Evidence incomplete.',evidence:[],improvement:'Specify the design contract.'};}),gates:rubric.gates.map(function(item){return {id:item.id,status:'NE',explanation:'Evidence incomplete.'};}),diagnostics:{},fixes:[],missingEvidence:['Cover pixels.'],promises:[],intent:'Original world.'};"
    +"['cover','title','blurb','storyStart','characterCreator'].forEach(function(key){report.diagnostics[key]={score:'NE',explanation:'Evidence incomplete.'};});"
    +"var packet=JSON.parse(VoyageCore.nativeRequest(JSON.stringify({operation:'assistantPacket',args:[project,project.tasks[0]]})));"
    +"if(!packet.grading||packet.artworkDestinations)throw Error('Grading context is not isolated');"
    +"var rejected=false;try{VoyageCore.reduce(project,{type:'proposeArtwork',taskId:'grade',attempt:'one',id:'forbidden',request:{}});}catch(error){rejected=true;}"
    +"if(!rejected)throw Error('Mutation was allowed');"
    +"project=VoyageCore.reduce(project,{type:'taskDone',taskId:'grade',attempt:'one',text:JSON.stringify(report)});"
    +"if(project.activeSource!==source||project.chat.length!==0||project.grading.reports.length!==1)throw Error('Grading changed source or chat');"
    +"if(project.grading.reports[0].scores.universal.lower!==0||project.grading.reports[0].scores.universal.upper!==100)throw Error('Missing evidence lost its interval');"
    +"project.tasks[0].state;";
   assertEquals("COMPLETED",Context.toString(context.evaluateString(scope,script,"grading-regression",1,null)));
  }finally {Context.exit();}
 }
}
