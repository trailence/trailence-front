import { first, Observable, Subscriber } from 'rxjs';

export class DynamicCacheObservables<T> {

  private readonly _cache = new Map<string, DynamicCacheObservable<T>>();

  constructor(
    private readonly provider: (key: string) => Observable<T>,
  ) {}

  public get(key: string): Observable<T> {
    return new Observable<T>(subscriber => {
      let o = this._cache.get(key);
      if (o) {
        o.subscribe(subscriber);
      } else {
        o = new DynamicCacheObservable<T>(() => this.provider(key), subscriber, () => this._cache.delete(key));
        this._cache.set(key, o);
      }
      return () => o.unsubscribe(subscriber);
    });
  }

  public invalidate(key: string): void {
    this._cache.get(key)?.invalidate();
  }

}

class DynamicCacheObservable<T> {

  constructor(
    private readonly provider: () => Observable<T>,
    firstSubscriber: Subscriber<T>,
    private readonly onNoSubscriber: () => void,
  ) {
    this._subscribers = [firstSubscriber];
    this.invalidate();
  }

  private readonly _subscribers: Subscriber<T>[];
  private _value?: T;

  invalidate(): void {
    this.provider().pipe(first()).subscribe(value => {
      this._value = value;
      const listeners = [...this._subscribers];
      for (const listener of listeners) listener.next(value);
    });
  }

  subscribe(subscriber: Subscriber<T>): void {
    this._subscribers.push(subscriber);
    if (this._value !== undefined) subscriber.next(this._value);
  }

  unsubscribe(subscriber: Subscriber<T>): void {
    const index = this._subscribers.indexOf(subscriber);
    if (index < 0) return;
    this._subscribers.splice(index, 1);
    if (this._subscribers.length === 0) this.onNoSubscriber();
  }

}
