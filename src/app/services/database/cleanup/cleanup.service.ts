import { Injectable, Injector, NgZone, OnDestroy } from '@angular/core';
import { Console } from 'src/app/utils/console';
import { TraceRecorderService } from '../../trace-recorder/trace-recorder.service';

const STARTUP_GRACE_PERIOD = 60000;
const CLEANUP_DELAY = 10000;
const CLEANUP_TIMEOUT = 120000;
const LOCAL_STORAGE_KEY_PREFIX = 'trailence.cleanup.';

export interface ToCleanup {
  id: string;
  name: string;
  every: number;
  execute: () => Promise<string>;
}

interface Cleanup extends ToCleanup {
  lastRun: number;
  nextRun: number;
}

@Injectable({providedIn: 'root'})
export class CleanupService implements OnDestroy {

  constructor(
    private readonly ngZone: NgZone,
    private readonly injector: Injector,
  ) {
    this.sort();
  }

  private started = false;
  private timeout: any = undefined;
  private nextTimeout = 0;
  private lastRun = 0;
  private readonly todo: Cleanup[] = [];
  private _destroyed = false;

  ngOnDestroy(): void {
    this._destroyed = true;
    if (this.timeout) clearTimeout(this.timeout);
  }

  public add(toCleanup: ToCleanup): void {
    this.remove(toCleanup.id);
    const lastRunStr = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + toCleanup.id);
    let lastRun = lastRunStr ? Number.parseInt(lastRunStr) : 0;
    if (Number.isNaN(lastRun)) lastRun = 0;
    this.todo.push({...toCleanup, lastRun, nextRun: lastRun + toCleanup.every});
    this.sort();
  }

  public remove(id: string): void {
    const index = this.todo.findIndex(t => t.id === id);
    if (index >= 0) {
      this.todo.splice(index, 1);
      this.sort();
    }
  }

  private sort(): void {
    if (this._destroyed) return;
    this.todo.sort((t1, t2) => t1.nextRun - t2.nextRun);

    if (!this.started) {
      if (!this.timeout) {
        this.nextTimeout = Date.now() + STARTUP_GRACE_PERIOD;
        this.ngZone.runOutsideAngular(() => this.timeout = setTimeout(() => {
          this.started = true;
          this.timeout = undefined;
          this.sort();
        }, STARTUP_GRACE_PERIOD));
      }
      return;
    }

    if (this.todo.length === 0) {
      // should never happen, let's restart
      this.started = false;
      if (this.timeout) this.ngZone.runOutsideAngular(() => clearTimeout(this.timeout));
      this.timeout = undefined;
      this.sort();
      return;
    }

    if (this.injector.get(TraceRecorderService).recording) {
      // delay to avoid using battery
      if (this.timeout) this.ngZone.runOutsideAngular(() => clearTimeout(this.timeout));
      this.ngZone.runOutsideAngular(() => this.timeout = setTimeout(() => this.sort(), 10 * 60 * 1000));
      return;
    }

    const nextRun = Math.max(this.todo[0].nextRun, this.lastRun + CLEANUP_DELAY);
    if (this.timeout && this.nextTimeout === nextRun) return;
    if (this.timeout) this.ngZone.runOutsideAngular(() => clearTimeout(this.timeout));
    this.nextTimeout = nextRun;
    this.ngZone.runOutsideAngular(() => this.timeout = setTimeout(() => this.run(), Math.max(10, this.nextTimeout - Date.now())));
  }

  private run(): void {
    if (this._destroyed) return;
    let todo = this.todo.at(0);
    if (!todo) return; // should never happen
    if (todo.nextRun > Date.now()) {
      this.sort();
      return;
    }
    const start = Date.now();
    let done = false;
    todo.execute()
    .then(result => {
      Console.info('[CLEANUP]', todo.name, result, 'in', (Date.now() - start), 'ms.');
      todo.lastRun = Date.now();
      todo.nextRun = todo.lastRun + todo.every;
      localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + todo.id, '' + todo.lastRun);
      this.lastRun = todo.lastRun;
      this.sort();
      done = true;
    })
    .catch(e => {
      Console.error('[CLEANUP]', todo.name, e);
      todo.lastRun = Date.now();
      todo.nextRun = todo.lastRun + todo.every;
      localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + todo.id, '' + todo.lastRun);
      this.lastRun = todo.lastRun;
      this.sort();
      done = true;
    });
    this.ngZone.runOutsideAngular(() => setTimeout(() => {
      if (done) return;
      todo.lastRun = Date.now();
      todo.nextRun = todo.lastRun + todo.every + 60 * 60 * 1000;
      this.lastRun = todo.lastRun;
      this.sort();
    }, CLEANUP_TIMEOUT));
  }

}
