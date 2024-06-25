import { PointDto } from 'src/app/model/dto/point';

export const GEOLOCATION_MAX_AGE = 15000;
export const GEOLOCATION_TIMEOUT = 5000;

export interface IGeolocationService {

  waitingForGps: boolean;

  getCurrentPosition(): Promise<PointDto>;

  watchPosition(listener: (position: PointDto) => void, onerror?: (error: any) => void): void;

  stopWatching(listener: (position: PointDto) => void): void;

}
