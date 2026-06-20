import { Injectable, Injector } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './store/owned-store';
import { PhotoDto } from 'src/app/model/dto/photo';
import { Photo } from 'src/app/model/photo';
import { VersionedDto } from 'src/app/model/dto/versioned';
import { BehaviorSubject, catchError, combineLatest, defaultIfEmpty, EMPTY, first, firstValueFrom, from, map, Observable, of, share, switchMap, tap, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { HttpService } from '../http/http.service';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { StoredFilesService } from './stored-files.service';
import { TrailService } from './trail.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { Trail } from 'src/app/model/trail';
import { ModalController, Platform } from '@ionic/angular/standalone';
import { PreferencesService } from '../preferences/preferences.service';
import { DatabaseSubject } from './database-subject';
import { DatabaseSubjectService } from './database-subject-service';
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { QuotaService } from '../auth/quota.service';
import { ModerationService } from '../moderation/moderation.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { TraceRecorderService } from '../trace-recorder/trace-recorder.service';
import { CommonDatabaseService } from './common-database.service';
import { StoreWithCleaning } from './store/store.service';
import { WorkerService } from 'src/app/worker/web-app';

@Injectable({providedIn: 'root'})
export class PhotoService {

  private readonly store: PhotoStore;

  constructor(
    private readonly injector: Injector,
    private readonly preferences: PreferencesService,
  ) {
    this.store = new PhotoStore(injector);
  }

  public getTrailPhotos$(trail: Trail): Observable<Photo[]> {
    if (!trail.owner.includes('@')) return this.injector.get(FetchSourceService).getPhotos$(trail.owner, trail.uuid);
    if (trail.fromModeration) return this.injector.get(ModerationService).getPhotos$(trail.owner, trail.uuid);
    return this.store.getAll$().pipe(
      collection$items(),
      map(photos => photos.filter(p => p.owner === trail.owner && p.trailUuid === trail.uuid))
    );
  }

  public getPhotosForTrailReady$(trail: Trail): Observable<Photo[]> {
    if (!trail.owner.includes('@')) return this.injector.get(FetchSourceService).getPhotos$(trail.owner, trail.uuid);
    if (trail.fromModeration) return this.injector.get(ModerationService).getPhotos$(trail.owner, trail.uuid);
    return this.store.getAll$().pipe(
      switchMap(photos$ => photos$.length === 0 ? of([]) : zip(
        photos$.map(item$ => item$.pipe(
          firstTimeout(p => !!p, 10000, () => null as Photo | null),
          switchMap(p => p ? of(p) : EMPTY),
        ))
      )),
      map(photos => photos.filter(p => p.owner === trail.owner && p.trailUuid === trail.uuid))
    );
  }

  public getPhotosForTrailsReady$(ids: {owner: string, uuid: string}[]): Observable<Photo[]> {
    const external = ids.filter(id => !id.owner.includes('@'));
    const internal = ids.filter(id => id.owner.includes('@'));
    const external$ = external.length === 0 ? of([]) : zip(external.map(id => this.injector.get(FetchSourceService).getPhotos$(id.owner, id.uuid)));
    const internal$ = internal.length === 0 ? of([]) : this.store.getAll$().pipe(
      switchMap(photos$ => photos$.length === 0 ? of([]) : zip(
        photos$.map(item$ => item$.pipe(
          firstTimeout(p => !!p, 10000, () => null as Photo | null),
          switchMap(p => p ? of(p) : EMPTY),
        ))
      )),
      map(photos => photos.filter(p => ids.some(i => i.owner === p.owner && i.uuid === p.trailUuid)))
    );
    return zip(external$, internal$).pipe(
      map(([list1, list2]) => ([...list1.flat(), ...list2]))
    );
  }

  private readonly _retrievingFiles = new Map<string, Observable<Blob>>();
  public getFile$(photo: Photo): Observable<Blob> {
    if (!photo.owner.includes('@')) {
      if (photo.uuid.startsWith(environment.baseUrl) && this.injector.get(Platform).is('capacitor')) {
        return this.injector.get(HttpService).getBlob(photo.uuid);
      }
      return from(
        globalThis.fetch(photo.uuid)
        .then(response => response.blob())
        .catch(e => {
          const fetchSourceService = this.injector.get(FetchSourceService)
          const pluginName = fetchSourceService.getPluginNameByOwner(photo.owner);
          if (!pluginName) throw e;
          const plugin = fetchSourceService.getPluginByName(pluginName);
          if (!plugin) throw e;
          return plugin.fetchPhoto(photo.uuid)
            .then(b => {
              if (!b) throw e;
              return b;
            })
            .catch(e2 => { // NOSONAR
              Console.error('Cannot fetch photo', e, e2);
              throw e;
            })
        })
      );
    }
    if (photo.fromModeration)
      return this.injector.get(ModerationService).getPhotoBlob$(photo.uuid, photo.owner);
    if (photo.fromRecording)
      return this.injector.get(TraceRecorderService).getPhotoFile$(photo.uuid);
    return this.injector.get(StoredFilesService).getFile$(photo.owner, 'photo', photo.uuid).pipe(
      catchError(e => {
        const doing = this._retrievingFiles.get(photo.owner + '#' + photo.uuid);
        if (doing) return doing;
        const request = this.injector.get(HttpService).getBlob(environment.apiBaseUrl + '/photo/v1/' + encodeURIComponent(photo.owner) + '/' + photo.uuid).pipe(
          switchMap(blob => this.injector.get(StoredFilesService).store(photo.owner, 'photo', photo.uuid, blob).pipe(map(() => blob))),
          tap(() => this._retrievingFiles.delete(photo.owner + '#' + photo.uuid)),
          share()
        );
        this._retrievingFiles.set(photo.owner + '#' + photo.uuid, request);
        return request;
      })
    );
  }

  private readonly _blobUrls = new Map<string, DatabaseSubject<{url: string, blobSize: number}>>();
  public getBlobUrl$(photo: Photo): Observable<{url: string, blobSize?: number} | null> {
    const key = photo.owner + '#' + photo.uuid;
    const existing = this._blobUrls.get(key);
    if (existing) return existing.asObservable();
    const subject = this.injector.get(DatabaseSubjectService).create(
      'PhotoBlobUrl',
      () => firstValueFrom(this.getFile$(photo).pipe(map(blob => ({url: URL.createObjectURL(blob), blobSize: blob.size})))),
      item => {
        URL.revokeObjectURL(item.url);
        this._blobUrls.delete(key);
      },
    );
    this._blobUrls.set(key, subject);
    return subject.asObservable();
  }

  public getQuota(): {max: number, current: number} {
    const q = this.injector.get(QuotaService).quotas;
    if (!q) return {max: 0, current: 0};
    return {
      max: q.photosMax,
      current: q.photosUsed + this.store.getNbLocalCreates(),
    }
  }

  public addPhoto( // NOSONAR
    owner: string, trailUuid: string,
    description: string, index: number,
    content: ArrayBuffer,
    dateTaken?: number, latitude?: number, longitude?: number,
    isCover?: boolean,
    fromModeration?: boolean,
    fromRecording?: boolean,
  ): Observable<Photo | null> {
    return from(this.injector.get(WorkerService).importPhoto(owner, trailUuid, description, index, content, this.preferences.preferences, dateTaken, latitude, longitude, isCover)).pipe(
      switchMap(imported => {
        return this.injector.get(StoredFilesService).store(owner, 'photo', imported.photo.uuid, imported.blob).pipe(
          switchMap(result => {
            if (fromModeration) return this.injector.get(ModerationService).createPhoto(imported.photo, imported.blob);
            if (fromRecording) return from(this.injector.get(TraceRecorderService).storePhoto(imported.photo, imported.blob));
            return this.store.create(imported.photo);
          })
        );
      }),
      catchError(e => {
        Console.error('error storing photo', e);
        this.injector.get(ErrorService).addTechnicalError(e, 'errors.import_photo', [description]);
        return of(null);
      })
    );
  }

  public setCover(trail: Trail, photo: Photo): void {
    if (photo.isCover) return;
    this.getPhotosForTrailReady$(trail).pipe(first()).subscribe(photos => {
      const newCover = photos.find(p => p.uuid === photo.uuid);
      if (!newCover) return;
      const currentCover = photos.find(p => p.isCover);
      if (currentCover) this.update(currentCover, p => p.isCover = false);
      this.update(newCover, p => p.isCover = true);
    });
  }

  public update(photo: Photo, updater: (photo: Photo) => void, ondone?: (photo: Photo) => void): void {
    if (photo.fromModeration) {
      updater(photo);
      this.injector.get(ModerationService).updatePhoto(photo).pipe(filterDefined(), first()).subscribe(p => {
        if (ondone) ondone(p);
      });
      return;
    }
    this.store.updateWithLock(photo, updater, ondone);
  }

  public updateFile(photo: Photo, blob: Blob, ondone?: () => void): void {
    this.delete(photo, () => {
      this.injector.get(StoredFilesService).deleteFile(photo.owner, 'photo', photo.uuid).pipe(
        switchMap(() => from(blob.arrayBuffer())),
        switchMap(content =>  this.addPhoto(photo.owner, photo.trailUuid, photo.description, photo.index, content, photo.dateTaken, photo.latitude, photo.longitude, photo.isCover, photo.fromModeration, photo.fromRecording)),
        first()
      ).subscribe(() => {
        if (ondone) ondone();
      });
    });
  }

  public delete(photo: Photo, ondone?: () => void): void {
    if (photo.fromModeration) {
      this.injector.get(ModerationService).deletePhoto(photo).pipe(first()).subscribe(() => {
        if (ondone) ondone();
      });
      return;
    }
    if (photo.fromRecording) {
      this.injector.get(TraceRecorderService).deletePhoto(photo.uuid);
      if (ondone) ondone();
      return;
    }
    this.store.delete(photo, () => {
      const key = photo.owner + '#' + photo.uuid;
      const blob = this._blobUrls.get(key);
      if (blob) {
        this._blobUrls.delete(key);
        blob.close();
      }
      if (ondone) ondone();
    });
  }

  public deleteMany(photos: Photo[], ondone?: () => void): void {
    if (photos.length === 0) {
      if (ondone) ondone();
      return;
    }
    this.store.deleteIf('deleted photos', item => photos.some(p => p.uuid === item.uuid), ondone);
  }

  public deleteForTrail(trail: Trail, ondone?: () => void): void {
    this.getPhotosForTrailReady$(trail).subscribe(photos => this.deleteMany(photos, ondone));
  }

  public deleteForTrails(trails: Trail[], ondone?: () => void): void {
    this.getPhotosForTrailsReady$(trails.map(t => ({owner: t.owner, uuid: t.uuid}))).subscribe(photos => this.deleteMany(photos, ondone));
  }

  public async openSliderPopup(photos: Photo[], index: number) {
    const module = await import('../../components/photos-slider-popup/photos-slider-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.PhotosSliderPopupComponent,
      componentProps: {
        photos,
        index,
      },
      cssClass: ['full-screen', 'semi-opaque'],
    });
    modal.present();
  }

  public getTotalCacheSize(maxDateStored: number): Observable<[number,number]> {
    return this.injector.get(StoredFilesService).getTotalSize('photo', maxDateStored, 1000);
  }

  public removeAllCachedFiles(): Observable<any> {
    return this.store.getAll$().pipe(
      collection$items(),
      switchMap(items => this.injector.get(StoredFilesService).removeAllFiles('photo', (owner, uuid) => {
        const item = items.find(p => p.owner === owner && p.uuid === uuid);
        if (!item) return false;
        return !item.isSavedOnServerAndNotDeletedLocally() || this.store.itemUpdatedLocally(owner, uuid);
      }))
    );
  }

  public removeExpiredFiles(): Observable<any> {
    return this.injector.get(StoredFilesService).cleanExpiredFiles('photo', Date.now() - this.injector.get(PreferencesService).preferences.photoCacheDays);
  }

}

