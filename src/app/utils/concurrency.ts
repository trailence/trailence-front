export class ConcurrentPromises {

  constructor(
    private readonly maxConcurrency: number,
  ) {}

  private readonly pending: Promise<any>[] = [];
  private readonly waiting: {resolve: (value: any) => void, reject: (reason: any) => void, op: () => Promise<any>}[] = [];

  public launchOrWait<T>(op: () => Promise<T>, onLaunched: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.pending.length < this.maxConcurrency) {
        // launch now
        const p = op();
        this.pending.push(p);
        p.finally(() => {
          this.pending.splice(this.pending.indexOf(p), 1);
          this.launchNext();
        });
        resolve(onLaunched());
        return;
      }
      this.waiting.push({resolve, reject, op});
    });
  }

  public waitAll(): Promise<any> {
    return new Promise<any>((resolve) => {
      if (this.pending.length === 0) {
        resolve(true);
        return;
      }
      this.waiting.push({op: () => this.waitAll(), resolve, reject: resolve});
    });
  }

  private launchNext(): void {
    const next = this.waiting.shift();
    if (!next) return;
    const p = next.op();
    p.finally(() => {
      this.pending.splice(this.pending.indexOf(p), 1);
      this.launchNext();
    });
    p.catch(next.reject).then(next.resolve);
  }

}
