import { MonoTypeOperatorFunction, Observable, SchedulerLike, Subscription, asyncScheduler } from 'rxjs';
import { executeSchedule } from 'rxjs/internal/util/executeSchedule';

export function debounceTimeExtended<T>(
  initialDelay: number,
  subsequentDelay: number,
  maximumPending: number,
  predicateSkipDelay: (previousEmission: T, newValue: T) => boolean = () => false,
  scheduler: SchedulerLike = asyncScheduler,
): MonoTypeOperatorFunction<T> {
  return source => new Observable(destination => {
    let lastValue: T;
    let lastEmission: T;
    let activeTask: Subscription | undefined;
    let firstEmitted = false;
    let pending = 0;

    source.subscribe({
      next: value => {
        lastValue = value;
        pending++;
        activeTask?.unsubscribe();
        activeTask = undefined;
        if ((maximumPending > 0 && pending >= maximumPending) ||
            (!firstEmitted && initialDelay <= 0) ||
            (firstEmitted && predicateSkipDelay(lastEmission, value))) {
          // emit now
          firstEmitted = true;
          pending = 0;
          lastEmission = value;
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
            destination.next(v);
          },
          firstEmitted ? subsequentDelay : initialDelay
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
  });
}

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

    source.subscribe({
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
          () => {
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
  });
}