import { Injectable, Injector } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { PhotoDto } from 'src/app/model/dto/photo';
import { Photo } from 'src/app/model/photo';
import { VersionedDto } from 'src/app/model/dto/versioned';
import { BehaviorSubject, catchError, combineLatest, defaultIfEmpty, EMPTY, first, firstValueFrom, from, map, Observable, of, share, switchMap, tap, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { HttpService } from '../http/http.service';
import { DatabaseService, PHOTO_TABLE_NAME } from './database.service';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { StoredFilesService } from './stored-files.service';
import { TrailService } from './trail.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import Dexie from 'dexie';
import { Trail } from 'src/app/model/trail';
import { ModalController } from '@ionic/angular/standalone';
import { ImageInfo, ImageUtils } from 'src/app/utils/image-utils';
import { PreferencesService } from '../preferences/preferences.service';
import { DatabaseSubject } from './database-subject';
import { DatabaseSubjectService } from './database-subject-service';
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { Arrays } from 'src/app/utils/arrays';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { QuotaService } from '../auth/quota.service';

@Injectable({providedIn: 'root'})
export class PhotoService {

  private readonly store: PhotoStore;

  constructor(
    private readonly injector: Injector,
    private readonly preferences: PreferencesService,
  ) {
    this.store = new PhotoStore(injector);
  }

  public getTrailPhotos(trail: Trail): Observable<Photo[]> {
    return this.getPhotosForTrail(trail.owner, trail.uuid);
  }

  public getPhotosForTrail(owner: string, uuid: string): Observable<Photo[]> {
    if (owner.indexOf('@') < 0) return this.injector.get(FetchSourceService).getPhotos$(owner, uuid);
    return this.store.getAll$().pipe(
      collection$items(),
      map(photos => photos.filter(p => p.owner === owner && p.trailUuid === uuid))
    );
  }

  public getPhotosForTrailReady(owner: string, uuid: string): Observable<Photo[]> {
    if (owner.indexOf('@') < 0) return this.injector.get(FetchSourceService).getPhotos$(owner, uuid);
    return this.store.getAll$().pipe(
      switchMap(photos$ => photos$.length === 0 ? of([]) : zip(
        photos$.map(item$ => item$.pipe(
          firstTimeout(p => !!p, 10000, () => null as Photo | null),
          switchMap(p => p ? of(p) : EMPTY),
        ))
      )),
      map(photos => photos.filter(p => p.owner === owner && p.trailUuid === uuid))
    );
  }

  public getPhotosForTrailsReady(ids: {owner: string, uuid: string}[]): Observable<Photo[]> {
    const external = ids.filter(id => id.owner.indexOf('@') < 0);
    const internal = ids.filter(id => id.owner.indexOf('@') >= 0);
    const external$ = external.length === 0 ? of([]) : zip(external.map(id => this.injector.get(FetchSourceService).getPhotos$(id.owner, id.uuid)));
    const internal$ = internal.length === 0 ? of([]) : this.store.getAll$().pipe(
      switchMap(photos$ => photos$.length === 0 ? of([]) : zip(
        photos$.map(item$ => item$.pipe(
          firstTimeout(p => !!p, 10000, () => null as Photo | null),
          switchMap(p => p ? of(p) : EMPTY),
        ))
      )),
      map(photos => photos.filter(p => !!ids.find(i => i.owner === p.owner && i.uuid === p.trailUuid)))
    );
    return zip(external$, internal$).pipe(
      map(([list1, list2]) => ([...Arrays.flatMap(list1, e => e), ...list2]))
    );
  }

  private readonly _retrievingFiles = new Map<string, Observable<Blob>>();
  public getFile$(owner: string, uuid: string): Observable<Blob> {
    if (owner.indexOf('@') < 0)
      return from(window.fetch(uuid).then(response => response.blob()));
    return this.injector.get(StoredFilesService).getFile$(owner, 'photo', uuid).pipe(
      catchError(e => {
        const doing = this._retrievingFiles.get(owner + '#' + uuid);
        if (doing) return doing;
        const request = this.injector.get(HttpService).getBlob(environment.apiBaseUrl + '/photo/v1/' + encodeURIComponent(owner) + '/' + uuid).pipe(
          switchMap(blob => this.injector.get(StoredFilesService).store(owner, 'photo', uuid, blob).pipe(map(() => blob))),
          tap(() => this._retrievingFiles.delete(owner + '#' + uuid)),
          share()
        );
        this._retrievingFiles.set(owner + '#' + uuid, request);
        return request;
      })
    );
  }

  private readonly _blobUrls = new Map<string, DatabaseSubject<{url: string, blobSize: number}>>();
  public getBlobUrl$(owner: string, uuid: string): Observable<{url: string, blobSize?: number} | null> {
    if (owner.indexOf('@') < 0) return of({url: uuid});
    const key = owner + '#' + uuid;
    const existing = this._blobUrls.get(key);
    if (existing) return existing.asObservable();
    const subject = this.injector.get(DatabaseSubjectService).create(
      'PhotoBlobUrl',
      () => firstValueFrom(this.getFile$(owner, uuid).pipe(map(blob => ({url: URL.createObjectURL(blob), blobSize: blob.size})))),
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
    isCover?: boolean
  ): Observable<Photo | null> {
    const arr = new Uint8Array(content);
    let info: ImageInfo | undefined;
    if (ImageUtils.isJpeg(arr)) {
      if (dateTaken && latitude !== undefined && longitude !== undefined)
        info = {dateTaken, latitude, longitude};
      else {
        info = ImageUtils.extractInfos(arr);
        if (!info?.dateTaken) {
          const date = PhotoService.extractDateFromName(description);
          if (date) {
            if (!info) info = {dateTaken: date}; else info.dateTaken = date;
          }
        }
        Console.info('extracted info from image', info);
      }
    }
    const nextConvert: (s:number,q:number) => Promise<Blob> = (currentMaxSize: number, currentMaxQuality: number) =>
      ImageUtils.convertToJpeg(arr, currentMaxSize, currentMaxSize, currentMaxQuality)
      .then(jpeg => {
        if (jpeg.blob.size <= this.preferences.preferences.photoMaxSizeKB * 1024) return Promise.resolve(jpeg.blob);
        if (currentMaxQuality > this.preferences.preferences.photoMaxQuality - 0.25) return nextConvert(currentMaxSize, currentMaxQuality - 0.05);
        if (currentMaxSize > 400) return nextConvert(currentMaxSize - 100, this.preferences.preferences.photoMaxQuality);
        if (currentMaxQuality > 0.25) return nextConvert(currentMaxSize, currentMaxQuality - 0.05);
        if (currentMaxSize > 100) return nextConvert(currentMaxSize - 50, this.preferences.preferences.photoMaxQuality);
        return Promise.resolve(jpeg.blob);
      });
    const blobPromise = nextConvert(this.preferences.preferences.photoMaxPixels, this.preferences.preferences.photoMaxQuality);
    return from(blobPromise).pipe(
      switchMap(blob => {
        const photo = new Photo({
          owner,
          trailUuid,
          description,
          index,
        });
        photo.latitude = latitude ?? info?.latitude;
        photo.longitude = longitude ?? info?.longitude;
        photo.dateTaken = dateTaken ?? info?.dateTaken;
        photo.isCover = isCover ?? false;
        return this.injector.get(StoredFilesService).store(owner, 'photo', photo.uuid, blob).pipe(
          switchMap(result => {
            if (result === undefined) return of(null);
            return this.store.create(photo);
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

  private static extractDateFromName(name: string): number | undefined {
    const regex = /.*(\d{4})([0-1]\d)([0-3]\d).?([0-2]\d)([0-5]\d)([0-5]\d).*/;
    const dateMatch = regex.exec(name.length > 200 ? name.substring(0, 200) : name);
    if (!dateMatch) return undefined;
    const year = dateMatch[1] ? parseInt(dateMatch[1]) : undefined;
    if (!year || isNaN(year) || year < 1900) return undefined;
    const month = dateMatch[2] ? parseInt(dateMatch[2]) : undefined;
    if (!month || isNaN(month) || month < 1 || month > 12) return undefined;
    const day = dateMatch[3] ? parseInt(dateMatch[3]) : undefined;
    if (!day || isNaN(day) || day < 1 || day > 31) return undefined;
    const hour = dateMatch[4] ? parseInt(dateMatch[4]) : undefined;
    if (!hour || isNaN(hour) || hour < 1 || hour > 23) return undefined;
    const minute = dateMatch[5] ? parseInt(dateMatch[5]) : undefined;
    if (minute === undefined || isNaN(minute) || minute < 0 || minute > 59) return undefined;
    const second = dateMatch[6] ? parseInt(dateMatch[6]) : undefined;
    if (second === undefined || isNaN(second) || second < 0 || second > 59) return undefined;
    const date = new Date(year, month - 1, day, hour, minute, second).getTime();
    return date;
  }

  public update(photo: Photo, updater: (photo: Photo) => void, ondone?: (photo: Photo) => void): void {
    this.store.updateWithLock(photo, updater, ondone);
  }

  public delete(photo: Photo, ondone?: () => void): void {
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
    this.store.deleteIf('deleted photos', item => !!photos.find(p => p.uuid === item.uuid), ondone);
  }

  public deleteForTrail(owner: string, trailUuid: string, ondone?: () => void): void {
    this.getPhotosForTrailReady(owner, trailUuid).subscribe(photos => this.deleteMany(photos, ondone));
  }

  public deleteForTrails(trails: Trail[], ondone?: () => void): void {
    this.getPhotosForTrailsReady(trails.map(t => ({owner: t.owner, uuid: t.uuid}))).subscribe(photos => this.deleteMany(photos, ondone));
  }

  public async openPopupForTrail(owner: string, uuid: string): Promise<Photo | null> {
    const module = await import('../../components/photos-popup/photos-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.PhotosPopupComponent,
      componentProps: {
        owner: owner,
        trailUuid: uuid,
      },
      cssClass: 'large-modal',
    });
    await modal.present();
    return modal.onDidDismiss().then(result => result.data);
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
    return this.injector.get(StoredFilesService).getTotalSize('photo', maxDateStored, 20);
  }

  public removeAllCached(): Observable<any> {
    return this.store.getAll$().pipe(
      collection$items(),
      switchMap(items => this.injector.get(StoredFilesService).removeAll('photo', (owner, uuid) => {
        const item = items.find(p => p.owner === owner && p.uuid === uuid);
        if (!item) return false;
        return !item.isSavedOnServerAndNotDeletedLocally() || this.store.itemUpdatedLocally(owner, uuid);
      }))
    );
  }

  public removeExpired(): Observable<any> {
    return this.injector.get(StoredFilesService).cleanExpired('photo', Date.now() - this.injector.get(PreferencesService).preferences.photoCacheDays);
  }

}

class PhotoStore extends OwnedStore<PhotoDto, Photo> {

  private readonly http: HttpService;
  private readonly files: StoredFilesService;
  private readonly trails: TrailService;
  private readonly quotaService: QuotaService;

  constructor(
    injector: Injector,
  ) {
    super(PHOTO_TABLE_NAME, injector);
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

  protected override migrate(fromVersion: number, dbService: DatabaseService): Promise<number | undefined> {
    return Promise.resolve(undefined);
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
    const db = this._db;
    for (const dto of items) {
      const request = () => {
        if (this._db !== db) return EMPTY;
        return this.files.getFile$(dto.owner, 'photo', dto.uuid).pipe(
          catchError(e => EMPTY),
          switchMap(blob => {
            if (this._db !== db) return EMPTY;
            const headers: any = {
              'Content-Type': 'application/octet-stream',
              'X-Description': encodeURIComponent(dto.description),
              'X-Cover': dto.isCover ? 'true' : 'false',
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
      map(readiness => readiness.indexOf(false) < 0)
    );
  }

  protected override createdLocallyCanBeRemoved(entity: Photo): Observable<boolean> {
    return this.trails.getTrail$(entity.trailUuid, entity.owner).pipe(map(t => !t));
  }

  protected override deleted(deleted: {item$: BehaviorSubject<Photo | null> | undefined, item: Photo}[]): void {
    super.deleted(deleted);
    this.files.deleteMany('photo', deleted.map(d => ({owner: d.item.owner, uuid: d.item.uuid})));
  }

  protected override doCleaning(email: string, db: Dexie): Observable<any> {
    const photosCleant$ = zip([
      this.getAll$().pipe(collection$items()),
      this.trails.getAll$().pipe(collection$items()),
    ]).pipe(
      first(),
      switchMap(([photos, trails]) => {
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
            Console.info('Photos database cleaned: ' + count + ' removed');
            subscriber.next(true);
            subscriber.complete();
          });
          for (const photo of photos) {
            if (photo.createdAt > maxDate || photo.updatedAt > maxDate) continue;
            const trail = trails.find(t => t.uuid === photo.trailUuid && t.owner === photo.owner);
            if (trail) continue;
            const d = ondone.add();
            this.getLocalUpdate(photo).then(date => {
              if (db !== dbService.db?.db || email !== dbService.email) {
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

    const filesCleant$ = this.injector.get(StoredFilesService).cleanExpired('photo', Date.now() - this.injector.get(PreferencesService).preferences.photoCacheDays);

    return photosCleant$.pipe(switchMap(() => filesCleant$));
  }

}
