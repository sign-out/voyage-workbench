package dev.voyage.workbench;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.security.KeyStore;
import javax.crypto.Cipher;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.json.JSONArray;

@RunWith(AndroidJUnit4.class)
public class CredentialStorageTest {
 @Test public void apiKeysAreEncryptedNonExportableBoundAndRemovable()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();Secrets secrets=new Secrets(app);SharedPreferences storage=app.getSharedPreferences("secrets",0);String name="provider-credential-test",other="provider-credential-test-other",value="credential-fixture-never-production";
  try{secrets.set(name,value);String first=storage.getString(name,"");assertTrue(first.startsWith("v2:"));assertFalse(first.contains(value));assertEquals(value,new Secrets(app).get(name));secrets.set(name,value);assertNotEquals(first,storage.getString(name,""));KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);assertNull(keys.getKey("voyage-api",null).getEncoded());assertTrue(storage.edit().putString(other,first).commit());try{secrets.get(other);fail("Ciphertext must be bound to its credential name");}catch(java.security.GeneralSecurityException expected){}secrets.set(name,"");assertFalse(storage.contains(name));assertEquals("",secrets.get(name));}finally{secrets.set(name,"");secrets.set(other,"");}
 }
 @Test public void existingEncryptedCredentialsRemainReadable()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();Secrets secrets=new Secrets(app);String name="provider-credential-legacy-test",value="legacy-fixture";
  try{secrets.set(name,value);KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,keys.getKey("voyage-api",null));String legacy=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);assertTrue(app.getSharedPreferences("secrets",0).edit().putString(name,legacy).commit());assertEquals(value,new Secrets(app).get(name));}finally{secrets.set(name,"");}
 }
 @Test public void hostDoesNotExposeKeysAndDeletesRemovedConnectionCredentials()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();Host host=new Host(app);String previous=host.store.setting("providers"),id="credential-host-test",value="credential-host-fixture";
  try{JSONObject settings=host.settings();settings.getJSONArray("profiles").put(new JSONObject().put("id",id).put("name","Credential test").put("protocol","openai").put("baseUrl","https://api.x.ai/v1").put("model",""));host.request("saveProviderSettings",new JSONObject().put("settings",settings));JSONObject status=(JSONObject)host.request("providerKey",new JSONObject().put("profileId",id).put("key",value));assertFalse(status.toString().contains(value));assertFalse(host.store.setting("providers").contains(value));assertEquals(value,host.secrets.get("provider-"+id));try{host.request("providerKey",new JSONObject().put("profileId","missing-credential-test").put("key",value));fail("Unknown connection must be rejected");}catch(Exception expected){assertEquals("Provider not found.",expected.getMessage());}JSONArray profiles=settings.getJSONArray("profiles");profiles.remove(profiles.length()-1);host.request("saveProviderSettings",new JSONObject().put("settings",settings));assertEquals("",host.secrets.get("provider-"+id));}finally{host.secrets.set("provider-"+id,"");host.store.setting("providers",previous);host.store.close();}
 }
}
