package org.trailence;

import com.getcapacitor.PluginCall;

import java.io.Closeable;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;

public class Utils {

  public static byte[] readNBytes(InputStream in, int n) throws IOException {
    byte[] buffer = new byte[n];
    int done = 0;
    while (done < n) {
      int nb = in.read(buffer, done, n - done);
      if (nb <= 0) throw new EOFException();
      done += nb;
    }
    return buffer;
  }

  public static void silentClose(Closeable resource) {
    try {
      resource.close();
    } catch (Exception e) {
      // silent
    }
  }

  public static void reject(PluginCall call, Exception e) {
    call.reject(e.getMessage(), "error-" + e.getClass().getSimpleName());
  }

}
