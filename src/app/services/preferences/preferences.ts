export type DistanceUnit = 'IMPERIAL' | 'METERS';
export type HourFormat = 'H12' | 'H24';
export type DateFormat = 'm/d/yyyy' | 'dd/mm/yyyy';
export type ThemeType = 'DARK' | 'LIGHT' | 'SYSTEM';

export interface Preferences {

  lang?: string;
  distanceUnit?: DistanceUnit;
  hourFormat?: HourFormat;
  dateFormat?: DateFormat;
  theme?: ThemeType;

  traceMinMeters?: number;
  traceMinMillis?: number;

  offlineMapMaxKeepDays?: number;
  offlineMapMaxZoom?: number;

  estimatedBaseSpeed?: number;
  longBreakMinimumDuration?: number;
  longBreakMaximumDistance?: number;

  photoMaxPixels?: number;
	photoMaxQuality?: number;
	photoMaxSizeKB?: number;
  photoCacheDays?: number;

  alias?: string;
}

export interface ComputedPreferences extends Preferences {

  lang: string;
  distanceUnit: DistanceUnit;
  hourFormat: HourFormat;
  dateFormat: DateFormat;
  theme: ThemeType;

  traceMinMeters: number;
  traceMinMillis: number;

  offlineMapMaxKeepDays: number;
  offlineMapMaxZoom: number;

  estimatedBaseSpeed: number;
  longBreakMinimumDuration: number;
  longBreakMaximumDistance: number;

  photoMaxPixels: number;
	photoMaxQuality: number;
	photoMaxSizeKB: number;
  photoCacheDays: number;

  alias: string;

}
