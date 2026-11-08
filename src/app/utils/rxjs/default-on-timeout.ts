import { MonoTypeOperatorFunction, Observable, SchedulerLike, Subscription, asyncScheduler } from 'rxjs';
import { executeSchedule } from 'rxjs/internal/util/executeSchedule';

export function defaultOnTimeout<S, T>(
  timeout: number,
  itemOnTimeout: () => T,
  scheduler: SchedulerLike = asyncScheduler,
): MonoTypeOperatorFunction<S | T> {
  return source => new Observable(destination => {
    let activeTask: Subscription | undefined;
    let subscription: Subscription | undefined = undefined;
    activeTask = executeSchedule(
      destination,
      scheduler,
      () => {
        activeTask = undefined;
        destination.next(itemOnTimeout());
      },
      timeout
    );

    subscription = source.subscribe({
      next: value => {
        activeTask?.unsubscribe();
        activeTask = undefined;
        destination.next(value);
      },
      complete: () => {
        activeTask?.unsubscribe();
        activeTask = undefined;
        destination.complete();
      },
      error: e => {
        activeTask?.unsubscribe();
        activeTask = undefined;
        destination.error(e);
      },
    });
    return () => {
      subscription?.unsubscribe();
      activeTask?.unsubscribe();
    };
  });
}
