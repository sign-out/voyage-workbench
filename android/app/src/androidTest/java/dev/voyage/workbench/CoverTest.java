package dev.voyage.workbench;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class CoverTest {
 @Test public void coverJobEvidencePersistsInNativeFeatureStorage()throws Exception{Host host=new Host(InstrumentationRegistry.getInstrumentation().getTargetContext());String key="covers:native-rubric-test";try{host.request("featureSet",new JSONObject().put("key",key).put("value","[{\"state\":\"grade-failed\",\"assetId\":\"saved-cover\"}]"));String saved=(String)host.request("featureGet",new JSONObject().put("key",key));assertEquals("saved-cover",new JSONArray(saved).getJSONObject(0).getString("assetId"));}finally{host.store.setting("feature:"+key,"");}}
 JSONObject scores(double value)throws Exception{JSONObject scores=new JSONObject();for(String category:new String[]{"A","B","C","D","E","F","G","H","I","J"})scores.put(category,new JSONObject().put("score",value).put("reason","Observed crop evidence"));return scores;}
 @Test public void nativeRubricAppliesExactWeightsFloorsAndCaps()throws Exception{
  Core core=new Core(InstrumentationRegistry.getInstrumentation().getTargetContext());JSONObject scores=scores(10);scores.getJSONObject("A").put("score",4.9);JSONObject result=(JSONObject)core.doc("scoreCover",scores);assertEquals(69,result.getDouble("total"),0);assertEquals(1,result.getJSONArray("caps").length());scores.getJSONObject("A").put("score",3);scores.getJSONObject("B").put("score",3);scores.getJSONObject("C").put("score",4);result=(JSONObject)core.doc("scoreCover",scores);assertEquals(59,result.getDouble("total"),0);assertTrue(result.getBoolean("redesign"));
 }
 @Test public void nativeVisionRequestsAndReportReadbackIncludeEveryCrop()throws Exception{
  Core core=new Core(InstrumentationRegistry.getInstrumentation().getTargetContext());JSONArray images=new JSONArray();for(String id:new String[]{"original","discovery","phone","desktop","listing","profile","thumbnail","blur","grayscale"})images.put(new JSONObject().put("id",id).put("dataUrl","data:image/png;base64,YQ=="));
  JSONObject brief=new JSONObject().put("title","Native world").put("premise","Explore a living world").put("direction","A clear focal subject").put("original",true);
  for(String protocol:new String[]{"openai","openai-responses","anthropic","gemini"}){JSONObject route=new JSONObject().put("id","vision").put("name","Vision").put("stage","planning").put("protocol",protocol).put("baseUrl","https://example.com/v1").put("model","vision-text");JSONObject wire=(JSONObject)core.doc("coverReviewRequest",route,"test-key",brief,images);assertTrue(wire.getString("body").contains("Tradeoff matrix"));assertTrue(wire.getString("body").contains("grayscale"));assertFalse(wire.getString("body").contains("test-key"));}
  JSONArray views=new JSONArray();for(String id:new String[]{"discovery","phone","desktop","listing","profile"})views.put(new JSONObject().put("id",id).put("scores",scores(9)).put("criticalContentClipped","phone".equals(id)).put("fix","Keep focal content central"));JSONObject report=new JSONObject().put("views",views).put("summary","Crop concern").put("tradeoffs","Detail versus readability").put("recommendations",new JSONArray().put("Fix phone crop"));JSONObject response=new JSONObject().put("choices",new JSONArray().put(new JSONObject().put("message",new JSONObject().put("content",report.toString()))));JSONObject graded=(JSONObject)core.doc("coverReviewResult","openai",response);assertEquals(90,graded.getDouble("total"),0);assertTrue(graded.getBoolean("needsRevision"));assertEquals(5,graded.getJSONArray("views").length());
 }
}