class PhotoStore extends OwnedStore<PhotoDto, Photo> implements StoreWithCleaning {

  private readonly http: HttpService;
  private readonly files: StoredFilesService;
  private readonly trails: TrailService;
  private readonly quotaService: QuotaService;

  constructor(
    injector: Injector,
  ) {
    super(injector.get(CommonDatabaseService).photoTable, injector);
    this.http = injector.get(HttpService);
    this.files = injector.get(StoredFilesService);
    this.trails = injector.get(TrailService);
    this.quotaService = injector.get(QuotaService);
  }

  protected override fromDTO(dto: PhotoDto): Photo {
    return new Photo(dto);
  }

  protected override toDTO(entity: Photo): PhotoDto {
    return entity.toDto();
  }

  protected override isQuotaReached(): boolean {
    const q = this.quotaService.quotas;
    return !q || q.photosUsed >= q.photosMax || q.photosSizeUsed >= q.photosSizeMax;
  }

  protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<PhotoDto>> {
    return this.http.post<UpdatesResponse<PhotoDto>>(environment.apiBaseUrl + '/photo/v1/_bulkGetUpdates', knownItems);
  }

  protected override sendUpdatesToServer(items: PhotoDto[]): Observable<PhotoDto[]> {
    return this.http.put<PhotoDto[]>(environment.apiBaseUrl + '/photo/v1/_bulkUpdate', items);
  }

