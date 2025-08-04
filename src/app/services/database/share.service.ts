import { Injectable, Injector } from '@angular/core';
import { SimpleStore } from './simple-store';
import { ShareDto, ShareElementType } from 'src/app/model/dto/share';
import { Share } from 'src/app/model/share';
import { DatabaseService, SHARE_TABLE_NAME } from './database.service';
import { combineLatest, EMPTY, map, Observable, of, switchMap, tap, zip } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { TrailCollectionService } from './trail-collection.service';
import { TagService } from './tag.service';
import { AuthService } from '../auth/auth.service';
import { TrailService } from './trail.service';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { I18nService } from '../i18n/i18n.service';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import Dexie from 'dexie';
import { collection$items, collection$items$ } from 'src/app/utils/rxjs/collection$items';
import { QuotaService } from '../auth/quota.service';
import { Arrays } from 'src/app/utils/arrays';
import { Trail } from 'src/app/model/trail';

@Injectable({
  providedIn: 'root'
})
export class ShareService {

  private readonly _store: ShareStore;

  constructor(
    private readonly injector: Injector
  ) {
    this._store = new ShareStore(injector);
  }

  public getAll$(): Observable<Observable<Share | null>[]> {
    return this._store.getAll$();
  }

  public getAllReady$(): Observable<Share[]> {
    return this.getAll$().pipe(collection$items());
  }

  public getShare$(id: string, from: string): Observable<Share | null> {
    return this.getAll$().pipe(
      collection$items(),
      map(shares => shares.find(share => share.uuid === id && share.owner === from) ?? null)
    );
  }

  public create(type: ShareElementType, elements: string[], name: string, recipients: string[], mailLanguage: string, includePhotos: boolean): Observable<Share | null> {
    const from = this.injector.get(AuthService).email;
    if (!from) return of(null);
    const trails: string[] = [];
    const date = Date.now();
    return this._store.create(new Share(
      window.crypto.randomUUID(),
      from,
      1,
      date,
      date,
      recipients,
      type,
      name,
      includePhotos,
      elements,
      trails,
      mailLanguage,
    ));
  }

  public update(share: Share, updater: (share: Share) => void, ondone?: (share: Share) => void): void {
    this._store.updateWithLock(share, updater, ondone);
  }

  public remove(share: Share) {
    this._store.delete(share);
  }

  public getShareMenu(share: Share): MenuItem[] {
    const menu: MenuItem[] = [];
    if (share.owner === this.injector.get(AuthService).email)
      menu.push(new MenuItem().setIcon('edit').setI18nLabel('buttons.edit').setAction(() => this.sharePopup(share)))
    menu.push(new MenuItem().setIcon('trash').setI18nLabel('buttons.delete').setTextColor('danger').setAction(() => this.confirmDelete(share)));
    return menu;
  }

