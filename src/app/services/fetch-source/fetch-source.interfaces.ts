import L from 'leaflet';
import { Trail } from 'src/app/model/trail';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from '../database/track-database';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { ComputedPreferences } from '../preferences/preferences';
import { Injector } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

export abstract class FetchSourcePlugin {

  constructor(
    protected readonly injector: Injector,
  ) {
    this.sanitizer = injector.get(DomSanitizer);
  }

  protected readonly sanitizer: DomSanitizer;

  public readonly abstract name: string;
  public readonly abstract owner: string;

  public abstract canFetchTrailInfoByUrl(url: string): boolean;
  public abstract fetchTrailInfoByUrl(url: string): Promise<TrailInfo | null>;

  public abstract canFetchTrailInfoByContent(html: Document): boolean;
  public abstract fetchTrailInfoByContent(html: Document): Promise<TrailInfo | null>;

  public abstract canFetchTrailByUrl(url: string): boolean;
  public abstract fetchTrailByUrl(url: string): Promise<Trail | null>;

  public abstract canFetchTrailsByUrl(url: string): boolean;
  public abstract fetchTrailsByUrl(url: string): Promise<Trail[]>;

  public abstract canFetchTrailByContent(html: Document): boolean;
  public abstract fetchTrailByContent(html: Document): Promise<Trail | null>;

  public abstract canFetchTrailsByContent(html: Document): boolean;
  public abstract fetchTrailsByContent(html: Document): Promise<Trail[]>;

  public abstract canSearchByArea(): boolean;
  public abstract searchByArea(bounds: L.LatLngBounds): Promise<{trails: Trail[], tooMuchResults: boolean}>;

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
      let wp = cwp.find(w => w.isDeparture === wpi.isDeparture && w.isArrival === wpi.isArrival);
      if (!wp) wp = cwp.find(w => (wpi.isDeparture && w.isDeparture) || (wpi.isArrival && w.isArrival));
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
