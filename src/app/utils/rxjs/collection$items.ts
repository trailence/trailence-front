import { Observable, OperatorFunction, combineLatest, debounceTime, map, of, switchMap } from 'rxjs';

export function collection$items<T>(filter?: (item: T) => boolean): OperatorFunction<Observable<T | null>[], T[]> {
  return source => source.pipe(
    switchMap(items$ => items$.length === 0 ? of([] as T[]) : combineLatest(items$)),
    debounceTime(1),
    map(items => {
      items = items.filter(item => !!item && (filter ? filter(item) : true));
      return items as T[];
    })
  );
}
