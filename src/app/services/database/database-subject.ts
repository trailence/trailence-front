import { Observable, Subscriber } from 'rxjs';
import { DatabaseSubjectService } from './database-subject-service';

export class DatabaseSubject<T> {

  constructor(
    private service: DatabaseSubjectService,
    private loadItem: () => Promise<T | null>,
    initialValue: T | null | undefined = undefined,
  ) {
    if (initialValue !== undefined) {
      this.loaded = initialValue;
      this.lastObserverSeen = Date.now();
      service.register(this);
    }
  }

  private loading = false;
  private loaded: T | null | undefined = undefined;
  private observers: Subscriber<T | null>[] = [];
  private lastObserverSeen = 0;

  public asObservable(): Observable<T | null> {
    return new Observable(subscriber => {
      this.observers.push(subscriber);
      if (this.loaded !== undefined) {
        subscriber.next(this.loaded);
      } else if (!this.loading) {
        this.loading = true;
        this.loadItem().then(item => this.itemLoaded(item));
      }
      return () => {
        const index = this.observers.indexOf(subscriber);
        if (index >= 0) {
          this.observers.splice(index, 1);
        }
        if (this.observers.length === 0) this.lastObserverSeen = Date.now();
      };
    });
  }

  public get loadedValue(): T | null | undefined { return this.loaded; }

  private itemLoaded(item: T | null): void {
    if (!this.loading) return;
    this.loading = false;
    this.loaded = item;
    this.service.register(this);
    const subscribers = [...this.observers];
    for (const s of subscribers) s.next(item);
  }

  public newValue(value: T | null): void {
    this.loading = false;
    this.loaded = value;
    this.lastObserverSeen = Date.now();
    this.service.register(this);
    const subscribers = [...this.observers];
    for (const s of subscribers) s.next(value);
  }

  public clean(): boolean {
    //console.log(this.observers);
    if (this.loading || this.observers.length > 0 || Date.now() - this.lastObserverSeen < 15000) return false;
    this.service.unregister(this);
    this.loaded = undefined;
    return true;
  }

  public close(): void {
    this.service.unregister(this);
    this.loaded = undefined;
    this.loading = false;
    while (this.observers.length > 0) {
      const obs = [...this.observers];
      this.observers = [];
      for (const o of obs) o.complete();
    }
  }

}
