import fs from 'node:fs';
import { FileHandle } from 'node:fs/promises';

export async function readFully(fd: FileHandle, buffer: Buffer, offset: number, length: number, readPos: number) {
  let read = 0;
  do {
    const result = await fd.read(buffer, offset, length, readPos);
    if (result.bytesRead === 0) return read;
    offset += result.bytesRead;
    length -= result.bytesRead;
    readPos += result.bytesRead;
    read += result.bytesRead;
  } while (length > 0);
  return read;
}

export async function listFiles(dir: string): Promise<string[]> {
  const d = await fs.promises.opendir(dir);
  let entry;
  const result: string[] = [];
  while ((entry = (await d.read())) != null) {
    if (entry.isFile()) result.push(entry.name);
  }
  await d.close();
  return result;
}

export async function getFileSize(file: string): Promise<number | null> {
  return fs.promises.stat(file).then(s => s.size).catch(e => null);
}

export class BufferedWriter {
  constructor(
    private readonly fd: FileHandle,
    private readonly bufferSize: number,
  ) {}

  private _buffer?: Buffer;
  private _fileOffset = 0;
  private _bufferOffset = 0;
  private _op: Promise<any> = Promise.resolve();

  public write(data: Buffer, offset: number, length: number): void {
    if (!this._buffer) {
      this._buffer = Buffer.allocUnsafe(Math.max(this.bufferSize, length));
      this._bufferOffset = 0;
    }
    if (length > this._buffer.length - this._bufferOffset) {
      this.flush();
      this.write(data, offset, length);
      return;
    }
    data.copy(this._buffer, this._bufferOffset, offset, offset + length);
    this._bufferOffset += length;
  }

  public flush(): void {
    if (!this._buffer) return;
    const buf = this._buffer;
    const len = this._bufferOffset;
    const offset = this._fileOffset;
    this._buffer = undefined;
    this._bufferOffset = 0;
    this._fileOffset += len;
    this._op = this._op.then(() => this.fd.write(buf, 0, len, offset));
  }

  public async close() {
    this.flush();
    await this._op;
    await this.fd.close();
  }
}

export class BufferedReader {
  constructor(
    private readonly fd: FileHandle,
    private readonly bufferSize: number,
  ) {}

  private _buffer?: Buffer;
  private _offset = 0;
  private _read = 0;
  private _fileOffset = 0;

  public get offset(): number { return this._fileOffset - this._read + this._offset; }

  public async read(length: number) {
    if (this._buffer) {
      if (this._offset + length <= this._read) {
        const sub = this._buffer.subarray(this._offset, this._offset + length);
        this._offset += length;
        if (this._offset === this._read) {
          this._buffer = undefined;
        }
        return sub;
      }
      const b = Buffer.allocUnsafe(length);
      this._buffer.copy(b, 0, this._offset, this._read);
      const done = this._read - this._offset;
      this._buffer = undefined;
      this._offset = this._read;
      const total = done + await this.readInto(b, done, length - done);
      if (total === length)
        return b;
      return b.subarray(0, total);
    }
    if (length >= this.bufferSize) {
      const b = Buffer.allocUnsafe(length);
      const read = await this.readInto(b, 0, length);
      if (read === length) return b;
      return b.subarray(0, read);
    }
    this._buffer = Buffer.allocUnsafe(this.bufferSize);
    this._read = await readFully(this.fd, this._buffer, 0, this.bufferSize, this._fileOffset);
    this._fileOffset += this._read;
    const len = Math.min(length, this._read);
    const sub = this._buffer.subarray(0, len);
    if (len === this._read) {
      this._buffer = undefined;
      this._read = 0;
      this._offset = 0;
    } else {
      this._offset = len;
    }
    return sub;
  }

  public async readInto(target: Buffer, offset: number, length: number): Promise<number> {
    if (this._buffer) {
      if (this._offset + length <= this._read) {
        this._buffer.copy(target, offset, this._offset, this._offset + length);
        this._offset += length;
        if (this._offset === this._read) {
          this._buffer = undefined;
        }
        return length;
      }
      this._buffer.copy(target, offset, this._offset, this._read);
      const done = this._read - this._offset;
      this._buffer = undefined;
      this._read = 0;
      this._offset = 0;
      return (await this.readInto(target, offset + done, length - done)) + done;
    }
    const read = await readFully(this.fd, target, offset, length, this._fileOffset);
    this._fileOffset += read;
    return read;
  }

  public async close() {
    await this.fd.close();
  }
}
