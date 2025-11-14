package org.trailence;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.util.Pair;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;


@CapacitorPlugin(
  name = "Trailence"
)
public class TrailencePlugin extends Plugin {

  private int idCount = 1;
  private final Map<Integer, SaveFile> saveFiles = new HashMap<>();

  private static class SaveFile {
    private OutputStream out;
  }

  @PluginMethod()
  public void getInfo(PluginCall call) {
    String buildType = null;
    try {
      int id = getContext().getResources().getIdentifier("build_type", "string", getContext().getPackageName());
      if (id > 0)
        buildType = getContext().getResources().getString(id);
    } catch (Throwable t) {}
    String installer = null;
    try {
      installer = getContext().getPackageManager().getInstallerPackageName(getContext().getPackageName());
    } catch (Throwable t) {}
    if (installer == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
      try {
        installer = getContext().getPackageManager().getInstallSourceInfo(getContext().getPackageName()).getInitiatingPackageName();
      } catch (Throwable t) {}
    String deviceModel = Build.MODEL;
    String deviceBrand = Build.MANUFACTURER;
    String deviceName = Build.DEVICE;
    call.resolve(
      new JSObject()
        .put("buildType", buildType)
        .put("installer", installer)
        .put("deviceModel", deviceModel)
        .put("deviceBrand", deviceBrand)
        .put("deviceName", deviceName)
    );
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
            out = new ZipOutputStream(out);
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

  private final LinkedList<Pair<String, List<byte[]>>> filesToImport = new LinkedList<>();
  private PluginCall importFilesListener = null;

  public void addFileToImport(String filename, List<byte[]> content) {
    if (importFilesListener == null)
      this.filesToImport.add(new Pair<>(filename, content));
    else
      this.pushFileToImport(filename, content);
  }

  @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
  public void listenToImportedFiles(PluginCall call) {
    call.setKeepAlive(true);
    this.importFilesListener = call;
    while (!filesToImport.isEmpty()) {
      Pair<String, List<byte[]>> content = filesToImport.removeFirst();
      this.pushFileToImport(content.first, content.second);
    }
  }

  private int pushFileIdCounter = 1;
  private void pushFileToImport(String filename, List<byte[]> content) {
    int id = pushFileIdCounter++;
    this.importFilesListener.resolve(new JSObject().put("fileId", id).put("chunks", content.size()).put("filename", filename));
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

  @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
  public void downloadAndInstall(PluginCall call) {
    call.setKeepAlive(true);
    Context ctx = this.getContext().getApplicationContext();
    String urlString = call.getString("url");
    TrailenceUpdater.update(urlString, ctx, call);
  }

  @PluginMethod
  public void canKeepOnScreenLock(PluginCall call) {
    call.resolve(new JSObject().put("allowed", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1));
  }

  private boolean keepOnScreenLock = false;

  public boolean isKeepOnScreenLock() {
    return keepOnScreenLock;
  }

  @PluginMethod
  public void setKeepOnScreenLock(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      this.keepOnScreenLock = Boolean.TRUE.equals(call.getBoolean("enabled"));
      this.getActivity().setShowWhenLocked(this.keepOnScreenLock);
      call.resolve(new JSObject().put("success", true));
    } else {
      call.resolve(new JSObject().put("success", false));
    }
  }

  @PluginMethod
  public void getKeepOnScreenLock(PluginCall call) {
    call.resolve(new JSObject().put("enabled", this.keepOnScreenLock));
  }

  @PluginMethod
  public void getInsets(PluginCall call) {
    Insets insets = getDeviceInsets(ViewCompat.getRootWindowInsets(this.getBridge().getWebView()), this.getActivity(), this.getContext());
    call.resolve(new JSObject().put("top", insets.top).put("bottom", insets.bottom).put("left", insets.left).put("right", insets.right));
  }

  public static Insets getDeviceInsets(WindowInsetsCompat windowInsets, AppCompatActivity activity, Context ctx) {
    try {
      if (ctx.getApplicationInfo().targetSdkVersion < 35)
        return Insets.of(0, 0, 0, 0);
      Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
      float density = activity.getResources().getDisplayMetrics().density;
      int topInset = (int) (insets.top / density);
      int bottomInset = (int) (insets.bottom / density);
      int leftInset = (int) (insets.left / density);
      int rightInset = (int) (insets.right / density);
      return Insets.of(leftInset, topInset, rightInset, bottomInset);
    } catch (Exception e) {
      Logger.error("Error getting insets", e);
      return Insets.of(0, 0, 0, 0);
    }
  }

  @PluginMethod
  public void canTakePhoto(PluginCall call) {
    call.resolve(new JSObject().put("canTakePhoto", getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)));
  }

  @PluginMethod
  public void share(PluginCall call) {
    String link = call.getString("link");
    if (link == null || link.isBlank()) return;
    Intent shareIntent = new Intent();
    shareIntent.setAction(Intent.ACTION_SEND);
    shareIntent.putExtra(Intent.EXTRA_TEXT, link);
    shareIntent.setType("text/plain");
    String title = call.getString("title");
    if (title != null && !title.isBlank())
      shareIntent.putExtra(Intent.EXTRA_TITLE, title);
    getContext().startActivity(Intent.createChooser(shareIntent, null));
    call.resolve();
  }

  @PluginMethod
  public void exitApp(PluginCall call) {
    this.getActivity().finishAndRemoveTask();
  }
}
