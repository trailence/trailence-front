import fs from 'node:fs';
import { Buf, durationToString } from '../util/util';
import { MemoryLimiter } from '../util/memory-limiter';
import { FileAppender } from '../util/file-appender';

interface Tile {
  buf: Buf;
  fileAppender: FileAppender;
  lastUsed: number;
}

export class TilesWriter {

  private readonly tiles = new Map<number, Tile>();

  constructor(private readonly dir: string, private readonly bufferSize: number, private readonly memoryLimiter: MemoryLimiter) {}

  public async getTileBuffer(tile: number, size: number) {
    let t = this.tiles.get(tile);
    if (t) {
      t.lastUsed = Date.now();
      if (t.buf.remaining >= size) return t.buf;
      const buf = t.buf;
      t.buf = new Buf(Math.max(this.bufferSize, size));
      await t.fileAppender.append(buf);
      return t.buf;
    }
    t = { buf: new Buf(Math.max(this.bufferSize, size)), fileAppender: new FileAppender(this.dir + '/' + tile + '.tile', this.memoryLimiter), lastUsed: Date.now() }
    this.tiles.set(tile, t);
    return t.buf;
  }

  public async flushIfNeeded(maxPending: number, reduceTo: number) {
    const nb = this.tiles.size;
    if (nb < maxPending) return;
    console.log('Flushing tiles', nb);
    const start = Date.now();
    const sorted: {tileNum: number, tile: Tile}[] = new Array(nb);
    let i = 0;
    for (const tile of this.tiles.entries()) sorted[i++] = {tileNum: tile[0], tile: tile[1]};
    sorted.sort((t1, t2) => t1.tile.lastUsed - t2.tile.lastUsed);
    const nbToRemove = nb - reduceTo;
    const remove: Promise<any>[] = new Array(nbToRemove);;
    for (i = 0; i < nbToRemove; ++i) {
      const tile = sorted[i].tile;
      const promise = tile.buf.offset > 0 ? tile.fileAppender.append(tile.buf).then(() => tile.fileAppender.close()) : tile.fileAppender.close();
      remove[i] = promise;
      this.tiles.delete(sorted[i].tileNum);
    }
    await Promise.all(remove);
    console.log('Tiles flushed from', nb, 'to', reduceTo, 'in', durationToString(Date.now() - start));
  }

  public async close() {
    for (const tile of this.tiles.values()) {
      if (tile.buf.offset > 0) tile.fileAppender.append(tile.buf);
      await tile.fileAppender.close();
    }
    this.tiles.clear();
  }

}
