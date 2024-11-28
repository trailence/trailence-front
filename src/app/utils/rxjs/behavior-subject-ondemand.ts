import { Observable, Subscriber, Subscription } from 'rxjs';

export class BehaviorSubjectOnDemand<T> {

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
        observer.next(this.lastValue);
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
      return this.valueProvider();
    return this.lastValue;
  }

}
