package org.trailence;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(TrailencePlugin.class);
    registerPlugin(BackgroundGeolocation.class);
    super.onCreate(savedInstanceState);
  }
}
