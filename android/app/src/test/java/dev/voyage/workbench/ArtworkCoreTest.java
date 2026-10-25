package dev.voyage.workbench;

import org.junit.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import static org.junit.Assert.assertEquals;

public class ArtworkCoreTest {
 @Test public void planningArtworkRequestsWorkInTheNativeEngine()throws Exception {
  Context context=Context.enter();
  try {
   context.setOptimizationLevel(-1);context.setLanguageVersion(Context.VERSION_ES6);context.setClassShutter(name->false);
   Scriptable scope=context.initSafeStandardObjects();
   context.evaluateString(scope,new String(Files.readAllBytes(Paths.get("src/main/assets/core-native.js")),StandardCharsets.UTF_8),"core",1,null);
   String script="var source='{\"npcs\":{\"guide\":{\"description\":\"A lighthouse keeper\"},\"malo\":{\"name\":\"Mal0\",\"portraitUrl\":\"https://images.example/malo.png\"}},\"exact\":9007199254740993}';"
    +"var project=VoyageCore.create('p','World',source,1);"
    +"project=VoyageCore.reduce(project,{type:'prepareTask',id:'task',attempt:'one',kind:'plan',prompt:'Create missing portraits'});"
    +"project=VoyageCore.reduce(project,{type:'taskRunning',taskId:'task',attempt:'one'});"
    +"var packet=JSON.parse(VoyageCore.nativeRequest(JSON.stringify({operation:'assistantPacket',args:[project,project.tasks[0]]})));"
    +"var target=packet.artworkDestinations.filter(function(item){return item.label==='guide'&&!item.hasArtwork;})[0];"
    +"if(target.label!=='guide')throw Error('Missing-name fallback failed');"
    +"project=VoyageCore.reduce(project,{type:'proposeArtwork',taskId:'task',attempt:'one',id:'artwork',request:{destinationId:target.id,prompt:'Watercolor lighthouse keeper'}});"
    +"project=VoyageCore.reduce(project,{type:'taskDone',taskId:'task',attempt:'one',text:'Review artwork requests'});"
    +"if(project.activeSource!==source||project.artworkProposals.length!==1||packet.artworkDestinations.length!==3)throw Error('Artwork proposal modified source or lost destinations');"
    +"project.artworkProposals[0].label;";
   assertEquals("guide",Context.toString(context.evaluateString(scope,script,"artwork-regression",1,null)));
  }finally {Context.exit();}
 }
}
