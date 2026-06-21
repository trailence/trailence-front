import { Injectable, Injector } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { Track } from 'src/app/model/track';
import { HikingDifficulty, Way, WaySurface, WayType, WayVisibility } from '../map/way';
import { DbTable, DbTableWhereEquals } from './storage/db-table';
import { Db, DbReady } from './storage/db';
import { AllWaysResponse } from '../map/ways';
import { OsmWaysTrackPoint } from 'src/app/utils/track-computed-data/match-osm-ways';
import { OsmWayMatchResponse } from 'src/app/utils/track-computed-data/track-computed-data';
import { TrackOsmStatInfo, TrackOsmStats } from 'src/app/utils/track-computed-data/track-osm-stats';
import { CleanupService } from './cleanup/cleanup.service';
import { TrackService } from './track.service';
import { POI } from '../map/poi';
import { PoisResponse } from '../map/pois';

export interface CacheItem {
  key: string;
  ownerUuid: string;
  trackVersion: number;
}

export interface AllWaysItem extends CacheItem {
  osmDataVersion: number;
  ways: Way[];
}

export interface OsmWaysMatchItem extends CacheItem {
  waysOnTrack: Way[],
  osmTrackPoints: OsmWaysTrackPoint[][],
  osmDataVersion: number | undefined,
}

export interface OsmStatsItem extends CacheItem {
  osmDataVersion: number | undefined;
  osmTotalDistanceMeters: number;
  wayType: Map<WayType, TrackOsmStatInfo>;
  surface: Map<WaySurface, TrackOsmStatInfo>;
  hikingDifficulty: Map<HikingDifficulty, TrackOsmStatInfo>;
  visibility: Map<WayVisibility, TrackOsmStatInfo>;
}

export interface GuidepostsItem extends CacheItem {
  osmDataVersion: number | undefined;
  pois: POI[],
}

function key(track: Track) {
  return track.uuid + '#' + track.version + '#' + track.owner;
}

function ownerUuid(track: Track) {
  return track.uuid + '#' + track.owner;
}

@Injectable({providedIn: 'root'})
export class TrackComputedDataCacheService {

  constructor(private readonly injector: Injector) {
    this.tableAllWays = new DbTable<AllWaysItem>(injector, 'all_ways', 'key, ownerUuid', 'key');
    this.tableGuideposts = new DbTable<GuidepostsItem>(injector, 'osm_guideposts', 'key, ownerUuid', 'key');
    this.tableOsmWaysMatch = new DbTable<OsmWaysMatchItem>(injector, 'osm_ways_match', 'key, ownerUuid', 'key');
    this.tableOsmStats = new DbTable<OsmStatsItem>(injector, 'osm_stats', 'key, ownerUuid', 'key');
    this.db = new Db(injector, 'trailence_track_data_cache', true, [
      this.tableAllWays,
      this.tableGuideposts,
      this.tableOsmWaysMatch,
      this.tableOsmStats,
    ]);
    this.db.onClosed$.subscribe(closed => injector.get(CleanupService).remove('track-computed-data-cache-' + closed.email));
    this.db.dbReady$.subscribe(ready => {
      if (ready)
        injector.get(CleanupService).add({
          id: 'track-computed-data-cache-' + ready.email,
          name: 'Track computed data cache',
          every: 10 * 24 * 60 * 60 * 1000,
          execute: () => this.cleanup(),
        });
    });
    this.db.start();
  }

  private readonly db: Db;
  private readonly tableAllWays: DbTable<AllWaysItem>;
  private readonly tableGuideposts: DbTable<GuidepostsItem>;
  private readonly tableOsmWaysMatch: DbTable<OsmWaysMatchItem>;
  private readonly tableOsmStats: DbTable<OsmStatsItem>;

  private get<T extends CacheItem>(table: DbTable<T>, track: Track): Observable<T | undefined> {
    return table.getByKey$(key(track));
  }

