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
