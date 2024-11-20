import { MonoTypeOperatorFunction, Observable, SchedulerLike, Subscription, asyncScheduler } from 'rxjs';
import { executeSchedule } from 'rxjs/internal/util/executeSchedule';

export function filterTimeout<T>(
  predicate: (item: T) => boolean,
  timeout: number,
  itemOnTimeout: () => T,
  scheduler: SchedulerLike = asyncScheduler,
): MonoTypeOperatorFunction<T> {
  return source => new Observable(destination => {
    let activeTask: Subscription | undefined;
    let subscription: Subscription | undefined = undefined;

    subscription = source.subscribe({
      next: value => {
        if (predicate(value)) {
          activeTask?.unsubscribe();
          activeTask = undefined;
          destination.next(value);
          return;
        }

        if (activeTask) return;
        activeTask = executeSchedule(
          destination,
          scheduler,
          () => { // NOSONAR
            activeTask = undefined;
            destination.next(itemOnTimeout());
          },
          timeout
        );
      },
      complete: () => {
        if (activeTask) {
          activeTask.unsubscribe();
          activeTask = undefined;
        }
        destination.complete();
      },
      error: e => {
        if (activeTask) {
          activeTask.unsubscribe();
          activeTask = undefined;
        }
        destination.error(e);
      },
    });
    return () => subscription?.unsubscribe();
  });
}
