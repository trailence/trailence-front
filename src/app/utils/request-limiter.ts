import { Observable, Subscriber } from 'rxjs';

export class RequestLimiter {

  private requests: {request: () => Observable<any>, subscriber: Subscriber<any>}[] = [];
  private inProgress = 0;

  constructor(
    private maxRequests: number
  ) {}

  public add<T>(request: () => Observable<T>): Observable<T> {
    return new Observable<T>(subscriber => {
      this.addRequest(request, subscriber);
    });
  }

  private addRequest<T>(request: () => Observable<T>, subscriber: Subscriber<T>): void {
    this.requests.push({request, subscriber});
    this.process();
  }

  private process(): void {
    if (this.requests.length === 0 || this.inProgress >= this.maxRequests) {
      return;
    }
    const todo = this.requests[0];
    this.requests.splice(0, 1);
    this.inProgress++;
    todo.request().subscribe({
      next: e => todo.subscriber.next(e),
      complete: () => {
        this.inProgress--;
        todo.subscriber.complete();
        this.process();
      },
      error: e => {
        this.inProgress--;
        todo.subscriber.error(e);
        this.process();
      }
    });
  }

}
