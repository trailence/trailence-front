import { Injectable, Injector, NgZone } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { DatabaseService, TRAIL_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { Observable, combineLatest, debounceTime, filter, first, from, map, of, switchMap, timeout, toArray, zip } from 'rxjs';
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

  public getTrailsMenu(trails: Trail[], fromTrail: boolean = false): MenuItem[] {
    if (trails.length === 0) return [];
    const menu: MenuItem[] = [];
    const email = this.injector.get(AuthService).email!;
    if (trails.every(t => t.owner === email)) {
      menu.push(new MenuItem().setIcon('download').setI18nLabel('pages.trail.actions.download_map').setAction(() => this.openDownloadMap(trails)));

      const collectionUuid = this.getUniqueCollectionUuid(trails);
      if (collectionUuid) {
        menu.push(new MenuItem());
        menu.push(new MenuItem().setIcon('tags').setI18nLabel('pages.trails.tags.menu_item').setAction(() => this.openTags(trails, collectionUuid)));
      }
      menu.push(new MenuItem());
      menu.push(new MenuItem().setIcon('export').setI18nLabel('pages.trails.actions.export').setAction(() => this.export(trails)));
      if (collectionUuid) {
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

  public export(trails: Trail[]): void {
    const data: BinaryContent[] = [];
    from(trails).pipe(
      switchMap(trail => {
        const tracks: Observable<Track | null>[] = [];
        tracks.push(this.injector.get(TrackService).getFullTrack$(trail.originalTrackUuid, trail.owner));
        if (trail.currentTrackUuid !== trail.originalTrackUuid)
          tracks.push(this.injector.get(TrackService).getFullTrack$(trail.currentTrackUuid, trail.owner));
        return combineLatest(tracks.map(track$ => track$.pipe(firstTimeout(track => !!track, 5000, () => null as (Track | null))))).pipe(
          map(tracks => ({trail, tracks: tracks.filter(track => !!track) as Track[]})),
        );
      }),
      filter(t => t.tracks.length > 0),
      map(t => ({data: GpxFormat.exportGpx(t.trail, t.tracks), filename: StringUtils.toFilename(t.trail.name)})),
      toArray(),
    ).subscribe(files => {
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
