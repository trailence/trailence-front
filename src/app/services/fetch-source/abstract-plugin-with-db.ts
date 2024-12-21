import { Injector } from '@angular/core';
import { FetchSourcePlugin, TrailInfo } from './fetch-source.interfaces';
import Dexie, { Table } from 'dexie';
import { TrailDto } from 'src/app/model/dto/trail';
import { TrackDto } from 'src/app/model/dto/track';
import { SimplifiedPoint, SimplifiedTrackSnapshot, TrackMetadataSnapshot } from '../database/track-database';
import { Trail } from 'src/app/model/trail';
import { PreferencesService } from '../preferences/preferences.service';
import { Track } from 'src/app/model/track';

export interface TrailInfoBaseDto {
  info: TrailInfo;
  fetchDate: number;
}

export interface SimplifiedTrackDto {
  uuid: string;
  points: SimplifiedPoint[];
}

export abstract class PluginWithDb<TRAIL_INFO_DTO extends TrailInfoBaseDto> extends FetchSourcePlugin {

  constructor(
    injector: Injector,
    dbName: string,
    trailInfosKeys: string,
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
    this.tableInfos = db.table<TRAIL_INFO_DTO, string>('infos');
    this.tableTrails = db.table<TrailDto, string>('trails');
    this.tableFullTracks = db.table<TrackDto, string>('full_tracks');
    this.tableSimplifiedTracks = db.table<SimplifiedTrackDto, string>('simplified_tracks');
    this.tableMetadata = db.table<TrackMetadataSnapshot, string>('metadata');
  }

  protected readonly tableInfos: Table<TRAIL_INFO_DTO, string>;
  protected readonly tableTrails: Table<TrailDto, string>;
  protected readonly tableFullTracks: Table<TrackDto, string>;
  protected readonly tableSimplifiedTracks: Table<SimplifiedTrackDto, string>;
  protected readonly tableMetadata: Table<TrackMetadataSnapshot, string>;

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

}
