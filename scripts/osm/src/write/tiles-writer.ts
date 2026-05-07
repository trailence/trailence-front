import fs from 'node:fs';
import { Buf } from '../util/util';
import { MemoryLimiter } from '../util/memory-limiter';

interface Tile {
  buf: Buf;
  op: Promise<any>;
}

export class TilesWriter {

  private readonly tiles = new Map<number, Tile>();

  constructor(private readonly dir: string, private readonly bufferSize: number, private readonly memoryLimiter: MemoryLimiter) {}

  public async getTileBuffer(tile: number, size: number) {
    let t = this.tiles.get(tile);
    if (t) {
      if (t.buf.remaining >= size) return t.buf;
      const buf = t.buf;
      t.buf = new Buf(Math.max(this.bufferSize, size));
      const op = t.op.then(() => this.append(tile, buf));
      t.op = op;
      await this.memoryLimiter.add(op, buf.buffer.length);
      return t.buf;
    }
    t = { buf: new Buf(Math.max(this.bufferSize, size)), op: Promise.resolve() }
    this.tiles.set(tile, t);
    return t.buf;
  }

  private async append(tile: number, buf: Buf) {
    const fd = await fs.promises.open(this.dir + '/' + tile + '.tile', 'a');
    await fd.write(buf.buffer, 0, buf.offset);
    await fd.close();
  }

  public async close() {
    for (const tile of this.tiles.entries()) {
      const key = tile[0];
      const t = tile[1];
      if (t.buf.offset > 0) t.op = t.op.then(() => this.append(key, t.buf));
      await t.op;
    }
    this.tiles.clear();
  }

}
