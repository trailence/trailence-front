import { DomSanitizer } from '@angular/platform-browser';

export interface FetchSourcePlugin {

  name: string;

  canFetchTrailInfo(url: string): boolean;

  fetchTrailInfo(url: string, sanitizer: DomSanitizer): Promise<TrailInfo>;
}

export interface TrailInfo {

  description?: string;
  wayPoints?: WayPointInfo[];
  photos?: PhotoInfo[];

}

export interface WayPointInfo {

  isDeparture?: boolean;
  isArrival?: boolean;
  number?: number;
  description?: string;

}

export interface PhotoInfo {
  url: string;
  description?: string;
}
