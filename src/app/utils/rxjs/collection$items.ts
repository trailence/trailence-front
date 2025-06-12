import { Observable, OperatorFunction, combineLatest, map, of, switchMap } from 'rxjs';
import { debounceTimeExtended } from './debounce-time-extended';

export function collection$items<T>(filter?: (item: T) => boolean): OperatorFunction<Observable<T | null>[], T[]> {
  return source => source.pipe(
    switchMap(items$ => items$.length === 0 ? of([] as T[]) : combineLatest(items$)),
    debounceTimeExtended(0, 10),
    map(items => {
      items = items.filter(item => !!item && (filter ? filter(item) : true));
      return items as T[];
    })
  );
}

export function collection$items$<T>(filter?: (item: T) => boolean): OperatorFunction<Observable<T | null>[], {item: T, item$: Observable<T | null>}[]> {
  const f = filter ? (item: T | null) => !!item && filter(item) : (item: T | null) => !!item;
  return source => source.pipe(
    switchMap(items$ => items$.length === 0 ? of([]) : combineLatest(items$.map(item$ => item$.pipe(map(item => ({item, item$})))))),
    debounceTimeExtended(0, 10),
    map(list => list.filter(element => f(element.item)) as {item: T, item$: Observable<T | null>}[])
  );
}
