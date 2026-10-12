package dev.voyage.runtimeprobe;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.nio.file.Files;

public final class MainActivity extends Activity {
    private final Handler timer=new Handler();
    private TextView status;
    private Journal journal;
    private final Runnable refresh=new Runnable() { public void run() {
        try {
            String report=journal.report().toString(2);
            status.setText(report);
            Files.write(new java.io.File(getFilesDir(),"report.json").toPath(),report.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch(Exception e) { status.setText(e.toString()); }
        timer.postDelayed(this,1000);
    }};
    public void onCreate(Bundle state) {
        super.onCreate(state); journal=new Journal(this);
        LinearLayout layout=new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(28,36,28,16);
        TextView heading=new TextView(this); heading.setText("Voyage Runtime Lab"); heading.setTextSize(26); layout.addView(heading);
        TextView note=new TextView(this); note.setText("Native Android feasibility experiment. Synthetic world only. This is not the finished Workbench."); layout.addView(note);
        for(String mode:new String[]{"probe","hold","model","accept","recover","stop"}) {
            Button b=new Button(this); b.setText(mode); b.setOnClickListener(v->start(mode)); layout.addView(b);
        }
        status=new TextView(this); status.setTextSize(13); layout.addView(status); setContentView(layout);
        if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},1);
        String mode=getIntent().getStringExtra("mode"); if(mode!=null) start(mode);
        timer.post(refresh);
    }
    public void onNewIntent(Intent i) { super.onNewIntent(i); String mode=i.getStringExtra("mode"); if(mode!=null)start(mode); }
    private void start(String mode) { startForegroundService(new Intent(this,AgentService.class).putExtra("mode",mode)); }
    public void onDestroy() { timer.removeCallbacks(refresh); journal.close(); super.onDestroy(); }
}
