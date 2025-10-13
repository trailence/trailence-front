package org.trailence.camera;

public enum CameraResultType {
    BASE64("base64");

    private String type;

    CameraResultType(String type) {
        this.type = type;
    }

    public String getType() {
        return type;
    }
}
