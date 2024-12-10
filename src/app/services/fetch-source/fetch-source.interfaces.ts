import { DomSanitizer } from '@angular/platform-browser';
import L from 'leaflet';
import { Trail } from 'src/app/model/trail';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from '../database/track-database';
import { Track } from 'src/app/model/track';

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
