import { Injectable, Injector } from '@angular/core';
import { SimpleStore } from './simple-store';
import { ShareDto, ShareElementType } from 'src/app/model/dto/share';
import { Share } from 'src/app/model/share';
import { SHARE_TABLE_NAME } from './database.service';
import { combineLatest, EMPTY, map, Observable, of, tap, zip } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { TrailCollectionService } from './trail-collection.service';
import { TagService } from './tag.service';
import { AuthService } from '../auth/auth.service';
import { TrailService } from './trail.service';
import { MenuItem } from 'src/app/utils/menu-item';
import { I18nService } from '../i18n/i18n.service';
import { AlertController } from '@ionic/angular/standalone';
import Dexie from 'dexie';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { QuotaService } from '../auth/quota.service';

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

  public getShare$(id: string, from: string): Observable<Share | null> {
    return this.getAll$().pipe(
      collection$items(),
      map(shares => shares.find(share => share.id === id && share.from === from) ?? null)
    );
  }

  public create(type: ShareElementType, elements: string[], name: string, to: string, toLanguage: string, includePhotos: boolean): Observable<Share | null> {
    const from = this.injector.get(AuthService).email;
    if (!from) return of(null);
    const trails: string[] = [];
    return this._store.create(new Share(
      window.crypto.randomUUID(), name, from, to, type, Date.now(), elements, trails, toLanguage, includePhotos
    ));
  }

  public remove(share: Share) {
    this._store.delete(share);
  }

  public getShareMenu(share: Share): MenuItem[] {
    const menu: MenuItem[] = [];
    menu.push(new MenuItem().setIcon('trash').setI18nLabel('buttons.delete').setColor('danger').setAction(() => this.confirmDelete(share)));
    return menu;
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
  protected override getKey(entity: Share): string { return entity.id; }

  protected override updateEntityFromServer(): boolean { return true; }

  protected override createOnServer(items: ShareDto[]): Observable<ShareDto[]> {
    const db = this._db;
    const limiter = new RequestLimiter(2);
    const requests: Observable<any>[] = [];
    items.forEach(item => {
      const request = () => {
        if (this._db !== db) return EMPTY;
        return this.injector.get(HttpService).post<ShareDto>(environment.apiBaseUrl + '/share/v1', {
          id: item.id,
          name: item.name,
          to: item.to,
          type: item.type,
          elements: item.elements,
          toLanguage: item.toLanguage,
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
        return this.injector.get(HttpService).delete(environment.apiBaseUrl + '/share/v1/' + encodeURIComponent(item.from) + '/' + item.id).pipe(
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

  protected override getAllFromServer(): Observable<ShareDto[]> {
    return this.injector.get(HttpService).get<ShareDto[]>(environment.apiBaseUrl + '/share/v1');
  }

  protected override readyToSave(entity: Share): boolean {
    if (entity.from != this.injector.get(AuthService).email) return false;
    if (entity.type === ShareElementType.COLLECTION) {
      const collectionService = this.injector.get(TrailCollectionService);
      return entity.elements.every(collectionUuid => collectionService.getCollection(collectionUuid, entity.from)?.isSavedOnServerAndNotDeletedLocally());
    }
    if (entity.type === ShareElementType.TAG) {
      const tagService = this.injector.get(TagService);
      return entity.elements.every(tagUuid => tagService.getTag(tagUuid)?.isSavedOnServerAndNotDeletedLocally());
    }
    if (entity.type === ShareElementType.TRAIL) {
      const trailService = this.injector.get(TrailService);
      return entity.elements.every(trailUuid => trailService.getTrail(trailUuid, entity.from)?.isSavedOnServerAndNotDeletedLocally());
    }
    return false;
  }

  protected override readyToSave$(entity: Share): Observable<boolean> {
    if (entity.elements.length === 0 || entity.from != this.injector.get(AuthService).email) return of(false);
    if (entity.type === ShareElementType.COLLECTION) {
      const collectionService = this.injector.get(TrailCollectionService);
      return combineLatest(
        entity.elements.map(collectionUuid => collectionService.getCollection$(collectionUuid, entity.from).pipe(map(col => !!col?.isSavedOnServerAndNotDeletedLocally())))
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
        entity.elements.map(trailUuid => trailService.getTrail$(trailUuid, entity.from).pipe(map(trail => !!trail?.isSavedOnServerAndNotDeletedLocally())))
      ).pipe(
        map(readiness => readiness.indexOf(false) < 0)
      );
    }
    return of(false);
  }

  protected override doCleaning(email: string, db: Dexie): Observable<any> {
    return of(false);
  }

}
