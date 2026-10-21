package dev.voyage.workbench;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

final class UploadEnvironment {
 static String verify(String projectId,String suppliedEnvironment,String suppliedWorld,String projectEnvironment,String projectWorld,String activeEnvironment,String endpoint)throws Exception {
  if(projectId==null||projectId.isEmpty()||projectWorld==null||projectWorld.isEmpty()||!projectEnvironment.equals(activeEnvironment)||!projectEnvironment.equals(suppliedEnvironment)||!projectWorld.equals(suppliedWorld))throw new Exception("Image upload project/environment/world binding is missing or changed. Resume the original upload; it cannot be retargeted.");
  if(endpoint!=null&&!endpoint.equals("/uploads")){
   if(!endpoint.matches("^/worlds/[^/]+/uploads/[^/]+/moderate$"))throw new Exception("Unsupported image moderation endpoint");
   String world=URLDecoder.decode(endpoint.split("/")[2],StandardCharsets.UTF_8.name());
   if(!projectWorld.equals(world))throw new Exception("Image moderation world does not match the linked project");
  }
  return projectEnvironment;
 }
}
