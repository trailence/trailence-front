import { Observable, map, mergeMap } from 'rxjs';
import { CollectionObservable, CollectionOperatorFunction } from '../collection-observable';

export function collection$mergeMap<S, T>(
  mapper: (source: S, index: number) => Observable<T>
): CollectionOperatorFunction<Observable<S>, Observable<T>> {
  return source => new Collection$MergeMap<S, T>(source, mapper);
}

class Collection$MergeMap<S, T> extends CollectionObservable<Observable<T>> {

  constructor(
    private source: CollectionObservable<Observable<S>>,
    private mapper: (source: S, index: number) => Observable<T>,
  ) {
    super();
  }

  private _knownMapping = new Map<Observable<S>, Observable<T>>();

  public override get values$(): Observable<Observable<T>[]> {
    return this.source.values$.pipe(
      map(list => {
        const toRemove: Observable<S>[] = [...this._knownMapping.keys()];
        const result = list.map(
          item => {
            let known = this._knownMapping.get(item);
            if (!known) {
              known = item.pipe(mergeMap(this.mapper));
              this._knownMapping.set(item, known);
            } else {
              toRemove.splice(toRemove.indexOf(item), 1);
            }
            return known;
          }
        );
        for (const item of toRemove) {
          this.removed(item);
        }
        return result;
      })
    );
  }

  public override get changes$(): Observable<{ added: Observable<T>[]; removed: Observable<T>[]; }> {
    return this.source.changes$.pipe(
      map(changes => {
        const result: { added: Observable<T>[]; removed: Observable<T>[] } = { added: [], removed: [] };
        changes.removed.forEach(removed => {
          const known = this._knownMapping.get(removed);
          if (known) {
            this.removed(removed);
            result.removed.push(known);
          }
        });
        changes.added.forEach(added => {
          let known = this._knownMapping.get(added);
          if (!known) {
            known = added.pipe(mergeMap(this.mapper));
            this._knownMapping.set(added, known);
          }
          result.added.push(known);
        });
        return result;
      })
    );
  }

  private _toRemove: Observable<S>[] = [];
  private _removeTimeout?: any;

  private removed(item: Observable<S>) {
    if (this._toRemove.indexOf(item) < 0)
      this._toRemove.push(item);
    if (this._removeTimeout) clearTimeout(this._removeTimeout);
    this._removeTimeout = setTimeout(() => {
      this._removeTimeout = undefined;
      for (const item of this._toRemove) {
        this._knownMapping.delete(item);
      }
      this._toRemove = [];
    }, 10000);
  }

}
