import { sleep } from './util';

export class MemoryLimiter {

  constructor(
    private readonly softLimit: number,
    private readonly hardLimit: number,
  ) {}

  private used = 0;

  public async add(op: Promise<any>, size: number) {
    this.used += size;
    if (this.used >= this.hardLimit) {
      await op;
      this.used -= size;
    } else if (this.used >= this.softLimit) {
      op.then(() => this.used -= size);
      await this.waitSoftLimit();
    } else {
      op.then(() => this.used -= size);
    }
  }

  private async waitSoftLimit() {
    for (let i = 1; i <= 10; ++i) {
      await sleep(1000);
      if (this.used < this.softLimit) return;
    }
  }

}
