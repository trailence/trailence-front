package org.trailence.storage;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.trailence.Utils;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(
  name = "LocalFiles"
)
public class LocalFilesPlugin extends Plugin {

  private static final int MAX_DECODED_CHUNK_SIZE = 768 * 1024;
  private File root;
  private final AtomicInteger readId = new AtomicInteger(0);
  private final AtomicInteger writeId = new AtomicInteger(0);

  private static class BinaryRead {
    private final FileInputStream in;
    private final long size;
    private long pos;
    private BinaryRead(FileInputStream in, long size, long pos) {
      this.in = in;
      this.size = size;
      this.pos = pos;
    }
  }
  private static class JsonlRead {
    private final FileInputStream in;
    private final BufferedReader br;
    private JsonlRead(FileInputStream in, BufferedReader br) {
      this.in = in;
      this.br = br;
    }
  }
  private static class BinaryWrite {
    private final File targetFile;
    private final File tempFile;
    private final FileOutputStream out;
    private final long size;
    private long done = 0;
    private BinaryWrite(File targetFile, File tempFile, FileOutputStream out, long size) {
      this.targetFile = targetFile;
      this.tempFile = tempFile;
      this.out = out;
      this.size = size;
    }
  }

  private static class JsonlWrite {
    private final File targetFile;
    private final File tempFile;
    private final FileOutputStream out;
    private final BufferedWriter bw;
    private JsonlWrite(File targetFile, File tempFile, FileOutputStream out, BufferedWriter bw) {
      this.targetFile = targetFile;
      this.tempFile = tempFile;
      this.out = out;
      this.bw = bw;
    }
  }

  private final Map<Integer, BinaryRead> binaryReads = new ConcurrentHashMap<>();
  private final Map<Integer, JsonlRead> jsonlReads = new ConcurrentHashMap<>();
  private final Map<Integer, BinaryWrite> binaryWrites = new ConcurrentHashMap<>();
  private final Map<Integer, JsonlWrite> jsonlWrites = new ConcurrentHashMap<>();

  @Override
  public void load() {
    root = this.getContext().getFilesDir();
  }

  /**
   * Input:
   *  - dir
   *  - filename
   * Output:
   *  - data: base64 encoded chunk
   *  - chunks: number of chunks needed to fully read the file
   *  - id: if chunks > 1 an id to continue reading
   */
  @PluginMethod
  public void readBinaryFile(PluginCall call) {
    FileInputStream in = null;
    try {
      File file = toFile(call);
      if (!file.exists() || !file.isFile())
        throw new LocalFilesException(LocalFilesException.Code.NOT_FOUND, "File not found");
      long size = file.length();
      JSObject response = new JSObject();
      if (size == 0L) {
        response.put("chunks", 0);
        call.resolve(response);
        return;
      }
      int chunks = (int) (size / MAX_DECODED_CHUNK_SIZE);
      if ((size % MAX_DECODED_CHUNK_SIZE) > 0) chunks++;
      response.put("chunks", chunks);
      int chunkSize = (int) Math.min(size, MAX_DECODED_CHUNK_SIZE);
      in = new FileInputStream(file);
      response.put("data", Base64.getEncoder().encodeToString(Utils.readNBytes(in, chunkSize)));
      if (chunks == 1) {
        in.close();
        call.resolve(response);
        return;
      }
      int id = readId.incrementAndGet();
      BinaryRead read = new BinaryRead(in, size, (long) chunkSize);
      binaryReads.put(id, read);
      response.put("id", id);
      call.resolve(response);
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.silentClose(in);
      Utils.reject(call, e);
    }
  }

  /**
   * Input:
   *  - id: from readBinaryFile
   * Output:
   *  - data: base64 encoded chunk
   */
  @PluginMethod
  public void readBinaryFileChunk(PluginCall call) {
    BinaryRead read = null;
    Integer id = null;
    try {
      id = call.getInt("id");
      if (id == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_ID, "Missing id");
      read = binaryReads.get(id);
      if (read == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_ID, "Unknown id");
      JSObject response = new JSObject();
      int chunkSize = (int) Math.min(read.size - read.pos, MAX_DECODED_CHUNK_SIZE);
      response.put("data", Base64.getEncoder().encodeToString(Utils.readNBytes(read.in, chunkSize)));
      read.pos += chunkSize;
      if (read.pos == read.size) {
        Utils.silentClose(read.in);
        binaryReads.remove(id);
      }
      call.resolve(response);
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      if (read != null) Utils.silentClose(read.in);
      binaryReads.remove(id);
      Utils.reject(call, e);
    }
  }


