import { Injectable, Injector, NgZone } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { DatabaseService, TRAIL_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { Observable, combineLatest, debounceTime, filter, first, forkJoin, from, map, of, switchMap, timeout, toArray, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/network.service';
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
import { Progress, ProgressService } from '../progress/progress.service';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { Router } from '@angular/router';
import { Track } from 'src/app/model/track';
import { FileService } from '../file/file.service';
import { BinaryContent } from 'src/app/utils/binary-content';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { StringUtils } from 'src/app/utils/string-utils';
import { downloadZip } from 'client-zip';
import { TrackEditionService } from '../track-edition/track-edition.service';
import { Arrays } from 'src/app/utils/arrays';
import { PreferencesService } from '../preferences/preferences.service';

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

  public deleteAllTrailsFromCollection(collectionUuid: string, owner: string, progress: Progress, progressWork: number): Observable<any> {
    return this._store.getAll$().pipe(
      switchMap(trails$ => zip(trails$.map(trail$ => trail$.pipe(firstTimeout(t => !!t, 1000, () => null as Trail | null))))),
      switchMap(trail => {
        const toRemove = trail.filter(trail => !!trail && trail.collectionUuid === collectionUuid && trail.owner === owner);
        if (toRemove.length === 0) {
          progress.addWorkDone(progressWork)
          return of(true);
        }
        return new Observable(observer => {
          let done = 0;
          let workDone = 0;
          const ondone = () => {
            setTimeout(() => {
              done++;
              const newWorkDone = done * progressWork / toRemove.length;
              progress.addWorkDone(newWorkDone - workDone);
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

  public getTrailsMenu(trails: Trail[], fromTrail: boolean = false, fromCollection: string | undefined = undefined): MenuItem[] {
    if (trails.length === 0) return [];
    const menu: MenuItem[] = [];
    const email = this.injector.get(AuthService).email!;
    menu.push(new MenuItem().setIcon('download').setI18nLabel('pages.trail.actions.download_map').setAction(() => this.openDownloadMap(trails)));
    if (trails.every(t => t.owner === email)) {
      const collectionUuid = this.getUniqueCollectionUuid(trails);
      if (collectionUuid) {
        menu.push(new MenuItem());
        if (trails.length === 1) {
          menu.push(new MenuItem().setIcon('edit').setI18nLabel('pages.trails.actions.rename').setAction(() => this.openRenameTrail(trails[0])));
          menu.push(new MenuItem().setIcon('location').setI18nLabel('pages.trails.actions.edit_location').setAction(() => this.openLocationPopup(trails[0])));
        }
        menu.push(new MenuItem().setIcon('tags').setI18nLabel('pages.trails.tags.menu_item').setAction(() => this.openTags(trails, collectionUuid)));
      }
    }
    menu.push(new MenuItem());
    menu.push(new MenuItem().setIcon('export').setI18nLabel('pages.trails.actions.export').setAction(() => this.exportGpx(trails)));
    menu.push(new MenuItem());
    menu.push(
      new MenuItem().setIcon('collection-copy').setI18nLabel('pages.trails.actions.copy_to_collection')
      .setChildrenProvider(() => this.getCollectionsMenuItems(this.getAllCollectionsUuids(trails, email), (col) => {
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
    if (fromCollection !== undefined) {
      if (trails.every(t => t.owner === email)) {
        const collectionUuid = this.getUniqueCollectionUuid(trails);
        if (fromCollection === collectionUuid) {
          menu.push(
            new MenuItem().setIcon('collection-move').setI18nLabel('pages.trails.actions.move_to_collection')
            .setChildrenProvider(() => this.getCollectionsMenuItems([collectionUuid], (col) => {
              for (const trail of trails) {
                trail.collectionUuid = col.uuid;
                this.update(trail);
              }
            }))
          );
          menu.push(new MenuItem());
          menu.push(new MenuItem().setIcon('share').setI18nLabel('tools.share').setAction(() => this.openSharePopup(collectionUuid, trails)))
        }
        menu.push(new MenuItem());
        menu.push(new MenuItem().setIcon('trash').setI18nLabel('buttons.delete').setColor('danger').setAction(() => this.confirmDelete(trails, fromTrail)));
      }
    }
    return menu;
  }

  private getCollectionsMenuItems(excludeUuids: string[], action: (col: TrailCollection) => void): Observable<MenuItem[]> {
    return this.injector.get(TrailCollectionService).getAll$().pipe(
      switchMap(cols => cols.length === 0 ? of([]) : combineLatest(cols)),
      map(cols => (cols.filter(col => !!col && excludeUuids.indexOf(col.uuid) < 0) as TrailCollection[]).map(
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

  private getAllCollectionsUuids(trails: Trail[], owner: string): string[] {
    const result: string[] = [];
    for (const trail of trails) {
      if (trail.owner === owner && result.indexOf(trail.collectionUuid) < 0)
        result.push(trail.collectionUuid)
    }
    return result;
  }

  public async openRenameTrail(trail: Trail) {
    const i18n = this.injector.get(I18nService);
    const alert = await this.injector.get(AlertController).create({
      header: i18n.texts.pages.trails.actions.rename_popup.title,
      inputs: [{
        placeholder: i18n.texts.pages.trails.actions.rename_popup.name,
        value: trail.name,
        attributes: {
          maxlength: 200,
          counter: true,
        }
      }],
      buttons: [{
        text: i18n.texts.buttons.apply,
        role: 'ok',
        handler: (result) => {
          alert.dismiss();
          if (trail.name !== result[0].trim()) {
            trail.name = result[0].trim();
            this.update(trail);
          }
        }
      }, {
        text: i18n.texts.buttons.cancel,
        role: 'cancel'
      }]
    });
    await alert.present();
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
            progress.subTitle = '0/' + trails.length;
            let index = 0;
            const deleteNext = () => {
              this.delete(trails[index], () => {
                progress.subTitle = '' + (index + 1) + '/' + trails.length;
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

  public openDownloadMap(trails: Trail[], bounds?: L.LatLngBounds) {
    const tracks$ = trails.length === 0 ? of([]) : combineLatest(trails.map(trail =>
      this.trackService.getFullTrack$(trail.currentTrackUuid, trail.owner).pipe(
        filter(track => !!track),
        timeout({
          first: 10000,
          with: () => of(null)
        }),
        first()
      )
    )).pipe(
      debounceTime(100),
      first(),
      map(tracks => tracks.filter(t => !!t) as Track[])
    );
    tracks$.subscribe(async (tracks) => {
      const module = await import('../../components/download-map-popup/download-map-popup.component');
      const modal = await this.injector.get(ModalController).create({
        component: module.DownloadMapPopupComponent,
        backdropDismiss: false,
        componentProps: {
          tracks,
          bounds,
        }
      });
      modal.present();
    });
  }

  public async openLocationPopup(trail: Trail) {
    const module = await import('../../components/location-popup/location-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.LocationPopupComponent,
      backdropDismiss: true,
      componentProps: {
        trail,
      }
    });
    modal.present();
  }

  public importGpxDialog(collectionUuid: string): void {
    const i18n = this.injector.get(I18nService);
    const email = this.injector.get(AuthService).email!;
    this.injector.get(FileService).openFileDialog({
      extension: '.gpx',
      mimeType: 'application/gpx+xml',
      multiple: true,
      description: i18n.texts.tools.import_gpx_description,
      onstartreading: (nbFiles: number) => {
        const progress = this.injector.get(ProgressService).create(i18n.texts.tools.importing, nbFiles);
        progress.subTitle = '0/' + nbFiles;
        return Promise.resolve(progress);
      },
      onfileread: (index: number, nbFiles: number, progress: Progress, file: ArrayBuffer) => {
        const imported = this.importGpx(file, email, collectionUuid);
        if (!imported) {
          // TODO show message
        }
        progress.subTitle = '' + (index + 1) + '/' + nbFiles;
        progress.addWorkDone(1);
        return Promise.resolve(imported);
      },
      onfilesloaded: (progress: Progress, imported: ({trailUuid: string, tags: string[][]} | undefined)[]) => {
        progress.done();
        const allTags: string[][] = [];
        for (const trail of imported) {
          if (trail && trail.tags.length > 0) {
            for (const tag of trail.tags) {
              const exists = allTags.find(t => Arrays.sameContent(t, tag));
              if (!exists) allTags.push(tag);
            }
          }
        }
        if (allTags.length > 0)
          import('../../components/import-tags-popup/import-tags-popup.component')
          .then(module => this.injector.get(ModalController).create({
            component: module.ImportTagsPopupComponent,
            backdropDismiss: false,
            componentProps: {
              collectionUuid,
              tags: allTags,
              toImport: imported.filter(i => !!i) as {trailUuid: string, tags: string[][]}[],
            }
          }))
          .then(modal => modal.present());
      },
      onerror: (error, progress) => {
        console.log(error);
        progress?.done();
      }
    });
  }

  public importGpx(file: ArrayBuffer, owner: string, collectionUuid: string): {trailUuid: string, tags: string[][]} | undefined {
    const imported = GpxFormat.importGpx(file, owner, collectionUuid, this.injector.get(PreferencesService));
    if (!imported) return undefined;
    if (imported.tracks.length === 1) {
      const improved = this.injector.get(TrackEditionService).applyDefaultImprovments(imported.tracks[0]);
      imported.trail.currentTrackUuid = improved.uuid;
      imported.tracks.push(improved);
    }
    this.trackService.create(imported.tracks[0]);
    this.trackService.create(imported.tracks[imported.tracks.length - 1]);
    this.create(imported.trail);
    return {trailUuid: imported.trail.uuid, tags: imported.tags};
  }

  public exportGpx(trails: Trail[]): void {
    const data: BinaryContent[] = [];
    const email = this.injector.get(AuthService).email!;
    forkJoin(trails.map(
      trail => {
        const tracks: Observable<Track | null>[] = [];
        tracks.push(this.injector.get(TrackService).getFullTrack$(trail.originalTrackUuid, trail.owner));
        if (trail.currentTrackUuid !== trail.originalTrackUuid)
          tracks.push(this.injector.get(TrackService).getFullTrack$(trail.currentTrackUuid, trail.owner));
        return forkJoin(tracks.map(track$ => track$.pipe(firstTimeout(track => !!track, 15000, () => null as (Track | null))))).pipe(
          map(tracks => ({trail, tracks: tracks.filter(track => !!track) as Track[]})),
          switchMap(t => {
            const tags$ = (t.tracks.length === 0 || t.trail.owner !== email) ? of([]) : this.injector.get(TagService).getTrailTagsNames$(t.trail.uuid, true);
            return tags$.pipe(
              map(tags => ({trail: t.trail, tracks: t.tracks, tags: tags}))
            );
          }),
        );
      }
    )).subscribe(result => {
      const files = result.filter(r => r.tracks.length > 0).map(t => ({data: GpxFormat.exportGpx(t.trail, t.tracks, t.tags), filename: StringUtils.toFilename(t.trail.name)}));
      if (files.length === 0) return;
      if (files.length === 1) {
        this.injector.get(FileService).saveBinaryData(files[0].filename + '.gpx', files[0].data);
      } else {
        const existingFilenames: string[] = [];
        for (const file of files) {
          if (existingFilenames.indexOf(file.filename) >= 0) {
            let i = 2;
            while (existingFilenames.indexOf(file.filename + '_' + i) >= 0) i++;
            file.filename = file.filename + '_' + i;
          }
          existingFilenames.push(file.filename);
        }
       combineLatest(files.map(file => from(file.data.toArrayBufferOrBlob()))).subscribe(
        inputs => {
          downloadZip(files.map((file, index) => ({
            name: file.filename + '.gpx',
            input: inputs[index],
          })), {
            buffersAreUTF8: true,
          }).blob().then(blob => {
            this.injector.get(FileService).saveBinaryData('trailence-export.zip', new BinaryContent(blob, 'application/x-zip'));
          });
        }
       )
      }
    });
  }

  async openSharePopup(collectionUuid: string, trails: Trail[]) {
    const module = await import('../../components/share-popup/share-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.SharePopupComponent,
      componentProps: {
        collectionUuid,
        trails
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

}
