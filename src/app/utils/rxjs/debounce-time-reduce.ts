import { MonoTypeOperatorFunction, Observable, SchedulerLike, Subscription, asyncScheduler } from 'rxjs';
import { executeSchedule } from 'rxjs/internal/util/executeSchedule';

export function debounceTimeReduce<T>(
  initialDelay: number,
  subsequentDelay: number,
  accumulator: (previous: T, newValue: T) => T,
  scheduler: SchedulerLike = asyncScheduler,
): MonoTypeOperatorFunction<T> {
  return source => new Observable(destination => {
    let currentValue: T | undefined;
    let activeTask: Subscription | undefined;
    let firstEmitted = false;

    const subscription = source.subscribe({
      next: value => {
        activeTask?.unsubscribe();
        activeTask = undefined;
        if (!firstEmitted && initialDelay <= 0) {
          // emit now the first value
          firstEmitted = true;
          destination.next(value);
          return;
        }
        currentValue = currentValue ? accumulator(currentValue, value) : value;
        activeTask = executeSchedule(
          destination,
          scheduler,
          () => { // NOSONAR
            activeTask = undefined;
            const v = currentValue;
            currentValue = undefined;
            firstEmitted = true;
            destination.next(v);
          },
          firstEmitted ? subsequentDelay : initialDelay
        );
      },
      complete: () => {
        if (activeTask) {
          activeTask.unsubscribe();
          if (currentValue)
            destination.next(currentValue);
        }
        destination.complete();
        currentValue = activeTask = undefined;
      },
      error: e => {
        activeTask?.unsubscribe();
        destination.error(e);
        currentValue = activeTask = undefined;
      },
    });
    return () => subscription.unsubscribe();
  });
}