  /**
   * Input:
   *  - dir
   *  - filename
   * Output:
   *  - lines
   *  - id: if more lines need to be read
   */
  @PluginMethod
  public void readJsonlFile(PluginCall call) {
    FileInputStream in = null;
    try {
      File file = toFile(call);
      if (!file.exists() || !file.isFile())
        throw new LocalFilesException(LocalFilesException.Code.NOT_FOUND, "File not found");
      in = new FileInputStream(file);
      InputStreamReader reader = new InputStreamReader(in, StandardCharsets.UTF_8);
      BufferedReader br = new BufferedReader(reader);
      JSObject response = new JSObject();
      boolean done = readLines(br, response);
      if (done) {
        in.close();
        call.resolve(response);
        return;
      }
      int id = readId.incrementAndGet();
      JsonlRead read = new JsonlRead(in, br);
      jsonlReads.put(id, read);
      response.put("id", id);
      call.resolve(response);
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.silentClose(in);
      Utils.reject(call, e);
    }
  }

  /**
   * Input:
   *  - id: from readJsonlFile
   * Output:
   *  - lines
   *  - end: boolean
   */
  @PluginMethod
  public void readBJsonlFileChunk(PluginCall call) {
    JsonlRead read = null;
    Integer id = null;
    try {
      id = call.getInt("id");
      if (id == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_ID, "Missing id");
      read = jsonlReads.get(id);
      if (read == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_ID, "Unknown id");
      JSObject response = new JSObject();
      boolean done = readLines(read.br, response);
      response.put("end", done);
      if (done) {
        Utils.silentClose(read.in);
        jsonlReads.remove(id);
      }
      call.resolve(response);
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      if (read != null) Utils.silentClose(read.in);
      jsonlReads.remove(id);
      Utils.reject(call, e);
    }
  }

  private boolean readLines(BufferedReader in, JSObject response) throws IOException {
    String line;
    int done = 0;
    JSONArray lines = new JSONArray();
    while ((line = in.readLine()) != null && done < 512 * 1024) {
      lines.put(line);
      done += line.length();
    }
    response.put("lines", lines);
    return line == null;
  }

