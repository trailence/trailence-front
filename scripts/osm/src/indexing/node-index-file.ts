import fs from 'node:fs';
import { FileHandle } from 'node:fs/promises';
import { IndexFileReader, IndexFileWriter } from './index-file';
import { MemoryLimiter } from '../util/memory-limiter';
import { OsmNode } from '../osm/osm-object';

export const idToNodeIndex = (id: bigint) => Math.floor(Number(id / 1000000n));
export const idToSubNodeId = (id: bigint) => Number(id % 1000000n);

export class NodeIndexesWriter {

  constructor(private readonly dir: string, private readonly memoryLimiter: MemoryLimiter) {
  }

  private currentKey: number | undefined;
  private current: NodeIndexFileWriter | undefined;
  private closing: Promise<any> = Promise.resolve();

  public async add(osm: OsmNode) {
    const key = idToNodeIndex(osm.id);
    if (key !== this.currentKey) {
      const c = this.current;
      if (c) this.closing = this.closing.then(() => c.close());
      console.log('New index', key);
      this.current = new NodeIndexFileWriter(fs.promises.open(this.dir + '/' + key, 'w'), this.memoryLimiter);
      this.currentKey = key;
    }
    await this.current!.add(idToSubNodeId(osm.id), osm.x, osm.y);
  }

  public async close() {
    const c = this.current;
    if (c) this.closing = this.closing.then(() => c.close());
    this.current = undefined;
    await this.closing;
  }
}

export class NodeIndexFileWriter extends IndexFileWriter {

  constructor(
    fd: Promise<FileHandle>,
    memoryLimiter: MemoryLimiter,
  ) {
    super(fd, 12, 4096, memoryLimiter);
  }

  public async add(subId: number, x: number, y: number) {
    this.buf.writeUInt32(subId);
    this.buf.writeInt32(Math.round(x * 1e7)); // lon
    this.buf.writeInt32(Math.round(y * 1e7)); // lat
    await this.entryAdded();
  }

}

export class NodeIndexFileReader extends IndexFileReader<number[]> {
  constructor(private readonly nodesIndexDir: string) {
    super(nodesIndexDir, 12, 2048, 2, 128);
  }

  protected override readElement(buffer: Buffer, pos: number): number[] {
    return [buffer.readInt32LE(pos + 8), buffer.readInt32LE(pos + 4)]; // invert x and y => [lat,lon]
  }

}
