import { Injectable, Injector } from '@angular/core';
import { Track } from 'src/app/model/track';
import { combineLatest, EMPTY, map, Observable, of, switchMap } from 'rxjs';
import { SimplifiedTrackSnapshot, TrackDatabase, TrackMetadataSnapshot } from './track-database';
import Dexie from 'dexie';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { Progress } from '../progress/progress.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';

@Injectable({
  providedIn: 'root'
})
export class TrackService {

  private readonly db: TrackDatabase;

  constructor(
    private readonly injector: Injector,
  ) {
    this.db = new TrackDatabase(injector);
  }

  public getSimplifiedTrack$(uuid: string, owner: string): Observable<SimplifiedTrackSnapshot | null> {
    if (owner.indexOf('@') < 0) return this.injector.get(FetchSourceService).getSimplifiedTrack$(owner, uuid);
    return this.db.getSimplifiedTrack$(uuid, owner);
  }

  public getMetadata$(uuid: string, owner: string): Observable<TrackMetadataSnapshot | null> {
    if (owner.indexOf('@') < 0) return this.injector.get(FetchSourceService).getMetadata$(owner, uuid);
    return this.db.getMetadata$(uuid, owner);
  }

  public getMetadataList$(tracks: {uuid: string, owner: string}[]): Observable<Observable<TrackMetadataSnapshot | null>[]> {
    const externals: {uuid: string, owner: string}[] = [];
    const internals: {uuid: string, owner: string}[] = [];
    for (const t of tracks) {
      if (t.owner.indexOf('@') < 0) externals.push(t);
      else internals.push(t);
    }
    const externalTracks = externals.length === 0 ? of([]) : this.injector.get(FetchSourceService).getMetadataList$(externals);
    const internalTracks = internals.map(i => this.db.getMetadata$(i.uuid, i.owner));
    return externalTracks.pipe(
      map(externalList => [...externalList.map(e => of(e)), ...internalTracks]),
    );
  }

  public getAllMetadata$(): Observable<Observable<TrackMetadataSnapshot | null>[]> {
    return this.db.getAllMetadata$();
  }

  public getFullTrack$(uuid: string, owner: string): Observable<Track | null> {
    if (owner.indexOf('@') < 0) return this.injector.get(FetchSourceService).getFullTrack$(owner, uuid);
    return this.db.getFullTrack$(uuid, owner);
  }

  public getFullTrackReady$(uuid: string, owner: string): Observable<Track> {
    return this.getFullTrack$(uuid, owner).pipe(
      firstTimeout(t => !!t, 10000, () => null as Track | null),
      switchMap(t => t ? of(t) : EMPTY),
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

  public deleteMany(ids: {uuid: string, owner: string}[], progress: Progress | undefined, progressWork: number, ondone?: () => void) {
    if (ids.length === 0) {
      if (ondone) ondone();
      return;
    }
    this.db.deleteMany(ids, progress, progressWork, ondone);
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
