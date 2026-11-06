package dev.voyage.workbench;

import org.junit.Test;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class VoyageEnvironmentTest {
 @Test public void onlyConfirmedCreatorHostsAreAvailable()throws Exception {
  assertEquals("https://api.aidungeon.com/creator/v1",Host.apiBase("production"));
  assertEquals("https://api-alpha.aidungeon.com/creator/v1",Host.apiBase("alpha"));
  for(String target:new String[]{"beta","https://other.test","production/../alpha"})assertThrows(Exception.class,()->Host.apiBase(target));
 }
 @Test public void productionUploadsRequireProductionProjectAndConnectionBindings()throws Exception {
  assertEquals("production",UploadEnvironment.verify("project","production","WORLD","production","WORLD","production","/uploads"));
  assertEquals("production",UploadEnvironment.verify("project","production","WORLD","production","WORLD","production","/worlds/WORLD/uploads/upload/moderate"));
  assertThrows(Exception.class,()->UploadEnvironment.verify("project","production","WORLD","production","WORLD","alpha","/uploads"));
 }
}
