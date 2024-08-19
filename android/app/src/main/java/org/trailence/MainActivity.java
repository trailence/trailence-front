package org.trailence;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(TrailencePlugin.class);
    registerPlugin(BackgroundGeolocation.class);
    super.onCreate(savedInstanceState);
    WebView.setWebContentsDebuggingEnabled(true);
  }
}
