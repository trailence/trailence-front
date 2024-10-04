import { Injectable, Injector } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { DatabaseService, TRAIL_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { BehaviorSubject, Observable, combineLatest, filter, first, map, of, switchMap, zip } from 'rxjs';
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
import Trailence from '../trailence.service';
import { TrailMenuService } from './trail-menu.service';
import { Router } from '@angular/router';
import { ModalController} from '@ionic/angular/standalone';
import { PhotoService } from './photo.service';

@Injectable({
  providedIn: 'root'
})
export class TrailService {

  private _store: TrailStore;

  constructor(
    http: HttpService,
    private trackService: TrackService,
    collectionService: TrailCollectionService,
    private injector: Injector,
  ) {
    this._store = new TrailStore(injector, http, trackService, collectionService);
    this.listenToImportGpx();
  }

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
    this.injector.get(PhotoService).deleteForTrail(trail.owner, trail.uuid, doneHandler.add());
    this._store.delete(trail, doneHandler.add());
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
        const toRemove = trail.filter(trail => !!trail && trail.collectionUuid === collectionUuid && trail.owner === owner);
        if (toRemove.length === 0) {
          progress?.addWorkDone(progressWork)
          return of(true);
        }
        return new Observable(observer => {
          let done = 0;
          let workDone = 0;
          const ondone = () => {
            setTimeout(() => {
              done++;
              const newWorkDone = done * progressWork / toRemove.length;
              progress?.addWorkDone(newWorkDone - workDone);
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

  private listenToImportGpx(): void {
    const files = new Map<number, {nbChunks: number, chunks: string[]}>();
    Trailence.listenToImportedFiles((message) => {
      if (message.chunks !== undefined) {
        files.set(message.fileId, {nbChunks: message.chunks, chunks: new Array(message.chunks)});
        console.log('Start receiving new file from device with ' + message.chunks + ' chunks');
      } else if (message.chunkIndex !== undefined && message.data !== undefined) {
        const file = files.get(message.fileId);
        if (!file) {
          console.error('Received a chunk of data from device for an unknown file id', message.fileId);
          return;
        }
        file.chunks[message.chunkIndex] = message.data;
        let done = true;
        for (const chunk of file.chunks) {
          if (chunk === undefined || chunk === null) {
            done = false;
            break;
          }
        }
        console.log('new chunk of data received from device', file);
        if (done) {
          files.delete(message.fileId);
          this.importGpx(file.chunks);
        }
      }
    });
  }

  private importGpx(chunks: string[]): void {
    console.log('Received GPX data to import from device');
    this.injector.get(AuthService).auth$.pipe(
      filter(auth => !!auth),
      first(),
    ).subscribe(auth => {
      const owner = auth.email;
      const binaryChunks = chunks.map(c => atob(c));
      let size = 0;
      for (const c of binaryChunks) size += c.length;
      const bytes = new Uint8Array(size);
      let pos = 0;
      for (const c of binaryChunks) {
        for (let i = 0; i < c.length; ++i)
          bytes[pos + i] = c.charCodeAt(i);
        pos += c.length;
      }
      const buffer = bytes.buffer;

      const menuService = this.injector.get(TrailMenuService);
      import('../../components/import-gpx-popup/import-gpx-popup.component')
      .then(module => this.injector.get(ModalController).create({
        component: module.ImportGpxPopupComponent,
        backdropDismiss: false,
        componentProps: {
          onDone: (collectionUuid: string) => {
            menuService.importGpx(buffer, owner, collectionUuid).then(imported => {
              menuService.importTags([imported], collectionUuid);
              this.injector.get(Router).navigateByUrl('/trail/' + encodeURIComponent(owner) + '/' + imported.trailUuid);
            });
            // TODO errors
          }
        }
      }))
      .then(modal => modal.present());
    });
  }

}

class TrailStore extends OwnedStore<TrailDto, Trail> {

  constructor(
    injector: Injector,
    private http: HttpService,
    private trackService: TrackService,
    private collectionService: TrailCollectionService,
  ) {
    super(TRAIL_TABLE_NAME, injector);
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
          if (db !== dbService.db || email !== dbService.email) {
            subscriber.next(false);
            subscriber.complete();
            return;
          }
          const maxDate = Date.now() - 24 * 60 * 60 * 1000;
          let count = 0;
          const ondone = new CompositeOnDone(() => {
            console.log('Trails database cleaned: ' + count + ' removed');
            subscriber.next(true);
            subscriber.complete();
          });
          for (const trail of trails) {
            if (trail.createdAt > maxDate || trail.updatedAt > maxDate) continue;
            if (trail.owner === email) {
              const collection = collections.find(c => c.uuid === trail.collectionUuid && c.owner === email);
              if (collection) continue;
            }
            const share = shares.find(s => s.from === trail.owner && s.trails.indexOf(trail.uuid) >= 0);
            if (share) continue;
            const d = ondone.add();
            this.getLocalUpdate(trail).then(date => {
              if (db !== dbService.db || email !== dbService.email) {
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
