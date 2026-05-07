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