  private set<T extends CacheItem>(table: DbTable<T>, item: T): void {
    table.deleteWhere$(new DbTableWhereEquals('ownerUuid', item.ownerUuid, dto => dto.trackVersion < item.trackVersion)).subscribe();
    table.setOne$(item).subscribe();
  }

  private remove<T>(table: DbTable<T>, track: Track): void {
    table.deleteWhere$(new DbTableWhereEquals('ownerUuid', ownerUuid(track))).subscribe();
  }

  public getAllWays(track: Track): Observable<AllWaysItem | undefined> {
    return this.get(this.tableAllWays, track);
  }

  public setAllWays(track: Track, allWays: AllWaysResponse): void {
    this.set(this.tableAllWays, {
      key: key(track),
      ownerUuid: ownerUuid(track),
      trackVersion: track.version,
      osmDataVersion: allWays.osmDataVersion!,
      ways: allWays.ways,
    })
  }

  public removeAllWays(track: Track): void {
    this.remove(this.tableAllWays, track);
  }

  public getGuideposts(track: Track): Observable<GuidepostsItem | undefined> {
    return this.get(this.tableGuideposts, track);
  }

  public setGuideposts(track: Track, guideposts: PoisResponse): void {
    this.set(this.tableGuideposts, {
      key: key(track),
      ownerUuid: ownerUuid(track),
      trackVersion: track.version,
      osmDataVersion: guideposts.osmDataVersion!,
      pois: guideposts.pois,
    })
  }

  public removeGuideposts(track: Track): void {
    this.remove(this.tableGuideposts, track);
  }

  public getOsmWaysMatch(track: Track): Observable<OsmWaysMatchItem | undefined> {
    return this.get(this.tableOsmWaysMatch, track);
  }

  public setOsmWaysMatch(track: Track, match: OsmWayMatchResponse): void {
    this.set(this.tableOsmWaysMatch, {
      key: key(track),
      ownerUuid: ownerUuid(track),
      trackVersion: track.version,
      osmDataVersion: match.osmDataVersion!,
      waysOnTrack: [...match.waysOnTrack.values()],
      osmTrackPoints: match.osmTrackPoints,
    })
  }

  public removeOsmWaysMatch(track: Track): void {
    this.remove(this.tableOsmWaysMatch, track);
  }

  public getOsmStats(track: Track): Observable<OsmStatsItem | undefined> {
    return this.get(this.tableOsmStats, track);
  }

  public setOsmStats(track: Track, stats: TrackOsmStats): void {
    this.set(this.tableOsmStats, {
      key: key(track),
      ownerUuid: ownerUuid(track),
      trackVersion: track.version,
      osmDataVersion: stats.osmDataVersion!,
      osmTotalDistanceMeters: stats.osmTotalDistanceMeters,
      wayType: stats.wayType,
      surface: stats.surface,
      hikingDifficulty: stats.hikingDifficulty,
      visibility: stats.visibility,
    })
  }

  public removeOsmStats(track: Track): void {
    this.remove(this.tableOsmStats, track);
  }

  private cleanup(): Promise<string> {
    return Promise.all([
      this.cleanupTable(this.tableAllWays),
      this.cleanupTable(this.tableGuideposts),
      this.cleanupTable(this.tableOsmWaysMatch),
      this.cleanupTable(this.tableOsmStats),
    ]).then(r => 'all_ways: ' + r[0] + + ', guideposts: ' + r[1] + ', ways_match: ' + r[2] + ', stats: ' + r[3]);
  }

  private cleanupTable<T extends CacheItem>(table: DbTable<T>): Promise<number> {
    return firstValueFrom(table.deleteWhen$(100, undefined, undefined, items => {
      const tracks = items.map(item => {
        const key = item.ownerUuid!
        const index = key.indexOf('#');
        const uuid = key.substring(0, index);
        const owner = key.substring(index + 1);
        return {uuid, owner, item};
      });
      return firstValueFrom(this.injector.get(TrackService).getUnknownTracks(tracks))
      .then(unknown => unknown.map(u => u.item));
    }));
  }

}