  /**
   * Input:
   *  - dir
   *  - filename
   *  - size: size of data
   * Output:
   *  - id
   *  - maxChunkSize: maximum size of a chunk to send to saveFileChunk
   */
  @PluginMethod
  public void saveBinaryFile(PluginCall call) {
    FileOutputStream out = null;
    try {
      File targetFile = toFile(call);
      Integer size = call.getInt("size");
      if (size == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing size");
      if (size.intValue() == 0) {
        Files.deleteIfExists(targetFile.toPath());
        targetFile.createNewFile();
        call.resolve(new JSObject());
        return;
      }
      File tempFile = new File(targetFile.getParentFile(), targetFile.getName() + ".tmp");
      Files.deleteIfExists(tempFile.toPath());
      tempFile.deleteOnExit();
      tempFile.getParentFile().mkdirs();
      out = new FileOutputStream(tempFile);
      int id = writeId.incrementAndGet();
      JSObject response = new JSObject().put("maxChunkSize", MAX_DECODED_CHUNK_SIZE).put("id", id);
      binaryWrites.put(id, new BinaryWrite(targetFile, tempFile, out, size));
      out = null;
      call.resolve(response);
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    } finally {
      if (out != null) Utils.silentClose(out);
    }
  }

  /**
   * Input:
   *  - id
   *  - data: base64 encoded chunk
   * Output:
   *  - result: "continue" or "done"
   */
  @PluginMethod
  public void saveBinaryFileChunk(PluginCall call) {
    Integer id = null;
    BinaryWrite write = null;
    try {
      id = call.getInt("id");
      if (id == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_ID, "Missing id");
      write = binaryWrites.get(id);
      if (write == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_ID, "Unknown id");
      String contentBase64 = call.getString("data");
      if (contentBase64 == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing data");
      byte[] data = Base64.getDecoder().decode(contentBase64);
      write.out.write(data);
      write.done += data.length;
      if (write.done < write.size) {
        call.resolve(new JSObject().put("result", "continue"));
        return;
      }
      write.out.close();
      Files.deleteIfExists(write.targetFile.toPath());
      write.tempFile.renameTo(write.targetFile);
      binaryWrites.remove(id);
      call.resolve(new JSObject().put("result", "done"));
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      if (write != null) Utils.silentClose(write.out);
      binaryWrites.remove(id);
      Utils.reject(call, e);
    }
  }


  /**
   * Input:
   *  - dir
   *  - filename
   *  - lines
   *  - more: boolean
   * Output:
   *  - id if more is true
   */
  @PluginMethod
  public void saveJsonlFile(PluginCall call) {
    FileOutputStream out = null;
    try {
      File targetFile = toFile(call);
      Boolean more = call.getBoolean("more");
      if (more == null) more = Boolean.FALSE;
      JSONArray lines = call.getArray("lines");
      File tempFile = new File(targetFile.getParentFile(), targetFile.getName() + ".tmp");
      Files.deleteIfExists(tempFile.toPath());
      tempFile.deleteOnExit();
      tempFile.getParentFile().mkdirs();
      out = new FileOutputStream(tempFile);
      OutputStreamWriter sw = new OutputStreamWriter(out, StandardCharsets.UTF_8);
      BufferedWriter bw = new BufferedWriter(sw);
      if (lines != null) {
        for (int index = 0; index < lines.length(); ++index) {
          String line = lines.getString(index);
          bw.append(line);
          bw.newLine();
        }
      }
      if (more.equals(Boolean.FALSE)) {
        bw.flush();
        out.close();
        out = null;
        Files.deleteIfExists(targetFile.toPath());
        tempFile.renameTo(targetFile);
        call.resolve(new JSObject());
        return;
      }
      int id = writeId.incrementAndGet();
      JSObject response = new JSObject().put("id", id);
      jsonlWrites.put(id, new JsonlWrite(targetFile, tempFile, out, bw));
      out = null;
      call.resolve(response);
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    } finally {
      if (out != null) Utils.silentClose(out);
    }
  }

  /**
   * Input:
   *  - id
   *  - lines
   *  - more: boolean
   * Output:
   *  - result: "continue" or "done"
   */
  @PluginMethod
  public void saveJsonlFileChunk(PluginCall call) {
    Integer id = null;
    JsonlWrite write = null;
    try {
      id = call.getInt("id");
      if (id == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_ID, "Missing id");
      write = jsonlWrites.get(id);
      if (write == null)
        throw new LocalFilesException(LocalFilesException.Code.INVALID_ID, "Unknown id");
      Boolean more = call.getBoolean("more");
      if (more == null) more = Boolean.FALSE;
      JSONArray lines = call.getArray("lines");
      if (lines != null) {
        for (int index = 0; index < lines.length(); ++index) {
          String line = lines.getString(index);
          write.bw.append(line);
          write.bw.newLine();
        }
      }
      if (more.equals(Boolean.FALSE)) {
        write.bw.flush();
        write.out.close();
        Files.deleteIfExists(write.targetFile.toPath());
        write.tempFile.renameTo(write.targetFile);
        jsonlWrites.remove(id);
        call.resolve(new JSObject().put("result", "done"));
        return;
      }
      call.resolve(new JSObject().put("result", "continue"));
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      if (write != null) Utils.silentClose(write.out);
      jsonlWrites.remove(id);
      Utils.reject(call, e);
    }
  }

  /**
   * Input:
   *  - dir
   *  - filename
   * Output:
   *  - exists: boolean
   */
  @PluginMethod
  public void fileExists(PluginCall call) {
    try {
      call.resolve(new JSObject().put("exists", toFile(call).exists()));
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    }
  }

  /**
   * Input:
   *  - dir
   *  - files: string[]
   * Output:
   *  - exist: boolean[]
   */
  @PluginMethod
  public void filesExist(PluginCall call) {
    try {
      String dir = call.getString("dir");
      if (dir == null || dir.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing dir");
      JSObject response = new JSObject();
      JSONArray filesOutput = new JSONArray();
      response.put("exist", filesOutput);
      JSONArray filesInput = call.getArray("files");
      if (filesInput != null) {
        File subDir = new File(root, dir);
        for (int i = 0; i < filesInput.length(); ++i) {
          filesOutput.put(new File(subDir, filesInput.getString(i)).exists());
        }
      }
      call.resolve(response);
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    }
  }

  @PluginMethod
  public void listFiles(PluginCall call) {
    try {
      String dir = call.getString("dir");
      if (dir == null || dir.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing dir");
      File subDir = new File(root, dir);
      JSObject response = new JSObject();
      if (subDir.exists()) {
        response.put("files", new JSONArray(subDir.list()));
      } else {
        response.put("files", new JSONArray());
      }
      call.resolve(response);
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    }
  }

  /**
   * Input:
   *  - dir
   *  - filename
   */
  @PluginMethod
  public void deleteFile(PluginCall call) {
    try {
      Files.deleteIfExists(toFile(call).toPath());
      call.resolve();
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    }
  }

  /**
   * Input:
   *  - dir
   *  - files
   */
  @PluginMethod
  public void deleteFiles(PluginCall call) {
    try {
      String dir = call.getString("dir");
      if (dir == null || dir.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing dir");
      JSONArray files = call.getArray("files");
      if (files != null) {
        File subDir = new File(root, dir);
        for (int i = 0; i < files.length(); ++i)
          Files.deleteIfExists(new File(subDir, files.getString(i)).toPath());
      }
      call.resolve();
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    }
  }

  @PluginMethod
  public void deleteAllFiles(PluginCall call) {
    try {
      String dir = call.getString("dir");
      if (dir == null || dir.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing dir");
      File subDir = new File(root, dir);
      if (subDir.exists()) {
        File[] files = subDir.listFiles();
        if (files != null) {
          for (var file : files)
            if (file.isFile()) file.delete();
        }
      }
      call.resolve();
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    }
  }

  @PluginMethod
  public void deleteDirectoryAndContent(PluginCall call) {
    try {
      String dir = call.getString("dir");
      if (dir == null || dir.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing dir");
      File subDir = new File(root, dir);
      if (subDir.exists()) {
        if (!deleteDirRecursive(subDir)) {
          call.reject("Cannot delete directory: " + dir);
          return;
        }
      }
      call.resolve();
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    }
  }

  private boolean deleteDirRecursive(File dir) {
    File[] files = dir.listFiles();
    if (files == null) return false;
    for (var file : files) {
      if (file.isFile()) file.delete();
      else if (!file.getName().equals(".") && !file.getName().equals("..") && file.isDirectory()) deleteDirRecursive(file);
    }
    return dir.delete();
  }

  @PluginMethod
  public void renameDirectory(PluginCall call) {
    try {
      String previousPath = call.getString("previousPath");
      if (previousPath == null || previousPath.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing previousPath");
      String newPath = call.getString("newPath");
      if (newPath == null || newPath.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing newPath");
      File previousFile = new File(root, previousPath);
      File newFile = new File(root, newPath);
      if (newFile.exists()) throw new LocalFilesException((LocalFilesException.Code.INVALID_INPUT, "newPath already exists"));
      if (previousFile.exists()) previousFile.renameTo(newFile);
      call.resolve();
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    }
  }

  /**
   * Input:
   *  - dir
   *  - files: string[]
   * Output:
   *  - files: {filename: string, size: number}[]
   */
  @PluginMethod
  public void getFilesSize(PluginCall call) {
    try {
      String dir = call.getString("dir");
      if (dir == null || dir.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing dir");
      JSONArray filesInput = call.getArray("files");
      JSONArray filesOutput = new JSONArray();
      if (filesInput != null) {
        File subDir = new File(root, dir);
        for (int i = 0; i < filesInput.length(); ++i) {
          File file = new File(subDir, filesInput.getString(i));
          filesOutput.put(new JSObject().put("filename", file.getName()).put("size", file.exists() && file.isFile() ? file.length() : 0L));
        }
      }
      call.resolve(new JSObject().put("files", filesOutput));
    } catch (LocalFilesException e) {
      e.reject(call);
    } catch (Exception e) {
      Utils.reject(call, e);
    }
  }

  private File toFile(PluginCall call) throws LocalFilesException {
    String dir = call.getString("dir");
    if (dir == null || dir.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing dir");
    String filename = call.getString("filename");
    if (filename == null || filename.isBlank()) throw new LocalFilesException(LocalFilesException.Code.INVALID_INPUT, "Missing filename");
    File subDir = new File(root, dir);
    return new File(subDir, filename);
  }
}
