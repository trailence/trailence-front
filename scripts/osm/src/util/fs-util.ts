import fs from 'node:fs';
import { FileHandle } from 'node:fs/promises';
import { PromiseLimiter } from './promise-limiter';

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
    private readonly limiter: PromiseLimiter,
  ) {}

  private _buffer?: Buffer;
  private _bufferOffset = 0;
  private _fileOffset = 0;
  private _op: Promise<any> = Promise.resolve();
  private _pendingSize = 0;

  public write(data: Buffer): void {
    const l = data.length;
    if (l === 0) return;
    if (!this._buffer) {
      if (l >= this.bufferSize) {
        this._buffer = data;
        this._bufferOffset = l;
        this.flush();
        return;
      }
      this._buffer = Buffer.allocUnsafe(this.bufferSize);
      this._bufferOffset = 0;
    } else if (l > this.bufferSize - this._bufferOffset) {
      this.flush();
      this.write(data);
      return;
    }
    data.copy(this._buffer, this._bufferOffset);
    this._bufferOffset += l;
  }

  public flush(): void {
    if (!this._buffer) return;
    const buf = this._buffer;
    const len = this._bufferOffset;
    const offset = this._fileOffset;
    this._buffer = undefined;
    this._bufferOffset = 0;
    this._fileOffset += len;
    this._pendingSize += len;
    this._op = this._op.then(() => this.limiter.push(() => this.fd.write(buf, 0, len, offset).then(() => this._pendingSize -= len)));
  }

  public async waitIfPendingGreaterThan(maxPendingSize: number) {
    if (this._pendingSize >= maxPendingSize) await this._op;
  }

  public async flushAndTransfer(dataProvider: () => Promise<{data: Buffer, end: boolean}>) {
    this.flush();
    await this._op;
    do {
      const read = await dataProvider();
      const l = read.data.length;
      if (l > 0) {
        this._op = this.limiter.push(() => this.fd.write(read.data, 0, l, this._fileOffset));
        await this._op;
        this._fileOffset += l;
      }
      if (read.end) break;
    } while (true);
  }

  public async close() {
    this.flush();
    await this._op;
    await this.limiter.push(() => this.fd.close());
  }
}

export class BufferedReader {
  constructor(
    private readonly fd: FileHandle,
    private readonly bufferSize: number,
    private readonly limiter: PromiseLimiter,
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
    this._read = await this.limiter.push(() => readFully(this.fd, this._buffer!, 0, this.bufferSize, this._fileOffset));
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
    const read = await this.limiter.push(() => readFully(this.fd, target, offset, length, this._fileOffset));
    this._fileOffset += read;
    return read;
  }

  public async flushAndTransferTo(dst: BufferedWriter) {
    if (this._buffer !== undefined)
      dst.write(this._buffer.subarray(this._offset, this._read));
    this._buffer = Buffer.allocUnsafe(this.bufferSize);
    await dst.flushAndTransfer(async () => {
      const read = await this.limiter.push(() => readFully(this.fd, this._buffer!, 0, this.bufferSize, this._fileOffset));
      this._fileOffset += read;
      return {data: this._buffer!.subarray(0, read), end: read < this.bufferSize};
    });
    this._buffer = undefined;
  }

  public async close() {
    await this.limiter.push(() => this.fd.close());
  }
}