  public async sharePopup(share: Share) {
    const module = await import('../../components/share-popup/share-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.SharePopupComponent,
      componentProps: {
        share
      }
    });
    modal.present();
  }

  public async confirmDelete(share: Share) {
    const i18n = this.injector.get(I18nService);
    const texts = i18n.texts.confirm_delete_share;
    const alert = await this.injector.get(AlertController).create({
      header: texts.title,
      message: texts.message.replace('{{}}', share.name),
      buttons: [
        {
          text: texts.yes,
          role: 'danger',
          handler: () => {
            alert.dismiss();
            this.remove(share);
          }
        }, {
          text: texts.no,
          role: 'cancel'
        }
      ]
    });
    await alert.present();
  }

  public storeLoadedAndServerUpdates$(): Observable<boolean> {
    return combineLatest([this._store.loaded$, this._store.syncStatus$]).pipe(
      map(([loaded, sync]) => loaded && !sync.needsUpdateFromServer)
    );
  }

  public signalCollectionsDeleted(deleted: {uuid: string, owner: string}[]): void {
    this._store.triggerSyncFromServer();
  }

  public signalTrailsDeleted(deleted: {uuid: string, owner: string}[]): void {
    this._store.triggerSyncFromServer();
  }

  public signalTagsDeleted(deleted: {uuid: string, owner: string}[]): void {
    this._store.triggerSyncFromServer();
  }

  public getTrailsByShare(shares: Share[]): Observable<Map<Share, Observable<Trail | null>[]>> {
    return this.injector.get(AuthService).auth$.pipe(
      switchMap(auth => {
        if (!auth) return of(new Map<Share, Observable<Trail | null>[]>());
        const user = auth.email;
        const needTags = !!shares.find(s => s.owner === user && s.type === ShareElementType.TAG);
        return combineLatest([
          this.injector.get(TrailService).getAllWhenLoaded$().pipe(collection$items$()),
          needTags ? this.injector.get(TagService).getAllTrailsTags$().pipe(collection$items()) : of([]),
        ]).pipe(
          map(([trails, tags]) => {
            const result = new Map<Share, Observable<Trail | null>[]>();
            shares.forEach(share => {
              let filter: (trail: {item: Trail, item$: Observable<Trail | null>}) => boolean;
              if (share.owner === user) {
                if (share.type === ShareElementType.TRAIL)
                  filter = trail => trail.item.owner === share.owner && share.elements.indexOf(trail.item.uuid) >= 0;
                else if (share.type === ShareElementType.COLLECTION)
                  filter = trail => trail.item.owner === share.owner && share.elements.indexOf(trail.item.collectionUuid) >= 0;
                else {
                  const tagsUuids = tags.filter(tag => share.elements.indexOf(tag.tagUuid) >= 0).map(tag => tag.trailUuid);
                  filter = trail => trail.item.owner === share.owner && tagsUuids.indexOf(trail.item.uuid) >= 0;
                }
              } else {
                filter = trail => trail.item.owner === share.owner && share.trails.indexOf(trail.item.uuid) >= 0;
              }
              result.set(share, trails.filter(filter).map(t => t.item$));
            });
            return result;
          })
        );
      })
    );
  }

  public getSharesFromTrailSharedWithMe(trailUuid: string, trailOwner: string): Observable<Share[]> {
    return this.getAll$().pipe(
      collection$items(share => share.owner === trailOwner && share.trails.indexOf(trailUuid) >= 0),
    );
  }
}

class ShareStore extends SimpleStore<ShareDto, Share> {

  constructor(
    injector: Injector
  ) {
    super(SHARE_TABLE_NAME, injector);
    this.quotaService = injector.get(QuotaService);
  }

  private readonly quotaService: QuotaService;

  protected override fromDTO(dto: ShareDto): Share { return Share.fromDto(dto); }
  protected override toDTO(entity: Share): ShareDto { return entity.toDto(); }
  protected override getKey(entity: Share): string { return entity.uuid; }

  protected override isQuotaReached(): boolean {
    const q = this.quotaService.quotas;
    return !q || q.sharesUsed >= q.sharesMax;
  }

  protected override updateEntityFromServer(fromServer: Share, inStore: Share): Share | null {
    if (fromServer.version > inStore.version) return fromServer;
    if (this._updatedLocally.indexOf(this.getKey(fromServer)) >= 0) {
      if (Arrays.sameContent(inStore.trails, fromServer.trails)) return null;
      inStore.trails = fromServer.trails;
      return inStore;
    }
    return inStore.isEqual(fromServer) ? null : fromServer;
  }

  protected override updated(item: Share): void {
    item.updatedAt = Date.now();
  }

  protected override migrate(fromVersion: number, dbService: DatabaseService, isNewDb: boolean): Promise<number | undefined> {
    if (fromVersion < 1300 && !isNewDb) return import('./migrations/sharev1_sharev2').then(m => m.ShareV1ToShareV2.migrate(dbService)).then(() => undefined);
    return Promise.resolve(undefined);
  }

  protected override createOnServer(items: ShareDto[]): Observable<ShareDto[]> {
    const db = this._db;
    const limiter = new RequestLimiter(2);
    const requests: Observable<any>[] = [];
    items.forEach(item => {
      const request = () => {
        if (this._db !== db) return EMPTY;
        return this.injector.get(HttpService).post<ShareDto>(environment.apiBaseUrl + '/share/v2', {
          id: item.uuid,
          name: item.name,
          recipients: item.recipients,
          type: item.type,
          elements: item.elements,
          mailLanguage: item.mailLanguage,
          includePhotos: item.includePhotos,
        }).pipe(
          map(result => {
            result.trails = item.trails;
            this.quotaService.updateQuotas(q => q.sharesUsed++);
            return result;
          }),
        );
      }
      requests.push(limiter.add(request));
    });
    if (requests.length === 0) return of([]);
    return zip(requests);
  }

