import { Filters } from 'src/app/components/trails-list/filters';
import { LocaleKey } from '../i18n/available-locales';

export type DistanceUnit = 'IMPERIAL' | 'METERS';
export type HourFormat = 'H12' | 'H24';
export type DateFormat = 'm/d/yyyy' | 'dd/mm/yyyy' | 'dd.mm.yyyy';
export type ThemeType = 'DARK' | 'LIGHT' | 'SYSTEM';

export interface Preferences {

  lang?: LocaleKey;
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

  elevationCalibrationByDevice?: {[device: string]: number};
  trailFilters?: {[name: string]: Filters};
}

export interface ComputedPreferences extends Preferences {

  lang: LocaleKey;
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

  elevationCalibrationByDevice?: {[device: string]: number};
  trailFilters?: {[name: string]: Filters};
}
