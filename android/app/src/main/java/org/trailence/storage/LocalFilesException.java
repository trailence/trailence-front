package org.trailence.storage;

import com.getcapacitor.PluginCall;

public class LocalFilesException extends Exception {

  public enum Code {
    INVALID_INPUT("invalid-input"),
    INVALID_ID("invalid-id"),
    NOT_FOUND("not-found");

    Code(String code) {
      this.code = code;
    }
    private String code;
    public String getCode() { return code; }
  }

  public LocalFilesException(Code code, String message) {
    super(message);
    this.code = code;
  }

  private final Code code;

  public Code getCode() { return code; }
  public String getErrorCode() { return code.getCode(); }

  public void reject(PluginCall call) {
    call.reject(getMessage(), getErrorCode());
  }

}
