import { Observable } from 'rxjs';

export function observableWithCache<T, C>(
  createCache: () => C,
  destroyCache: (cache: C) => void,
  observable: (cache: C) => Observable<T>,
): Observable<T> {
  return new Observable<T>(subscriber => {
    const cache = createCache();
    const subscription = observable(cache).subscribe({
      next: value => subscriber.next(value),
      complete: () => subscriber.complete(),
      error: e => subscriber.error(e),
    });
    return () => {
      subscription.unsubscribe();
      destroyCache(cache);
    };
  });
}
