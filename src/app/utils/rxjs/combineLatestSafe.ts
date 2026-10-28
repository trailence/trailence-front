import { combineLatest, Observable, of } from 'rxjs';

export function combineLatestSafe<T>(elements: Observable<T>[]) {
  if (elements.length === 0) return of([] as T[]);
  return combineLatest(elements);
}
