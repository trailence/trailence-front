import { NgZone } from '@angular/core';
import { Observable, Observer, Subscription } from 'rxjs';

export class Subscriptions {

  private subscriptions: Subscription[] = [];

  public add(s: Subscription): void {
    this.subscriptions.push(s);
  }

  public unsubscribe(): void {
    for (const s of this.subscriptions) s.unsubscribe();
    this.subscriptions = [];
  }

}

export type Resubscribeable = {
  observable: Observable<any>,
  observer: Partial<Observer<any>> | ((value: any) => void),
  subscription?: Subscription,
  outsideAngular: boolean,
};

export class Resubscribeables {

  constructor(private readonly ngZone: NgZone) {}

  private paused = false;
  private subscriptions: Resubscribeable[] = [];

  public get zone() { return this.ngZone; }
  public get active() { return !this.paused; }

  public subscribe<T>(observable: Observable<T>, observer: Partial<Observer<T>> | ((value: T) => void), outsideAngular: boolean = false): void {
    this.subscriptions.push({
      observable,
      observer,
      subscription: this.paused ? undefined : outsideAngular ? this.ngZone.runOutsideAngular(() => observable.subscribe(observer)) : observable.subscribe(observer),
      outsideAngular,
    });
  }

  public pause(): void {
    if (this.paused) return;
    this.paused = true;
    for (const rs of this.subscriptions) {
      rs.subscription?.unsubscribe();
      rs.subscription = undefined;
    }
  }

  public resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const rs of this.subscriptions) {
      if (!rs.subscription) rs.subscription = rs.outsideAngular ? this.ngZone.runOutsideAngular(() => rs.observable.subscribe(rs.observer)) : rs.observable.subscribe(rs.observer);
    }
  }

  public stop(): void {
    for (const rs of this.subscriptions) rs.subscription?.unsubscribe();
    this.subscriptions = [];
    this.paused = true;
  }

}
