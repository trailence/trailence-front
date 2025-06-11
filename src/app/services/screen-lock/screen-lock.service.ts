import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import Trailence from '../trailence.service';

@Injectable({providedIn: 'root'})
export class ScreenLockService {

  constructor() {
    this.init();
  }

  public get available$(): Observable<boolean> { return this._available$; }
  public get enabled$(): Observable<boolean> { return this._enabled$; }

  private readonly _available$ = new BehaviorSubject<boolean>(false);
  private readonly _enabled$ = new BehaviorSubject<boolean>(false);

  private init(): void {
    Trailence.canKeepOnScreenLock({}).then(response => {
      if (response.allowed) {
        this._available$.next(true);
        Trailence.getKeepOnScreenLock({}).then(response => {
          this._enabled$.next(response.enabled);
        });
      }
    });
  }

  public set(enabled: boolean): Promise<boolean> {
    return Trailence.setKeepOnScreenLock({enabled}).then(response => {
      if (response.success) {
        this._enabled$.next(enabled);
        return enabled;
      }
      return this._enabled$.value;
    });
  }

}
