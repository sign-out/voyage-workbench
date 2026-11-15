package dev.voyage.workbench;

import org.junit.Test;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class VoyageEnvironmentTest {
 @Test public void onlyConfirmedCreatorHostsAreAvailable()throws Exception {
  assertEquals("https://api.aidungeon.com/creator/v1",Host.apiBase("production"));
  assertEquals("https://api-alpha.aidungeon.com/creator/v1",Host.apiBase("alpha"));
  assertEquals("https://api-beta.aidungeon.com/creator/v1",Host.apiBase("beta"));
  for(String target:new String[]{"staging","https://other.test","production/../alpha"})assertThrows(Exception.class,()->Host.apiBase(target));
 }
 @Test public void uploadsRequireMatchingProjectAndConnectionBindingsInEveryEnvironment()throws Exception {
  for(String environment:new String[]{"production","beta","alpha"}){
   assertEquals(environment,UploadEnvironment.verify("project",environment,"WORLD",environment,"WORLD",environment,"/uploads"));
   assertEquals(environment,UploadEnvironment.verify("project",environment,"WORLD",environment,"WORLD",environment,"/worlds/WORLD/uploads/upload/moderate"));
   for(String other:new String[]{"production","beta","alpha"})if(!other.equals(environment)){
    assertThrows(Exception.class,()->UploadEnvironment.verify("project",environment,"WORLD",environment,"WORLD",other,"/uploads"));
    assertEquals(environment,UploadEnvironment.verify("project",environment,"WORLD",other,"WORLD",environment,"/uploads"));
   }
  }
 }
}
