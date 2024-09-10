import { Injectable, Injector } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { PhotoDto } from 'src/app/model/dto/photo';
import { Photo } from 'src/app/model/photo';
import { VersionedDto } from 'src/app/model/dto/versioned';
import { BehaviorSubject, catchError, combineLatest, EMPTY, filter, first, from, map, Observable, of, share, switchMap, tap, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { HttpService } from '../http/http.service';
import { DatabaseService, PHOTO_TABLE_NAME } from './database.service';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { StoredFilesService } from './stored-files.service';
import { TrailService } from './trail.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { AuthService } from '../auth/auth.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import Dexie from 'dexie';
import { Trail } from 'src/app/model/trail';
import { ModalController } from '@ionic/angular/standalone';
import { ImageInfo, ImageUtils } from 'src/app/utils/image-utils';

@Injectable({providedIn: 'root'})
export class PhotoService {

  private store: PhotoStore;

  constructor(
    private injector: Injector,
  ) {
    this.store = new PhotoStore(injector);
  }

  public getTrailPhotos(trail: Trail): Observable<Photo[]> {
    return this.getPhotosForTrail(trail.owner, trail.uuid);
  }

  public getPhotosForTrail(owner: string, uuid: string): Observable<Photo[]> {
    return this.store.getAll$().pipe(
      collection$items(),
      map(photos => photos.filter(p => p.owner === owner && p.trailUuid === uuid))
    );
  }

  private _retrievingFiles = new Map<string, Observable<Blob>>();
  public getFile$(owner: string, uuid: string): Observable<Blob> {
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

  public addPhoto(owner: string, trailUuid: string, description: string, index: number, content: ArrayBuffer): Observable<Photo | null> {
    const arr = new Uint8Array(content);
    let info: ImageInfo | undefined;
    let blobPromise: Promise<Blob>;
    if (ImageUtils.isJpeg(arr)) {
      info = ImageUtils.extractInfos(arr);
      console.log('extracted info from image', info);
      blobPromise = Promise.resolve(new Blob([content], { type: 'image/jpeg' }));
    } else {
      blobPromise = ImageUtils.convertToJpeg(arr);
    }
    return from(blobPromise).pipe(
      switchMap(blob => {
        const photo = new Photo({
          owner,
          trailUuid,
          description,
          index,
        });
        photo.latitude = info?.latitude;
        photo.longitude = info?.longitude;
        photo.dateTaken = info?.dateTaken;
        return this.injector.get(StoredFilesService).store(owner, 'photo', photo.uuid, blob).pipe(
          switchMap(result => {
            if (result === undefined) return of(null);
            return this.store.create(photo);
          })
        );
      }),
      catchError(e => {
        console.log(e);
        return of(null);
      })
    );
  }

  public update(photo: Photo): void {
    this.store.update(photo);
  }

  public delete(photo: Photo, ondone?: () => void): void {
    this.store.delete(photo, ondone);
  }

  public deleteForTrail(owner: string, trailUuid: string, ondone?: () => void): void {
    this.getPhotosForTrail(owner, trailUuid).pipe(
      first()
    ).subscribe(photos => {
      const done = new CompositeOnDone(ondone);
      photos.forEach(photo => this.delete(photo, done.add()));
      done.start()
    });
  }

  public async openPopupForTrail(owner: string, uuid: string) {
    const module = await import('../../components/photos-popup/photos-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.PhotosPopupComponent,
      componentProps: {
        owner: owner,
        trailUuid: uuid,
      },
      cssClass: 'large-modal',
    });
    modal.present();
  }

}

class PhotoStore extends OwnedStore<PhotoDto, Photo> {

  private http: HttpService;
  private files: StoredFilesService;
  private trails: TrailService;

  constructor(
    injector: Injector,
  ) {
    super(PHOTO_TABLE_NAME, injector);
    this.http = injector.get(HttpService);
    this.files = injector.get(StoredFilesService);
    this.trails = injector.get(TrailService);
  }

  protected override fromDTO(dto: PhotoDto): Photo {
    return new Photo(dto);
  }

  protected override toDTO(entity: Photo): PhotoDto {
    return entity.toDto();
  }

  protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<PhotoDto>> {
    return this.http.post<UpdatesResponse<PhotoDto>>(environment.apiBaseUrl + '/photo/v1/_bulkGetUpdates', knownItems);
  }

  protected override sendUpdatesToServer(items: PhotoDto[]): Observable<PhotoDto[]> {
    return this.http.put<PhotoDto[]>(environment.apiBaseUrl + '/photo/v1/_bulkUpdate', items);
  }

  protected override deleteFromServer(uuids: string[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/photo/v1/_bulkDelete', uuids);
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
              'X-Description': dto.description,
              'X-Cover': dto.isCover ? 'true' : 'false',
              'X-Index': dto.index,
            };
            if (dto.dateTaken) headers['X-DateTaken'] = dto.dateTaken;
            if (dto.latitude) headers['X-Latitude'] = dto.latitude;
            if (dto.longitude) headers['X-Longitude'] = dto.longitude;
            return this.http.post<PhotoDto>(environment.apiBaseUrl + '/photo/v1/' + dto.trailUuid + '/' + dto.uuid, blob, headers);
          })
        )
      };
      requests.push(limiter.add(request));
    }
    return (requests.length === 0 ? of([]) : zip(requests));
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

  protected override deleted(item$: BehaviorSubject<Photo | null> | undefined, item: Photo): void {
    this.files.delete(item.owner, 'photo', item.uuid);
  }

  protected override doCleaning(email: string, db: Dexie): Observable<any> {
    return zip([
      this.getAll$().pipe(collection$items()),
      this.trails.getAll$().pipe(collection$items()),
    ]).pipe(
      first(),
      switchMap(([photos, trails]) => {
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
            console.log('Photos database cleaned: ' + count + ' removed');
            subscriber.next(true);
            subscriber.complete();
          });
          for (const photo of photos) {
            if (photo.createdAt > maxDate || photo.updatedAt > maxDate) continue;
            const trail = trails.find(t => t.uuid === photo.trailUuid && t.owner === photo.owner);
            if (trail) continue;
            const d = ondone.add();
            this.getLocalUpdate(photo).then(date => {
              if (db !== dbService.db || email !== dbService.email) {
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
  }

}
