import { NgZone } from '@angular/core';
import { BehaviorSubject, combineLatest, filter, first, map, Observable, switchMap } from 'rxjs';
import { Console } from 'src/app/utils/console';
import { StoreSyncStatus } from './store';

export class StoreOperations {

  constructor(
    private readonly name: string,
    private readonly storeLoaded$: BehaviorSubject<boolean>,
    private readonly syncStatus$: Observable<StoreSyncStatus | null>,
    private readonly ngZone: NgZone,
  ) {}

  public push(description: string, operation: () => Promise<any>): void {
    this._queue$.value.push({description, operation});
    if (this._inProgress$.value) return;
    if (this.storeLoaded$.value) {
      this.launch();
      return;
    }
    if (this._queue$.value.length === 1) {
      this._queue$.next(this._queue$.value);
      this.storeLoaded$.pipe(
        filter(loaded => loaded),
        first()
      ).subscribe(() => this.launch());
    }

  }

  public get hasPendingOperations$() { return combineLatest([this._inProgress$, this._queue$]).pipe(map(([progress, queue]) => progress || queue.length > 0)); }
  public get pendingOperations() { return this._queue$.value.length; }

  public requestSync(onready: () => Observable<boolean>): Observable<boolean> {
    return this._inProgress$.pipe(
      filter(p => {
        if (p) Console.info('Store ' + this.name + ' waiting for ' + this._queue$.value.length + ' operations to finish before sync');
        return !p;
      }),
      first(),
      switchMap(onready),
    );
  }

  public reset(): void {
    this._queue$.next([]);
    this._inProgress$.next(false);
  }

  private readonly _inProgress$ = new BehaviorSubject<boolean>(false);
  private readonly _queue$ = new BehaviorSubject<{description: string, operation: () => Promise<any>}[]>([]);

  private launch(): void {
    this._inProgress$.next(true);
    this._queue$.next(this._queue$.value);
    this.ngZone.runOutsideAngular(() => {
      this.syncStatus$.pipe(
        filter(s => !!s && !s.inProgress),
        first(),
      ).subscribe(() => setTimeout(() => this.executeNextOperation(Date.now(), 0), 0));
    });
  }

  private executeNextOperation(startTime: number, deep: number): void {
    if (this._queue$.value.length === 0) {
      Console.debug('No more operations on store ' + this.name);
      this._inProgress$.next(false);
      return;
    }
    const next = this._queue$.value.splice(0, 1)[0];
    Console.debug('Executing operation on store ' + this.name + ': ' + next.description);
    next.operation()
    .then(() => {
      Console.debug('Operation success on store ' + this.name + ': ' + next.description);
      this.continueExecution(startTime, deep);
    })
    .catch(e => {
      Console.error('Error during operation on store ' + this.name + ': ' + next.description, e);
      this.continueExecution(startTime, deep);
    })
  }

  private continueExecution(startTime: number, deep: number): void {
    this.ngZone.runOutsideAngular(() => {
      this._queue$.next(this._queue$.value);
      if (Date.now() - startTime > 1000 || deep > 100) {
        Console.info('Store ' + this.name + ': still ' + this._queue$.value.length + ' operations pending');
        setTimeout(() => this.executeNextOperation(Date.now(), 0), 0);
      } else
        this.executeNextOperation(startTime, deep + 1);
    });
  }

}
