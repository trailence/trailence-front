import { Injectable } from '@angular/core';
import { GEOLOCATION_MAX_AGE, GEOLOCATION_TIMEOUT, GeolocationState, IGeolocationService } from './geolocation.interface';
import { PointDto } from 'src/app/model/dto/point';
import { BehaviorSubject } from 'rxjs';
import { Console } from 'src/app/utils/console';

@Injectable({
  providedIn: 'root'
})
export class GeolocationService implements IGeolocationService {

  private readonly _waitingForGps$ = new BehaviorSubject<boolean>(false);
  private readonly _lastKnownPosition$ = new BehaviorSubject<{position: PointDto, timestamp: number} | undefined>(undefined);

  private watchId?: number;
  private readonly watchListeners: ({listener: (position: PointDto) => void, onerror?: (error: any) => void})[] = [];

  private readonly options: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: GEOLOCATION_MAX_AGE,
    timeout: GEOLOCATION_TIMEOUT
  }

  constructor() { }

  public readonly isNative = false;
  public get waitingForGps$() { return this._waitingForGps$; }
  public get waitingForGps() { return this._waitingForGps$.value; }
  public get lastKnownPosition$() { return this._lastKnownPosition$; }
  public get lastKnownPosition() { return this._lastKnownPosition$.value; }

  getState(): Promise<GeolocationState> {
    return globalThis.navigator.permissions.query({name: 'geolocation'})
    .then(status => {
      Console.info('geolocation permission', status, status.state);
      if (status.state === 'granted') {
        return GeolocationState.ENABLED;
      }
      if (status.state === 'prompt') {
        Console.info('geolocation permission must be prompt');
        return new Promise((resolve, error) => {
          let done = false;
          const check = () => {
            this.getCurrentPosition().then(p => {
              Console.info('getCurrentPosition returned a position => consider it as enabled', p);
              done = true;
              resolve(GeolocationState.ENABLED);
            });
          };
          const listener = () => {
            Console.info('geolocation permission status changed', status, status.state);
            if (done) {
              status.removeEventListener('change', listener);
              return;
            }
            if (status.state === 'granted') {
              done = true;
              resolve(GeolocationState.ENABLED);
              status.removeEventListener('change', listener);
            } else if (status.state === 'denied') {
              done = true;
              resolve(GeolocationState.DENIED);
              status.removeEventListener('change', listener);
            } else {
              check();
            }
          };
          status.addEventListener('change', listener);
          check();
        });
      }
      return GeolocationState.DENIED;
    });
  }

  public getCurrentPosition(): Promise<PointDto> {
    return new Promise((resolve, error) => {
      globalThis.navigator.geolocation.getCurrentPosition(
        position => {
          resolve(this.positionToPointDto(position));
        },
        error,
        this.options
      );
    });
  }

  public watchPosition(
    notifMessage: string,
    listener: (position: PointDto) => void,
    onerror?: (error: any) => void
  ): void {
    this._waitingForGps$.next(true);
    this.getCurrentPosition()
    .then(pos => {
      this._waitingForGps$.next(false);
      listener(pos);
    })
    .catch(e => {
      Console.warn('Geolocation error', e);
      if (onerror) onerror(e);
    });
    this.watchListeners.push({listener, onerror});
    if (!this.watchId) {
      Console.info('start watching geolocation');
      this.watchId = globalThis.navigator.geolocation.watchPosition(pos => this.emitPosition(pos), err => this.emitError(err), this.options);
    }
  }

  public stopWatching(listener: (position: PointDto) => void): void {
    const index = this.watchListeners.findIndex(l => l.listener === listener);
    if (index >= 0) {
      this.watchListeners.splice(index, 1);
      if (this.watchListeners.length === 0) {
        Console.info('stop watching geolocation');
        globalThis.navigator.geolocation.clearWatch(this.watchId!);
        this.watchId = undefined;
        this._waitingForGps$.next(false);
      }
    }
  }

  private positionToPointDto(position: GeolocationPosition): PointDto {
    const dto = {
      l: position.coords.latitude,
      n: position.coords.longitude,
      e: position.coords.altitude ?? undefined,
      t: position.timestamp,
      pa: position.coords.accuracy,
      ea: position.coords.altitudeAccuracy ?? undefined,
      h: position.coords.heading ?? undefined,
      s: position.coords.speed ?? undefined,
    };
    this._lastKnownPosition$.next({position: dto, timestamp: Date.now()});
    return dto;
  }

  private emitPosition(position: GeolocationPosition): void {
    this._waitingForGps$.next(false);
    const dto = this.positionToPointDto(position);
    for (const l of this.watchListeners)
      l.listener(dto);
  }

  private emitError(err: any): void {
    Console.warn('Geolocation error', err);
    this._waitingForGps$.next(true);
    for (const l of this.watchListeners)
      if (l.onerror) l.onerror(err);
  }

}
