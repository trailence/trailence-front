package org.trailence;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.GnssMeasurementsEvent;
import android.location.GnssStatus;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationRequest;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.Logger;

import java.util.HashSet;
import java.util.List;
import java.util.Timer;
import java.util.TimerTask;

// A bound and started service that is promoted to a foreground service
// (showing a persistent notification) when the first background watcher is
// added, and demoted when the last background watcher is removed.
public class BackgroundGeolocationService extends Service {
  static final String ACTION_BROADCAST = BackgroundGeolocationService.class.getPackage().getName() + ".broadcast";
  private final IBinder binder = new LocalBinder();

  // Must be unique for this application.
  private static final int NOTIFICATION_ID = 28351;


  private HashSet<GeolocationWatcher> watchers = new HashSet<>();

  @Override
  public IBinder onBind(Intent intent) {
      return binder;
  }

  // Some devices allow a foreground service to outlive the application's main
  // activity, leading to nasty crashes as reported in issue #59. If we learn
  // that the application has been killed, all watchers are stopped and the
  // service is terminated immediately.
  @Override
  public boolean onUnbind(Intent intent) {
    for (GeolocationWatcher watcher : watchers) {
      watcher.stop();
    }
    watchers = new HashSet<>();
    stopSelf();
    return false;
  }

  Notification getNotification() {
    for (GeolocationWatcher watcher : watchers) {
      if (watcher.getBackgroundNotification() != null) {
        return watcher.getBackgroundNotification();
      }
    }
    return null;
  }

  // Handles requests from the activity.
  public class LocalBinder extends Binder {
    void addWatcher(final String id, Notification backgroundNotification, float distanceFilter) {
      LocationManager locationManager = (LocationManager)getSystemService(Context.LOCATION_SERVICE);

      GeolocationWatcher watcher = new GeolocationWatcher(id, locationManager, getApplicationContext(), backgroundNotification, distanceFilter, 1000, 5000, location -> {
        //Logger.info("Geolocation: " + location);
        Intent intent = new Intent(ACTION_BROADCAST);
        if (location != null)
          intent.putExtra("location", location);
        intent.putExtra("id", id);
        LocalBroadcastManager.getInstance(
          getApplicationContext()
        ).sendBroadcast(intent);
      });
      watchers.add(watcher);
      watcher.start();

      // Promote the service to the foreground if necessary.
      // Ideally we would only call 'startForeground' if the service is not already
      // foregrounded. Unfortunately, 'getForegroundServiceType' was only introduced
      // in API level 29 and seems to behave weirdly, as reported in #120. However,
      // it appears that 'startForeground' is idempotent, so we just call it repeatedly
      // each time a background watcher is added.
      if (backgroundNotification != null) {
        try {
          // This method has been known to fail due to weird
          // permission bugs, so we prevent any exceptions from
          // crashing the app. See issue #86.
          startForeground(NOTIFICATION_ID, backgroundNotification);
        } catch (Exception exception) {
          Logger.error("Failed to foreground service", exception);
        }
      }
    }

    void removeWatcher(String id) {
      for (GeolocationWatcher watcher : watchers) {
        if (watcher.getId().equals(id)) {
          watcher.stop();
          watchers.remove(watcher);
          if (getNotification() == null) {
            stopForeground(true);
          }
          return;
        }
      }
    }

    void onPermissionsGranted() {
      // If permissions were granted while the app was in the background, for example in
      // the Settings app, the watchers need restarting.
      for (GeolocationWatcher watcher : watchers) {
        watcher.stop();
        watcher.start();
      }
    }

    void stopService() {
      BackgroundGeolocationService.this.stopSelf();
    }
  }
}
