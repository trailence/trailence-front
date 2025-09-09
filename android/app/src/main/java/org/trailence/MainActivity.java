package org.trailence;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.InputStream;
import java.util.LinkedList;
import java.util.List;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(TrailencePlugin.class);
    registerPlugin(BackgroundGeolocation.class);
    super.onCreate(savedInstanceState);
    WebView.setWebContentsDebuggingEnabled(true);
    this.getBridge().getWebView().setLongClickable(true);
    this.getBridge().getWebView().setOnLongClickListener(v -> true);
    ViewCompat.setOnApplyWindowInsetsListener(this.getBridge().getWebView(), (v, windowInsets) -> {
      try {
        Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
        float density = getResources().getDisplayMetrics().density;
        int topInset = (int) (insets.top / density);
        int bottomInset = (int) (insets.bottom / density);
        int leftInset = (int) (insets.left / density);
        int rightInset = (int) (insets.right / density);
        String js =
            "document.documentElement.style.setProperty('--device-margin-top', '" + topInset + "px');" +
            "document.documentElement.style.setProperty('--device-margin-bottom', '" + bottomInset + "px');" +
            "document.documentElement.style.setProperty('--device-margin-left', '" + leftInset + "px');" +
            "document.documentElement.style.setProperty('--device-margin-right', '" + rightInset + "px');";
        bridge.getWebView().evaluateJavascript(js, null);
      } catch (Exception e) {
        Logger.error("Error setting insets", e);
      }
      return WindowInsetsCompat.CONSUMED;
    });
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    this.checkForOpenFile(intent);
  }

  private void checkForOpenFile(Intent intent) {
    Uri fileUri = intent.getData();
    if (fileUri != null && !intent.getBooleanExtra("consumed", false)) {
      String filename = this.getFileName(fileUri);
      List<byte[]> content = new LinkedList<>();
      try (InputStream in = this.getContentResolver().openInputStream(fileUri)) {
        do {
          byte[] buffer = new byte[8192];
          int pos = 0;
          do {
            int nb = in.read(buffer, pos, buffer.length - pos);
            if (nb <= 0) break;
            pos += nb;
          } while (pos < buffer.length);
          if (pos < buffer.length) {
            if (pos > 0) {
              byte[] n = new byte[pos];
              System.arraycopy(buffer, 0, n, 0, pos);
              content.add(n);
            }
            break;
          }
          content.add(buffer);
        } while (true);
      } catch (Exception e) {
        Logger.error("Error reading file from intent", e);
      }
      if (!content.isEmpty()) {
        ((TrailencePlugin) this.getBridge().getPlugin("Trailence").getInstance()).addFileToImport(filename, content);
        intent.putExtra("consumed", true);
      }
    }
  }

  private String getFileName(Uri uri) {
    try (Cursor c = this.getContentResolver().query(uri, new String[]{"_data", "title", "_display_name"}, null, null, null)) {
      c.moveToFirst();
      int i = c.getColumnIndex("_display_name");
      if (i >= 0) {
        String filename = c.getString(i);
        if (filename != null && !filename.isEmpty()) return filename;
      }
      i = c.getColumnIndex("_data");
      if (i >= 0) {
        String path = c.getString(i);
        if (path != null && !path.isEmpty()) {
          int j = path.lastIndexOf('/');
          if (j >= 0) path = path.substring(j + 1);
          if (!path.isEmpty()) return path;
        }
      }
      i = c.getColumnIndex("title");
      if (i >= 0) {
        String filename = c.getString(i);
        if (filename != null && !filename.isEmpty()) return filename;
      }
    } catch (Exception e) {
      // ignore
    }
    return null;
  }

}
