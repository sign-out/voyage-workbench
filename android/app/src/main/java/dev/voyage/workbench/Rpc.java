package dev.voyage.workbench;
import android.content.Context;import org.json.*;import java.io.*;import java.nio.charset.StandardCharsets;import java.nio.file.Files;import java.util.*;import java.util.concurrent.*;
final class Rpc implements AutoCloseable {
 interface Listener {void event(JSONObject event)throws Exception;}
 Listener listener=e->{};Process child;BufferedWriter input;int sequence;final BlockingQueue<String> output=new LinkedBlockingQueue<>(512);
 Rpc(Context app,File task)throws Exception{
 RuntimePacks.require(app,"codex");
 File home=new File(app.getFilesDir(),"provider");home.mkdirs();task.mkdirs();
 String[] disabled={"shell_tool","unified_exec","plugins","remote_plugin","apps","hooks","browser_use","browser_use_external","computer_use","view_image","multi_agent","multi_agent_v2","workspace_dependencies","skill_search","skill_mcp_dependency_install","image_generation","memories","goals","sleep_tool","recommended_plugins","code_mode","code_mode_only"};
 String config="approval_policy=\"never\"\nsandbox_mode=\"read-only\"\nweb_search=\"disabled\"\nproject_doc_max_bytes=0\n[features]\n";
 for(String feature:disabled)config+=feature+"=false\n";config+="code_mode_host=true\n";
 Files.write(new File(home,"config.toml").toPath(),config.getBytes(StandardCharsets.UTF_8));
        String binary=app.getApplicationInfo().nativeLibraryDir+"/libcodex.so";
        ArrayList<String> command=new ArrayList<>();
        String libs=app.getApplicationInfo().nativeLibraryDir;
        File aliases=new File(app.getFilesDir(),"runtime-libs"); aliases.mkdirs();
        try(InputStream manifest=app.getAssets().open("runtime-libs-"+android.os.Build.SUPPORTED_ABIS[0]+".json")) {
            ByteArrayOutputStream bytes=new ByteArrayOutputStream(); byte[] buffer=new byte[4096]; int n;
            while((n=manifest.read(buffer))>0)bytes.write(buffer,0,n);
            JSONObject names=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
            Iterator<String> keys=names.keys();
            while(keys.hasNext()) {
                String key=keys.next(); File link=new File(aliases,key); Files.deleteIfExists(link.toPath());
                Files.createSymbolicLink(link.toPath(),new File(libs,names.getString(key)).toPath());
            }
        } catch(FileNotFoundException ignored) {}
        if(false) {
            command.add(libs+"/libstrace.so"); command.add("-f"); command.add("-o"); command.add(new File(app.getFilesDir(),"syscalls.log").toString());
        }
        if(true) {
            command.add(libs+"/libproot.so"); command.add("--kill-on-exit");
            android.net.ConnectivityManager connectivity=app.getSystemService(android.net.ConnectivityManager.class);
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
        pb.environment().put("PATH","/system/bin"); pb.environment().put("TMPDIR",app.getCacheDir().toString());
        pb.environment().put("LANG","C.UTF-8");
        pb.environment().put("LD_LIBRARY_PATH",aliases.toString()+":"+libs);
        pb.environment().put("PROOT_TMP_DIR",app.getCacheDir().toString());
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
        pb.redirectError(new File(app.getFilesDir(),"provider-stderr.log"));
        output.clear(); child=pb.start();
        final Process proc=child;
        new Thread(()->{try(BufferedReader r=new BufferedReader(new InputStreamReader(proc.getInputStream(),StandardCharsets.UTF_8))) {
            String line; while((line=r.readLine())!=null) if(!output.offer(line,5,TimeUnit.SECONDS))break;
        } catch(Exception ignored) {} finally {
            try { output.offer("{\"eof\":true,\"exit\":"+proc.waitFor()+"}"); }
            catch(InterruptedException ignored) { output.offer("{\"eof\":true}"); }
        }},"codex-jsonl").start();
        input=new BufferedWriter(new OutputStreamWriter(child.getOutputStream(),StandardCharsets.UTF_8));

 }
 void init()throws Exception {rpc("initialize",new JSONObject().put("clientInfo",new JSONObject().put("name","voyage_workbench").put("version","0.1.0")).put("capabilities",new JSONObject().put("experimentalApi",true)),60);send(new JSONObject().put("method","initialized").put("params",new JSONObject()));}
 synchronized void send(JSONObject value)throws Exception {input.write(value.toString());input.newLine();input.flush();}
 void pump()throws Exception{listener.event(next(60));}
 public void close(){if(child!=null){child.destroy();child.destroyForcibly();}}
    JSONObject next(int seconds) throws Exception {
        String line=output.poll(seconds,TimeUnit.SECONDS);
        if(line==null)throw new IOException("Timed out waiting for Codex event");
        JSONObject value=new JSONObject(line);
        if(value.optBoolean("eof"))throw new IOException("Codex exited (status "+value.optInt("exit",-1)+"); inspect provider-stderr.log");
        return value;
    }
    JSONObject rpc(String method,JSONObject params,int seconds) throws Exception {
        int id=++sequence; send(new JSONObject().put("id",id).put("method",method).put("params",params));
        long end=System.currentTimeMillis()+seconds*1000L;
        while(System.currentTimeMillis()<end) {
            JSONObject m=next(Math.max(1,(int)((end-System.currentTimeMillis())/1000)));
            if(m.optInt("id",-1)==id) {
                if(m.has("error"))throw new IOException(method+": "+m.get("error"));
                return m.getJSONObject("result");
            }
            listener.event(m);
        }
        throw new IOException("RPC timeout: "+method);
    }
}
