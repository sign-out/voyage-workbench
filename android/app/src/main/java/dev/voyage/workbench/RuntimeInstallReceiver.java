package dev.voyage.workbench;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

public final class RuntimeInstallReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context app, Intent intent) {
        String token = RuntimePacks.preferences(app).getString("token", "");
        int session = RuntimePacks.preferences(app).getInt("session", -1);
        if (token.isEmpty() || !(app.getPackageName() + ".runtime." + token).equals(intent.getAction())
            || session != intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -2)) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent approval = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
            if (approval == null) { RuntimePacks.save(app, "failed", "Android did not provide an installation confirmation. Retry."); return; }
            RuntimePacks.pendingApproval = approval;
            RuntimePacks.save(app, "approval", "Approve the installation in Android. The app may restart; saved projects and credentials are retained.");
            try { app.startActivity(approval.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            catch (Exception error) { RuntimePacks.save(app, "failed", "Could not open Android approval. Cancel the pending install and retry."); }
        } else {
            RuntimePacks.pendingApproval = null;
            RuntimePacks.save(app, status == PackageInstaller.STATUS_SUCCESS ? "complete" : "failed",
                status == PackageInstaller.STATUS_SUCCESS ? "Provider installed. Readiness is checked below; no login or inference was performed."
                : "Android did not install the provider (status " + status + "). Previously installed providers are unchanged; retry or use the full/offline APK.");
            RuntimePacks.preferences(app).edit().remove("session").remove("token").commit();
        }
    }
}
