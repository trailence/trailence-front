import { Injector, NgZone } from '@angular/core';
import { FetchSourcePlugin, TrailInfo } from './fetch-source.interfaces';
import Dexie from 'dexie';
import { TrailDto } from 'src/app/model/dto/trail';
import { TrackDto } from 'src/app/model/dto/track';
import { SimplifiedPoint, SimplifiedTrackSnapshot, TrackDatabase, TrackMetadataSnapshot } from '../database/track-database';
import { Trail } from 'src/app/model/trail';
import { PreferencesService } from '../preferences/preferences.service';
import { Track } from 'src/app/model/track';
import { TrackEditionService } from '../track-edition/track-edition.service';
import { filterItemsDefined } from 'src/app/utils/rxjs/filter-defined';
import { DelayedTable } from 'src/app/utils/delayed-table';
import { Console } from 'src/app/utils/console';

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
    trailInfosKeys: string,
    trailInfoId: string,
  ) {
    super(injector);
    const db = new Dexie(dbName);
    const schemaV1: any = {};
    schemaV1['infos'] = trailInfosKeys + ', fetchDate';
    schemaV1['trails'] = 'uuid';
    schemaV1['full_tracks'] = 'uuid';
    schemaV1['simplified_tracks'] = 'uuid';
    schemaV1['metadata'] = 'uuid';
    db.version(1).stores(schemaV1);
    this.tableFullTracks = new DelayedTable(db.table<TrackDto, string>('full_tracks'), 'uuid', 5, 1000, 250);
    this.tableSimplifiedTracks = new DelayedTable(db.table<SimplifiedTrackDto, string>('simplified_tracks'), 'uuid', 10, 2000, 500);
    this.tableMetadata = new DelayedTable(db.table<TrackMetadataSnapshot, string>('metadata'), 'uuid', 100, 15000, 5000);
    this.tableTrails = new DelayedTable(db.table<TrailDto, string>('trails'), 'uuid', 100, 20000, 10000);
    this.tableInfos = new DelayedTable(db.table<TRAIL_INFO_DTO, string>('infos'), trailInfoId, 100, 20000, 10000);
    injector.get(NgZone).runOutsideAngular(() => setTimeout(() => this.clean(), 10000));
  }

  protected readonly tableInfos: DelayedTable<TRAIL_INFO_DTO, string>;
  protected readonly tableTrails: DelayedTable<TrailDto, string>;
  protected readonly tableFullTracks: DelayedTable<TrackDto, string>;
  protected readonly tableSimplifiedTracks: DelayedTable<SimplifiedTrackDto, string>;
  protected readonly tableMetadata: DelayedTable<TrackMetadataSnapshot, string>;

  public override getTrail(uuid: string): Promise<Trail | null> {
    return this.tableTrails.get(uuid).then(t => t ? new Trail(t) : null);
  }

  public override getMetadata(uuid: string): Promise<TrackMetadataSnapshot | null> {
    return this.tableMetadata.get(uuid).then(t => t ?? null);
  }

  public override getSimplifiedTrack(uuid: string): Promise<SimplifiedTrackSnapshot | null> {
    return this.tableSimplifiedTracks.get(uuid).then(t => t ?? null);
  }

  public override getFullTrack(uuid: string): Promise<Track | null> {
    return this.tableFullTracks.get(uuid).then(t => t ? new Track(t, this.injector.get(PreferencesService)) : null);
  }

  public override getInfo(uuid: string): Promise<TrailInfo | null> {
    return this.tableInfos.get(uuid).then(t => t?.info ?? null);
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
