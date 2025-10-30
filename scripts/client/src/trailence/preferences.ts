import { ComputedPreferences } from 'front/services/preferences/preferences';
import { EMPTY } from 'rxjs';

export const preferences: ComputedPreferences = {
  lang: 'en',
  distanceUnit: 'METERS',
  hourFormat: 'H12',
  dateFormat: 'm/d/yyyy',
  theme: 'LIGHT',

  traceMinMeters: 2,
  traceMinMillis: 5000,

  offlineMapMaxKeepDays: 1,
  offlineMapMaxZoom: 1,

  estimatedBaseSpeed: 5000,
  longBreakMinimumDuration: 5 * 60 * 1000,
  longBreakMaximumDistance: 50,

  photoMaxPixels: 600,
  photoMaxQuality: 75,
  photoMaxSizeKB: 250,
  photoCacheDays: 1,

  alias: '',
};

export class FakePreferencesService {
  public preferences$ = EMPTY;
  public preferences = preferences;
}
