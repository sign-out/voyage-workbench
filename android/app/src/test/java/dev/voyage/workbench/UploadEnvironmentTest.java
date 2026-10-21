package dev.voyage.workbench;

import org.junit.Test;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class UploadEnvironmentTest {
 @Test public void linkedAlphaUploadsAndModerationUseTheProjectEnvironment()throws Exception {
  assertEquals("alpha",UploadEnvironment.verify("project","alpha","WORLD","alpha","WORLD","alpha","/uploads"));
  assertEquals("alpha",UploadEnvironment.verify("project","alpha","WORLD","alpha","WORLD","alpha","/worlds/WORLD/uploads/upload/moderate"));
  assertEquals("alpha",UploadEnvironment.verify("project","alpha","WORLD","alpha","WORLD","alpha",null));
 }
 @Test public void productionLinksCannotUseTheGlobalAlphaConnection(){
  for(String endpoint:new String[]{"/uploads","/worlds/WORLD/uploads/upload/moderate",null})assertThrows(Exception.class,()->UploadEnvironment.verify("project","production","WORLD","production","WORLD","alpha",endpoint));
 }
 @Test public void missingAndChangedBindingsCannotReachAllowanceBytesOrModeration(){
  for(String endpoint:new String[]{"/uploads","/worlds/WORLD/uploads/upload/moderate",null}){
   assertThrows(Exception.class,()->UploadEnvironment.verify("","alpha","WORLD","alpha","WORLD","alpha",endpoint));
   assertThrows(Exception.class,()->UploadEnvironment.verify("project","production","WORLD","alpha","WORLD","alpha",endpoint));
   assertThrows(Exception.class,()->UploadEnvironment.verify("project","alpha","OTHER","alpha","WORLD","alpha",endpoint));
   assertThrows(Exception.class,()->UploadEnvironment.verify("project","alpha","WORLD","alpha","","alpha",endpoint));
  }
 }
 @Test public void moderationMustTargetTheExactLinkedWorld(){
  assertThrows(Exception.class,()->UploadEnvironment.verify("project","alpha","WORLD","alpha","WORLD","alpha","/worlds/OTHER/uploads/upload/moderate"));
  assertThrows(Exception.class,()->UploadEnvironment.verify("project","alpha","WORLD","alpha","WORLD","alpha","/worlds/WORLD/uploads/upload/moderate?world=OTHER"));
 }
}
