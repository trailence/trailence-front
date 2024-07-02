import { Injectable, Injector, NgZone } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { DatabaseService, TRAIL_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { Observable, combineLatest, filter, first, map, of, switchMap, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/newtork.service';
import { Trail } from 'src/app/model/trail';
import { TrailDto } from 'src/app/model/dto/trail';
import { TrackService } from './track.service';
import { TrailCollectionService } from './trail-collection.service';
import { VersionedDto } from 'src/app/model/dto/versioned';
import { MenuItem } from 'src/app/utils/menu-item';
import { AuthService } from '../auth/auth.service';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { I18nService } from '../i18n/i18n.service';
import { TagService } from './tag.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { ProgressService } from '../progress/progress.service';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { Router } from '@angular/router';

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

  public getTrailsMenu(trails: Trail[], fromTrail: boolean = false): MenuItem[] {
    if (trails.length === 0) return [];
    const menu: MenuItem[] = [];
    const email = this.injector.get(AuthService).email!;
    if (trails.every(t => t.owner === email)) {
      const collectionUuid = this.getUniqueCollectionUuid(trails);
      if (collectionUuid) {
        menu.push(new MenuItem().setIcon('tags').setI18nLabel('pages.trails.tags.menu_item').setAction(() => this.openTags(trails, collectionUuid)));
      }
      if (collectionUuid) {
        if (menu.length > 0)
          menu.push(new MenuItem());
        menu.push(
          new MenuItem().setIcon('collection-copy').setI18nLabel('pages.trails.actions.copy_to_collection')
          .setChildrenProvider(() => this.getCollectionsMenuItems(collectionUuid, (col) => {
            const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.pages.trails.actions.copying, trails.length);
            for (const trail of trails) {
              const originalTrack$ = this.injector.get(TrackService).getFullTrack$(trail.originalTrackUuid, trail.owner);
              const currentTrack$ = trail.originalTrackUuid === trail.currentTrackUuid ? originalTrack$ : this.injector.get(TrackService).getFullTrack$(trail.currentTrackUuid, trail.owner);
              zip([originalTrack$, currentTrack$])
              .pipe(filter(tracks => !!tracks[0] && !!tracks[1]), first())
              .subscribe(
                tracks => {
                  const originalTrack = tracks[0]!.copy(email);
                  const currentTrack = tracks[1]!.uuid === tracks[0]!.uuid ? undefined : tracks[1]!.copy(email);
                  const copy = new Trail({
                    ...trail.toDto(),
                    uuid: undefined,
                    owner: email,
                    version: undefined,
                    createdAt: undefined,
                    updatedAt: undefined,
                    collectionUuid: col.uuid,
                    originalTrackUuid: originalTrack.uuid,
                    currentTrackUuid: currentTrack?.uuid ?? originalTrack.uuid
                  });
                  this.injector.get(TrackService).create(originalTrack);
                  if (currentTrack)
                    this.injector.get(TrackService).create(currentTrack);
                  this.create(copy);
                  progress.addWorkDone(1);
                  if (fromTrail) this.injector.get(Router).navigateByUrl('/trail/' + email + '/' + copy.uuid);
                }
              );
            }
          }))
        );
        menu.push(
          new MenuItem().setIcon('collection-move').setI18nLabel('pages.trails.actions.move_to_collection')
          .setChildrenProvider(() => this.getCollectionsMenuItems(collectionUuid, (col) => {
            for (const trail of trails) {
              trail.collectionUuid = col.uuid;
              this.update(trail);
            }
          }))
        );
      }
      if (menu.length > 0)
        menu.push(new MenuItem());
      menu.push(new MenuItem().setIcon('trash').setI18nLabel('buttons.delete').setColor('danger').setAction(() => this.confirmDelete(trails, fromTrail)));
    }
    return menu;
  }

  private getCollectionsMenuItems(excludeUuid: string, action: (col: TrailCollection) => void): Observable<MenuItem[]> {
    return this.injector.get(TrailCollectionService).getAll$().pipe(
      switchMap(cols => cols.length === 0 ? of([]) : combineLatest(cols)),
      map(cols => (cols.filter(col => !!col && col.uuid !== excludeUuid) as TrailCollection[]).map(
        col => {
          const item = new MenuItem();
          if (col.name === '' && col.type === TrailCollectionType.MY_TRAILS)
            item.setI18nLabel('my_trails');
          else
            item.setFixedLabel(col.name);
          item.setAction(() => action(col));
          return item;
        }
      ))
    );
  }

  private getUniqueCollectionUuid(trails: Trail[]): string | undefined {
    if (trails.length === 0) return undefined;
    let uuid = trails[0].collectionUuid;
    for (let i = 1; i < trails.length; ++i) {
      if (trails[i].collectionUuid !== uuid) return undefined;
    }
    return uuid;
  }

  public async confirmDelete(trails: Trail[], fromTrail: boolean) {
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
            alert.dismiss();
            const progress = this.injector.get(ProgressService).create(i18n.texts.pages.trails.actions.deleting_trails, trails.length);
            let index = 0;
            const deleteNext = () => {
              this.delete(trails[index], () => {
                progress.addWorkDone(1);
                index++;
                if (index < trails.length) setTimeout(deleteNext, 0);
                else if (fromTrail) this.injector.get(Router).navigateByUrl('/trails/collection/' + trails[0].collectionUuid);
              });
            };
            deleteNext();
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
