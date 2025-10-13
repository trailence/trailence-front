package org.trailence.camera;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@CapacitorPlugin(
    name = "Camera",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = CameraPlugin.CAMERA),
        // SDK VERSIONS 29 AND BELOW
        @Permission(
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE },
            alias = CameraPlugin.SAVE_GALLERY
        ),
        /*
        SDK VERSIONS 30-32
        This alias is a placeholder and the SAVE_GALLERY alias will be updated to use this permission
        so that the end user does not need to explicitly use separate aliases depending
        on the SDK version.
         */
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = CameraPlugin.READ_EXTERNAL_STORAGE)
    }
)
public class CameraPlugin extends Plugin {

    // Permission alias constants
    static final String CAMERA = "camera";
    static final String SAVE_GALLERY = "saveGallery";
    static final String READ_EXTERNAL_STORAGE = "readExternalStorage";

    // Message constants
    private static final String INVALID_RESULT_TYPE_ERROR = "Invalid resultType option";
    private static final String PERMISSION_DENIED_ERROR_CAMERA = "User denied access to camera";
    private static final String NO_CAMERA_ERROR = "Device doesn't have a camera available";
    private static final String NO_CAMERA_ACTIVITY_ERROR = "Unable to resolve camera activity";
    private static final String IMAGE_FILE_SAVE_ERROR = "Unable to create photo on disk";
    private static final String IMAGE_PROCESS_NO_FILE_ERROR = "Unable to process image, file not found on disk";
    private static final String UNABLE_TO_PROCESS_IMAGE = "Unable to process image";
    private static final String IMAGE_GALLERY_SAVE_ERROR = "Unable to save the image in the gallery";
    private static final String USER_CANCELLED = "User cancelled photos app";

    private String imageFileSavePath;
    private Uri imageFileUri;
    private boolean isFirstRequest = true;
    private boolean isSaved = false;

    private CameraSettings settings = new CameraSettings();

    @Override
    public void load() {
        super.load();
    }

    @PluginMethod
    public void getPhoto(PluginCall call) {
        settings = getSettings(call);
      showCamera(call);
    }


    private void showCamera(final PluginCall call) {
        if (!getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            call.reject(NO_CAMERA_ERROR);
            return;
        }
        openCamera(call);
    }

    private boolean checkCameraPermissions(PluginCall call) {
        // if the manifest does not contain the camera permissions key, we don't need to ask the user
        boolean needCameraPerms = isPermissionDeclared(CAMERA);
        boolean hasCameraPerms = !needCameraPerms || getPermissionState(CAMERA) == PermissionState.GRANTED;
        boolean hasGalleryPerms = getPermissionState(SAVE_GALLERY) == PermissionState.GRANTED;

        // If we want to save to the gallery, we need two permissions
        // actually we only need permissions to save to gallery for Android <= 9 (API 28)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // we might still need to request permission for the camera
            if (!hasCameraPerms) {
                requestPermissionForAlias(CAMERA, call, "cameraPermissionsCallback");
                return false;
            }
            return true;
        }

