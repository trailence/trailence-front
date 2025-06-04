import * as L from 'leaflet';
import { Trail } from 'src/app/model/trail';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from '../database/track-database';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { ComputedPreferences } from '../preferences/preferences';
import { Injector } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Observable, of } from 'rxjs';

export abstract class FetchSourcePlugin {

  constructor(
    protected readonly injector: Injector,
  ) {
    this.sanitizer = injector.get(DomSanitizer);
  }

  protected readonly sanitizer: DomSanitizer;

  public readonly abstract name: string;
  public readonly abstract owner: string;

  public readonly abstract canFetchFromUrl: boolean;

  public canFetchTrailInfoByUrl(url: string): boolean { return false };
  public fetchTrailInfoByUrl(url: string): Promise<TrailInfo | null> { return Promise.resolve(null); };

  public canFetchTrailInfoByContent(html: Document): boolean { return false };
  public fetchTrailInfoByContent(html: Document): Promise<TrailInfo | null> { return Promise.resolve(null); };

  public canFetchTrailByUrl(url: string): boolean { return false };
  public fetchTrailByUrl(url: string): Promise<Trail | null> { return Promise.resolve(null); };

  public canFetchTrailsByUrl(url: string): boolean { return false };
  public fetchTrailsByUrl(url: string): Promise<Trail[]> { return Promise.resolve([]); };

  public canFetchTrailByContent(html: Document): boolean { return false };
  public fetchTrailByContent(html: Document): Promise<Trail | null> { return Promise.resolve(null); };

  public canFetchTrailsByContent(html: Document): boolean { return false };
  public fetchTrailsByContent(html: Document): Promise<Trail[]> { return Promise.resolve([]); };

  public canSearchByArea(): boolean { return false };
  public searchByArea(bounds: L.LatLngBounds, limit: number): Observable<SearchResult> { return of({trails: [], end: true, tooManyResults: false}); }

  public abstract getInfo(uuid: string): Promise<TrailInfo | null>;
  public abstract getTrail(uuid: string): Promise<Trail | null>;
  public abstract getMetadata(uuid: string): Promise<TrackMetadataSnapshot | null>;
  public abstract getSimplifiedTrack(uuid: string): Promise<SimplifiedTrackSnapshot | null>;
  public abstract getFullTrack(uuid: string): Promise<Track | null>;
}

export interface TrailInfo {

  description?: string;
  location?: string;
  wayPoints?: WayPointInfo[];
  photos?: PhotoInfo[];
  key?: string;
  externalUrl?: string;
  rating?: number; // 0 to 5
  oscmSymbol?: string;

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
  pos?: L.LatLngLiteral;
  time?: number;
}

export interface SearchResult {
  trails: Trail[];
  end: boolean;
  tooManyResults: boolean;
}

export function populateWayPointInfo(track: Track, fetched: WayPointInfo[], preferences: ComputedPreferences): boolean { // NOSONAR
  let updated = false;
  const cwp = ComputedWayPoint.compute(track, preferences);
  for (const wpi of fetched) {
    if (wpi.number !== undefined) {
      const wp = cwp.find(w => w.index === wpi.number);
      if (wp) {
        if (wp.wayPoint.description.trim().length === 0 && wpi.description) {
          wp.wayPoint.description = wpi.description.trim();
          updated = true;
        }
      }
    } else if (wpi.isDeparture || wpi.isArrival) {
      let wp = cwp.find(w => w.isDeparture === wpi.isDeparture && w.isArrival === wpi.isArrival)
        ?? cwp.find(w => (wpi.isDeparture && w.isDeparture) || (wpi.isArrival && w.isArrival));
      if (wp) {
        if (wp.wayPoint.description.trim().length === 0 && wpi.description) {
          wp.wayPoint.description = wpi.description.trim();
          updated = true;
          if (track.wayPoints.indexOf(wp.wayPoint) < 0) {
            track.appendWayPoint(wp.wayPoint);
          }
        }
      }
    }
  }
  return updated;
}
