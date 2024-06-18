import { Injectable, NgZone } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { TrackDto } from 'src/app/model/dto/track';
import { Track } from 'src/app/model/track';
import { DatabaseService, TRACK_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { Observable, catchError, map, mergeMap, of, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/newtork.service';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { VersionedDto } from 'src/app/model/dto/versioned';
import { CollectionObservable } from 'src/app/utils/rxjs/collections/collection-observable';
import { SimplifiedTrackSnapshot, TrackDatabase, TrackMetadataSnapshot } from './track-database';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root'
})
export class TrackService {

  private db: TrackDatabase;

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    ngZone: NgZone,
    http: HttpService,
    auth: AuthService,
  ) {
    this.db = new TrackDatabase(databaseService, auth, http, network, ngZone);
  }

  public getSimplifiedTrack$(uuid: string, owner: string): Observable<SimplifiedTrackSnapshot | null> {
    return this.db.getSimplifiedTrack$(uuid, owner);
  }

  public getMetadata$(uuid: string, owner: string): Observable<TrackMetadataSnapshot | null> {
    return this.db.getMetadata$(uuid, owner);
  }

  public getFullTrack$(uuid: string, owner: string): Observable<Track | null> {
    return this.db.getFullTrack$(uuid, owner);
  }

  public create(track: Track): void {
    this.db.create(track);
  }

  public update(track: Track): void {
    this.db.update(track);
  }

  public delete(track: Track): void {
    this.db.delete(track.uuid, track.owner);
  }

  public deleteByUuidAndOwner(uuid: string, owner: string, ondone?: () => void): void {
    this.db.delete(uuid, owner, ondone);
  }

  public isSavedOnServerAndNotDeletedLocally(uuid: string, owner: string): boolean {
    return this.db.isSavedOnServerAndNotDeletedLocally(uuid, owner);
  }

  public isSavedOnServerAndNotDeletedLocally$(uuid: string, owner: string): Observable<boolean> {
    return this.db.isSavedOnServerAndNotDeletedLocally$(uuid, owner);
  }

}
