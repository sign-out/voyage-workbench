package dev.voyage.workbench;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

final class CommunityReferences {
 static String read(String file)throws Exception {
  if(!file.matches("(?:schema|wiki|limits|voice-catalog|guides|base-world)\\.json|guides/[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*\\.json"))throw new Exception("Invalid community reference path.");
  HttpURLConnection connection=(HttpURLConnection)new URL("https://api.unofficial.voyage/"+file).openConnection();
  ScheduledExecutorService guard=Executors.newSingleThreadScheduledExecutor();
  guard.schedule(connection::disconnect,20,TimeUnit.SECONDS);
  try {
   connection.setInstanceFollowRedirects(false);
   connection.setRequestMethod("GET");connection.setConnectTimeout(20000);connection.setReadTimeout(20000);
   connection.setRequestProperty("Accept","application/json");
   int status=connection.getResponseCode();if(status<200||status>=300)throw new Exception("Community "+file+": HTTP "+status);
   ByteArrayOutputStream bytes=new ByteArrayOutputStream();
   try(InputStream input=connection.getInputStream()){
    byte[] buffer=new byte[8192];int count;
    while((count=input.read(buffer))>=0){if(Thread.currentThread().isInterrupted())throw new InterruptedException("Reference refresh interrupted.");if(bytes.size()+count>8*1024*1024)throw new Exception("Reference response exceeds 8 MiB.");bytes.write(buffer,0,count);}
   }
   return new String(bytes.toByteArray(),StandardCharsets.UTF_8);
  } finally {guard.shutdownNow();connection.disconnect();}
 }
}
