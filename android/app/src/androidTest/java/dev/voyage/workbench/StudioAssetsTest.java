package dev.voyage.workbench;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import android.content.Context;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class StudioAssetsTest {
 @Test public void oversizedEncodedUploadIsRejectedBeforeDecodingOrNetwork()throws Exception{
  char[] encoded=new char[4*((5*1024*1024+2)/3)+1];java.util.Arrays.fill(encoded,' ');
  try{NativeImages.upload(new JSONObject().put("mime","image/png").put("base64",new String(encoded)).put("url","https://localhost/signed"));fail("Oversized encoded payload accepted");}catch(Exception expected){assertTrue(expected.getMessage().contains("size limit"));}
 }
 @Test public void signedMusicUploadCredentialsUseEncryptedStorageNotTheJournal()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();Host host=new Host(app);String token="00000000-0000-4000-8000-000000000001",key="media-upload-"+token,previous=host.secrets.get(key),value="https://example.com/signed?signature=native-fixture";
  try{host.request("retainUploadUrl",new JSONObject().put("id",token).put("url",value));assertTrue(((JSONObject)new Host(app).request("hasUploadUrl",new JSONObject().put("id",token))).getBoolean("available"));assertFalse(app.getSharedPreferences("secrets",0).getString(key,"").contains(value));assertFalse(host.store.setting("feature:music-uploads").contains(value));host.request("forgetUploadUrl",new JSONObject().put("id",token));assertFalse(((JSONObject)host.request("hasUploadUrl",new JSONObject().put("id",token))).getBoolean("available"));}finally{host.secrets.set(key,previous);}
 }
 @Test public void globalCatalogUsesGuardedStorageAndLegacyAssetDiscovery()throws Exception{
  Host host=new Host(InstrumentationRegistry.getInstrumentation().getTargetContext());String before=host.store.setting("feature:asset-library"),assetKey="feature:asset:native-library-test";
  try{
   host.request("featureSet",new JSONObject().put("key","asset-library").put("expected",before).put("value","[{\"id\":\"native-test\"}]"));
   assertTrue(((String)host.request("featureGet",new JSONObject().put("key","asset-library"))).contains("native-test"));
   try{host.request("featureSet",new JSONObject().put("key","asset-library").put("expected",before).put("value","[]"));fail("Stale update accepted");}catch(Exception expected){assertTrue(expected.getMessage().contains("changed"));}
   host.store.setting(assetKey,"{}");assertTrue(host.request("assetKeys",new JSONObject()).toString().contains("native-library-test"));
  }finally{host.store.setting("feature:asset-library",before);host.store.getWritableDatabase().execSQL("DELETE FROM settings WHERE key=?",new Object[]{assetKey});}
 }
 @Test public void audioExportsPreserveBytesAndCompactRestorableMime()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();byte[] bytes="RIFFxxxxWAVEfmt ".getBytes(StandardCharsets.UTF_8);
  JSONObject prepared=PendingExport.prepare(app,"exportMedia",new JSONObject().put("name","track.wav").put("dataUrl","data:audio/wav;base64,"+android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP)));
  try{assertEquals("audio/wav",prepared.getString("mime"));assertFalse(prepared.has("dataUrl"));ByteArrayOutputStream output=new ByteArrayOutputStream();PendingExport.write(app,new JSONObject(prepared.toString()),output);assertArrayEquals(bytes,output.toByteArray());}finally{PendingExport.discard(app,prepared);}
 }
 @Test public void musicEndpointsHaveNarrowNativeAllowlistWithoutNetwork()throws Exception{
  Host host=new Host(InstrumentationRegistry.getInstrumentation().getTargetContext()){
   @Override JSONObject http(String method,String url,String body,String etag,boolean authenticated,String idempotency)throws Exception{return new JSONObject().put("url",url).put("key",idempotency);}
  };
  for(String endpoint:new String[]{"/uploads/music","/uploads/music/upload-id/finalize"}){
   JSONObject result=(JSONObject)host.request("creatorRequest",new JSONObject().put("method","POST").put("endpoint",endpoint).put("body","{}").put("idempotencyKey","native-fixture"));assertTrue(result.getString("url").endsWith(endpoint));assertEquals("native-fixture",result.getString("key"));
  }
  try{host.request("creatorRequest",new JSONObject().put("method","POST").put("endpoint","/uploads/music/upload-id/delete"));fail("Unsupported music endpoint accepted");}catch(Exception expected){assertTrue(expected.getMessage().contains("Unsupported Creator"));}
 }
}
