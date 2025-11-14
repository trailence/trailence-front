package org.trailence;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PluginCall;

import java.io.EOFException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLConnection;
import java.util.HashMap;
import java.util.Map;

public class TrailenceUpdater {
  public static final Map<Integer, PluginCall> installSessions = new HashMap<>();

  static void update(String urlString, Context ctx, PluginCall call) {
    Logger.info("Downloading update from " + urlString);
    byte[] apk;
    try {
      URL url = new URL(urlString);
      URLConnection connection = url.openConnection();
      connection.connect();

      int length = connection.getContentLength();
      if (length > 0)
        apk = new byte[length];
      else
        apk = new byte[10 * 1024 * 1024];
      int pos = 0;
      try (InputStream in = connection.getInputStream()) {
        while (length <= 0 || pos < length) {
          int chunk = (length > 0 && length - pos < 65536 ? length - pos : 65536);
          int read = in.read(apk, pos, chunk);
          if (read <= 0) {
            if (length > 0)
              throw new EOFException();
            byte[] data = new byte[pos];
            System.arraycopy(apk, 0, data, 0, pos);
            apk = data;
            break;
          }
          pos += read;
          int pc = length > 0 ? (pos * 90 / length) : (pos > 6 * 1024 * 1024 ? 90 : pos * 90 / (6 * 1024 * 1024));
          call.resolve(new JSObject().put("done", false).put("progress", pc));
        }
      }
    } catch (Exception e) {
      Logger.error("Error downloading update", e);
      call.resolve(new JSObject().put("error", e.getMessage()));
      return;
    }

    Logger.info("Update downloaded (" + apk.length + "), start installation");
    call.resolve(new JSObject().put("done", false).put("progress", 95).put("i18n", "installing"));

    int sessionId = 0;
    PackageInstaller.Session session = null;

    PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
    try {
      sessionId = ctx.getPackageManager().getPackageInstaller().createSession(params);
      session = ctx.getPackageManager().getPackageInstaller().openSession(sessionId);
    } catch (Exception e) {
      Logger.error("Error opening package installer session", e);
      call.resolve(new JSObject().put("error", e.getMessage()));
      return;
    }
    try (OutputStream out = session.openWrite("update", 0, apk.length)) {
      out.write(apk);
      session.fsync(out);
    } catch (Exception e) {
      Logger.error("Error writing APK data", e);
      call.resolve(new JSObject().put("error", e.getMessage()));
      session.close();
      return;
    }

    Intent intent = new Intent(ctx, InstallReceiver.class);
    intent.putExtra("sessionId", sessionId);
    installSessions.put(sessionId, call);
    PendingIntent pi = PendingIntent.getBroadcast(
      ctx,
      sessionId,
      intent,
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ?
        PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT :
        PendingIntent.FLAG_UPDATE_CURRENT
    );

    session.commit(pi.getIntentSender());
    session.close();

    call.resolve(new JSObject().put("done", false).put("progress", 100));

  }

}
