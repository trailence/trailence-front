package org.trailence;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PluginCall;

public class InstallReceiver extends BroadcastReceiver {

  @Override
  public void onReceive(Context context, Intent intent) {
    int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
    Logger.info("install receiver status " + status + ", message: " + intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
    switch (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
      case PackageInstaller.STATUS_PENDING_USER_ACTION:
        context.startActivity(((Intent)intent.getParcelableExtra(Intent.EXTRA_INTENT)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        break;
    }
    int sessionId = intent.getIntExtra("sessionId", -1);
    if (sessionId > 0) {
      PluginCall call = TrailenceUpdater.installSessions.remove(sessionId);
      if (call != null)
        call.resolve(new JSObject().put("done", true));
    }
  }

}
