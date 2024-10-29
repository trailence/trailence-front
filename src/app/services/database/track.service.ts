import { Injectable, Injector } from '@angular/core';
import { Track } from 'src/app/model/track';
import { filter, first, Observable, timeout } from 'rxjs';
import { SimplifiedTrackSnapshot, TrackDatabase, TrackMetadataSnapshot } from './track-database';
import Dexie from 'dexie';

@Injectable({
  providedIn: 'root'
})
export class TrackService {

  private db: TrackDatabase;

  constructor(
    injector: Injector,
  ) {
    this.db = new TrackDatabase(injector);
  }

  public getSimplifiedTrack$(uuid: string, owner: string): Observable<SimplifiedTrackSnapshot | null> {
    return this.db.getSimplifiedTrack$(uuid, owner);
  }

  public getMetadata$(uuid: string, owner: string): Observable<TrackMetadataSnapshot | null> {
    return this.db.getMetadata$(uuid, owner);
  }

  public getAllMetadata$(): Observable<Observable<TrackMetadataSnapshot | null>[]> {
    return this.db.getAllMetadata$();
  }

  public getFullTrack$(uuid: string, owner: string): Observable<Track | null> {
    return this.db.getFullTrack$(uuid, owner);
  }

  public getFullTrackReady$(uuid: string, owner: string): Observable<Track> {
    return this.getFullTrack$(uuid, owner).pipe(
      filter(t => !!t),
      timeout(10000),
      first()
    );
  }

  public create(track: Track, ondone?: () => void): void {
    this.db.create(track, ondone);
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

  public cleanDatabase(db: Dexie, email: string): Observable<any> {
    return this.db.cleanDatabase(db, email);
  }

}
