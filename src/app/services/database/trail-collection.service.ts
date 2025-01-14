import { Injectable, Injector } from "@angular/core";
import { BehaviorSubject, Observable, combineLatest, first, map, of, switchMap } from "rxjs";
import { TrailCollection, TrailCollectionType } from "src/app/model/trail-collection";
import { OwnedStore, UpdatesResponse } from "./owned-store";
import { TrailCollectionDto } from "src/app/model/dto/trail-collection";
import { TRAIL_COLLECTION_TABLE_NAME, TRAIL_TABLE_NAME } from "./database.service";
import { environment } from "src/environments/environment";
import { HttpService } from "../http/http.service";
import { VersionedDto } from "src/app/model/dto/versioned";
import { ModalController, AlertController } from '@ionic/angular/standalone';
import { MenuItem } from 'src/app/utils/menu-item';
import { I18nService } from '../i18n/i18n.service';
import { TagService } from './tag.service';
import { TrailService } from './trail.service';
import { Progress, ProgressService } from '../progress/progress.service';
import Dexie from 'dexie';
import { Router } from '@angular/router';
import { Trail } from 'src/app/model/trail';
import { DependenciesService } from './dependencies.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { PreferencesService } from '../preferences/preferences.service';

@Injectable({
    providedIn: 'root'
})
export class TrailCollectionService {

  private readonly _store: TrailCollectionStore;

  constructor(
    http: HttpService,
    private readonly injector: Injector,
  ) {
    this._store = new TrailCollectionStore(injector, http);
  }

  public getAll$(): Observable<Observable<TrailCollection | null>[]> {
    return this._store.getAll$();
  }

  public getCollection$(uuid: string, owner: string): Observable<TrailCollection | null> {
    return this._store.getItem$(uuid, owner);
  }

  public getCollection(uuid: string, owner: string): TrailCollection | null {
    return this._store.getItem(uuid, owner);
  }

  public getMyTrails$(): Observable<TrailCollection> {
    return this.getAll$().pipe(
      switchMap(collections => collections.length === 0 ? of([]) : combineLatest(collections)),
      map(collections => collections.find(collection => collection?.type === TrailCollectionType.MY_TRAILS)),
      filterDefined(),
      first()
    );
  }

  public create(collection: TrailCollection, ondone?: () => void): Observable<TrailCollection | null> {
    return this._store.create(collection, ondone);
  }

  public update(collection: TrailCollection): void {
    this._store.update(collection);
  }

  public delete(collection: TrailCollection, progress: Progress): void {
    progress.workAmount = 100 + 1000 + 1;
    this.injector.get(TagService).deleteAllTagsFromCollection(collection.uuid, collection.owner, progress, 100).subscribe(() => {
      this.injector.get(TrailService).deleteAllTrailsFromCollection(collection.uuid, collection.owner, progress, 1000).subscribe(() => {
        this._store.delete(collection);
        progress.addWorkDone(1);
        progress.done();
      });
    });
  }

  propagateDelete(collection: TrailCollection): void {
    this.injector.get(TagService).deleteAllTagsFromCollection(collection.uuid, collection.owner, undefined, 100).subscribe(() => {
      this.injector.get(TrailService).deleteAllTrailsFromCollection(collection.uuid, collection.owner, undefined, 1000).subscribe();
    });
  }

  public getCollectionMenu(collection: TrailCollection): MenuItem[] {
    const menu: MenuItem[] = [];
    menu.push(new MenuItem().setIcon('edit').setI18nLabel('buttons.edit').setAction(() => this.collectionPopup(collection)));
    if (collection.type === TrailCollectionType.CUSTOM) {
      menu.push(new MenuItem().setIcon('trash').setI18nLabel('buttons.delete').setColor('danger').setAction(() => this.confirmDelete(collection)));
    }
    return menu;
  }

