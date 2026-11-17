import { Observable, Subscriber, Subscription } from 'rxjs';
import { Arrays } from '../arrays';

export class MulticastObservable<T> {

  private _latest: {emitted: boolean, value: T | undefined} = {emitted: false, value: undefined};
  private readonly _observers: Subscriber<T>[] = [];
  private _subscription?: Subscription;

  constructor(
    private readonly create: () => Observable<T>,
  ) {}

  public asObservable(): Observable<T> {
    return new Observable<T>(subscriber => {
      this.subscribe(subscriber);
      return () => this.unsubscribe(subscriber);
    });
  }

  public hasValue(): boolean { return this._latest.emitted; }
  public getLatest(): T | undefined { return this._latest.value; }

  private subscribe(subscriber: Subscriber<T>): void {
      this._observers.push(subscriber);
      if (!this._subscription) {
        this._subscription = this.create().subscribe({
          next: value => this.next(value),
          complete: () => this.complete(),
          error: e => this.error(e),
        });
      } else if (this._latest.emitted) {
        subscriber.next(this._latest.value!);
      }
  }

  private unsubscribe(subscriber: Subscriber<T>): void {
    Arrays.removeFirst(this._observers, subscriber);
    if (this._observers.length === 0 && this._subscription) {
      this._subscription.unsubscribe();
      this._subscription = undefined;
      this._latest = {emitted: false, value: undefined};
    }
  }

  private next(value: T): void {
    this._latest = {emitted: true, value};
    const listeners = [...this._observers];
    for (const listener of listeners) listener.next(value);
  }

  private complete(): void {
    this._subscription = undefined;
    this._latest = {emitted: false, value: undefined};
    const listeners = [...this._observers];
    for (const listener of listeners) listener.complete();
  }

  private error(e: any): void {
    this._subscription = undefined;
    this._latest = {emitted: false, value: undefined};
    const listeners = [...this._observers];
    for (const listener of listeners) listener.error(e);
  }

}
