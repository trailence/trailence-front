import { durationToString } from './util';

export interface PromiseLimiter {
  push<T>(op: () => Promise<T>): Promise<T>;
}

export class PromiseSequence implements PromiseLimiter {
  private previous: Promise<any> = Promise.resolve();

  push<T>(op: () => Promise<T>): Promise<T> {
    const p = this.previous.then(() => op());
    this.previous = p;
    return p;
  }
}

export class PromiseParallel implements PromiseLimiter {
  constructor(private readonly maxConcurrent: number) {}

  private readonly requests: {op: () => Promise<any>, resolve: (value: any) => void, reject: (error: any) => void}[] = [];
  private inProgress = 0;

  push<T>(op: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve,reject) => {
      this.requests.push({op, resolve, reject});
      this.process();
    });
  }

  private process(): void {
    if (this.requests.length === 0 || this.inProgress >= this.maxConcurrent) {
      return;
    }
    const todo = this.requests.shift()!;
    this.inProgress++;
    todo.op()
      .catch(error => {
        this.inProgress--;
        this.process();
        todo.reject(error);
      })
      .then(result => {
        this.inProgress--;
        this.process();
        todo.resolve(result);
      });
  }
}

export class ParallelOperations {

  private readonly parallel: PromiseParallel;
  private readonly start = Date.now();
  private done = 0;
  private total = 0;
  private readonly promises: Promise<any>[] = [];

  constructor(
    private readonly name: string,
    maxConcurrent: number,
    private readonly customLog: () => string = () => ''
  ) {
    this.parallel = new PromiseParallel(maxConcurrent);
  }

  add(op: () => Promise<any>): void {
    this.total++;
    this.promises.push(
      this.parallel.push(op)
      .then(() => {
        this.done++;
        this.updateConsole();
      })
    );
    this.updateConsole();
  }

  waitDone(): Promise<any> {
    return Promise.all(this.promises)
    .then(() => {
      if (this.updateConsoleTimeout !== undefined) clearTimeout(this.updateConsoleTimeout);
      process.stdout.clearLine(-1);
      process.stdout.cursorTo(0);
    });
  }

  private updateConsoleTimeout: any;
  private updateConsole(): void {
    if (this.updateConsoleTimeout !== undefined) return;
    this.updateConsoleTimeout = setTimeout(() => {
      this.updateConsoleTimeout = undefined;
      process.stdout.clearLine(-1);
      process.stdout.cursorTo(0);
      const now = Date.now();
      const remaining = this.total === 0 || this.done === 0 ? '' : durationToString((this.total - this.done) * (now - this.start) / this.done);
      process.stdout.write(' + ' + this.name + ' ' + this.done + ' / ' + this.total + ' ' + this.customLog() + ' after ' + durationToString(now - this.start) + ', eta: ' + remaining);
    }, 1000);
  }

}
