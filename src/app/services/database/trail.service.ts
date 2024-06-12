import { Injectable, Injector, NgZone } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { DatabaseService, TRAIL_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { Observable, combineLatest, map } from 'rxjs';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/newtork.service';
import { Trail } from 'src/app/model/trail';
import { TrailDto } from 'src/app/model/dto/trail';
import { TrackService } from './track.service';
import { TrailCollectionService } from './trail-collection.service';
import { VersionedDto } from 'src/app/model/dto/versioned';
import { MenuItem } from 'src/app/utils/menu-item';
import { AuthService } from '../auth/auth.service';
import { CollectionObservable } from 'src/app/utils/rxjs/observable-collection';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { I18nService } from '../i18n/i18n.service';
import { TagService } from './tag.service';

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

  public getAll$(): CollectionObservable<Observable<Trail | null>> {
    return this._store.getAll$();
  }

  public getAllForCollectionUuid$(colletionUuid: string): CollectionObservable<Observable<Trail | null>> {
    return this._store.filter$(trail => trail.collectionUuid === colletionUuid);
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

  public delete(trail: Trail): void {
    this.trackService.deleteByUuidAndOwner(trail.originalTrackUuid, trail.owner);
    if (trail.currentTrackUuid !== trail.originalTrackUuid)
      this.trackService.deleteByUuidAndOwner(trail.currentTrackUuid, trail.owner);
    this.injector.get(TagService).deleteTrailTagsForTrail(trail.uuid);
    this._store.delete(trail);
  }

  public getTrailMenu(trail: Trail): MenuItem[] {
    const menu: MenuItem[] = [];
    if (trail.owner === this.injector.get(AuthService).email) {
      menu.push(new MenuItem().setIcon('tags').setI18nLabel('pages.trails.tags.menu_item').setAction(() => this.openTags([trail], trail.collectionUuid)));
      menu.push(new MenuItem());
      menu.push(new MenuItem().setIcon('trash').setI18nLabel('buttons.delete').setColor('danger').setAction(() => this.confirmDelete([trail])));
    }
    return menu;
  }

  public getTrailsMenu(trails: Trail[]): MenuItem[] {
    if (trails.length === 0) return [];
    if (trails.length === 1) return this.getTrailMenu(trails[0]);
    const menu: MenuItem[] = [];
    if (trails.every(t => t.owner === this.injector.get(AuthService).email)) {
      const collectionUuid = this.getUniqueCollectionUuid(trails);
      if (collectionUuid) {
        menu.push(new MenuItem().setIcon('tags').setI18nLabel('pages.trails.tags.menu_item').setAction(() => this.openTags(trails, collectionUuid)));
      }
      if (menu.length > 0)
        menu.push(new MenuItem());
      menu.push(new MenuItem().setIcon('trash').setI18nLabel('buttons.delete').setColor('danger').setAction(() => this.confirmDelete(trails)));
    }
    return menu;
  }

  private getUniqueCollectionUuid(trails: Trail[]): string | undefined {
    if (trails.length === 0) return undefined;
    let uuid = trails[0].collectionUuid;
    for (let i = 1; i < trails.length; ++i) {
      if (trails[i].collectionUuid !== uuid) return undefined;
    }
    return uuid;
  }

  public async confirmDelete(trails: Trail[]) {
    const i18n = this.injector.get(I18nService);
    const texts = trails.length === 1 ? i18n.texts.pages.trails.actions.delete_confirm_single : i18n.texts.pages.trails.actions.delete_confirm_multiple;
    const alert = await this.injector.get(AlertController).create({
      header: trails.length === 1 ? texts.title : texts.title.replace('{{}}', '' + trails.length),
      message: texts.message.replace('{{}}', trails.length === 1 ? trails[0].name : '' + trails.length),
      buttons: [
        {
          text: texts.yes,
          role: 'danger',
          handler: () => {
            trails.forEach(trail => this.delete(trail));
            alert.dismiss();
          }
        }, {
          text: texts.no,
          role: 'cancel'
        }
      ]
    });
    await alert.present();
  }

  public async openTags(trails: Trail[], collectionUuid: string) {
    const module = await import('../../components/tags/tags.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.TagsComponent,
      backdropDismiss: false,
      componentProps: {
        trails,
        collectionUuid,
      }
    });
    modal.present();
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
    const collectionReady$ = this.collectionService.getCollection$(entity.collectionUuid, entity.owner).pipe(map(track => !!track?.isSavedOnServerAndNotDeletedLocally()));
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
