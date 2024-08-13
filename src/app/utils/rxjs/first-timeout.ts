import { MonoTypeOperatorFunction, Observable, SchedulerLike, Subscription, asyncScheduler } from 'rxjs';
import { executeSchedule } from 'rxjs/internal/util/executeSchedule';

export function firstTimeout<T>(
  predicate: (item: T) => boolean,
  timeout: number,
  itemOnTimeout: () => T,
  scheduler: SchedulerLike = asyncScheduler,
): MonoTypeOperatorFunction<T> {
  return source => new Observable(destination => {
    let emitted = false;
    let activeTask: Subscription | undefined;
    let subscription: Subscription | undefined = undefined;

    subscription = source.subscribe({
      next: value => {
        if (emitted) {
          subscription?.unsubscribe();
          subscription = undefined;
          return;
        }
        if (predicate(value)) {
          emitted = true;
          subscription?.unsubscribe();
          subscription = undefined;
          destination.next(value);
          destination.complete();
          return;
        }

        activeTask?.unsubscribe();
        activeTask = undefined;
        activeTask = executeSchedule(
          destination,
          scheduler,
          () => {
            activeTask = undefined;
            subscription?.unsubscribe();
            subscription = undefined;
            if (emitted) return;
            emitted = true;
            destination.next(itemOnTimeout());
            destination.complete();
          },
          timeout
        );
      },
      complete: () => {
        if (activeTask) {
          activeTask.unsubscribe();
          activeTask = undefined;
        }
        if (!emitted) {
          destination.next(itemOnTimeout());
          destination.complete();
        }
      },
      error: e => {
        if (activeTask) {
          activeTask.unsubscribe();
          activeTask = undefined;
        }
        if (!emitted) {
          destination.error(e);
        }
      },
    });
    return () => subscription?.unsubscribe();
  });
}
