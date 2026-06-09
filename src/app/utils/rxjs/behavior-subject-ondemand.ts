import { concat, first, Observable, of, Subscriber, Subscription, switchMap, timeout } from 'rxjs';

export class BehaviorSubjectOnDemand<T> {

  constructor(
    private readonly valueProvider: () => Observable<T>,
    private readonly invalidateValueEvent$: Observable<any>,
    private readonly timeout: number,
  ) {}

  private lastValue?: T;
  private subscription?: Subscription;
  private timeoutSubscription?: Subscription;
  private readonly observers: Subscriber<T>[] = [];

  public asObservable(): Observable<T> {
    return new Observable(observer => {
      this.observers.push(observer);
      if (this.observers.length === 1) {
        this.subscribe();
      }
      if (this.lastValue) {
        observer.next(this.lastValue);
      }
      return () => {
        const index = this.observers.indexOf(observer);
        if (index >= 0) {
          this.observers.splice(index, 1);
          if (this.observers.length === 0) {
            this.subscribeTimeout();
          }
        }
      }
    });
  }

  private subscribe(): void {
    if (this.timeoutSubscription) {
      this.timeoutSubscription.unsubscribe();
      this.timeoutSubscription = undefined;
    }
    if (this.subscription) return;
    const event$ = this.lastValue ? this.invalidateValueEvent$ : concat(of(false), this.invalidateValueEvent$);
    this.subscription = event$.pipe(
      switchMap(() => this.valueProvider())
    ).subscribe(value => {
      if (value === this.lastValue) return;
      this.lastValue = value;
      const list = [...this.observers];
      for (const o of list) o.next(value);
    });
  }

  private subscribeTimeout(): void {
    if (this.timeoutSubscription) return;
    if (this.subscription) {
      this.subscription?.unsubscribe();
      this.subscription = undefined;
    }
    this.timeoutSubscription = this.invalidateValueEvent$.pipe(
      timeout(this.timeout),
      first(),
    ).subscribe({
      next: () => {
        this.timeoutSubscription = undefined;
        this.lastValue = undefined;
      },
      error: () => {
        this.timeoutSubscription = undefined;
        this.lastValue = undefined;
      }
    });
  }

}

export class BehaviorSubjectOnDemandWithSnapshot<T> {

  constructor(
    private readonly valueProvider: () => T,
    private readonly invalidateValueEvent$: Observable<any>
  ) {}

  private lastValue?: T;
  private subscription?: Subscription;
  private readonly observers: Subscriber<T>[] = [];

  public asObservable(): Observable<T> {
    return new Observable(observer => {
      this.observers.push(observer);
      if (this.observers.length === 1) {
        this.lastValue = this.valueProvider();
        observer.next(this.lastValue);
        this.subscription = this.invalidateValueEvent$.subscribe(() => {
          const value = this.valueProvider();
          if (value === this.lastValue) return;
          this.lastValue = value;
          const list = [...this.observers];
          for (const o of list) o.next(value);
        });
      } else {
        observer.next(this.lastValue!);
      }
      return () => {
        const index = this.observers.indexOf(observer);
        if (index >= 0) {
          this.observers.splice(index, 1);
          if (this.observers.length === 0) {
            this.subscription?.unsubscribe();
            this.subscription = undefined;
            this.lastValue = undefined;
          }
        }
      }
    });
  }

  public snapshot(): T {
    if (this.lastValue === undefined || this.observers.length === 0)
      return this.lastValue = this.valueProvider();
    return this.lastValue;
  }

}
