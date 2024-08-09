import { Injectable, Injector, NgZone } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { DatabaseService, TRAIL_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { Observable, combineLatest, map, of, switchMap, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/network.service';
import { Trail, TrailLoopType } from 'src/app/model/trail';
import { TrailDto } from 'src/app/model/dto/trail';
import { TrackService } from './track.service';
import { TrailCollectionService } from './trail-collection.service';
import { VersionedDto } from 'src/app/model/dto/versioned';
import { TagService } from './tag.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { Progress } from '../progress/progress.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';

@Injectable({
  providedIn: 'root'
})
export class TrailService {

  private _store: TrailStore;

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    ngZone: NgZone,
    http: HttpService,
    private trackService: TrackService,
    collectionService: TrailCollectionService,
    private injector: Injector,
  ) {
    this._store = new TrailStore(databaseService, network, ngZone, http, trackService, collectionService);
  }

  // TODO remove tracks not used by any trail (do the same for all entities, like trails belonging to a non existing collection...)

  public getAll$(): Observable<Observable<Trail | null>[]> {
    return this._store.getAll$();
  }

  public getTrail$(uuid: string, owner: string): Observable<Trail | null> {
    return this._store.getItem$(uuid, owner);
  }

  public getTrail(uuid: string, owner: string): Trail | null {
    return this._store.getItem(uuid, owner);
  }

  public create(trail: Trail): Observable<Trail | null> {
    this.check(trail);
    return this._store.create(trail);
  }

  public update(trail: Trail): void {
    this.check(trail);
    this._store.update(trail);
  }

  private check(trail: Trail): void {
    if (trail.name.length > 200) trail.name = trail.name.substring(0, 200);
    if (trail.description.length > 50000) trail.description = trail.description.substring(0, 50000);
  }

  public delete(trail: Trail, ondone?: () => void): void {
    const doneHandler = new CompositeOnDone(ondone);
    this.trackService.deleteByUuidAndOwner(trail.originalTrackUuid, trail.owner, doneHandler.add());
    if (trail.currentTrackUuid !== trail.originalTrackUuid)
      this.trackService.deleteByUuidAndOwner(trail.currentTrackUuid, trail.owner, doneHandler.add());
    this.injector.get(TagService).deleteTrailTagsForTrail(trail.uuid, doneHandler.add());
    this._store.delete(trail, doneHandler.add());
    doneHandler.start();
  }

  public deleteAllTrailsFromCollection(collectionUuid: string, owner: string, progress: Progress, progressWork: number): Observable<any> {
    return this._store.getAll$().pipe(
      switchMap(trails$ => zip(trails$.map(trail$ => trail$.pipe(firstTimeout(t => !!t, 1000, () => null as Trail | null))))),
      switchMap(trail => {
        const toRemove = trail.filter(trail => !!trail && trail.collectionUuid === collectionUuid && trail.owner === owner);
        if (toRemove.length === 0) {
          progress.addWorkDone(progressWork)
          return of(true);
        }
        return new Observable(observer => {
          let done = 0;
          let workDone = 0;
          const ondone = () => {
            setTimeout(() => {
              done++;
              const newWorkDone = done * progressWork / toRemove.length;
              progress.addWorkDone(newWorkDone - workDone);
              workDone = newWorkDone;
              if (done === toRemove.length) {
                observer.next(true);
                observer.complete();
              }
            }, 0);
          };
          for (const trail of toRemove) setTimeout(() => this.delete(trail!, ondone), 0);
        });
      })
    );
  }

  getLoopTypeIcon(loopType: TrailLoopType | undefined): string {
    if (loopType === undefined) return 'question';
    switch (loopType) {
      case TrailLoopType.ONE_WAY: return 'one-way';
      case TrailLoopType.LOOP: return 'loop';
      case TrailLoopType.HALF_LOOP: return 'half-loop';
      case TrailLoopType.SMALL_LOOP: return 'small-loop';
      case TrailLoopType.OUT_AND_BACK: return 'out-and-back';
    }
  }

}

class TrailStore extends OwnedStore<TrailDto, Trail> {

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    ngZone: NgZone,
    private http: HttpService,
    private trackService: TrackService,
    private collectionService: TrailCollectionService,
  ) {
    super(TRAIL_TABLE_NAME, databaseService, network, ngZone);
  }

  protected override fromDTO(dto: TrailDto): Trail {
    return new Trail(dto);
  }

  protected override toDTO(entity: Trail): TrailDto {
    return entity.toDto();
  }

  protected override readyToSave(entity: Trail): boolean {
    if (!this.collectionService.getCollection(entity.collectionUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally()) return false;
    if (!this.trackService.isSavedOnServerAndNotDeletedLocally(entity.originalTrackUuid, entity.owner)) return false;
    if (entity.currentTrackUuid !== entity.originalTrackUuid &&
      !this.trackService.isSavedOnServerAndNotDeletedLocally(entity.currentTrackUuid, entity.owner)) return false;
    return true;
  }

  protected override readyToSave$(entity: Trail): Observable<boolean> {
    const originalTrackReady$ = this.trackService.isSavedOnServerAndNotDeletedLocally$(entity.originalTrackUuid, entity.owner);
    const currentrackReady$ = this.trackService.isSavedOnServerAndNotDeletedLocally$(entity.currentTrackUuid, entity.owner);
    const collectionReady$ = this.collectionService.getCollection$(entity.collectionUuid, entity.owner).pipe(map(col => !!col?.isSavedOnServerAndNotDeletedLocally()));
    return combineLatest([originalTrackReady$, currentrackReady$, collectionReady$]).pipe(
      map(readiness => readiness.indexOf(false) < 0)
    );
  }

  protected override createOnServer(items: TrailDto[]): Observable<TrailDto[]> {
    return this.http.post<TrailDto[]>(environment.apiBaseUrl + '/trail/v1/_bulkCreate', items);
  }

  protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<TrailDto>> {
    return this.http.post<UpdatesResponse<TrailDto>>(environment.apiBaseUrl + '/trail/v1/_bulkGetUpdates', knownItems);
  }

  protected override sendUpdatesToServer(items: TrailDto[]): Observable<TrailDto[]> {
    return this.http.put<TrailDto[]>(environment.apiBaseUrl + '/trail/v1/_bulkUpdate', items);
  }

  protected override deleteFromServer(uuids: string[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/trail/v1/_bulkDelete', uuids);
  }

}