  protected override deleteFromServer(uuids: string[]): Observable<void> {
    return this.http.post<number>(environment.apiBaseUrl + '/photo/v1/_bulkDelete', uuids).pipe(
      map(sizeRemoved => {
        this.quotaService.updateQuotas(q => {
          q.photosUsed -= uuids.length;
          q.photosSizeUsed -= sizeRemoved;
        });
      })
    );
  }

  protected override createOnServer(items: PhotoDto[]): Observable<PhotoDto[]> {
    const limiter = new RequestLimiter(1);
    const requests: Observable<PhotoDto>[] = [];
    const status = this._storeLoaded$.value;
    if (!status) return EMPTY;
    for (const dto of items) {
      const request = () => {
        if (status.counter !== this._storeLoaded$.value?.counter) return EMPTY;
        return this.files.getFile$(dto.owner, 'photo', dto.uuid).pipe(
          catchError(_ => EMPTY),
          switchMap(blob => {
            if (status.counter !== this._storeLoaded$.value?.counter) return EMPTY;
            const headers: any = {
              'Content-Type': 'application/octet-stream',
              'X-Description': encodeURIComponent(dto.description),
              'X-Cover': dto.cover ? 'true' : 'false',
              'X-Index': dto.index,
            };
            if (dto.dateTaken) headers['X-DateTaken'] = dto.dateTaken;
            if (dto.latitude) headers['X-Latitude'] = dto.latitude;
            if (dto.longitude) headers['X-Longitude'] = dto.longitude;
            return this.http.post<PhotoDto>(environment.apiBaseUrl + '/photo/v1/' + dto.trailUuid + '/' + dto.uuid, blob, headers).pipe(
              tap(dto => this.quotaService.updateQuotas(q => {
                q.photosUsed++;
                q.photosSizeUsed += blob.size;
              })),
              catchError(e => {
                Console.error('error saving photo on server', dto, e);
                this.injector.get(ErrorService).addNetworkError(e, 'errors.stores.save_photo', [dto.description]);
                return EMPTY;
              })
            );
          })
        )
      };
      requests.push(limiter.add(request));
    }
    return (requests.length === 0 ? of([]) : zip(requests).pipe(defaultIfEmpty([])));
  }

