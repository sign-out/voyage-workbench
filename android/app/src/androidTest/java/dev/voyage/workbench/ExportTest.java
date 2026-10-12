package dev.voyage.workbench;

import android.content.Context;
import android.os.Bundle;
import android.os.Parcel;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ExportTest {
 @Test public void largeDownloadedWorldExportSurvivesSavedStateAndPreservesBytes()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();char[] content=new char[3*1024*1024];Arrays.fill(content,'x');
  String source="{\"shortId\":\"export-fixture\",\"title\":\"海岸\",\"initialGameState\":{\"exact\":9007199254740993,\"text\":\""+new String(content)+"\"}}";
  JSONObject payload=new JSONObject().put("name","voyage-world.json").put("source",source);
  Bundle oldState=new Bundle();oldState.putString("options",new JSONObject().put("method","export").put("payload",payload).toString());assertTrue(parcelSize(oldState)>1024*1024);
  PluginCall call=new PluginCall(null,"Workbench","export-fixture","request",new JSObject(new JSONObject().put("method","export").put("payload",payload).toString()));JSONObject prepared=PendingExport.prepareCall(app,call);
  try{
   JSONObject options=call.getData();Bundle state=new Bundle();state.putString("options",options.toString());assertTrue(parcelSize(state)<4096);assertFalse(options.toString().contains("9007199254740993"));assertFalse(call.getObject("payload").has("source"));
   JSONObject restored=new JSONObject(state.getString("options")).getJSONObject("payload");File destination=File.createTempFile("export-test-",".json",app.getCacheDir());
   try{try(OutputStream output=new FileOutputStream(destination)){PendingExport.write(app,restored,output);}try(InputStream input=new FileInputStream(destination)){assertArrayEquals(source.getBytes(StandardCharsets.UTF_8),input.readAllBytes());}}finally{destination.delete();}
  }finally{PendingExport.discard(app,prepared);}assertFalse(new File(new File(app.getFilesDir(),"pending-exports"),prepared.getString("exportToken")).exists());
 }
 @Test public void cancelledAndInvalidExportsDoNotKeepPayloadFiles()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();JSONObject prepared=PendingExport.prepare(app,"export",new JSONObject().put("source","{\"exact\":9007199254740993}"));File file=PendingExport.file(app,prepared);PendingExport.discard(app,prepared);assertFalse(file.exists());
  for(Object source:new Object[]{"",JSONObject.NULL})try{PendingExport.prepare(app,"export",new JSONObject().put("source",source));fail("Invalid export must fail before opening the picker");}catch(IOException expected){assertTrue(expected.getMessage().contains("Nothing to export"));}
  try{PendingExport.file(app,new JSONObject().put("exportToken","../world.json"));fail("Invalid token allowed");}catch(IOException expected){assertTrue(expected.getMessage().contains("Invalid export token"));}
 }
 @Test public void imageExportsAlsoUseCompactRestorableOptions()throws Exception{
  Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();byte[] image="test image bytes".getBytes(StandardCharsets.UTF_8);JSONObject prepared=PendingExport.prepare(app,"exportImage",new JSONObject().put("dataUrl","data:image/png;base64,"+android.util.Base64.encodeToString(image,android.util.Base64.NO_WRAP)));
  try{assertFalse(prepared.has("dataUrl"));ByteArrayOutputStream output=new ByteArrayOutputStream();PendingExport.write(app,new JSONObject(prepared.toString()),output);assertArrayEquals(image,output.toByteArray());}finally{PendingExport.discard(app,prepared);}
 }
 private int parcelSize(Bundle state){Parcel parcel=Parcel.obtain();try{parcel.writeBundle(state);return parcel.dataSize();}finally{parcel.recycle();}}
}
