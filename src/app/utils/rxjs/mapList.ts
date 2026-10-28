import { BehaviorSubject, EMPTY, Observable, of, Subscription, switchMap } from 'rxjs';

export function mapList<T, R>(source: Observable<T[]>, mapper: (element: T) => Observable<R>): Observable<R[]> {
  let subscriptions: {src: T, subscription: Subscription}[] = [];
  const elements$ = new BehaviorSubject<{src: T, result?: R, emitted: boolean}[]>([]);
  return source.pipe(
    switchMap(list => {
      const newSubscriptions: {src: T, subscription: Subscription}[] = [];
      for (const s of subscriptions) {
        if (list.includes(s.src)) newSubscriptions.push(s);
        else {
          s.subscription.unsubscribe();
          const index = elements$.value.findIndex(e => e.src === s.src);
          elements$.value.splice(index, 1);
        }
      }
      for (const src of list) {
        if (newSubscriptions.some(s => s.src === src)) continue;
        const element: {src: T, result?: R, emitted: boolean} = {src, emitted: false};
        elements$.value.push(element);
        newSubscriptions.push({src, subscription: mapper(src).subscribe(result => {
          element.result = result;
          element.emitted = true;
          elements$.next(elements$.value);
        })});
      }
      subscriptions = newSubscriptions;
      return elements$.pipe(
        switchMap(elements => {
          const result: R[] = [];
          for (const e of elements) {
            if (!e.emitted) return EMPTY;
            result.push(e.result as any);
          }
          return of(result);
        })
      );
    })
  );
}
