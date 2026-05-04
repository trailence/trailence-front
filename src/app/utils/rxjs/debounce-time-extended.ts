import { MonoTypeOperatorFunction, Observable, SchedulerLike, Subscription, asyncScheduler } from 'rxjs';
import { executeSchedule } from 'rxjs/internal/util/executeSchedule';

export function debounceTimeExtended<T>(
  initialDelay: number | ((firstValue: T) => number),
  subsequentDelay: number | ((value: T) => number),
  maximumPending: number = -1,
  predicateSkipDelay: (previousEmission: T, newValue: T) => boolean = () => false,
  maximumDelay: number = -1,
  scheduler: SchedulerLike = asyncScheduler,
): MonoTypeOperatorFunction<T> {
  return source => new Observable(destination => {
    let lastValue: T;
    let lastEmission: T;
    let lastEmissionTime = 0;
    let activeTask: Subscription | undefined;
    let firstEmitted = false;
    let pending = 0;

    const subscription = source.subscribe({
      next: value => {
        lastValue = value;
        pending++;
        activeTask?.unsubscribe();
        activeTask = undefined;
        const delay = firstEmitted ? (typeof subsequentDelay === 'number' ? subsequentDelay : subsequentDelay(value)) : (typeof initialDelay === 'number' ? initialDelay : initialDelay(value));
        let now = Date.now();
        if ((maximumPending > 0 && pending >= maximumPending) ||
            delay <= 0 ||
            (firstEmitted && maximumDelay > 0 && now - lastEmissionTime >= maximumDelay) ||
            (firstEmitted && predicateSkipDelay(lastEmission, value))) {
          // emit now
          firstEmitted = true;
          pending = 0;
          lastEmission = value;
          lastEmissionTime = now;
          destination.next(value);
          return;
        }
        activeTask = executeSchedule(
          destination,
          scheduler,
          () => {
            activeTask = undefined;
            const v = lastValue;
            lastValue = null!;
            firstEmitted = true;
            pending = 0;
            lastEmission = value;
            lastEmissionTime = Date.now();
            destination.next(v);
          },
          delay
        );
      },
      complete: () => {
        if (activeTask) {
          activeTask.unsubscribe();
          destination.next(lastValue);
        }
        destination.complete();
        lastValue = activeTask = null!
      },
      error: e => {
        activeTask?.unsubscribe();
        destination.error(e);
        lastValue = activeTask = null!
      },
    });
    return () => subscription.unsubscribe();
  });
}
