export type ElevationUnit = 'METERS' | 'FOOT';
export type DistanceUnit = 'METERS' | 'MILES';
export type HourFormat = 'H12' | 'H24';
export type DateFormat = 'm/d/yyyy' | 'dd/mm/yyyy';


export interface Preferences {

  lang?: string;
  elevationUnit?: ElevationUnit;
  distanceUnit?: DistanceUnit;
  hourFormat?: HourFormat;
  dateFormat?: DateFormat;

}
