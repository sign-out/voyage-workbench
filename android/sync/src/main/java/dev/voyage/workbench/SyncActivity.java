package dev.voyage.workbench;

import android.app.Activity;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.*;
import android.widget.FrameLayout;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

public final class SyncActivity extends Activity {
 static final String PAGE="file:///android_asset/index.html";
 final ExecutorService executor=Executors.newSingleThreadExecutor();
 WebView web;SyncHost host;String pendingId,pendingMethod;File exportFile;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);FrameLayout frame=new FrameLayout(this);frame.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  web=new WebView(this);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setAllowFileAccessFromFileURLs(false);settings.setAllowUniversalAccessFromFileURLs(false);settings.setBlockNetworkLoads(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setDomStorageEnabled(false);settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
  web.addJavascriptInterface(new Bridge(),"VoyageSyncNative");web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !PAGE.equals(request.getUrl().toString());}});web.setWebChromeClient(new WebChromeClient());
  frame.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(frame);
  executor.execute(()->{try{host=new SyncHost(getApplicationContext());runOnUiThread(()->web.loadUrl(PAGE));}catch(Exception failure){runOnUiThread(()->{android.widget.TextView message=new android.widget.TextView(this);message.setPadding(24,48,24,24);message.setText("Voyage Sync could not open local storage. Your data has not been reset.\n\n"+failure.getMessage());frame.removeAllViews();frame.addView(message);});}});
 }
 final class Bridge {
  @JavascriptInterface public void post(String text){
   if(text==null||text.length()>70*1024*1024)return;
   executor.execute(()->{String id="";try{
    JSONObject message=new JSONObject(text);id=message.getString("id");if(!id.matches("[0-9]{1,12}"))return;String method=message.getString("method");JSONObject payload=message.optJSONObject("payload");if(payload==null)payload=new JSONObject();
    if("pickFile".equals(method)||"export".equals(method)){prepareFile(id,method,payload);return;}
    if("openStudio".equals(method)){String target=host.environment(host.store.load()),url=host.profile(target).getString("studioUrl");String call=id;runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));reply(call,new JSONObject(),null);}catch(Exception failure){reply(call,null,failure.getMessage());}});return;}
    if("licenses".equals(method)){try(InputStream input=getAssets().open("licenses.txt")){reply(id,new String(SyncStore.bytes(input,128*1024),StandardCharsets.UTF_8),null);}return;}
    reply(id,host.request(method,payload),null);
   }catch(Exception failure){reply(id,null,failure.getMessage());}});
  }
 }
 void prepareFile(String id,String method,JSONObject payload)throws Exception{
  if(pendingId!=null)throw new Exception("Finish the open file dialog first.");
  File prepared=null;
  if("export".equals(method)){
   String source=payload.getString("source");if(source.isEmpty()||source.getBytes(StandardCharsets.UTF_8).length>16*1024*1024)throw new Exception("Export is empty or exceeds 16 MiB.");
   prepared=File.createTempFile("voyage-export-",".json",getCacheDir());try(FileOutputStream output=new FileOutputStream(prepared)){output.write(source.getBytes(StandardCharsets.UTF_8));output.getFD().sync();}
  }
  pendingId=id;pendingMethod=method;exportFile=prepared;
  Intent intent=new Intent("export".equals(method)?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT).setType("export".equals(method)?"application/json":"*/*").addCategory(Intent.CATEGORY_OPENABLE);
  if("export".equals(method))intent.putExtra(Intent.EXTRA_TITLE,payload.optString("name","voyage-world.json"));
  runOnUiThread(()->{try{startActivityForResult(intent,410);}catch(Exception failure){String call=pendingId;clearFile();reply(call,null,failure.getMessage());}});
 }
 void clearFile(){pendingId=null;pendingMethod=null;if(exportFile!=null)exportFile.delete();exportFile=null;}
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);if(request!=410||pendingId==null)return;
  executor.execute(()->{String id=pendingId;try{
   if(result!=RESULT_OK){reply(id,null,null);return;}if(data==null||data.getData()==null)throw new Exception("The file picker returned no document.");Uri uri=data.getData();
   if("export".equals(pendingMethod)){
    if(exportFile==null||!exportFile.isFile()||exportFile.length()==0)throw new Exception("Prepared export is unavailable. Export the saved local world again.");
    try(InputStream input=new FileInputStream(exportFile);OutputStream output=getContentResolver().openOutputStream(uri,"wt")){if(output==null)throw new Exception("Cannot write the chosen document");byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);output.flush();}reply(id,new JSONObject().put("saved",true),null);
   }else{
    String name="World.json";try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);}
    try(InputStream input=getContentResolver().openInputStream(uri)){if(input==null)throw new Exception("Cannot read the selected document");byte[] bytes=SyncStore.bytes(input,8*1024*1024);String source=StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString();if(source.startsWith("\ufeff"))source=source.substring(1);reply(id,new JSONObject().put("name",name).put("source",source),null);}
   }
  }catch(Exception failure){reply(id,null,failure.getMessage());}finally{clearFile();}});
 }
 void reply(String id,Object result,String error){if(id==null||id.isEmpty())return;try{JSONObject response=new JSONObject().put("id",id).put("result",result==null?JSONObject.NULL:result);if(error!=null)response.put("error",error);String encoded=JSONObject.quote(response.toString()).replace("\u2028","\\u2028").replace("\u2029","\\u2029");runOnUiThread(()->{if(!isFinishing()&&!isDestroyed())web.evaluateJavascript("window.VoyageSyncReply(JSON.parse("+encoded+"))",null);});}catch(Exception ignored){}}
 @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("VoyageSyncNative");web.destroy();}executor.shutdown();super.onDestroy();}
}