  protected override readyToSave(entity: Photo): boolean {
    return false; // need asynchronous way
  }

  protected override readyToSave$(entity: Photo): Observable<boolean> {
    const trailReady$ = this.trails.getTrail$(entity.trailUuid, entity.owner).pipe(map(trail => !!trail?.isSavedOnServerAndNotDeletedLocally()));
    const fileReady$ = this.files.isStored$(entity.owner, 'photo', entity.uuid);
    return combineLatest([trailReady$, fileReady$]).pipe(
      map(readiness => !readiness.includes(false))
    );
  }

  protected override createdLocallyCanBeRemoved(entity: Photo): Observable<boolean> {
    return this.trails.getTrail$(entity.trailUuid, entity.owner).pipe(map(t => !t));
  }

  protected override deleted(deleted: {item$: BehaviorSubject<Photo | null> | undefined, item: Photo}[]): void {
    super.deleted(deleted);
    this.files.deleteFiles('photo', deleted.map(d => ({owner: d.item.owner, uuid: d.item.uuid}))).subscribe();
  }

  cleaningDependencies(): string[] {
    return ['trails'];
  }

  doCleaning(): Promise<string> {
    const status = this._storeLoaded$.value;
    if (!status) return Promise.resolve('not loaded');
    const photosCleant$ = zip([
      this.getAll$().pipe(collection$items()),
      this.trails.getAll$().pipe(collection$items()),
    ]).pipe(
      first(),
      switchMap(([photos, trails]) => {
        const knownPhotos = photos.map(p => ({owner: p.owner, uuid: p.uuid}));
        return new Observable<{owner: string, uuid: string}[] | undefined>(subscriber => {
          if (status.counter !== this._storeLoaded$.value?.counter) {
            subscriber.next(undefined);
            subscriber.complete();
            return;
          }
          const maxDate = Date.now() - 24 * 60 * 60 * 1000;
          let count = 0;
          const ondone = new CompositeOnDone(() => {
            Console.info('Photos database cleaned: ' + count + ' removed');
            subscriber.next(knownPhotos);
            subscriber.complete();
          });
          for (const photo of photos) {
            if (photo.createdAt > maxDate || photo.updatedAt > maxDate) continue;
            const trail = trails.find(t => t.uuid === photo.trailUuid && t.owner === photo.owner);
            if (trail) continue;
            const d = ondone.add();
            this.getLocalUpdate(photo).then(date => {
              if (status.counter !== this._storeLoaded$.value?.counter) {
                d();
                return;
              }
              if (!date || date > maxDate) {
                d();
                return;
              }
              count++;
              this.delete(photo, d);
            });
          }
          ondone.start();
        });
      })
    );

    return firstValueFrom(photosCleant$.pipe(
      switchMap(references => {
        if (!references) return of('0');
        return this.injector.get(StoredFilesService).cleanExpiredFiles('photo', Date.now() - this.injector.get(PreferencesService).preferences.photoCacheDays).pipe(
          switchMap(() => this.injector.get(StoredFilesService).cleanUnreferencedFiles('photo', references, Date.now() - 3 * 24 * 60 * 60 * 1000)),
        );
      })
    ));
  }

}
