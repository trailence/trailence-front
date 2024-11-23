package org.trailence;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.util.HttpRequestHandler;

import java.io.BufferedInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLConnection;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(
  name = "Trailence"
)
public class TrailencePlugin extends Plugin {

  @PluginMethod()
  public void getAppInfo(PluginCall call) {
    try {
      final var context = this.getContext();
      final var pkgName = context.getPackageName();
      final var pkgMgr = context.getPackageManager();
      final var pkgInfo = pkgMgr.getPackageInfo(pkgName, 0);
      final var installer = pkgMgr.getInstallerPackageName(pkgName);
      call.resolve(
        new JSObject()
          .put("versionCode", pkgInfo.versionCode)
          .put("versionName", pkgInfo.versionName)
          .put("installer", installer)
      );
    } catch (Exception e) {
      call.reject(e.getMessage());
    }
  }

  private int idCount = 1;
  private final Map<Integer, SaveFile> saveFiles = new HashMap<>();

  private static class SaveFile {
    private OutputStream out;
  }

  @PluginMethod()
  public void startSaveFile(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType(call.getString("type"));
    intent.putExtra(Intent.EXTRA_TITLE, call.getString("filename"));
    startActivityForResult(call, intent, "saveFileCallback");
  }

  @PluginMethod()
  public void saveFileChunk(PluginCall call) {
    Integer fileId = call.getInt("id");
    if (fileId == null) {
      call.reject("Missing id");
      return;
    }
    SaveFile file = saveFiles.get(fileId);
    if (file == null) {
      call.reject("Unknown id");
      return;
    }
    String contentBase64 = call.getString("data");
    if (contentBase64 != null) {
      try {
        file.out.write(Base64.getDecoder().decode(contentBase64));
      } catch (Exception e) {
        try { file.out.close(); } catch (Exception e2) { /* ignore */ }
        saveFiles.remove(fileId);
        Logger.error("Error writing to file", e);
        call.reject("Error while writing file: " + e.getMessage());
        return;
      }
    }
    if (Boolean.TRUE.equals(call.getBoolean("isEnd"))) {
      try {
        file.out.close();
        call.resolve(new JSObject().put("success", true));
      } catch (Exception e) {
        Logger.error("Error closing file", e);
        call.reject("Error closing file: " + e.getMessage());
      }
      saveFiles.remove(fileId);
      return;
    }
    call.resolve(new JSObject().put("success", true));
  }

  @PluginMethod
  public void startZipFile(PluginCall call) {
    Integer fileId = call.getInt("id");
    if (fileId == null) {
      call.reject("Missing id");
      return;
    }
    SaveFile file = saveFiles.get(fileId);
    if (file == null) {
      call.reject("Unknown id");
      return;
    }
    if (!(file.out instanceof ZipOutputStream)) {
      call.reject("Not a zip file");
      return;
    }
    try {
      ((ZipOutputStream) file.out).putNextEntry(new ZipEntry(call.getString("filename")));
    } catch (IOException e) {
      Logger.error("Error creating next zip entry", e);
      call.reject(e.getMessage());
      return;
    }
    call.resolve(new JSObject().put("success", true));
  }

  @ActivityCallback
  private void saveFileCallback(PluginCall call, ActivityResult result) {
    if (call == null) {
      return;
    }

    if (result.getResultCode() == Activity.RESULT_OK) {
      int fileId = idCount++;
      SaveFile file = new SaveFile();
      try {
        OutputStream out = this.getContext().getContentResolver().openOutputStream(result.getData().getData());
        if (Boolean.TRUE.equals(call.getBoolean("isZip"))) {
          ZipOutputStream zip = new ZipOutputStream(out);
          out = zip;
        }
        file.out = out;
        saveFiles.put(fileId, file);
        call.resolve(new JSObject().put("id", fileId));
      } catch (Exception e) {
        Logger.error("Error starting to write to file", e);
        call.reject(e.getMessage());
      }
    } else {
      call.resolve(new JSObject().put("id", false));
    }
  }

  private final LinkedList<List<byte[]>> filesToImport = new LinkedList<>();
  private PluginCall importFilesListener = null;

  public void addFileToImport(List<byte[]> content) {
    if (importFilesListener == null)
      this.filesToImport.add(content);
    else
      this.pushFileToImport(content);
  }

  @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
  public void listenToImportedFiles(PluginCall call) {
    call.setKeepAlive(true);
    this.importFilesListener = call;
    while (!filesToImport.isEmpty()) {
      List<byte[]> content = filesToImport.removeFirst();
      this.pushFileToImport(content);
    }
  }

  private int pushFileIdCounter = 1;
  private void pushFileToImport(List<byte[]> content) {
    int id = pushFileIdCounter++;
    this.importFilesListener.resolve(new JSObject().put("fileId", id).put("chunks", content.size()));
    int index = 0;
    for (byte[] chunk : content) {
      this.importFilesListener.resolve(new JSObject().put("fileId", id).put("chunkIndex", index++).put("data", Base64.getEncoder().encodeToString(chunk)));
    }
  }

  @PluginMethod()
  public void downloadUsingBrowser(PluginCall call) {
    try {
      Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url")));
      getContext().startActivity(intent);
      call.resolve(new JSObject().put("success", true));
    } catch (Exception e) {
      Logger.error("Cannot open URL", call.getString("url"), e);
      call.reject("Cannot open URL", e);
    }
  }

  @PluginMethod
  public void canInstallUpdate(PluginCall call) {
    call.resolve(new JSObject().put("allowed", this.getContext().getApplicationContext().getPackageManager().canRequestPackageInstalls()));
  }

  @PluginMethod
  public void requestInstallPermission(PluginCall call) {
    Context ctx = this.getContext().getApplicationContext();
    if (ctx.getPackageManager().canRequestPackageInstalls()) {
      call.resolve(new JSObject().put("allowed", true));
      return;
    }
    startActivityForResult(call, new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).setData(Uri.parse(String.format("package:%s", ctx.getPackageName()))), "requestInstallPermissionCallback");
  }

  @ActivityCallback
  public void requestInstallPermissionCallback(PluginCall call, ActivityResult result) {
    call.resolve(new JSObject().put("allowed", result.getResultCode() == Activity.RESULT_OK));
  }

  public static final Map<Integer, PluginCall> installSessions = new HashMap<>();

  @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
  public void downloadAndInstall(PluginCall call) {
    call.setKeepAlive(true);
    Context ctx = this.getContext().getApplicationContext();
    String urlString = call.getString("url");

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
      PendingIntent.FLAG_UPDATE_CURRENT
    );

    session.commit(pi.getIntentSender());
    session.close();

    call.resolve(new JSObject().put("done", false).put("progress", 100));
  }

}
