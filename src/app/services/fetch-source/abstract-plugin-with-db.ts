import { Injector, NgZone } from '@angular/core';
import { FetchSourcePlugin, TrailInfo } from './fetch-source.interfaces';
import Dexie from 'dexie';
import { TrailDto } from 'src/app/model/dto/trail';
import { TrackDto } from 'src/app/model/dto/track';
import { TrackDatabase } from '../database/track-database';
import { Trail } from 'src/app/model/trail';
import { PreferencesService } from '../preferences/preferences.service';
import { Track } from 'src/app/model/track';
import { TrackEditionService } from '../track-edition/track-edition.service';
import { filterItemsDefined } from 'src/app/utils/rxjs/filter-defined';
import { DelayedTable } from 'src/app/utils/delayed-table';
import { Console } from 'src/app/utils/console';
import { AuthService } from '../auth/auth.service';
import { SimplifiedPoint, SimplifiedTrackSnapshot, TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { filter, first } from 'rxjs';

export interface TrailInfoBaseDto {
  info: TrailInfo;
  fetchDate: number;
}

export interface SimplifiedTrackDto {
  uuid: string;
  points: SimplifiedPoint[];
}

const EXPIRATION_TIMEOUT = 7 * 24 * 60 * 60 * 1000;

export abstract class PluginWithDb<TRAIL_INFO_DTO extends TrailInfoBaseDto> extends FetchSourcePlugin {

  constructor(
    injector: Injector,
    dbName: string,
    private readonly trailInfosKeys: string,
    private readonly trailInfoId: string,
    dbByUser: boolean = false,
    private readonly refreshAfter?: number,
  ) {
    super(injector);
    injector.get(NgZone).runOutsideAngular(() => {
      this._allowed$.pipe(filter(a => a), first()).subscribe(() => {
        if (dbByUser) injector.get(AuthService).auth$.subscribe(auth => this.openDb(dbName + (auth ? '_' + auth.email : '')));
        else this.openDb(dbName);
      });
    });
  }

  private db?: Dexie;
  protected tableInfos!: DelayedTable<TRAIL_INFO_DTO, string>;
  protected tableTrails!: DelayedTable<TrailDto, string>;
  protected tableFullTracks!: DelayedTable<TrackDto, string>;
  protected tableSimplifiedTracks!: DelayedTable<SimplifiedTrackDto, string>;
  protected tableMetadata!: DelayedTable<TrackMetadataSnapshot, string>;

  private openDb(name: string): void {
    if (this.db?.name === name) return;
    Console.info('Opening DB ' + name);
    this.db = new Dexie(name);
    const schemaV1: any = {};
    schemaV1['infos'] = this.trailInfosKeys + ', fetchDate';
    schemaV1['trails'] = 'uuid';
    schemaV1['full_tracks'] = 'uuid';
    schemaV1['simplified_tracks'] = 'uuid';
    schemaV1['metadata'] = 'uuid';
    this.db.version(1).stores(schemaV1);
    this.tableFullTracks = new DelayedTable(this.db.table<TrackDto, string>('full_tracks'), 'uuid', 5, 1000, 250);
    this.tableSimplifiedTracks = new DelayedTable(this.db.table<SimplifiedTrackDto, string>('simplified_tracks'), 'uuid', 10, 2000, 500);
    this.tableMetadata = new DelayedTable(this.db.table<TrackMetadataSnapshot, string>('metadata'), 'uuid', 100, 15000, 5000);
    this.tableTrails = new DelayedTable(this.db.table<TrailDto, string>('trails'), 'uuid', 100, 20000, 10000);
    this.tableInfos = new DelayedTable(this.db.table<TRAIL_INFO_DTO, string>('infos'), this.trailInfoId, 100, 20000, 10000);
    this.injector.get(NgZone).runOutsideAngular(() => setTimeout(() => this.clean(), 10000));
  }

  public override getTrail(uuid: string): Promise<Trail | null> {
    return this.tableTrails.get(uuid).then(t => t ? new Trail(t) : this.fetchTrailById(uuid));
  }

  public override getTrails(uuids: string[]): Promise<Trail[]> {
    return this.tableTrails.bulkGet(uuids)
    .then(dtos => {
      const result: Trail[] = [];
      const toFetch: string[] = [];
      for (let i = 0; i < dtos.length; ++i)  {
        const dto = dtos[i];
        if (!dto) toFetch.push(uuids[i]);
        else result.push(new Trail(dto));
      }
      if (toFetch.length === 0) return result;
      return this.fetchTrailsByIds(toFetch)
      .then(fetched => {
        result.push(...fetched);
        return result;
      })
    })
  }

  public override forceRefresh(uuid: string): Promise<Trail | null> {
    return this.fetchTrailById(uuid);
  }

  protected fetchTrailById(uuid: string): Promise<Trail | null> {
    return Promise.resolve(null);
  }

  protected fetchTrailsByIds(uuids: string[]): Promise<Trail[]> {
    return Promise.resolve([]);
  }

  public override getMetadata(uuid: string): Promise<TrackMetadataSnapshot | null> {
    return this.tableMetadata.get(uuid).then(t => t ?? this.fetchMetadataById(uuid));
  }

  public override getMetadataList(uuids: string[]): Promise<TrackMetadataSnapshot[]> {
    return this.tableMetadata.bulkGet(uuids)
    .then(known => {
      const result: TrackMetadataSnapshot[] = [];
      const unknown: string[] = [];
      for (let i = 0; i < uuids.length; ++i) {
        if (known[i]) result.push(known[i]!);
        else unknown.push(uuids[i]);
      }
      if (unknown.length === 0) return result;
      return Promise.all(unknown.map(uuid => this.fetchMetadataById(uuid)))
      .then(fetchResult => {
        result.push(...fetchResult.filter(r => !!r));
        return result;
      });
    });
  }

  protected fetchMetadataById(uuid: string): Promise<TrackMetadataSnapshot | null> {
    return Promise.resolve(null);
  }

  public override getSimplifiedTrack(uuid: string): Promise<SimplifiedTrackSnapshot | null> {
    return this.tableSimplifiedTracks.get(uuid).then(t => t ?? null);
  }

  protected fetchSimplifiedTrackById(uuid: string): Promise<SimplifiedTrackSnapshot | null> {
    return Promise.resolve(null);
  }

  public override getFullTrack(uuid: string): Promise<Track | null> {
    return this.tableFullTracks.get(uuid).then(t => t ? new Track(t, this.injector.get(PreferencesService)) : this.fetchFullTrackById(uuid));
  }

  protected fetchFullTrackById(uuid: string): Promise<Track | null> {
    return Promise.resolve(null);
  }

  public override getInfo(uuid: string): Promise<TrailInfo | null> {
    return this.tableInfos.get(uuid)
    .then(t => {
      if (!t) return this.fetchInfoById(uuid);
      if (this.refreshAfter !== undefined && Date.now() - t.fetchDate > this.refreshAfter) {
        return this.fetchInfoById(uuid).catch(e => null).then(trail => {
          return trail ?? t.info;
        })
      }
      return t.info;
    });
  }

  protected fetchInfoById(uuid: string): Promise<TrailInfo | null> {
    return Promise.resolve(null);
  }

  protected prepareTrailToStore(trail: Trail, originalTrack: Track, uuid: string, overrideMetadata: Partial<TrackMetadataSnapshot> = {}, skipImprovment: boolean = false): TrailToStore {
    let currentTrack: Track | undefined = undefined;
    if (!skipImprovment) {
      currentTrack = this.injector.get(TrackEditionService).applyDefaultImprovments(originalTrack);
      if (currentTrack.isEquals(originalTrack)) {
        currentTrack = undefined;
      }
    }
    trail.originalTrackUuid = uuid + '-original';
    trail.currentTrackUuid = currentTrack ? uuid + '-improved' : trail.originalTrackUuid;
    this.injector.get(TrackEditionService).computeFinalMetadata(trail, currentTrack ?? originalTrack);
    const trailDto = trail.toDto();
    trailDto.uuid = uuid;
    const originalTrackDto = originalTrack.toDto();
    originalTrackDto.uuid = uuid + '-original';
    const currentTrackDto = currentTrack?.toDto();
    if (currentTrackDto) currentTrackDto.uuid = uuid + '-improved';
    const originalMetadata = {...TrackDatabase.toMetadata(originalTrack), ...overrideMetadata};
    originalMetadata.uuid = originalTrackDto.uuid;
    const currentMetadata = currentTrack ? {...TrackDatabase.toMetadata(currentTrack), ...overrideMetadata} : undefined;
    if (currentMetadata) currentMetadata.uuid = currentTrackDto!.uuid;
    const originalSimplifiedTrackDto = {uuid: originalTrackDto.uuid, points: TrackDatabase.simplify(originalTrack).points};
    const currentSimplifiedTrackDto = currentTrack ? {uuid: currentTrackDto!.uuid, points: TrackDatabase.simplify(currentTrack).points} : undefined;
    return {
      trail,
      trailDto,
      originalTrackDto,
      currentTrackDto,
      originalMetadata,
      currentMetadata,
      originalSimplifiedTrackDto,
      currentSimplifiedTrackDto,
    };
  }

  protected storeTrails(trails: TrailToStore[]): void {
    this.tableTrails.bulkPut(trails.map(t => t.trailDto));
    this.tableFullTracks.bulkPut(trails.map(t => t.originalTrackDto));
    this.tableFullTracks.bulkPut(filterItemsDefined(trails.map(t => t.currentTrackDto)));
    this.tableSimplifiedTracks.bulkPut(trails.map(t => t.originalSimplifiedTrackDto));
    this.tableSimplifiedTracks.bulkPut(filterItemsDefined(trails.map(t => t.currentSimplifiedTrackDto)));
    this.tableMetadata.bulkPut(trails.map(t => t.originalMetadata));
    this.tableMetadata.bulkPut(filterItemsDefined(trails.map(t => t.currentMetadata)));
  }

  private clean(): void {
    Console.info('Start cleaning ' + this.owner);
    this.tableInfos.table.where('fetchDate').below(Date.now() - EXPIRATION_TIMEOUT).primaryKeys().then(toRemove => {
      Console.info('Found ' + toRemove.length + ' to remove from ' + this.owner);
      if (toRemove.length === 0) return;
      const tracks: string[] = [];
      for (const id of toRemove) {
        tracks.push(id + '-original');
        tracks.push(id + '-improved');
      }
      const startTime = Date.now();
      Promise.all([
        this.tableInfos.table.bulkDelete(toRemove),
        this.tableTrails.table.bulkDelete(toRemove),
        this.tableFullTracks.table.bulkDelete(tracks),
        this.tableSimplifiedTracks.table.bulkDelete(tracks),
        this.tableMetadata.table.bulkDelete(tracks),
      ]).then(() => Console.info('' + toRemove.length + ' trails removed from ' + this.owner + ' in ' + (Date.now() - startTime) + 'ms.'));
    });
  }

}

export interface TrailToStore {
  trail: Trail,
  trailDto: TrailDto;
  originalTrackDto: TrackDto;
  currentTrackDto?: TrackDto;
  originalMetadata: TrackMetadataSnapshot;
  currentMetadata?: TrackMetadataSnapshot;
  originalSimplifiedTrackDto: SimplifiedTrackDto;
  currentSimplifiedTrackDto?: SimplifiedTrackDto;
}
