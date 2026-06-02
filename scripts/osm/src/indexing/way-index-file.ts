import fs from 'node:fs';
import { FileHandle } from 'node:fs/promises';
import { IndexFileReader, IndexFileWriter } from './index-file';
import { MemoryLimiter } from '../util/memory-limiter';

export const idToWayIndex = (id: bigint) => Math.floor(Number(id / 250000n));
export const idToSubWayIndex = (id: bigint) => Number(id % 250000n);
export const wayIndexToId = (index: number, subId: number) => BigInt(index) * 250000n + BigInt(subId);

export class WayIndexesWriter {

  constructor(private readonly dir: string, private readonly memoryLimiter: MemoryLimiter) {
  }

  private currentKey: number | undefined;
  private current: WayIndexFileWriter | undefined;
  private closing: Promise<any> = Promise.resolve();

  public async add(id: bigint, tile: number) {
    const key = idToWayIndex(id);
    const subId = idToSubWayIndex(id);
    if (key !== this.currentKey) {
      const c = this.current;
      if (c) this.closing = this.closing.then(() => c.close());
      console.log('New index', key);
      this.current = new WayIndexFileWriter(fs.promises.open(this.dir + '/' + key, 'w'), this.memoryLimiter);
      this.currentKey = key;
    }
    await this.current!.add(subId, tile);
  }

  public async close() {
    const c = this.current;
    if (c) this.closing = this.closing.then(() => c.close());
    this.current = undefined;
    await this.closing;
  }
}

export class WayIndexFileWriter extends IndexFileWriter {

  constructor(
    fd: Promise<FileHandle>,
    memoryLimiter: MemoryLimiter,
  ) {
    super(fd, 8, 8192, memoryLimiter);
  }

  public async add(subId: number, tile: number) {
    this.buf.writeUInt32(subId);
    this.buf.writeUInt32(tile);
    await this.entryAdded();
  }

}

export class WayIndexFileReader extends IndexFileReader<number> {
  constructor(private readonly waysIndexDir: string) {
    super(waysIndexDir, 8, 2048, 2, 128);
  }

  protected override readElement(buffer: Buffer, pos: number): number {
    return buffer.readUInt32LE(pos + 4);
  }

}
