package org.trailence;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.provider.Settings;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.List;

@CapacitorPlugin(
  name = "BackgroundGeolocation",
  permissions = {
    @Permission(strings = {Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, alias = BackgroundGeolocation.LOCATION_ALIAS),
    @Permission(strings = {Manifest.permission.ACCESS_COARSE_LOCATION}, alias = BackgroundGeolocation.COARSE_LOCATION_ALIAS)
  },
  requestCodes = { 28351 }
)
public class BackgroundGeolocation extends Plugin {
  public static final String LOCATION_ALIAS = "location";
  public static final String COARSE_LOCATION_ALIAS = "coarseLocation";

  private PluginCall callPendingPermissions = null;
  private BackgroundGeolocationService.LocalBinder service = null;
  private Boolean stoppedWithoutPermissions = false;

  @PluginMethod
  @Override
  public void checkPermissions(PluginCall call) {
    checkLocationState(call, () -> super.checkPermissions(call));
  }

  @PluginMethod
  @Override
  public void requestPermissions(PluginCall call) {
    checkLocationState(call, () -> super.requestPermissions(call));
  }

  private void checkLocationState(PluginCall call, Runnable onLocationEnabled) {
    if (isLocationEnabled(getContext()))
      onLocationEnabled.run();
    else
      call.reject("Location services disabled.", "NOT_AUTHORIZED");
  }

  @PluginMethod
  public void getCurrentPosition(PluginCall call) {
    LocationManager locationManager = (LocationManager)getContext().getSystemService(Context.LOCATION_SERVICE);
    String provider = LocationManager.GPS_PROVIDER;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      provider = locationManager.hasProvider(LocationManager.FUSED_PROVIDER) ? LocationManager.FUSED_PROVIDER : LocationManager.GPS_PROVIDER;
      Long timeout = call.getLong("timeout");
      if (timeout == null) timeout = 1000L;
      LocationRequest request = new LocationRequest.Builder(timeout).build();
      try {
        locationManager.getCurrentLocation(provider, request, null, ContextCompat.getMainExecutor(getContext()), location -> {
          //Logger.info(">>> GetCurrentPosition = " + location);
          if (location != null && System.currentTimeMillis() - location.getTime() < 60000)
            call.resolve(formatLocation(location));
          else
            call.reject("Location not available");
        });
        return;
      } catch (SecurityException e) {}
    }
    try {
      locationManager.requestSingleUpdate(provider, new LocationListener() {
        @Override
        public void onLocationChanged(@NonNull Location location) {
          call.resolve(formatLocation(location));
        }
        @Override
        public void onProviderDisabled(@NonNull String provider) {
          call.reject("Location not available");
        }
        @Override
        public void onProviderEnabled(@NonNull String provider) {
        }
        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {
        }
        @Override
        public void onFlushComplete(int requestCode) {
        }
        @Override
        public void onLocationChanged(@NonNull List<Location> locations) {
          final int size = locations.size();
          for (int i = 0; i < size; i++) {
            onLocationChanged(locations.get(i));
          }
        }
      }, null);
    } catch (SecurityException e) {}
  }

  private void fetchLastLocation(PluginCall call) {
    LocationManager locationManager = (LocationManager)getContext().getSystemService(Context.LOCATION_SERVICE);
    Location lastKnownGps = null;
    try { lastKnownGps = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER); } catch (SecurityException | IllegalArgumentException e) {}
    if (lastKnownGps != null && System.currentTimeMillis() - lastKnownGps.getTime() < 30000) {
      call.resolve(formatLocation(lastKnownGps));
      return;
    }
    Location lastKnownFused = null;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        lastKnownFused = locationManager.getLastKnownLocation(LocationManager.FUSED_PROVIDER);
      } catch (SecurityException | IllegalArgumentException e) {}
    }
    if (lastKnownFused == null) {
      if (lastKnownGps != null) {
        call.resolve(formatLocation(lastKnownGps));
      }
    } else {
      if (lastKnownGps == null || lastKnownGps.getTime() >= lastKnownFused.getTime()) {
        call.resolve(formatLocation(lastKnownFused));
      } else {
        call.resolve(formatLocation(lastKnownGps));
      }
    }
  }

  @PluginMethod(returnType=PluginMethod.RETURN_CALLBACK)
  public void addWatcher(final PluginCall call) {
    if (service == null) {
        call.reject("Service not running.");
        return;
    }
    call.setKeepAlive(true);
    if (getPermissionState(LOCATION_ALIAS) != PermissionState.GRANTED) {
      if (call.getBoolean("requestPermissions", true)) {
        requestPermissionForAlias(LOCATION_ALIAS, call, "locationPermissionsCallback");
      } else {
        call.reject("Permission denied.", "NOT_AUTHORIZED");
      }
    } else if (!isLocationEnabled(getContext())) {
      call.reject("Location services disabled.", "NOT_AUTHORIZED");
    }
    if (call.getBoolean("stale", false)) {
      fetchLastLocation(call);
    }
    Notification backgroundNotification = null;
    String backgroundMessage = call.getString("backgroundMessage");
    if (backgroundMessage != null) {
      Notification.Builder builder = new Notification.Builder(getContext())
        .setContentTitle(call.getString("backgroundTitle","Using your location"))
        .setOngoing(true)
        .setPriority(Notification.PRIORITY_HIGH)
        .setWhen(System.currentTimeMillis());
      if (!backgroundMessage.isEmpty())
        builder = builder.setContentText(backgroundMessage);

      try {
        String name = getAppString("capacitor_background_geolocation_notification_icon","drawable/trailence");
        String[] parts = name.split("/");
        // It is actually necessary to set a valid icon for the notification to behave
        // correctly when tapped. If there is no icon specified, tapping it will open the
        // app's settings, rather than bringing the application to the foreground.
        builder.setSmallIcon(getAppResourceIdentifier(parts[1], parts[0]));
      } catch (Exception e) {
        Logger.error("Could not set notification icon", e);
      }

      try {
        String color = getAppString("capacitor_background_geolocation_notification_color",null);
        if (color != null) {
          builder.setColor(Color.parseColor(color));
        }
      } catch (Exception e) {
        Logger.error("Could not set notification color", e);
      }

      Intent launchIntent = getContext().getPackageManager().getLaunchIntentForPackage(getContext().getPackageName());
      if (launchIntent != null) {
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        builder.setContentIntent(
          PendingIntent.getActivity(
            getContext(),
            0,
            launchIntent,
            PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE
          )
        );
      }

      // Set the Channel ID for Android O.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          builder.setChannelId(BackgroundGeolocationService.class.getPackage().getName());
      }

      backgroundNotification = builder.build();
    }
    service.addWatcher(
      call.getCallbackId(),
      backgroundNotification,
      call.getFloat("distanceFilter", 0f)
    );
  }

  @PermissionCallback
  private void locationPermissionsCallback(PluginCall call) {
    if (getPermissionState(LOCATION_ALIAS) != PermissionState.GRANTED) {
      call.reject("User denied location permission", "NOT_AUTHORIZED");
      return;
    }
    if (call.getBoolean("stale", false)) {
      fetchLastLocation(call);
    }
    if (service != null) {
      service.onPermissionsGranted();
      // The handleOnResume method will now be called, and we don't need it to call
      // service.onPermissionsGranted again so we reset this flag.
      stoppedWithoutPermissions = false;
    }
  }

  @PluginMethod()
  public void removeWatcher(PluginCall call) {
    String callbackId = call.getString("id");
    if (callbackId == null) {
      call.reject("Missing id.");
      return;
    }
    if (service != null)
      service.removeWatcher(callbackId);
    PluginCall savedCall = bridge.getSavedCall(callbackId);
    if (savedCall != null) {
      savedCall.release(bridge);
    }
    call.resolve();
  }

  @PluginMethod()
  public void openSettings(PluginCall call) {
    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
    Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
    intent.setData(uri);
    getContext().startActivity(intent);
    call.resolve();
  }

  // Checks if device-wide location services are disabled
  private static Boolean isLocationEnabled(Context context)
  {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
      return lm != null && lm.isLocationEnabled();
    } else {
      return Settings.Secure.getInt(context.getContentResolver(), Settings.Secure.LOCATION_MODE, Settings.Secure.LOCATION_MODE_OFF) != Settings.Secure.LOCATION_MODE_OFF;
    }
  }

  private static JSObject formatLocation(Location location) {
    JSObject obj = new JSObject();
    obj.put("latitude", location.getLatitude());
    obj.put("longitude", location.getLongitude());
    // The docs state that all Location objects have an accuracy, but then why is there a
    // hasAccuracy method? Better safe than sorry.
    obj.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
    obj.put("altitude", location.hasAltitude() ? location.getAltitude() : JSONObject.NULL);
    if (Build.VERSION.SDK_INT >= 26 && location.hasVerticalAccuracy()) {
      obj.put("altitudeAccuracy", location.getVerticalAccuracyMeters());
    } else {
      obj.put("altitudeAccuracy", JSONObject.NULL);
    }
    // In addition to mocking locations in development, Android allows the
    // installation of apps which have the power to simulate location
    // readings in other apps.
    obj.put("simulated", location.isFromMockProvider());
    obj.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
    obj.put("bearing", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
    obj.put("time", location.getTime());
    return obj;
  }

  // Receives messages from the service.
  private class ServiceReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
      String id = intent.getStringExtra("id");
      PluginCall call = bridge.getSavedCall(id);
      if (call == null) return;
      Location location = intent.getParcelableExtra("location");
      Logger.debug("location broadcast received: " + location);
      if (location != null) {
        call.resolve(formatLocation(location));
      } else {
        call.reject("Location not available");
      }
    }
  }

  // Gets the identifier of the app's resource by name, returning 0 if not found.
  private int getAppResourceIdentifier(String name, String defType) {
    return getContext().getResources().getIdentifier(
      name,
      defType,
      getContext().getPackageName()
    );
  }

  // Gets a string from the app's strings.xml file, resorting to a fallback if it is not defined.
  private String getAppString(String name, String fallback) {
    int id = getAppResourceIdentifier(name, "string");
    return id == 0 ? fallback : getContext().getString(id);
  }

  @Override
  public void load() {
    super.load();

    // Android O requires a Notification Channel.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
      NotificationChannel channel = new NotificationChannel(
        BackgroundGeolocationService.class.getPackage().getName(),
        getAppString("capacitor_background_geolocation_notification_channel_name","Background Tracking"),
        NotificationManager.IMPORTANCE_DEFAULT
      );
      channel.enableLights(false);
      channel.enableVibration(false);
      channel.setSound(null, null);
      manager.createNotificationChannel(channel);
    }

    this.getContext().bindService(
      new Intent(this.getContext(), BackgroundGeolocationService.class),
      new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
          BackgroundGeolocation.this.service = (BackgroundGeolocationService.LocalBinder) binder;
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
        }
      },
      Context.BIND_AUTO_CREATE
    );

    LocalBroadcastManager.getInstance(this.getContext()).registerReceiver(
      new ServiceReceiver(),
      new IntentFilter(BackgroundGeolocationService.ACTION_BROADCAST)
    );
  }

  @Override
  protected void handleOnResume() {
    if (service != null) {
      if (stoppedWithoutPermissions && hasRequiredPermissions()) {
        service.onPermissionsGranted();
      }
    }
    super.handleOnResume();
  }

  @Override
  protected void handleOnPause() {
    stoppedWithoutPermissions = !hasRequiredPermissions();
    super.handleOnPause();
  }

  @Override
  protected void handleOnDestroy() {
    if (service != null) {
      service.stopService();
    }
    super.handleOnDestroy();
  }
}
