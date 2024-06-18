import { BehaviorSubject, MonoTypeOperatorFunction, Observable, Subscriber, Subscription, filter, map } from 'rxjs';
import { CollectionObservable, MonoTypeCollectionOperatorFunction } from '../collection-observable';

export function collection$filter<E>(
  predicate: (element: E) => boolean,
): MonoTypeCollectionOperatorFunction<Observable<E>> {
  return source => new Collection$Filter(source, predicate);
}

class Collection$Filter<E, T extends Observable<E>> extends CollectionObservable<T> {

  constructor(
    private source: CollectionObservable<T>,
    private predicate: (element: E) => boolean,
  ) {
    super();
  }

  private _subscription?: Subscription;
  private _contentObservers: Subscriber<T[]>[] = [];
  private _changesObservers: Subscriber<{ added: T[]; removed: T[]; }>[] = [];
  private _itemsSubscriptions = new Map<T, Subscription>();
  private _currentContent: T[] = [];
  private _values$Timeout?: any;
  private _changesToSend: { added: T[]; removed: T[]; } = { added: [], removed: [] };
  private _changes$Timeout?: any;

  public override get values$(): Observable<T[]> {
    return new Observable<T[]>(observer => {
      this._contentObservers.push(observer);
      if (!this._subscription) this.start();
      if (this._currentContent.length === 0) observer.next([]);
      return () => {
        const index = this._contentObservers.indexOf(observer);
        if (index >= 0) {
          this._contentObservers.splice(index, 1);
          if (this._contentObservers.length === 0 && this._changesObservers.length === 0)
            this.stop();
        }
      };
    });
  }

  public override get changes$(): Observable<{ added: T[]; removed: T[]; }> {
    return new Observable<{ added: T[]; removed: T[]; }>(observer => {
      if (!this._subscription) this.start();
      this._changesObservers.push(observer);
      return () => {
        const index = this._changesObservers.indexOf(observer);
        if (index >= 0) {
          this._changesObservers.splice(index, 1);
          if (this._contentObservers.length === 0 && this._changesObservers.length === 0)
            this.stop();
        }
      };
    });
  }

  public override get initialValuesThenChanges$(): Observable<{ added: T[]; removed: T[]; }> {
    return new Observable<{ added: T[]; removed: T[]; }>(observer => {
      if (!this._subscription) this.start();
      this._changesObservers.push(observer);
      observer.next({added: this._currentContent, removed: []});
      return () => {
        const index = this._changesObservers.indexOf(observer);
        if (index >= 0) {
          this._changesObservers.splice(index, 1);
          if (this._contentObservers.length === 0 && this._changesObservers.length === 0)
            this.stop();
        }
      };
    });
  }


  private start() {
    this._subscription = this.source.initialValuesThenChanges$.subscribe(
      changes => {
        changes.added.forEach(
          item$ => this._itemsSubscriptions.set(item$, item$.subscribe(item => this.itemChanged(item$, item)))
        );
        changes.removed.forEach(
          item$ => {
            this._itemsSubscriptions.get(item$)?.unsubscribe();
            this._itemsSubscriptions.delete(item$);
            this.itemRemoved(item$);
          }
        );
      }
    );
  }

  private stop() {
    this._subscription?.unsubscribe();
    this._subscription = undefined;
    this._currentContent = [];
    this._itemsSubscriptions.forEach(s => s.unsubscribe());
    this._itemsSubscriptions.clear();
    if (this._values$Timeout) {
      clearTimeout(this._values$Timeout);
      this._values$Timeout = undefined;
    }
    if (this._changes$Timeout) {
      clearTimeout(this._changes$Timeout);
      this._changes$Timeout = undefined;
    }
    this._changesToSend = { added: [], removed: [] };
  }

  private itemChanged(item$: T, item: E) {
    if (this.predicate(item)) {
      if (this._currentContent.indexOf(item$) < 0) {
        this._currentContent.push(item$);
        this.addItem(item$);
      }
    } else {
      const index = this._currentContent.indexOf(item$);
      if (index >= 0) {
        this._currentContent.splice(index, 1);
        this.removeItem(item$);
      }
    }
  }

  private itemRemoved(item$: T) {
    const index = this._currentContent.indexOf(item$);
    if (index >= 0) {
      this._currentContent.splice(index, 1);
      this.removeItem(item$);
    }
  }

  private addItem(item$: T) {
    this.fireValues$();
    const index = this._changesToSend.removed.indexOf(item$);
    if (index >= 0) {
      this._changesToSend.removed.splice(index, 1);
    } else {
      this._changesToSend.added.push(item$);
      this.fireChanges$();
    }
  }

  private removeItem(item$: T) {
    this.fireValues$();
    const index = this._changesToSend.added.indexOf(item$);
    if (index >= 0) {
      this._changesToSend.added.splice(index, 1);
    } else {
      this._changesToSend.removed.push(item$);
      this.fireChanges$();
    }
  }

  private fireValues$() {
    if (this._values$Timeout) clearTimeout(this._values$Timeout);
    this._values$Timeout = setTimeout(() => {
      this._values$Timeout = undefined;
      [...this._contentObservers].forEach(observer => observer.next([...this._currentContent]));
    }, 0);
  }

  private fireChanges$() {
    if (this._changes$Timeout) clearTimeout(this._changes$Timeout);
    this._changes$Timeout = setTimeout(() => {
      this._changes$Timeout = undefined;
      if (this._changesToSend.added.length > 0 || this._changesToSend.removed.length > 0) {
        [...this._changesObservers].forEach(observer => observer.next({ added: [...this._changesToSend.added], removed: [...this._changesToSend.removed]}));
        this._changesToSend.added = [];
        this._changesToSend.removed = [];
      }
    }, 0);
  }

}
