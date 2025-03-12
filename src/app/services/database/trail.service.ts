import { Injectable, Injector } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { DatabaseService, TRAIL_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { BehaviorSubject, Observable, combineLatest, first, map, of, switchMap, tap, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Trail, TrailLoopType } from 'src/app/model/trail';
import { TrailDto } from 'src/app/model/dto/trail';
import { TrackService } from './track.service';
import { TrailCollectionService } from './trail-collection.service';
import { VersionedDto } from 'src/app/model/dto/versioned';
import { TagService } from './tag.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { Progress } from '../progress/progress.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import Dexie from 'dexie';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { ShareService } from './share.service';
import { AuthService } from '../auth/auth.service';
import { PhotoService } from './photo.service';
import { Console } from 'src/app/utils/console';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { QuotaService } from '../auth/quota.service';

@Injectable({
  providedIn: 'root'
})
export class TrailService {

  private readonly _store: TrailStore;

  constructor(
    http: HttpService,
    private readonly trackService: TrackService,
    collectionService: TrailCollectionService,
    private readonly injector: Injector,
  ) {
    this._store = new TrailStore(injector, http, trackService, collectionService);
  }

  public getAll$(): Observable<Observable<Trail | null>[]> {
    return this._store.getAll$();
  }

  public getTrail$(uuid: string, owner: string): Observable<Trail | null> {
    if (owner.indexOf('@') < 0) return this.injector.get(FetchSourceService).getTrail$(owner, uuid);
    return this._store.getItem$(uuid, owner);
  }

  public getTrail(uuid: string, owner: string): Trail | null {
    return this._store.getItem(uuid, owner);
  }

  public create(trail: Trail, ondone?: () => void): Observable<Trail | null> {
    this.check(trail);
    return this._store.create(trail, ondone);
  }

  public lock(uuid: string, owner: string, onlocked: (locked: boolean, unlock: () => void) => void): void {
    this._store.lock(uuid, owner, locked => {
      onlocked(locked, () => {
        this._store.unlock(uuid, owner);
      });
    });
  }

  public update(trail: Trail, ondone?: () => void): void {
    this.check(trail);
    this._store.update(trail, ondone);
  }

  public doUpdate(trail: Trail, updater: (latestVersion: Trail) => void, ondone?: (trail: Trail) => void): void {
    this.lock(trail.uuid, trail.owner, (locked, unlock) => {
      if (!locked) {
        if (ondone) ondone(trail);
        return;
      }
      const latestTrail = this.getTrail(trail.uuid, trail.owner);
      if (latestTrail) {
        updater(latestTrail);
        this.update(latestTrail, () => {
          unlock();
          if (ondone) ondone(latestTrail);
        });
      } else {
        unlock();
        if (ondone) ondone(trail);
      }
    });
  }

  private check(trail: Trail): void {
    if (trail.name.length > 200) trail.name = trail.name.substring(0, 200);
    if (trail.description.length > 50000) trail.description = trail.description.substring(0, 50000);
  }

  public isUpdatedLocally(owner: string, uuid: string): boolean {
    return this._store.itemUpdatedLocally(owner, uuid);
  }

  public delete(trail: Trail, ondone?: () => void): void {
    const doneHandler = new CompositeOnDone(ondone);
    this.trackService.deleteByUuidAndOwner(trail.originalTrackUuid, trail.owner, doneHandler.add());
    if (trail.currentTrackUuid !== trail.originalTrackUuid)
      this.trackService.deleteByUuidAndOwner(trail.currentTrackUuid, trail.owner, doneHandler.add());
    this.injector.get(TagService).deleteTrailTagsForTrail(trail.uuid, doneHandler.add());
    this.injector.get(PhotoService).deleteForTrail(trail.owner, trail.uuid, doneHandler.add());
    this._store.delete(trail, doneHandler.add());
    doneHandler.start();
  }

  public deleteMany(trails: Trail[], progress: Progress | undefined, progressWork: number, ondone?: () => void): void {
    const doneHandler = new CompositeOnDone(ondone);
    const tracks: {uuid: string, owner: string}[] = [];
    for (const trail of trails) {
      tracks.push({uuid: trail.originalTrackUuid, owner: trail.owner});
      if (trail.currentTrackUuid !== trail.originalTrackUuid)
        tracks.push({uuid: trail.currentTrackUuid, owner: trail.owner});
    }
    this.trackService.deleteMany(tracks, progress, progressWork * 2 / 3, doneHandler.add());
    const remainingProgress = progressWork - (progressWork * 2 / 3);
    let tagsWork = remainingProgress / 10;
    this.injector.get(TagService).deleteTrailTagsForTrails(trails.map(t => t.uuid), doneHandler.add(() => progress?.addWorkDone(tagsWork)));
    let photosWork = remainingProgress / 2;
    this.injector.get(PhotoService).deleteForTrails(trails, doneHandler.add(() => progress?.addWorkDone(photosWork)));
    const trailWork = remainingProgress - tagsWork - photosWork;
    this._store.deleteIf(trail => !!trails.find(t => t.uuid === trail.uuid && t.owner === trail.owner), doneHandler.add(() => progress?.addWorkDone(trailWork)));
    doneHandler.start();
  }

  propagateDelete(trail: Trail): void {
    this.trackService.deleteByUuidAndOwner(trail.originalTrackUuid, trail.owner);
    if (trail.currentTrackUuid !== trail.originalTrackUuid)
      this.trackService.deleteByUuidAndOwner(trail.currentTrackUuid, trail.owner);
    if (trail.owner === this.injector.get(AuthService).email)
      this.injector.get(TagService).deleteTrailTagsForTrail(trail.uuid);
    this.injector.get(PhotoService).deleteForTrail(trail.owner, trail.uuid);
  }

  public deleteAllTrailsFromCollection(collectionUuid: string, owner: string, progress: Progress | undefined, progressWork: number): Observable<any> {
    return this._store.getAll$().pipe(
      first(),
      switchMap(trails$ => trails$.length === 0 ? of([]) : zip(trails$.map(trail$ => trail$.pipe(firstTimeout(t => !!t, 1000, () => null as Trail | null))))),
      switchMap(trail => {
        const toRemove = trail.filter(trail => !!trail && trail.collectionUuid === collectionUuid && trail.owner === owner) as Trail[];
        if (toRemove.length === 0) {
          progress?.addWorkDone(progressWork);
          return of(true);
        }
        return new Observable(observer => {
          this.deleteMany(toRemove, progress, progressWork, () => {
            observer.next(true);
            observer.complete();
          });
        });
      })
    );
  }

  public getLoopTypeIcon(loopType: TrailLoopType | undefined): string {
    if (loopType === undefined) return 'question';
    switch (loopType) {
      case TrailLoopType.ONE_WAY: return 'one-way';
      case TrailLoopType.LOOP: return 'loop';
      case TrailLoopType.HALF_LOOP: return 'half-loop';
      case TrailLoopType.SMALL_LOOP: return 'small-loop';
      case TrailLoopType.OUT_AND_BACK: return 'out-and-back';
    }
  }

  public cleanDatabase(db: Dexie, email: string): Observable<any> {
    return this._store.cleanDatabase(db, email);
  }

  public storeLoadedAndServerUpdates$(): Observable<boolean> {
    return combineLatest([this._store.loaded$, this._store.syncStatus$]).pipe(
      map(([loaded, sync]) => loaded && !sync.needsUpdateFromServer)
    );
  }
}

class TrailStore extends OwnedStore<TrailDto, Trail> {

  constructor(
    injector: Injector,
    private readonly http: HttpService,
    private readonly trackService: TrackService,
    private readonly collectionService: TrailCollectionService,
  ) {
    super(TRAIL_TABLE_NAME, injector);
    this.quotaService = injector.get(QuotaService);
  }

  private readonly quotaService: QuotaService;

  protected override isQuotaReached(): boolean {
    const q = this.quotaService.quotas;
    return !q || q.trailsUsed >= q.trailsMax;
  }

  protected override migrate(fromVersion: number, dbService: DatabaseService): Promise<number | undefined> {
    return Promise.resolve(undefined);
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
    return this.http.post<TrailDto[]>(environment.apiBaseUrl + '/trail/v1/_bulkCreate', items).pipe(
      tap(created => this.quotaService.updateQuotas(q => q.trailsUsed += created.length)),
    );
  }

  protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<TrailDto>> {
    return this.http.post<UpdatesResponse<TrailDto>>(environment.apiBaseUrl + '/trail/v1/_bulkGetUpdates', knownItems);
  }

  protected override sendUpdatesToServer(items: TrailDto[]): Observable<TrailDto[]> {
    return this.http.put<TrailDto[]>(environment.apiBaseUrl + '/trail/v1/_bulkUpdate', items);
  }

  protected override deleteFromServer(uuids: string[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/trail/v1/_bulkDelete', uuids).pipe(
      tap({
        complete: () => this.quotaService.updateQuotas(q => q.trailsUsed -= uuids.length)
      })
    );
  }

  protected override deleted(item$: BehaviorSubject<Trail | null> | undefined, item: Trail): void {
    this.injector.get(TrailService).propagateDelete(item);
  }

  protected override doCleaning(email: string, db: Dexie): Observable<any> {
    return zip([
      this.getAll$().pipe(collection$items()),
      this.collectionService.getAll$().pipe(collection$items()),
      this.injector.get(ShareService).getAll$().pipe(collection$items()),
    ]).pipe(
      first(),
      switchMap(([trails, collections, shares]) => {
        return new Observable<any>(subscriber => {
          const dbService = this.injector.get(DatabaseService);
          if (db !== dbService.db?.db || email !== dbService.email) {
            subscriber.next(false);
            subscriber.complete();
            return;
          }
          const maxDate = Date.now() - 24 * 60 * 60 * 1000;
          let count = 0;
          const ondone = new CompositeOnDone(() => {
            Console.info('Trails database cleaned: ' + count + ' removed');
            subscriber.next(true);
            subscriber.complete();
          });
          for (const trail of trails) {
            if (trail.createdAt > maxDate || trail.updatedAt > maxDate) continue;
            if (trail.owner === email) {
              const collection = collections.find(c => c.uuid === trail.collectionUuid && c.owner === email);
              if (collection) continue;
            }
            const share = shares.find(s => s.owner === trail.owner && s.trails.indexOf(trail.uuid) >= 0);
            if (share) continue;
            const d = ondone.add();
            this.getLocalUpdate(trail).then(date => {
              if (db !== dbService.db?.db || email !== dbService.email) {
                d();
                return;
              }
              if (!date || date > maxDate) {
                d();
                return;
              }
              count++;
              this.delete(trail, d);
            });
          }
          ondone.start();
        });
      })
    );
  }

}
