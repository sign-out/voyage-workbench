package dev.voyage.workbench;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.IOException;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CodexAccountRecoveryTest {
 private Rpc.RpcError routing(){return new Rpc.RpcError("account/read",-32603,"workspace routing discovery failed");}
 @Test public void retryIsAccountOnlyAndDoesNotForceRefresh()throws Exception{
  int[] calls={0};JSONObject account=new JSONObject().put("account",new JSONObject().put("type","chatgpt"));
  assertSame(account,Rpc.readAccount(params->{assertFalse(params.getBoolean("refreshToken"));if(++calls[0]==1)throw routing();return account;}));
  assertEquals(2,calls[0]);
 }
 @Test public void repeatedFailureIsBoundedAndInformative()throws Exception{
  int[] calls={0};
  try{Rpc.readAccount(params->{calls[0]++;throw routing();});fail("Accepted unverified account");}
  catch(IOException expected){assertTrue(expected.getMessage().contains("one account-only retry"));assertTrue(expected.getMessage().contains("does not prove you are signed out"));assertTrue(expected.getMessage().contains("No task or image turn"));}
  assertEquals(2,calls[0]);
 }
 @Test public void unrelatedFailuresAndNullAccountDoNotRetry()throws Exception{
  for(Exception error:new Exception[]{new IOException("workspace routing discovery failed"),new Rpc.RpcError("account/read",-32603,"workspace routing discovery unauthorized (401)"),new Rpc.RpcError("turn/start",-32603,"workspace routing discovery failed"),new Rpc.RpcError("account/read",-32602,"workspace routing discovery failed")}){
   int[] calls={0};try{Rpc.readAccount(params->{calls[0]++;throw error;});fail("Accepted failed read");}catch(Exception expected){assertSame(error,expected);}assertEquals(1,calls[0]);
  }
  int[] calls={0};assertTrue(Rpc.readAccount(params->{calls[0]++;return new JSONObject().put("account",JSONObject.NULL);}).isNull("account"));assertEquals(1,calls[0]);
 }
 @Test public void mediaFailureClosesWithoutThreadOrTurn()throws Exception{
  CodexMediaTest.Fake fake=new CodexMediaTest.Fake(){int reads;public JSONObject request(String method,JSONObject params)throws Exception{if("account/read".equals(method)){reads++;throw routing();}if("thread/start".equals(method)||"turn/start".equals(method))fail("Started unverified work");return super.request(method,params);}};
  Host host=new Host(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext());
  try{CodexMedia.run(host,new JSONObject().put("protocol","codex").put("model",""),"Inspect",new JSONArray(),false,(app,cwd)->fake);fail("Accepted failed account");}catch(IOException expected){assertTrue(expected.getMessage().contains("account-only retry"));}
  assertTrue(fake.closed);assertFalse(fake.started);
 }
}
