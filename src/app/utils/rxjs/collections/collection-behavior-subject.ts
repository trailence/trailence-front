import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { CollectionObservable } from './collection-observable';

export abstract class CollectionBehaviorSubject<T> extends CollectionObservable<T> {

  public abstract get values(): T[];

  public abstract clear(): void;

  public abstract change(append: T[], remove?: (item: T) => boolean): void;

  public add(append: T[]): void { this.change(append); }

  public addAndRemove(append: T[], remove: T[]): void {
      this.change(append, item => remove.indexOf(item) >= 0);
  }

  public remove(remove: T[]): void {
      this.addAndRemove([], remove);
  }

  public removeIf(remove: (item: T) => boolean): void {
      this.change([], remove);
  }

}

export class ArrayBehaviorSubject<T> extends CollectionBehaviorSubject<T> {

  private _array$: BehaviorSubject<T[]>;
  private _changes$ = new Subject<{added: T[], removed: T[]}>();

  constructor(array: T[] = []) {
      super();
      this._array$ = new BehaviorSubject<T[]>(array);
  }

  public override get values(): T[] { return this._array$.value; }
  public override get values$(): Observable<T[]> { return this._array$; }

  public override get changes$(): Observable<{ added: T[]; removed: T[]; }> {
      return this._changes$;
  }

  public override clear(): void {
      if (this._array$.value.length > 0)
          this._changes$.next({added: [], removed: this._array$.value});
      this._array$.next([]);
  }

  public override change(append: T[], remove?: (item: T) => boolean): void {
      let changed = false;
      const a = this._array$.value;
      const removed: T[] = [];
      if (remove) {
          let nbRemoved = 0;
          for (let i = 0; i < a.length; ++i) {
              if (remove(a[i])) {
                  nbRemoved++;
                  changed = true;
                  removed.push(a[i]);
              } else if (nbRemoved > 0) {
                  a.splice(i - nbRemoved, nbRemoved);
                  i -= nbRemoved;
                  nbRemoved = 0;
              }
          }
          if (nbRemoved > 0) {
              a.splice(a.length - nbRemoved, nbRemoved);
          }
      }
      if (append.length > 0) {
          a.push(...append);
          changed = true;
      }
      if (changed) {
          this._array$.next(a);
          this._changes$.next({added: append, removed});
      }
  }

}
