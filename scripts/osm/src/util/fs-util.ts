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
