import fs from 'node:fs';
import { Buf } from '../util/util';
import { MemoryLimiter } from '../util/memory-limiter';
import { FileAppender } from '../util/file-appender';

interface Tile {
  buf: Buf;
  fileAppender: FileAppender;
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
      await t.fileAppender.append(buf);
      return t.buf;
    }
    t = { buf: new Buf(Math.max(this.bufferSize, size)), fileAppender: new FileAppender(this.dir + '/' + tile + '.tile', this.memoryLimiter) }
    this.tiles.set(tile, t);
    return t.buf;
  }

  public async close() {
    for (const tile of this.tiles.values()) {
      if (tile.buf.offset > 0) tile.fileAppender.append(tile.buf);
      await tile.fileAppender.close();
    }
    this.tiles.clear();
  }

}
