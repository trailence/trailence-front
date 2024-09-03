import { Observable } from 'rxjs';
import { PointDto } from 'src/app/model/dto/point';

export const GEOLOCATION_MAX_AGE = 15000;
export const GEOLOCATION_TIMEOUT = 5000;

export enum GeolocationState {
  DISABLED,
  DENIED,
  ENABLED,
}

export interface IGeolocationService {

  waitingForGps$: Observable<boolean>;
  waitingForGps: boolean;

  getState(): Promise<GeolocationState>;

  getCurrentPosition(): Promise<PointDto>;

  watchPosition(notifMessage: string, listener: (position: PointDto) => void, onerror?: (error: any) => void): void;

  stopWatching(listener: (position: PointDto) => void): void;

}
