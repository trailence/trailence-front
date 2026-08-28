import { FilterEnum, FilterNumeric, FilterTags } from 'src/app/components/filters/filter';
import { LocaleKey } from '../i18n/available-locales';
import { TrailLoopType } from 'src/app/model/dto/trail-loop-type';
import { TrailActivity } from 'src/app/model/dto/trail-activity';

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

export interface Filters {
  duration: FilterNumeric;
  estimatedDuration: FilterNumeric;
  distance: FilterNumeric;
  positiveElevation: FilterNumeric;
  negativeElevation: FilterNumeric;
  loopTypes: FilterEnum<TrailLoopType>;
  activities: FilterEnum<TrailActivity | undefined>;
  onlyVisibleOnMap: boolean;
  onlyWithPhotos: boolean;
  tags: FilterTags;
  search: string;
  rate: FilterNumeric;
}
