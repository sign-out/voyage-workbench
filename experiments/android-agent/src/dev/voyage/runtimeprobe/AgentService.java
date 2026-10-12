package dev.voyage.runtimeprobe;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;

public final class AgentService extends Service {
    private Journal journal;
    private volatile Process child;
    private volatile boolean canceled;
    private volatile boolean running;
    private BufferedWriter input;
    private int sequence=0;
    private final BlockingQueue<String> output=new LinkedBlockingQueue<>(512);
    private String threadId;
    public IBinder onBind(Intent intent) { return null; }
    public void onCreate() {
        super.onCreate(); journal=new Journal(this); journal.recover();
        NotificationManager n=getSystemService(NotificationManager.class);
        n.createNotificationChannel(new NotificationChannel("runtime","Runtime experiment",NotificationManager.IMPORTANCE_LOW));
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE);
        startForeground(1,new Notification.Builder(this,"runtime").setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Voyage runtime experiment").setContentText("Local agent task running").setContentIntent(open).build());
    }
    public int onStartCommand(Intent intent,int flags,int startId) {
        String mode=intent==null?"recover":intent.getStringExtra("mode");
        if("stop".equals(mode)) { canceled=true; if(child!=null)child.destroy(); journal.state("CANCELED","Stopped by user"); stopSelf(); return START_NOT_STICKY; }
        if(running)return START_NOT_STICKY;
        running=true; canceled=false;
        new Thread(()->{
            try {
                if("recover".equals(mode)) { journal.recover(); }
                else if("accept".equals(mode)) { journal.accept(); }
                else if("edit-fixture".equals(mode)) { journal.editFixture(); }
                else if("reset-fixture".equals(mode)) { journal.resetFixture(); }
                else if("candidate-fixture".equals(mode)) { journal.prepare(); journal.candidate("Android runtime verified"); journal.state("PROPOSAL_READY","Deterministic fixture, not a model result"); }
                else {
                    journal.prepare(); journal.state("RUNNING",mode);
                    if("hold".equals(mode)) {
                        for(int i=0;i<90 && !canceled;i++){journal.beat(); report(); Thread.sleep(1000);}
                        if(!canceled)journal.state("COMPLETED","Lifecycle heartbeat completed");
                    } else runCodex(mode.endsWith("model"), mode);
                }
            } catch(Exception e) { if(!canceled)journal.state("FAILED",e.toString()); }
            finally {
                if(child!=null)child.destroy(); child=null; running=false;
                try { report(); } catch(Exception ignored) {}
                // Authentication used for this disposable probe must not outlive the run.
                new File(getFilesDir(),"provider/auth.json").delete();
                stopSelf(startId);
            }
        },"voyage-agent-worker").start();
        return START_NOT_STICKY;
    }
    private void runCodex(boolean model, String mode) throws Exception {
        File home=new File(getFilesDir(),"provider"); home.mkdirs();
        File task=new File(getFilesDir(),"task"); task.mkdirs();
        Files.write(new File(task,"world.json").toPath(),journal.field("base").getBytes(StandardCharsets.UTF_8));
        Files.write(new File(home,"config.toml").toPath(),(
            "approval_policy = \"never\"\nweb_search = \"disabled\"\n[features]\nshell_tool = false\nunified_exec = false\napps = false\nplugins = false\nremote_plugin = false\nhooks = false\n").getBytes(StandardCharsets.UTF_8));
        String binary=getApplicationInfo().nativeLibraryDir+"/libcodex.so";
        ArrayList<String> command=new ArrayList<>();
        String libs=getApplicationInfo().nativeLibraryDir;
        File aliases=new File(getFilesDir(),"runtime-libs"); aliases.mkdirs();
        try(InputStream manifest=getAssets().open("runtime-libs.json")) {
            ByteArrayOutputStream bytes=new ByteArrayOutputStream(); byte[] buffer=new byte[4096]; int n;
            while((n=manifest.read(buffer))>0)bytes.write(buffer,0,n);
            JSONObject names=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
            Iterator<String> keys=names.keys();
            while(keys.hasNext()) {
                String key=keys.next(); File link=new File(aliases,key); Files.deleteIfExists(link.toPath());
                Files.createSymbolicLink(link.toPath(),new File(libs,names.getString(key)).toPath());
            }
        } catch(FileNotFoundException ignored) {}
        if(mode.startsWith("trace")) {
            command.add(libs+"/libstrace.so"); command.add("-f"); command.add("-o"); command.add(new File(getFilesDir(),"syscalls.log").toString());
        }
        if(mode.contains("proot")) {
            command.add(libs+"/libproot.so"); command.add("--kill-on-exit");
            android.net.ConnectivityManager connectivity=getSystemService(android.net.ConnectivityManager.class);
            android.net.LinkProperties properties=connectivity.getLinkProperties(connectivity.getActiveNetwork());
            if(properties==null || properties.getDnsServers().isEmpty())throw new IOException("No active network DNS configuration");
            StringBuilder resolv=new StringBuilder("options timeout:2 attempts:2\n");
            for(java.net.InetAddress server:properties.getDnsServers())resolv.append("nameserver ").append(server.getHostAddress()).append("\n");
            File resolver=new File(home,"resolv.conf"); Files.write(resolver.toPath(),resolv.toString().getBytes(StandardCharsets.UTF_8));
            command.add("-b"); command.add(resolver.toString()+":/etc/resolv.conf");
            File companion=new File(libs,"libcodex-code-mode-host.so");
            if(companion.isFile()) { command.add("-b"); command.add(companion.toString()+":"+libs+"/codex-code-mode-host"); }
        }
        Collections.addAll(command,binary,"app-server","--listen","stdio://");
        ProcessBuilder pb=new ProcessBuilder(command);
        pb.directory(task); pb.environment().clear();
        pb.environment().put("HOME",home.toString()); pb.environment().put("CODEX_HOME",home.toString());
        pb.environment().put("PATH","/system/bin"); pb.environment().put("TMPDIR",getCacheDir().toString());
        pb.environment().put("LANG","C.UTF-8");
        pb.environment().put("LD_LIBRARY_PATH",aliases.toString()+":"+libs);
        pb.environment().put("PROOT_TMP_DIR",getCacheDir().toString());
        pb.environment().put("PROOT_LOADER",libs+"/libloader.so");
        pb.environment().put("PROOT_NO_SECCOMP","1");
        java.security.KeyStore store=java.security.KeyStore.getInstance("AndroidCAStore"); store.load(null);
        StringBuilder certificates=new StringBuilder(); Enumeration<String> certNames=store.aliases();
        while(certNames.hasMoreElements()) {
            java.security.cert.Certificate cert=store.getCertificate(certNames.nextElement());
            certificates.append("-----BEGIN CERTIFICATE-----\n").append(android.util.Base64.encodeToString(cert.getEncoded(),android.util.Base64.NO_WRAP)).append("\n-----END CERTIFICATE-----\n");
        }
        File ca=new File(home,"ca-certificates.pem"); Files.write(ca.toPath(),certificates.toString().getBytes(StandardCharsets.UTF_8));
        pb.environment().put("SSL_CERT_FILE",ca.toString());
        pb.redirectError(new File(getFilesDir(),"provider-stderr.log"));
        output.clear(); child=pb.start();
        final Process proc=child;
        new Thread(()->{try(BufferedReader r=new BufferedReader(new InputStreamReader(proc.getInputStream(),StandardCharsets.UTF_8))) {
            String line; while((line=r.readLine())!=null) if(!output.offer(line,5,TimeUnit.SECONDS))break;
        } catch(Exception ignored) {} finally {
            try { output.offer("{\"eof\":true,\"exit\":"+proc.waitFor()+"}"); }
            catch(InterruptedException ignored) { output.offer("{\"eof\":true}"); }
        }},"codex-jsonl").start();
        input=new BufferedWriter(new OutputStreamWriter(child.getOutputStream(),StandardCharsets.UTF_8));
        JSONObject initialized=rpc("initialize",new JSONObject().put("clientInfo",new JSONObject().put("name","voyage_android_probe").put("version","0.1"))
            .put("capabilities",new JSONObject().put("experimentalApi",true)),30);
        send(new JSONObject().put("method","initialized").put("params",new JSONObject()));
        if(!model) {
            JSONObject account=rpc("account/read",new JSONObject().put("refreshToken",false),30);
            journal.state("COMPLETED","Codex app-server initialized under Android app UID. "+initialized.optString("userAgent")+"; account present="+!account.isNull("account"));
            return;
        }
        JSONObject models=rpc("model/list",new JSONObject(),45);
        JSONArray list=models.getJSONArray("data"); String selected=null;
        for(int i=0;i<list.length();i++)if(list.getJSONObject(i).optBoolean("isDefault"))selected=list.getJSONObject(i).getString("id");
        if(selected==null && list.length()>0)selected=list.getJSONObject(0).getString("id");
        if(selected==null)throw new IOException("Provider did not advertise a model");
        JSONObject tool=new JSONObject().put("name","world_set_title").put("description","Stage the approved title in the candidate world; never changes the active world.")
            .put("inputSchema",new JSONObject("{\"type\":\"object\",\"properties\":{\"title\":{\"type\":\"string\"}},\"required\":[\"title\"],\"additionalProperties\":false}"));
        JSONObject started=rpc("thread/start",new JSONObject().put("model",selected).put("cwd",task.toString()).put("approvalPolicy","never")
            .put("sandbox","read-only").put("dynamicTools",new JSONArray().put(tool))
            .put("developerInstructions","You edit a synthetic Voyage fixture using world_set_title only. Do not use shell, network or other tools."),45);
        threadId=started.getJSONObject("thread").getString("id");
        rpc("turn/start",new JSONObject().put("threadId",threadId).put("input",new JSONArray().put(new JSONObject().put("type","text")
            .put("text","Approved Work Order: set the candidate title to exactly Android runtime verified using world_set_title, then briefly confirm. Preserve everything else."))),30);
        long end=System.currentTimeMillis()+180000;
        while(System.currentTimeMillis()<end && !canceled) {
            JSONObject event=next(Math.max(1,(int)((end-System.currentTimeMillis())/1000)));
            if("turn/completed".equals(event.optString("method"))) {
                JSONObject turn=event.getJSONObject("params").getJSONObject("turn");
                if(!"completed".equals(turn.optString("status")))throw new IOException("Model turn: "+turn.toString());
                if(journal.field("candidate")==null)throw new IOException("Model returned without producing a candidate");
                journal.state("PROPOSAL_READY","Real Codex turn completed on Android; active world unchanged; model="+selected); return;
            }
            dispatch(event);
        }
        throw new IOException("Model run timed out or was canceled");
    }
    private synchronized void send(JSONObject value) throws Exception { input.write(value.toString()); input.newLine(); input.flush(); }
    private void report() throws Exception {
        File temp=new File(getFilesDir(),"service-report.tmp");
        Files.write(temp.toPath(),journal.report().toString(2).getBytes(StandardCharsets.UTF_8));
        Files.move(temp.toPath(),new File(getFilesDir(),"service-report.json").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }
    private JSONObject next(int seconds) throws Exception {
        String line=output.poll(seconds,TimeUnit.SECONDS);
        if(line==null)throw new IOException("Timed out waiting for Codex event");
        JSONObject value=new JSONObject(line);
        if(value.optBoolean("eof"))throw new IOException("Codex exited (status "+value.optInt("exit",-1)+"); inspect provider-stderr.log");
        return value;
    }
    private JSONObject rpc(String method,JSONObject params,int seconds) throws Exception {
        int id=++sequence; send(new JSONObject().put("id",id).put("method",method).put("params",params));
        long end=System.currentTimeMillis()+seconds*1000L;
        while(System.currentTimeMillis()<end) {
            JSONObject m=next(Math.max(1,(int)((end-System.currentTimeMillis())/1000)));
            if(m.optInt("id",-1)==id) {
                if(m.has("error"))throw new IOException(method+": "+m.get("error"));
                return m.getJSONObject("result");
            }
            dispatch(m);
        }
        throw new IOException("RPC timeout: "+method);
    }
    private void dispatch(JSONObject event) throws Exception {
        if(event.has("id") && event.has("method")) {
            if("item/tool/call".equals(event.optString("method"))) {
                JSONObject p=event.getJSONObject("params");
                if(!"world_set_title".equals(p.getString("tool")))throw new IOException("Unapproved tool requested");
                journal.candidate(p.getJSONObject("arguments").getString("title"));
                send(new JSONObject().put("id",event.get("id")).put("result",new JSONObject().put("success",true)
                    .put("contentItems",new JSONArray().put(new JSONObject().put("type","inputText").put("text","Candidate staged. Active world unchanged.")))));
            } else send(new JSONObject().put("id",event.get("id")).put("error",new JSONObject().put("code",-32601).put("message","Unsupported request")));
        }
        journal.beat();
    }
    public void onDestroy() { canceled=true; if(child!=null)child.destroy(); super.onDestroy(); }
}
