import * as L from 'leaflet';
import { Trail, TrailActivity } from 'src/app/model/trail';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from '../database/track-database';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { ComputedPreferences } from '../preferences/preferences';
import { Injector } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { BehaviorSubject, EMPTY, first, Observable, of, switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { NetworkService } from '../network/network.service';
import { Filters } from 'src/app/components/trails-list/trails-list.component';

export abstract class FetchSourcePlugin {

  constructor(
    protected readonly injector: Injector,
  ) {
    this.sanitizer = injector.get(DomSanitizer);
    this.listenAllowed();
  }

  protected listenAllowed(): void {
    this.injector.get(AuthService).auth$.pipe(
      switchMap(a => !a || a.isAnonymous ? of(false) :
        this.injector.get(NetworkService).server$.pipe(
          switchMap(n => n ? this.checkAllowed$() : EMPTY),
          first(),
        )
      )
    ).subscribe(allowed => {
      if (this._allowed$.value !== allowed) this._allowed$.next(allowed);
    });
  }

  protected readonly sanitizer: DomSanitizer;
  protected readonly _allowed$ = new BehaviorSubject<boolean>(false);
  public get allowed$(): Observable<boolean> { return this._allowed$; }
  public get allowed(): boolean { return this._allowed$.value; }

  public readonly abstract name: string;
  public readonly abstract owner: string;

  public readonly abstract canFetchFromUrl: boolean;

  protected abstract checkAllowed$(): Observable<boolean>;

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

  public canSearchBubbles(): boolean { return false; };
  public searchBubbles(bounds: L.LatLngBounds, zoom: number, filters: Filters): Observable<SearchBubblesResult[]> { return of([]); }

  public abstract getInfo(uuid: string): Promise<TrailInfo | null>;
  public abstract getTrail(uuid: string): Promise<Trail | null>;
  public abstract getMetadata(uuid: string): Promise<TrackMetadataSnapshot | null>;
  public abstract getSimplifiedTrack(uuid: string): Promise<SimplifiedTrackSnapshot | null>;
  public abstract getFullTrack(uuid: string): Promise<Track | null>;

  public abstract forceRefresh(uuid: string): Promise<Trail | null>;
}

export interface TrailInfo {

  description?: string;
  location?: string;
  activity?: TrailActivity;
  wayPoints?: WayPointInfo[];
  photos?: PhotoInfo[];
  key?: string;
  externalUrl?: string;
  rating?: number; // 0 to 5
  nbRate0?: number;
  nbRate1?: number;
  nbRate2?: number;
  nbRate3?: number;
  nbRate4?: number;
  nbRate5?: number;
  nbRates?: number;
  oscmSymbol?: string;
  author?: string;
  myUuid?: string;
  itsMine?: boolean;

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

export interface SearchBubblesResult {
  pos: L.LatLngLiteral;
  count: number;
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
