import { Observable, Subscriber, Subscription } from 'rxjs';

export class BehaviorSubjectOnDemand<T> {

  constructor(
    private valueProvider: () => T,
    private invalidateValueEvent$: Observable<any>
  ) {}

  private lastValue?: T;
  private subscription?: Subscription;
  private observers: Subscriber<T>[] = [];

  public asObservable(): Observable<T> {
    return new Observable(observer => {
      this.observers.push(observer);
      if (this.observers.length === 1) {
        this.lastValue = this.valueProvider();
        observer.next(this.lastValue);
        this.subscription = this.invalidateValueEvent$.subscribe(() => {
          const value = this.valueProvider();
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

}