        // we need to request permissions to save to gallery for Android <= 9
        if (settings.isSaveToGallery() && !(hasCameraPerms && hasGalleryPerms) && isFirstRequest) {
            isFirstRequest = false;
            String[] aliases;
            if (needCameraPerms) {
                aliases = new String[] { CAMERA, SAVE_GALLERY };
            } else {
                aliases = new String[] { SAVE_GALLERY };
            }
            requestPermissionForAliases(aliases, call, "cameraPermissionsCallback");
            return false;
        }
        // If we don't need to save to the gallery, we can just ask for camera permissions
        else if (!hasCameraPerms) {
            requestPermissionForAlias(CAMERA, call, "cameraPermissionsCallback");
            return false;
        }
        return true;
    }

    /**
     * Completes the plugin call after a camera permission request
     *
     * @see #getPhoto(PluginCall)
     * @param call the plugin call
     */
    @PermissionCallback
    private void cameraPermissionsCallback(PluginCall call) {
        if (settings.getSource() == CameraSource.CAMERA && getPermissionState(CAMERA) != PermissionState.GRANTED) {
            Logger.debug(getLogTag(), "User denied camera permission: " + getPermissionState(CAMERA).toString());
            call.reject(PERMISSION_DENIED_ERROR_CAMERA);
            return;
        }
        showCamera(call);
    }

    @Override
    protected void requestPermissionForAliases(@NonNull String[] aliases, @NonNull PluginCall call, @NonNull String callbackName) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            for (int i = 0; i < aliases.length; i++) {
                if (aliases[i].equals(SAVE_GALLERY)) {
                    aliases[i] = READ_EXTERNAL_STORAGE;
                }
            }
        }
        super.requestPermissionForAliases(aliases, call, callbackName);
    }

    private CameraSettings getSettings(PluginCall call) {
        CameraSettings settings = new CameraSettings();
        settings.setResultType(getResultType(call.getString("resultType")));
        settings.setSaveToGallery(call.getBoolean("saveToGallery", CameraSettings.DEFAULT_SAVE_IMAGE_TO_GALLERY));
        settings.setAllowEditing(call.getBoolean("allowEditing", false));
        settings.setQuality(call.getInt("quality", CameraSettings.DEFAULT_QUALITY));
        settings.setWidth(call.getInt("width", 0));
        settings.setHeight(call.getInt("height", 0));
        settings.setShouldResize(settings.getWidth() > 0 || settings.getHeight() > 0);
        settings.setShouldCorrectOrientation(call.getBoolean("correctOrientation", CameraSettings.DEFAULT_CORRECT_ORIENTATION));
        try {
            settings.setSource(CameraSource.valueOf(call.getString("source", CameraSource.CAMERA.getSource())));
        } catch (IllegalArgumentException ex) {
            settings.setSource(CameraSource.CAMERA);
        }
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        if (latitude != null && longitude != null)
          settings.setGeolocation(latitude, longitude);
        return settings;
    }

    private CameraResultType getResultType(String resultType) {
        if (resultType == null) {
            return null;
        }
        try {
            return CameraResultType.valueOf(resultType.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            Logger.debug(getLogTag(), "Invalid result type \"" + resultType + "\", defaulting to base64");
            return CameraResultType.BASE64;
        }
    }

    public void openCamera(final PluginCall call) {
        if (checkCameraPermissions(call)) {
            Intent takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (takePictureIntent.resolveActivity(getContext().getPackageManager()) != null) {
                // If we will be saving the photo, send the target file along
                try {
                    String appId = getAppId();
                    File photoFile = CameraUtils.createImageFile(getActivity());
                    imageFileSavePath = photoFile.getAbsolutePath();
                    // TODO: Verify provider config exists
                    imageFileUri = FileProvider.getUriForFile(getActivity(), appId + ".fileprovider", photoFile);
                    takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, imageFileUri);
                } catch (Exception ex) {
                    call.reject(IMAGE_FILE_SAVE_ERROR, ex);
                    return;
                }

                startActivityForResult(call, takePictureIntent, "processCameraImage");
            } else {
                call.reject(NO_CAMERA_ACTIVITY_ERROR);
            }
        }
    }

    @ActivityCallback
    public void processCameraImage(PluginCall call, ActivityResult result) {
        settings = getSettings(call);
        if (imageFileSavePath == null) {
            call.reject(IMAGE_PROCESS_NO_FILE_ERROR);
            return;
        }
        // Load the image as a Bitmap
        File f = new File(imageFileSavePath);
        BitmapFactory.Options bmOptions = new BitmapFactory.Options();
        Uri contentUri = Uri.fromFile(f);
        Bitmap bitmap = BitmapFactory.decodeFile(imageFileSavePath, bmOptions);

        if (bitmap == null) {
            call.reject(USER_CANCELLED);
            return;
        }

        returnResult(call, bitmap, contentUri);
    }

    private Uri saveImage(Uri uri, InputStream is) throws IOException {
        File outFile = null;
        if ("content".equals(uri.getScheme())) {
            outFile = getTempFile(uri);
        } else {
            outFile = new File(uri.getPath());
        }
        try {
            writePhoto(outFile, is);
        } catch (FileNotFoundException ex) {
            // Some gallery apps return read only file url, create a temporary file for modifications
            outFile = getTempFile(uri);
            writePhoto(outFile, is);
        }
        return Uri.fromFile(outFile);
    }

    private void writePhoto(File outFile, InputStream is) throws IOException {
        FileOutputStream fos = new FileOutputStream(outFile);
        byte[] buffer = new byte[1024];
        int len;
        while ((len = is.read(buffer)) != -1) {
            fos.write(buffer, 0, len);
        }
        fos.close();
    }

    private File getTempFile(Uri uri) {
        String filename = Uri.parse(Uri.decode(uri.toString())).getLastPathSegment();
        if (!filename.contains(".jpg") && !filename.contains(".jpeg")) {
            filename += "." + (new java.util.Date()).getTime() + ".jpeg";
        }
        File cacheDir = getContext().getCacheDir();
        return new File(cacheDir, filename);
    }

    private void returnResult(PluginCall call, Bitmap bitmap, Uri u) {
        ExifWrapper exif = ImageUtils.getExifData(getContext(), bitmap, u);
        try {
            bitmap = prepareBitmap(bitmap, u, exif);
        } catch (IOException e) {
            call.reject(UNABLE_TO_PROCESS_IMAGE);
            return;
        }
        // Compress the final image and prepare for output to client
        ByteArrayOutputStream bitmapOutputStream = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, settings.getQuality(), bitmapOutputStream);

        boolean saveToGallery = call.getBoolean("saveToGallery", CameraSettings.DEFAULT_SAVE_IMAGE_TO_GALLERY);
        if (saveToGallery && imageFileSavePath != null) {
            isSaved = true;
            try {
                String fileToSavePath = imageFileSavePath;
                File fileToSave = new File(fileToSavePath);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContext().getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileToSave.getName());
                    values.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DCIM);

                    final Uri contentUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                    Uri uri = resolver.insert(contentUri, values);

                    if (uri == null) {
                        throw new IOException("Failed to create new MediaStore record.");
                    }

                    OutputStream stream = resolver.openOutputStream(uri);
                    if (stream == null) {
                        throw new IOException("Failed to open output stream.");
                    }

                    boolean inserted = bitmap.compress(Bitmap.CompressFormat.JPEG, settings.getQuality(), stream);
                    stream.close();

                    if (!inserted) {
                        isSaved = false;
                    } else if (settings.hasGeolocation()) {
                      try {
                        ParcelFileDescriptor pfd = resolver.openFileDescriptor(uri, "rw");
                        if (pfd != null) {
                          FileDescriptor fd = pfd.getFileDescriptor();
                          new ExifWrapper(new ExifInterface(fd)).setGeolocation(settings.getLatitude(), settings.getLongitude());
                          pfd.close();
                        }
                      } catch (Exception e) {
                        Logger.error("Cannot save GPS location", e);
                      }
                    }
                } else {
                    String inserted = MediaStore.Images.Media.insertImage(
                        getContext().getContentResolver(),
                        fileToSavePath,
                        fileToSave.getName(),
                        ""
                    );

                    if (inserted == null) {
                        isSaved = false;
                    }
                }
            } catch (IOException e) {
                isSaved = false;
                Logger.error(getLogTag(), IMAGE_GALLERY_SAVE_ERROR, e);
            }
        }

        if (settings.getResultType() == CameraResultType.BASE64) {
            returnBase64(call, exif, bitmapOutputStream);
        } else {
            call.reject(INVALID_RESULT_TYPE_ERROR);
        }
        // Result returned, clear stored paths and images
        if (isSaved) {
            deleteImageFile();
        }
        imageFileSavePath = null;
        imageFileUri = null;
    }

    private void deleteImageFile() {
        if (imageFileSavePath != null) {
            File photoFile = new File(imageFileSavePath);
            if (photoFile.exists()) {
                photoFile.delete();
            }
        }
    }

    /**
     * Apply our standard processing of the bitmap, returning a new one and
     * recycling the old one in the process
     * @param bitmap
     * @param imageUri
     * @param exif
     * @return
     */
    private Bitmap prepareBitmap(Bitmap bitmap, Uri imageUri, ExifWrapper exif) throws IOException {
        if (settings.isShouldCorrectOrientation()) {
            final Bitmap newBitmap = ImageUtils.correctOrientation(getContext(), bitmap, imageUri, exif);
            bitmap = replaceBitmap(bitmap, newBitmap);
        }

        if (settings.isShouldResize()) {
            final Bitmap newBitmap = ImageUtils.resize(bitmap, settings.getWidth(), settings.getHeight());
            bitmap = replaceBitmap(bitmap, newBitmap);
        }

        return bitmap;
    }

    private Bitmap replaceBitmap(Bitmap bitmap, final Bitmap newBitmap) {
        if (bitmap != newBitmap) {
            bitmap.recycle();
        }
        bitmap = newBitmap;
        return bitmap;
    }

    private void returnBase64(PluginCall call, ExifWrapper exif, ByteArrayOutputStream bitmapOutputStream) {
        byte[] byteArray = bitmapOutputStream.toByteArray();
        String encoded = Base64.encodeToString(byteArray, Base64.NO_WRAP);

        JSObject data = new JSObject();
        data.put("format", "jpeg");
        data.put("base64String", encoded);
        data.put("exif", exif.toJson());
        call.resolve(data);
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        // If the camera permission is defined in the manifest, then we have to prompt the user
        // or else we will get a security exception when trying to present the camera. If, however,
        // it is not defined in the manifest then we don't need to prompt and it will just work.
        if (isPermissionDeclared(CAMERA)) {
            // just request normally
            super.requestPermissions(call);
        } else {
            // the manifest does not define camera permissions, so we need to decide what to do
            // first, extract the permissions being requested
            JSArray providedPerms = call.getArray("permissions");
            List<String> permsList = null;
            if (providedPerms != null) {
                try {
                    permsList = providedPerms.toList();
                } catch (JSONException e) {}
            }

            if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ||
                (permsList != null && permsList.size() == 1 && permsList.contains(CAMERA))
            ) {
                // either we're on Android 13+ (storage permissions do not apply)
                // or the only thing being asked for was the camera so we can just return the current state
                checkPermissions(call);
            } else {
                requestPermissionForAlias(SAVE_GALLERY, call, "checkPermissions");
            }
        }
    }

    @Override
    public Map<String, PermissionState> getPermissionStates() {
        Map<String, PermissionState> permissionStates = super.getPermissionStates();

        // If Camera is not in the manifest and therefore not required, say the permission is granted
        if (!isPermissionDeclared(CAMERA)) {
            permissionStates.put(CAMERA, PermissionState.GRANTED);
        }

        // If the SDK version is 30 or higher, update the SAVE_GALLERY state to match the READ_EXTERNAL_STORAGE state.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            String alias = READ_EXTERNAL_STORAGE;
            if (permissionStates.containsKey(alias)) {
                permissionStates.put(SAVE_GALLERY, permissionStates.get(alias));
            }
        }

        return permissionStates;
    }

    @Override
    protected Bundle saveInstanceState() {
        Bundle bundle = super.saveInstanceState();
        if (bundle != null) {
            bundle.putString("cameraImageFileSavePath", imageFileSavePath);
        }
        return bundle;
    }

    @Override
    protected void restoreState(Bundle state) {
        String storedImageFileSavePath = state.getString("cameraImageFileSavePath");
        if (storedImageFileSavePath != null) {
            imageFileSavePath = storedImageFileSavePath;
        }
    }
}
