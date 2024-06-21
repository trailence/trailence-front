import { Injectable } from '@angular/core';
import { GEOLOCATION_MAX_AGE, GEOLOCATION_TIMEOUT, IGeolocationService } from './geolocation.interface';
import { PointDto } from 'src/app/model/dto/point';

@Injectable({
  providedIn: 'root'
})
export class GeolocationService implements IGeolocationService {

  private watchId?: number;
  private watchListeners: ({listener: (position: PointDto) => void, onerror?: (error: any) => void})[] = [];

  private options: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: GEOLOCATION_MAX_AGE,
    timeout: GEOLOCATION_TIMEOUT
  }

  constructor() { }

  public getCurrentPosition(): Promise<PointDto> {
    return new Promise((resolve, error) => {
      window.navigator.geolocation.getCurrentPosition(
        position => {
          resolve(this.positionToPointDto(position));
        },
        error,
        this.options
      );
    });
  }

  public watchPosition(
    listener: (position: PointDto) => void,
    onerror?: (error: any) => void
  ): void {
    const initial = this.getCurrentPosition().then(pos => listener(pos));
    if (onerror) initial.catch(onerror);
    this.watchListeners.push({listener, onerror});
    if (!this.watchId) {
      this.watchId = window.navigator.geolocation.watchPosition(pos => this.emitPosition(pos), err => this.emitError(err), this.options);
    }
  }

  public stopWatching(listener: (position: PointDto) => void): void {
    const index = this.watchListeners.findIndex(l => l.listener === listener);
    if (index >= 0) {
      this.watchListeners.splice(index, 1);
      if (this.watchListeners.length === 0) {
        window.navigator.geolocation.clearWatch(this.watchId!);
        this.watchId = undefined;
      }
    }
  }

  private positionToPointDto(position: GeolocationPosition): PointDto {
    return {
      l: position.coords.latitude,
      n: position.coords.longitude,
      e: position.coords.altitude == null ? undefined : position.coords.altitude,
      t: position.timestamp,
      pa: position.coords.accuracy,
      ea: position.coords.altitudeAccuracy == null ? undefined : position.coords.altitudeAccuracy,
      h: position.coords.heading == null ? undefined : position.coords.heading,
      s: position.coords.speed == null ? undefined : position.coords.speed,
    };
  }

  private emitPosition(position: GeolocationPosition): void {
    const dto = this.positionToPointDto(position);
    for (const l of this.watchListeners)
      l.listener(dto);
  }

  private emitError(err: any): void {
    for (const l of this.watchListeners)
      if (l.onerror) l.onerror(err);
  }

}
