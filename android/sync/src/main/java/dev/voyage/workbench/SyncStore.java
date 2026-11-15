package dev.voyage.workbench;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;

final class SyncStore {
 static final int LIMIT=64*1024*1024;
 final AtomicFile file;
 SyncStore(Context context){file=new AtomicFile(new File(context.getFilesDir(),"voyage-sync.json"));}
 static byte[] bytes(InputStream input,int limit)throws Exception{
  ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int count;
  while((count=input.read(buffer))!=-1){if(output.size()>limit-count)throw new IOException("File exceeds the companion's size limit.");output.write(buffer,0,count);}return output.toByteArray();
 }
 synchronized JSONObject load()throws Exception{
  if(!file.getBaseFile().exists()&&!new File(file.getBaseFile().getPath()+".bak").exists())return new JSONObject().put("format",1).put("revision",0).put("environment","production");
  try(InputStream input=file.openRead()){JSONObject state=new JSONObject(new String(bytes(input,LIMIT),StandardCharsets.UTF_8));if(state.optInt("format")!=1)throw new IOException("Unsupported local sync state. Export or recover the saved data before replacing it.");return state;}
 }
 synchronized JSONObject write(JSONObject next,long expected)throws Exception{
  JSONObject current=load();if(current.getLong("revision")!=expected)throw new IOException("Local state changed. Reload before continuing.");
  next.put("format",1).put("revision",expected+1);byte[] bytes=next.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>LIMIT)throw new IOException("Local sync storage exceeds 64 MiB. Export your backups before continuing.");
  FileOutputStream output=null;try{output=file.startWrite();output.write(bytes);output.getFD().sync();file.finishWrite(output);output=null;}finally{if(output!=null)file.failWrite(output);}return next;
 }
}
