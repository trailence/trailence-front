import { Observable, Observer, Subscription } from 'rxjs';

export class Subscriptions {

  private subscriptions: Subscription[] = [];

  public add(s: Subscription): void {
    this.subscriptions.push(s);
  }

  public unsusbcribe(): void {
    for (const s of this.subscriptions) s.unsubscribe();
    this.subscriptions = [];
  }

}

export type Resubscribeable = {
  observable: Observable<any>,
  observer: Partial<Observer<any>> | ((value: any) => void),
  subscription?: Subscription,
};

export class Resubscribeables {

  private paused = false;
  private subscriptions: Resubscribeable[] = [];

  public subscribe<T>(observable: Observable<T>, observer: Partial<Observer<T>> | ((value: T) => void)): void {
    this.subscriptions.push({
      observable,
      observer,
      subscription: this.paused ? undefined : observable.subscribe(observer)
    });
  }

  public pause(): void {
    this.paused = true;
    for (const rs of this.subscriptions) {
      rs.subscription?.unsubscribe();
      rs.subscription = undefined;
    }
  }

  public resume(): void {
    this.paused = false;
    for (const rs of this.subscriptions) {
      if (!rs.subscription) rs.subscription = rs.observable.subscribe(rs.observer);
    }
  }

  public stop(): void {
    for (const rs of this.subscriptions) rs.subscription?.unsubscribe();
    this.subscriptions = [];
    this.paused = true;
  }

}
