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

import java.io.OutputStream;
import java.util.Base64;

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

  @PluginMethod()
  public void saveFile(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType(call.getString("type"));
    intent.putExtra(Intent.EXTRA_TITLE, call.getString("filename"));
    String contentBase64 = call.getString("data");
    startActivityForResult(call, intent, "saveFileCallback");
  }

  @ActivityCallback
  private void saveFileCallback(PluginCall call, ActivityResult result) {
    if (call == null) {
      return;
    }

    if (result.getResultCode() == Activity.RESULT_OK) {
      try (OutputStream out = this.getContext().getContentResolver().openOutputStream(result.getData().getData())) {
        out.write(Base64.getDecoder().decode(call.getString("data")));
        call.resolve(new JSObject().put("saved", true));
      } catch (Exception e) {
        e.printStackTrace();
        call.reject(e.getMessage());
      }
    } else {
      call.resolve(new JSObject().put("saved", false));
    }
  }

}