  public async collectionPopup(collection?: TrailCollection, redirectOnApplied?: boolean) {
    const module = await import('../../components/collection-form-popup/collection-form-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.CollectionFormPopupComponent,
      componentProps: {
        collection,
        redirectOnApplied: redirectOnApplied ?? true,
      },
      backdropDismiss: false,
      cssClass: 'small-modal',
    });
    await modal.present();
    return await modal.onWillDismiss();
  }

  public async confirmDelete(collection: TrailCollection) {
    const i18n = this.injector.get(I18nService);
    const alert = await this.injector.get(AlertController).create({
      header: i18n.texts.collection_menu.delete_confirm.title,
      message: i18n.texts.collection_menu.delete_confirm.message.replace('{{}}', collection.name),
      buttons: [
        {
          text: i18n.texts.collection_menu.delete_confirm.yes,
          role: 'danger',
          handler: () => {
            const progress = this.injector.get(ProgressService).create(i18n.texts.collection_menu.deleting, 1);
            this.delete(collection, progress);
            alert.dismiss();
            this.injector.get(Router).navigateByUrl('/');
          }
        }, {
          text: i18n.texts.collection_menu.delete_confirm.no,
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

  public doNotDeleteCollectionWhileTrailNotSync(collectionUuid: string, trail: Trail): Promise<any> {
    const collectionKey = collectionUuid + '#' + trail.owner;
    const trailKey = trail.uuid + '#' + trail.owner;
    return this.injector.get(DependenciesService).addDependencies(
      TRAIL_COLLECTION_TABLE_NAME,
      collectionKey,
      'delete',
      [
        {
          storeName: TRAIL_TABLE_NAME,
          itemKey: trailKey,
          operation: 'update'
        }
      ]
    );
  }

  public doNotDeleteCollectionUntilEvent(collectionUuid: string, collectionOwner: string, eventId: string): void {
    this.injector.get(DependenciesService).addEventDependency(
      TRAIL_COLLECTION_TABLE_NAME,
      collectionUuid + '#' + collectionOwner,
      'delete',
      eventId
    );
  }

  public sort(list: TrailCollection[]): TrailCollection[] {
    const prefs = this.injector.get(PreferencesService).preferences;
    return list.sort((c1, c2) => this.compareCollections(c1, c2, prefs.lang));
  }

  public compareCollections(c1: TrailCollection, c2: TrailCollection, lang: string): number {
    if (c1.type === TrailCollectionType.MY_TRAILS) return -1;
    if (c2.type === TrailCollectionType.MY_TRAILS) return 1;
    return c1.name.localeCompare(c2.name, lang);
  }
}

class TrailCollectionStore extends OwnedStore<TrailCollectionDto, TrailCollection> {

    constructor(
      injector: Injector,
      private readonly http: HttpService,
    ) {
      super(TRAIL_COLLECTION_TABLE_NAME, injector);
    }

    protected override fromDTO(dto: TrailCollectionDto): TrailCollection {
      return new TrailCollection(dto);
    }

    protected override toDTO(entity: TrailCollection): TrailCollectionDto {
      return entity.toDto();
    }

    protected override readyToSave(entity: TrailCollection): boolean {
        return true;
    }

    protected override readyToSave$(entity: TrailCollection): Observable<boolean> {
      return of(true);
    }

    protected override createOnServer(items: TrailCollectionDto[]): Observable<TrailCollectionDto[]> {
      return this.http.post<TrailCollectionDto[]>(environment.apiBaseUrl + '/trail-collection/v1/_bulkCreate', items);
    }

    protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<TrailCollectionDto>> {
      return this.http.post<UpdatesResponse<TrailCollectionDto>>(environment.apiBaseUrl + '/trail-collection/v1/_bulkGetUpdates', knownItems);
    }

    protected override sendUpdatesToServer(items: TrailCollectionDto[]): Observable<TrailCollectionDto[]> {
      return this.http.put<TrailCollectionDto[]>(environment.apiBaseUrl + '/trail-collection/v1/_bulkUpdate', items);
    }

    protected override deleteFromServer(uuids: string[]): Observable<void> {
      return this.http.post<void>(environment.apiBaseUrl + '/trail-collection/v1/_bulkDelete', uuids);
    }

    protected override deleted(item$: BehaviorSubject<TrailCollection | null> | undefined, item: TrailCollection): void {
      this.injector.get(TrailCollectionService).propagateDelete(item);
    }

    protected override doCleaning(email: string, db: Dexie): Observable<any> {
      return of(false);
    }

  }