  protected override deleteFromServer(items: ShareDto[]): Observable<void> {
    const db = this._db;
    const limiter = new RequestLimiter(2);
    const requests: Observable<any>[] = [];
    items.forEach(item => {
      const request = () => {
        if (this._db !== db) return EMPTY;
        return this.injector.get(HttpService).delete(environment.apiBaseUrl + '/share/v2/' + encodeURIComponent(item.owner) + '/' + item.uuid).pipe(
          tap({
            complete: () => this.quotaService.updateQuotas(q => q.sharesUsed--)
          }),
          map(() => 1)
        );
      }
      requests.push(limiter.add(request));
    });
    if (requests.length === 0) return of([]).pipe(map(() => {}));
    return zip(requests).pipe(map(() => {}));
  }

  protected override updateToServer(items: ShareDto[]): Observable<ShareDto[]> {
    const db = this._db;
    const limiter = new RequestLimiter(2);
    const requests: Observable<any>[] = [];
    items.forEach(item => {
      const request = () => {
        if (this._db !== db) return EMPTY;
        return this.injector.get(HttpService).put<ShareDto>(environment.apiBaseUrl + '/share/v2/' + item.uuid, {
          name: item.name,
          includePhotos: item.includePhotos,
          recipients: item.recipients,
          mailLanguage: item.mailLanguage,
        }).pipe(
          map(result => {
            result.trails = item.trails;
            return result;
          }),
        );
      }
      requests.push(limiter.add(request));
    });
    if (requests.length === 0) return of([]);
    return zip(requests);
  }

  protected override getAllFromServer(): Observable<ShareDto[]> {
    return this.injector.get(HttpService).get<ShareDto[]>(environment.apiBaseUrl + '/share/v2');
  }

  protected override readyToSave(entity: Share): boolean {
    if (entity.owner != this.injector.get(AuthService).email) return false;
    if (entity.type === ShareElementType.COLLECTION) {
      const collectionService = this.injector.get(TrailCollectionService);
      return entity.elements.every(collectionUuid => collectionService.getCollection(collectionUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally());
    }
    if (entity.type === ShareElementType.TAG) {
      const tagService = this.injector.get(TagService);
      return entity.elements.every(tagUuid => tagService.getTag(tagUuid)?.isSavedOnServerAndNotDeletedLocally());
    }
    if (entity.type === ShareElementType.TRAIL) {
      const trailService = this.injector.get(TrailService);
      return entity.elements.every(trailUuid => trailService.getTrail(trailUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally());
    }
    return false;
  }

  protected override readyToSave$(entity: Share): Observable<boolean> {
    if (entity.elements.length === 0 || entity.owner != this.injector.get(AuthService).email) return of(false);
    if (entity.type === ShareElementType.COLLECTION) {
      const collectionService = this.injector.get(TrailCollectionService);
      return combineLatest(
        entity.elements.map(collectionUuid => collectionService.getCollection$(collectionUuid, entity.owner).pipe(map(col => !!col?.isSavedOnServerAndNotDeletedLocally())))
      ).pipe(
        map(readiness => readiness.indexOf(false) < 0)
      );
    }
    if (entity.type === ShareElementType.TAG) {
      const tagService = this.injector.get(TagService);
      return combineLatest(
        entity.elements.map(tagUuid => tagService.getTag$(tagUuid).pipe(map(tag => !!tag?.isSavedOnServerAndNotDeletedLocally())))
      ).pipe(
        map(readiness => readiness.indexOf(false) < 0)
      );
    }
    if (entity.type === ShareElementType.TRAIL) {
      const trailService = this.injector.get(TrailService);
      return combineLatest(
        entity.elements.map(trailUuid => trailService.getTrail$(trailUuid, entity.owner).pipe(map(trail => !!trail?.isSavedOnServerAndNotDeletedLocally())))
      ).pipe(
        map(readiness => readiness.indexOf(false) < 0)
      );
    }
    return of(false);
  }

  protected override createdLocallyCanBeRemoved(entity: Share): Observable<boolean> {
    return of(false);
  }

  protected override doCleaning(email: string, db: Dexie): Observable<any> {
    return of(false);
  }

}
