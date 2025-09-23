package org.trailence;

import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationRequest;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.Logger;

import java.util.List;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

public class GeolocationWatcher {
  public GeolocationWatcher(String id, LocationManager client, Context context, Notification backgroundNotification, float distanceFilter, long minTimeMs, long timerIntervalMs, Consumer<Location> listener) {
    this.id = id;
    this.client = client;
    this.context = context;
    this.backgroundNotification = backgroundNotification;
    this.distanceFilter = distanceFilter;
    this.listener = listener;
    this.minTimeMs = minTimeMs;
    this.timerIntervalMs = timerIntervalMs;
  }
  private final String id;
  private final LocationManager client;
  private final Context context;
  private final Notification backgroundNotification;
  private final float distanceFilter;
  private final Consumer<Location> listener;
  private final long minTimeMs;
  private final long timerIntervalMs;
  private Timer timer;
  private LocationListener locationListener;

  public String getId() {
    return id;
  }

  public Notification getBackgroundNotification() {
    return backgroundNotification;
  }

  public void start() {
    try {
      AtomicLong lastReceived = new AtomicLong(System.currentTimeMillis());
      locationListener = new LocationListener() {
        @Override
        public void onLocationChanged(@NonNull Location location) {
          //Logger.info(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> location changed: " + location);
          lastReceived.set(System.currentTimeMillis());
          listener.accept(location);
        }
        @Override
        public void onProviderDisabled(@NonNull String provider) {
          //Logger.info(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> provider disabled: " + provider);
          lastReceived.set(0L);
          listener.accept(null);
        }
        @Override
        public void onProviderEnabled(@NonNull String provider) {
          //Logger.info(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> provider enabled: " + provider);
        }
        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {
          //Logger.info(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> status changed: " + provider + " status = " + status + " extras = " + extras);
        }
        @Override
        public void onFlushComplete(int requestCode) {
          //Logger.info(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> flush complete: " + requestCode);
        }
        @Override
        public void onLocationChanged(@NonNull List<Location> locations) {
          final int size = locations.size();
          //Logger.info(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> location changed multiple: " + size);
          for (int i = 0; i < size; i++) {
            onLocationChanged(locations.get(i));
          }
        }
      };
      client.requestLocationUpdates(
        LocationManager.GPS_PROVIDER,
        minTimeMs,
        distanceFilter,
        locationListener
      );
      timer = new Timer();
      AtomicBoolean loopPrepared = new AtomicBoolean(false);
      TimerTask task = new TimerTask() {
        @Override
        public void run() {
          //Logger.info(">>>>>>>>> TIMER " + lastReceived.get() + " // " + (System.currentTimeMillis() - lastReceived.get()));
          if (lastReceived.get() == 0L || System.currentTimeMillis() - lastReceived.get() < timerIntervalMs) return;
          try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
              LocationRequest request = new LocationRequest.Builder(timerIntervalMs)
                .setMaxUpdateDelayMillis(timerIntervalMs)
                .setDurationMillis(timerIntervalMs)
                .setMinUpdateIntervalMillis(1000)
                .build();
              client.getCurrentLocation(LocationManager.GPS_PROVIDER, request, null, ContextCompat.getMainExecutor(context), location -> {
                //Logger.info(">>>>>>>>>>> TIMER location: " + location + " // " + lastReceived.get() + " // " + (System.currentTimeMillis() - lastReceived.get()));
                if (lastReceived.get() == 0L || System.currentTimeMillis() - lastReceived.get() < timerIntervalMs) return;
                if (location == null || System.currentTimeMillis() - location.getTime() > timerIntervalMs) {
                  //Logger.info(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> location not available detected");
                  lastReceived.set(0L);
                  listener.accept(null);
                }
              });
            } else {
              if (lastReceived.get() != 0L && System.currentTimeMillis() - lastReceived.get() > timerIntervalMs * 2) {
                lastReceived.set(0L);
                listener.accept(null);
              }
              if (!loopPrepared.get()) {
                loopPrepared.set(true);
                Looper.prepare();
              }
              client.requestSingleUpdate(LocationManager.GPS_PROVIDER,
                new LocationListener() {
                  @Override
                  public void onLocationChanged(@NonNull Location location) {
                    //Logger.info(">>>>> TIMER onLocationChanged " + location);
                    lastReceived.set(System.currentTimeMillis());
                  }
                  @Override
                  public void onProviderDisabled(@NonNull String provider) {
                    //Logger.info(">>>>> TIMER onProviderDisabled " + provider);
                    lastReceived.set(0L);
                    listener.accept(null);
                  }
                  @Override
                  public void onProviderEnabled(@NonNull String provider) {
                    //Logger.info(">>>>> TIMER onProviderEnabled " + provider);
                  }
                  @Override
                  public void onStatusChanged(String provider, int status, Bundle extras) {
                    //Logger.info(">>>>> TIMER onStatusChanged " + provider + " // " + status + " // " + extras);
                  }
                  @Override
                  public void onFlushComplete(int requestCode) {
                    //Logger.info(">>>>> TIMER onFlushComplete " + requestCode);
                  }
                  @Override
                  public void onLocationChanged(@NonNull List<Location> locations) {
                    //Logger.info(">>>>> TIMER onLocationChanged " + locations.size());
                    if (!locations.isEmpty()) lastReceived.set(System.currentTimeMillis());
                  }
                },
                null
              );
            }
          } catch (SecurityException e) {
          }
        }
      };
      timer.schedule(task, timerIntervalMs, timerIntervalMs);
    } catch (SecurityException ignore) {
    }
  }

  public void stop() {
    if (timer != null) {
      timer.cancel();
      timer = null;
    }
    if (locationListener != null) {
      client.removeUpdates(locationListener);
      locationListener = null;
    }
  }
}
