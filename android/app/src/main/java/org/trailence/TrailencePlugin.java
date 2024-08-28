package org.trailence;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

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
  private Map<Integer, SaveFile> saveFiles = new HashMap<>();

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
        try { file.out.close(); } catch (Exception e2) {}
        saveFiles.remove(fileId);
        call.reject("Error while writing file: " + e.getMessage());
        e.printStackTrace();
        return;
      }
    }
    if (Boolean.TRUE.equals(call.getBoolean("isEnd"))) {
      try {
        file.out.close();
        call.resolve(new JSObject().put("success", true));
      } catch (Exception e) {
        e.printStackTrace();
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
      e.printStackTrace();
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
        e.printStackTrace();
        call.reject(e.getMessage());
      }
      /*
      try (OutputStream out = this.getContext().getContentResolver().openOutputStream(result.getData().getData())) {
        out.write(Base64.getDecoder().decode(call.getString("data")));
        call.resolve(new JSObject().put("saved", true));*/
    } else {
      call.resolve(new JSObject().put("id", false));
    }
  }

}
