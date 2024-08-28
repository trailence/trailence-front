package org.trailence;

import com.getcapacitor.BridgeActivity;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

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
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    this.checkForOpenFile(intent);
  }

  private void checkForOpenFile(Intent intent) {
    Uri fileUri = intent.getData();
    if (fileUri != null) {
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
        e.printStackTrace();
      }
      if (!content.isEmpty()) {
        ((TrailencePlugin) this.getBridge().getPlugin("Trailence").getInstance()).addFileToImport(content);
      }
    }
  }
}
