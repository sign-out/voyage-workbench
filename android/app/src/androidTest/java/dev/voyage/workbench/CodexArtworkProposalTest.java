package dev.voyage.workbench;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CodexArtworkProposalTest {
 private AgentService planner()throws Exception{
  AgentService planner=new AgentService();planner.store=new Store(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext());
  planner.projectId=planner.store.create("Artwork tool test","{\"initialGameState\":{\"npcs\":{\"guide\":{\"name\":\"Guide\"}}}}").getJSONObject("project").getString("id");planner.taskId="task";planner.attempt="attempt";
  planner.store.dispatch(planner.projectId,new JSONObject().put("type","prepareTask").put("id",planner.taskId).put("attempt",planner.attempt).put("kind","plan").put("prompt","Suggest a portrait"));
  planner.command(new JSONObject().put("type","taskRunning"));return planner;
 }
 @Test public void artworkToolOnlyDispatchesAHumanApprovalProposal()throws Exception{
  AgentService planner=planner();try{
  String source=planner.store.project(planner.projectId).getString("activeSource");JSONArray destinations=(JSONArray)planner.store.core.doc("artworkDestinations",source);String destination="";for(int index=0;index<destinations.length();index++)if("Guide".equals(destinations.getJSONObject(index).optString("label")))destination=destinations.getJSONObject(index).getString("id");assertFalse(destination.isEmpty());
  JSONObject request=new JSONObject().put("destinationId",destination).put("prompt","A misty harbor");
  JSONObject result=(JSONObject)planner.tool("propose_artwork",request);
  JSONObject project=planner.store.project(planner.projectId),proposal=project.getJSONArray("artworkProposals").getJSONObject(0);
  assertEquals("task",proposal.getString("taskId"));assertEquals(destination,proposal.getString("destinationId"));assertEquals("A misty harbor",proposal.getString("prompt"));assertEquals(source,project.getString("activeSource"));
  assertEquals(result.getString("proposalId"),proposal.getString("id"));java.util.UUID.fromString(result.getString("proposalId"));
  assertTrue(result.getBoolean("awaitingHumanApproval"));assertTrue(result.getBoolean("activeWorldUnchanged"));assertFalse(result.getBoolean("generated"));assertNull(planner.rpc);
  }finally{planner.store.close();}
 }
 @Test public void stoppedTasksCannotProposeArtwork()throws Exception{
  AgentService planner=planner();try{
  planner.command(new JSONObject().put("type","taskStop").put("state","CANCELED"));
  try{planner.tool("propose_artwork",new JSONObject());fail("Stopped task proposed artwork");}catch(Exception expected){assertTrue(expected.getMessage().contains("Task stopped"));}
  assertEquals(0,planner.store.project(planner.projectId).optJSONArray("artworkProposals")==null?0:planner.store.project(planner.projectId).getJSONArray("artworkProposals").length());
  }finally{planner.store.close();}
 }
}
