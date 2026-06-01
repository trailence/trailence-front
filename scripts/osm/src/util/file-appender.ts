import fs from 'node:fs';
import { Buf } from './util';
import { MemoryLimiter } from './memory-limiter';

export class FileAppender {

  constructor(private readonly file: string, private readonly memoryLimiter: MemoryLimiter) {}

  private latestOp: Promise<any> = Promise.resolve();
  private canPushToLatest = false;
  private pending: Buf[] = [];
  private opCounter = 0;

  public async append(buf: Buf) {
    this.pending.push(buf);
    if (!this.canPushToLatest) {
      this.canPushToLatest = true;
      const counter = ++this.opCounter;
      this.latestOp = this.latestOp.then(() => this.flush(counter));
    }
    await this.memoryLimiter.add(this.latestOp, buf.offset);
  }

  private async flush(counter: number) {
    const fd = await fs.promises.open(this.file, 'a');
    const buffers = this.pending;
    this.pending = [];
    if (counter === this.opCounter)
      this.canPushToLatest = false;
    for (const buf of buffers)
      await fd.write(buf.buffer, 0, buf.offset);
    await fd.close();
  }

  public async close() {
    await this.latestOp;
  }

}
