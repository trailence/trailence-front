import L from 'leaflet';
import { Trail } from 'src/app/model/trail';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from '../database/track-database';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { ComputedPreferences } from '../preferences/preferences';

export interface FetchSourcePlugin {

  name: string;
  owner: string;

  canFetchTrailInfo(url: string): boolean;
  fetchTrailInfo(url: string): Promise<TrailInfo | null>;

  canSearchByArea(): boolean;
  searchByArea(bounds: L.LatLngBounds): Promise<Trail[]>;

  getInfo(uuid: string): Promise<TrailInfo | null>;
  getTrail(uuid: string): Promise<Trail | null>;
  getMetadata(uuid: string): Promise<TrackMetadataSnapshot | null>;
  getSimplifiedTrack(uuid: string): Promise<SimplifiedTrackSnapshot | null>;
  getFullTrack(uuid: string): Promise<Track | null>;
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
