package dev.voyage.workbench;

import android.content.Context;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.PluginCall;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

final class PendingExport {
 static JSONObject prepareCall(Context context,PluginCall call)throws Exception{
  JSONObject prepared=prepare(context,call.getString("method"),call.getObject("payload"));call.getData().put("payload",prepared);return prepared;
 }
 static JSONObject prepare(Context context,String method,JSONObject payload)throws Exception{
  if(!"export".equals(method)&&!"exportImage".equals(method)&&!"exportMedia".equals(method))throw new IOException("Unsupported export");
  String source=null;byte[] image=null;
  if("export".equals(method)){if(!(payload.opt("source") instanceof String))throw new IOException("Nothing to export");source=payload.getString("source");if(source.isEmpty())throw new IOException("Nothing to export");}
  else{String data=payload.getString("dataUrl");if(data.length()>45*1024*1024||!data.matches("^data:(image/(png|jpeg|webp)|audio/(mpeg|wav|ogg|mp4));base64,[A-Za-z0-9+/]*={0,2}$"))throw new IOException("Unsupported image");image=Base64.decode(data.substring(data.indexOf(',')+1),Base64.DEFAULT);if(image.length==0||image.length>32*1024*1024)throw new IOException("Empty or oversized export");}
  String token=UUID.randomUUID().toString();File directory=new File(context.getFilesDir(),"pending-exports");if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Cannot prepare export storage");
  AtomicFile file=new AtomicFile(new File(directory,token));FileOutputStream output=null;
  try{output=file.startWrite();if(source!=null){Writer writer=new OutputStreamWriter(output,StandardCharsets.UTF_8);writer.write(source);writer.flush();}else output.write(image);output.getFD().sync();file.finishWrite(output);output=null;if(file.getBaseFile().length()==0)throw new IOException("Cannot prepare an empty export");}
  catch(Exception error){if(output!=null)file.failWrite(output);throw error;}
  return new JSONObject().put("name",payload.optString("name","export".equals(method)?"world.json":"image.png")).put("exportToken",token).put("mime",source!=null?"application/json":payload.getString("dataUrl").substring(5,payload.getString("dataUrl").indexOf(';')));
 }
 static File file(Context context,JSONObject payload)throws Exception{
  String token=payload.getString("exportToken");if(!token.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))throw new IOException("Invalid export token");
  File file=new File(new File(context.getFilesDir(),"pending-exports"),token);if(!file.isFile()||file.length()==0)throw new IOException("Prepared export is missing. Retry exporting your saved local world.");return file;
 }
 static void write(Context context,JSONObject payload,OutputStream output)throws Exception{
  if(output==null)throw new IOException("The selected destination cannot be opened");
  try(InputStream input=new FileInputStream(file(context,payload))){byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);output.flush();}
 }
 static void discard(Context context,JSONObject payload){try{file(context,payload).delete();}catch(Exception ignored){}}
}
