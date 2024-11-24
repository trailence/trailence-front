import { Injectable, Injector } from "@angular/core";
import { BehaviorSubject, Observable, combineLatest, filter, first, map, of, switchMap } from "rxjs";
import { TrailCollection, TrailCollectionType } from "src/app/model/trail-collection";
import { OwnedStore, UpdatesResponse } from "./owned-store";
import { TrailCollectionDto } from "src/app/model/dto/trail-collection";
import { TRAIL_COLLECTION_TABLE_NAME } from "./database.service";
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
      filter(myTrails => !!myTrails),
      first()
    );
  }

  public create(collection: TrailCollection): Observable<TrailCollection | null> {
    return this._store.create(collection);
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

  public async collectionPopup(collection?: TrailCollection) {
    const module = await import('../../components/collection-form-popup/collection-form-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.CollectionFormPopupComponent,
      componentProps: { collection },
      backdropDismiss: false,
      cssClass: 'small-modal',
    });
    modal.present();
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
