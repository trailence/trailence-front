export async function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

export function durationToString(duration: number): string {
  duration = Math.floor(duration / 1000);
  let s = (duration % 60) + 's';
  duration = Math.floor(duration / 60);
  if (duration === 0) return s;
  s = (duration % 60) + 'm ' + s;
  duration = Math.floor(duration / 60);
  if (duration === 0) return s;
  return duration + 'h ' + s;
}

export class Buf {
  constructor(size: number) {
    this.buffer = Buffer.allocUnsafe(size);
    this.offset = 0;
  }

  public buffer: Buffer;
  public offset: number;

  public get remaining() { return this.buffer.length - this.offset; }

  public writeInt64(value: bigint) {
    this.buffer.writeBigInt64LE(value, this.offset);
    this.offset += 8;
  }

  public writeInt32(value: number) {
    this.buffer.writeInt32LE(value, this.offset);
    this.offset += 4;
  }

  public writeUInt32(value: number) {
    this.buffer.writeUint32LE(value, this.offset);
    this.offset += 4;
  }

  public writeUInt16(value: number) {
    this.buffer.writeUint16LE(value, this.offset);
    this.offset += 2;
  }

  public writeUInt8(value: number) {
    this.buffer.writeUint8(value, this.offset);
    this.offset++;
  }

  public write(data: Buffer) {
    this.offset += data.copy(this.buffer, this.offset);
  }
}
