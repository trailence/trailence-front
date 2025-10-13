package org.trailence.camera;

public enum CameraSource {
    CAMERA("CAMERA");

    private String source;

    CameraSource(String source) {
        this.source = source;
    }

    public String getSource() {
        return this.source;
    }
}
