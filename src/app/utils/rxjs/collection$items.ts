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
