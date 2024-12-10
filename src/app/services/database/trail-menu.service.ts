import { Injectable, Injector } from '@angular/core';
import { MenuItem } from 'src/app/utils/menu-item';
import { AuthService } from '../auth/auth.service';
import { AlertController, ModalController, Platform } from '@ionic/angular/standalone';
import { I18nService } from '../i18n/i18n.service';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { Router } from '@angular/router';
import { Track } from 'src/app/model/track';
import { FileService } from '../file/file.service';
import { BinaryContent } from 'src/app/utils/binary-content';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';
import { StringUtils } from 'src/app/utils/string-utils';
import { TrackEditionService } from '../track-edition/track-edition.service';
import { Arrays } from 'src/app/utils/arrays';
import { PreferencesService } from '../preferences/preferences.service';
import { Trail } from 'src/app/model/trail';
import { Progress, ProgressService } from '../progress/progress.service';
import { TrackService } from './track.service';
import { catchError, combineLatest, debounceTime, defaultIfEmpty, EMPTY, filter, first, firstValueFrom, forkJoin, from, map, Observable, of, switchMap, timeout, zip } from 'rxjs';
import { TrailService } from './trail.service';
import { TrailCollectionService } from './trail-collection.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { TagService } from './tag.service';
import { I18nError } from '../i18n/i18n-string';
import { ErrorService } from '../progress/error.service';
import { PhotoService } from './photo.service';
import { Photo } from 'src/app/model/photo';
import { copyPoint } from 'src/app/model/point';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';

@Injectable({providedIn: 'root'})
export class TrailMenuService {

  constructor(
    private readonly injector: Injector
  ) {}

  public trailToCompare: Trail | undefined;

  public getTrailsMenu(trails: Trail[], fromTrail: boolean = false, fromCollection: string | undefined = undefined, onlyGlobal: boolean = false): MenuItem[] { // NOSONAR
    const menu: MenuItem[] = [];
    const email = this.injector.get(AuthService).email!;

    if (!onlyGlobal && trails.length > 0) {
      menu.push(new MenuItem().setIcon('download').setI18nLabel('pages.trail.actions.download_map').setAction(() => this.openDownloadMap(trails)));
      if (trails.length === 1)
        menu.push(new MenuItem().setIcon('car').setI18nLabel('pages.trail.actions.go_to_departure').setAction(() => this.goToDeparture(trails[0])));

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

      if (trails.length === 2) {
        menu.push(new MenuItem());
        menu.push(new MenuItem().setIcon('compare').setI18nLabel('pages.trail.actions.compare')
          .setAction(() => {
            this.trailToCompare = undefined;
            const router = this.injector.get(Router);
            router.navigateByUrl('/trail/' + encodeURIComponent(trails[0].owner) + '/' + trails[0].uuid + '/' + encodeURIComponent(trails[1].owner) + '/' + trails[1].uuid + '?from=' + encodeURIComponent(router.url));
          })
        );
      }

      if (trails.length === 1) {
        menu.push(new MenuItem());
        if (this.trailToCompare) {
          menu.push(new MenuItem().setIcon('compare').setI18nLabel('pages.trail.actions.compare_with_this_one').setAction(() => {
            const trail1 = this.trailToCompare!;
            this.trailToCompare = undefined;
            const router = this.injector.get(Router);
            router.navigateByUrl('/trail/' + encodeURIComponent(trail1.owner) + '/' + trail1.uuid + '/' + encodeURIComponent(trails[0].owner) + '/' + trails[0].uuid + '?from=' + encodeURIComponent(router.url));
          }));
        } else {
          menu.push(new MenuItem().setIcon('compare').setI18nLabel('pages.trail.actions.compare_with').setAction(() => {
            this.trailToCompare = trails[0];
          }));
        }
      }
      if (trails.length > 1 && fromCollection) {
        menu.push(new MenuItem());
        menu.push(new MenuItem().setIcon('merge').setI18nLabel('pages.trail.actions.merge_trails').setAction(() => this.mergeTrails(trails, fromCollection)))
      }
    }
    if (onlyGlobal && fromCollection) {
      menu.push(new MenuItem().setIcon('tags').setI18nLabel('pages.trails.tags.menu_item').setAction(() => this.openTags(null, fromCollection)));
    }

    if (trails.length > 0) {
      if (menu.length > 0)
        menu.push(new MenuItem());
      menu.push(new MenuItem().setIcon('export').setI18nLabel('pages.trails.actions.export').setAction(() => this.exportGpx(trails)));

      menu.push(new MenuItem());
      menu.push(
        new MenuItem().setIcon('collection-copy').setI18nLabel('pages.trails.actions.copy_to_collection')
        .setChildrenProvider(() => this.getCollectionsMenuItems(this.getAllCollectionsUuids(trails, email), (col) => this.copyTrailsTo(trails, col, email, fromTrail)))
      );
    }

    if (fromCollection !== undefined && !onlyGlobal && trails.length > 0) {
      if (trails.every(t => t.owner === email)) {
        const collectionUuid = this.getUniqueCollectionUuid(trails);
        if (fromCollection === collectionUuid) {
          menu.push(
            new MenuItem().setIcon('collection-move').setI18nLabel('pages.trails.actions.move_to_collection')
            .setChildrenProvider(() => this.getCollectionsMenuItems([collectionUuid], (col) => this.moveTrailsTo(trails, col, email)))
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
      )),
      map(items => {
        items.splice(0, 0, new MenuItem()
          .setI18nLabel('pages.trails.actions.new_collection')
          .setIcon('add')
          .setAction(() => {
            this.injector.get(TrailCollectionService).collectionPopup(undefined, false)
            .then(result => {
              if (result.role !== 'apply' || !result.data) return;
              action(result.data as TrailCollection);
            });
          })
        );
        return items;
      })
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
            this.injector.get(TrailService).doUpdate(trail, t => t.name = result[0].trim());
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
              this.injector.get(TrailService).delete(trails[index], () => {
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

  public async openTags(trails: Trail[] | null, collectionUuid: string) {
    const module = await import('../../components/tags/tags.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.TagsComponent,
      backdropDismiss: false,
      componentProps: {
        trails,
        collectionUuid,
        selectable: !!trails,
      }
    });
    modal.present();
  }

  public openDownloadMap(trails: Trail[], bounds?: L.LatLngBounds) {
    const tracks$ = trails.length === 0 ? of([]) : combineLatest(trails.map(trail =>
      this.injector.get(TrackService).getFullTrackReady$(trail.currentTrackUuid, trail.owner).pipe(catchError(() => of(null)))
    )).pipe(
      debounceTime(100),
      first(),
      map(tracks => tracks.filter(t => !!t))
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
    let zipEntries = 0;
    let zipErrors: any[] = [];
    this.injector.get(FileService).openFileDialog({
      types: [
        {
          mime: 'application/gpx+xml',
          extensions: ['gpx']
        },
        {
          mime: 'application/zip',
          extensions: ['zip']
        }
      ],
      multiple: true,
      description: i18n.texts.tools.import_gpx_description,
      onstartreading: (nbFiles: number) => {
        const progress = this.injector.get(ProgressService).create(i18n.texts.tools.importing, nbFiles);
        progress.subTitle = '0/' + nbFiles;
        return Promise.resolve(progress);
      },
      onfileread: (index: number, nbFiles: number, progress: Progress, filename: string, file: ArrayBuffer) => {
        if (file.byteLength > 2) {
          const first2bytes = new Uint8Array(file.slice(0, 2));
          if (String.fromCharCode(first2bytes[0]) === 'P' &&
              String.fromCharCode(first2bytes[1]) === 'K') {
            // zip file
            return import('jszip').then(JSZip => JSZip.default.loadAsync(file)).then(zip => {
              const gpxFiles = zip.filter((path, entry) => !entry.dir && entry.name.toLowerCase().endsWith('.gpx'));
              if (gpxFiles.length === 0) {
                progress.subTitle = '' + (index + 1 + zipEntries) + '/' + (nbFiles + zipEntries);
                progress.addWorkDone(1);
                return Promise.resolve([]);
              }
              return new Promise<({trailUuid: string, tags: string[][]})[]>((resolve, reject) => {
                const previousZipEntries = zipEntries;
                zipEntries += gpxFiles.length;
                progress.addWorkToDo(gpxFiles.length);
                progress.subTitle = '' + (index + 1 + previousZipEntries) + '/' + (nbFiles + zipEntries);
                progress.addWorkDone(1);
                const done: ({trailUuid: string, tags: string[][], source?: string})[] = [];
                const readNextZipEntry = (entryIndex: number) => { // NOSONAR
                  const gpxFile = gpxFiles[entryIndex];
                  return gpxFile.async('arraybuffer')
                  .then(arraybuffer => this.importGpx(arraybuffer, email, collectionUuid, zip))
                  .then(result => {
                    done.push(result);
                    progress.subTitle = '' + (index + 1 + previousZipEntries + entryIndex + 1) + '/' + (nbFiles + zipEntries);
                    progress.addWorkDone(1);
                    if (entryIndex === gpxFiles.length - 1) {
                      resolve(done);
                    } else {
                      readNextZipEntry(entryIndex + 1);
                    }
                  })
                  .catch((e) => {
                    zipErrors.push(new I18nError('errors.import.file_not_imported', [filename + '/' + gpxFile.name, e]));
                    progress.subTitle = '' + (index + 1 + previousZipEntries + entryIndex + 1) + '/' + (nbFiles + zipEntries);
                    progress.addWorkDone(1);
                    if (entryIndex === gpxFiles.length - 1) {
                      resolve(done);
                    } else {
                      readNextZipEntry(entryIndex + 1);
                    }
                  });
                };
                readNextZipEntry(0);
              });
            });
          }
        }
        return this.importGpx(file, email, collectionUuid)
        .then(result => {
          progress.subTitle = '' + (index + 1 + zipEntries) + '/' + (nbFiles + zipEntries);
          progress.addWorkDone(1);
          return [result];
        }).catch((e) => {
          progress.subTitle = '' + (index + 1 + zipEntries) + '/' + (nbFiles + zipEntries);
          progress.addWorkDone(1);
          return Promise.reject(new I18nError('errors.import.file_not_imported', [filename, e]));
        })
      },
      ondone: (progress: Progress | undefined, imported: ({trailUuid: string, tags: string[][], source?: string})[][], errors: any[]) => {
        progress?.done();
        if (errors.length > 0)
          this.injector.get(ErrorService).addErrors(errors);
        if (zipErrors.length > 0)
          this.injector.get(ErrorService).addErrors(zipErrors);
        const importedTrails = Arrays.flatMap(imported, a => a);
        this.finishImport(importedTrails, collectionUuid);
      }
    });
  }

  public importGpx(file: ArrayBuffer, owner: string, collectionUuid: string, zip?: any): Promise<{trailUuid: string, tags: string[][], source?: string}> {
    try {
      const imported = GpxFormat.importGpx(file, owner, collectionUuid, this.injector.get(PreferencesService));
      if (imported.tracks.length === 1) {
        const improved = this.injector.get(TrackEditionService).applyDefaultImprovments(imported.tracks[0]);
        imported.trail.currentTrackUuid = improved.uuid;
        imported.tracks.push(improved);
      }
      let result$: Promise<any> = Promise.resolve(true);
      result$ = result$.then(() => new Promise(resolve => {
        const done = new CompositeOnDone(() => resolve(true));
        this.injector.get(TrackEditionService).computeFinalMetadata(imported.trail, imported.tracks[imported.tracks.length - 1]);
        this.injector.get(TrackService).create(imported.tracks[0], done.add());
        this.injector.get(TrackService).create(imported.tracks[imported.tracks.length - 1], done.add());
        this.injector.get(TrailService).create(imported.trail, done.add());
        done.start();
      }));
      const result = {trailUuid: imported.trail.uuid, tags: imported.tags, source: imported.source};
      // photos
      if (imported.photos.length > 0 && zip) {
        const photoService = this.injector.get(PhotoService);
        for (const photoDto of imported.photos) {
          const filename = imported.photosFilenames.get(photoDto);
          if (filename) {
            const zipEntry = zip.file(filename);
            if (zipEntry) {
              result$ = result$
              .then(() => zipEntry.async('arraybuffer'))
              .then(photoFile => firstValueFrom(
                photoService.addPhoto(
                  imported.trail.owner,
                  imported.trail.uuid,
                  photoDto.description ?? '',
                  photoDto.index ?? 1,
                  photoFile,
                  photoDto.dateTaken,
                  photoDto.latitude,
                  photoDto.longitude,
                  photoDto.isCover,
                )
              ));
            }
          }
        }
      }
      return result$.then(() => result);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  public finishImport(imported: {trailUuid: string, tags: string[][], source?: string}[], collectionUuid: string): Promise<any> {
    if (imported.length === 0) return Promise.resolve(true);
    return this.importTags(imported, collectionUuid)
    .then(() => this.importFromSources(imported));
  }

  public importTags(imported: ({trailUuid: string, tags: string[][]} | undefined)[], collectionUuid: string): Promise<any> {
    const allTags: string[][] = [];
    for (const trail of imported) {
      if (trail && trail.tags.length > 0) {
        for (const tag of trail.tags) {
          const exists = allTags.find(t => Arrays.sameContent(t, tag));
          if (!exists) allTags.push(tag);
        }
      }
    }
    if (allTags.length === 0) return Promise.resolve(true);
    return import('../../components/import-tags-popup/import-tags-popup.component')
    .then(module => this.injector.get(ModalController).create({
      component: module.ImportTagsPopupComponent,
      backdropDismiss: false,
      componentProps: {
        collectionUuid,
        tags: allTags,
        toImport: imported.filter(i => !!i) as {trailUuid: string, tags: string[][]}[],
      }
    }))
    .then(modal => {
      modal.present();
      return modal.onDidDismiss();
    });
  }

  public importFromSources(imported: {trailUuid: string, tags: string[][], source?: string}[]): Promise<any> {
    let toImport = imported.filter(t => !!t.source);
    if (toImport.length === 0) return Promise.resolve(true);
    const fetchService = this.injector.get(FetchSourceService);
    toImport = toImport.filter(t => fetchService.canFetchTrailInfo(t.source!));
    if (toImport.length === 0) return Promise.resolve(true);
    return import('../../components/fetch-source-popup/fetch-source-popup.component')
    .then(module => this.injector.get(ModalController).create({
      component: module.FetchSourcePopupComponent,
      backdropDismiss: false,
      componentProps: {
        trails: toImport.map(t => ({trailUuid: t.trailUuid, source: t.source!})),
      }
    }))
    .then(modal => {
      modal.present();
      return modal.onDidDismiss();
    });
  }

  public async exportGpx(trails: Trail[]) {
    if (trails.length === 0) return;
    const photoService = this.injector.get(PhotoService);
    const trailsPhotos$ = trails.map(trail => photoService.getPhotosForTrailReady(trail.owner, trail.uuid).pipe(map(photos => ({trail, photos}))));
    const trailsPhotos = await firstValueFrom(zip(trailsPhotos$).pipe(map(tp => tp.filter(e => e.photos.length > 0))));

    const module = await import('../../components/export-popup/export-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.ExportPopupComponent,
      componentProps: {
        trails: trails,
        trailsPhotos,
      }
    });
    await modal.present();
    const modalResult = await modal.onWillDismiss();
    if (!modalResult.data?.what) return;
    const photosToExport = modalResult.data.includePhotos ? Arrays.flatMap(trailsPhotos, e => e.photos) : [];

    const existingJpgFilenames: string[] = [];
    const photoFilenameMap = new Map<Photo, string>();
    for (const photo of photosToExport) {
      let filename = photo.uuid;
      if (existingJpgFilenames.indexOf(filename.toLowerCase()) >= 0) {
        let i = 2;
        while (existingJpgFilenames.indexOf(filename.toLowerCase() + '_' + i) >= 0) i++;
        filename = filename + '_' + i;
      }
      existingJpgFilenames.push(filename.toLowerCase());
      photoFilenameMap.set(photo, filename + '.jpg');
    }

    const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.pages.trails.actions.export, trails.length * 2 + photosToExport.length * 10 + 1);
    const email = this.injector.get(AuthService).email!;
    const trailToData$ = (trail: Trail) => {
      const tracks: Observable<Track | null>[] = [];
      if (modalResult.data.what === 'original' || modalResult.data.what === 'both')
        tracks.push(this.injector.get(TrackService).getFullTrack$(trail.originalTrackUuid, trail.owner));
      if (modalResult.data.what === 'current' || (modalResult.data.what === 'both' && trail.currentTrackUuid !== trail.originalTrackUuid))
        tracks.push(this.injector.get(TrackService).getFullTrack$(trail.currentTrackUuid, trail.owner));
      return forkJoin(tracks.map(track$ => track$.pipe(firstTimeout(track => !!track, 15000, () => null as (Track | null))))).pipe(
        map(tracks => ({trail, tracks: tracks.filter(track => !!track)})),
        switchMap(t => {
          if (t.tracks.length === 0) return of(null);
          const tags$ = t.trail.owner !== email ? of([]) : this.injector.get(TagService).getTrailTagsNames$(t.trail.uuid, true);
          return tags$.pipe(
            map(tags => ({
              name: t.trail.name,
              gpx: GpxFormat.exportGpx(
                t.trail,
                t.tracks,
                tags,
                photosToExport.filter(p => p.owner === trail.owner && p.trailUuid === trail.uuid), // NOSONAR
                photoFilenameMap,
              )
            }))
          );
        }),
      );
    };
    const fileService = this.injector.get(FileService);
    if (trails.length === 1 && photosToExport.length === 0) {
      trailToData$(trails[0]).subscribe(data => {
        if (!data) {
          progress.done();
          return;
        }
        progress.addWorkDone(1);
        fileService.saveBinaryData(StringUtils.toFilename(data.name) + '.gpx', data.gpx).then(() => progress.done());
      });
      return;
    }
    const i18n = this.injector.get(I18nService);
    progress.subTitle = i18n.texts.export.trail + ' 1/' + trails.length;
    const existingGpxFilenames: string[] = [];
    let photoIndex = 0;
    const processNextPhoto = (resolve: (result: { filename: string; data: BinaryContent; } | null) => void) => {
      progress.workDone = trails.length * 2 + photoIndex * 10;
      if (photoIndex === photosToExport.length) {
        progress.subTitle = '';
        resolve(null);
        return;
      }
      progress.subTitle = i18n.texts.export.photo + ' ' + (photoIndex + 1) + '/' + photosToExport.length;
      const photo = photosToExport[photoIndex++];
      photoService.getFile$(photo.owner, photo.uuid)
      .pipe(
        catchError(e => EMPTY),
        defaultIfEmpty(null)
      )
      .subscribe(blob => {
        if (!blob) {
          processNextPhoto(resolve);
          return;
        }
        resolve({filename: photoFilenameMap.get(photo)!, data: new BinaryContent(blob)});
      });
    };
    let trailIndex = 0;
    const processNextTrail = (resolve: (result: { filename: string; data: BinaryContent; } | null) => void) => {
      progress.subTitle = i18n.texts.export.trail + ' ' + (trailIndex + 1) + '/' + trails.length;
      progress.workDone = trailIndex * 2;
      if (trailIndex === trails.length) {
        processNextPhoto(resolve);
        return;
      }
      trailToData$(trails[trailIndex++]).subscribe(data => {
        if (!data) {
          processNextTrail(resolve);
          return;
        }
        let filename = StringUtils.toFilename(data.name);
        if (existingGpxFilenames.indexOf(filename.toLowerCase()) >= 0) {
          let i = 2;
          while (existingGpxFilenames.indexOf(filename.toLowerCase() + '_' + i) >= 0) i++;
          filename = filename + '_' + i;
        }
        existingGpxFilenames.push(filename.toLowerCase());
        resolve({filename: filename + '.gpx', data: data.gpx});
      });
    };
    const zipName = trails.length === 1 ? StringUtils.toFilename(trails[0].name) : 'trailence-export';
    fileService.saveZip(zipName + '.zip', () => {
      return new Promise<{ filename: string; data: BinaryContent; } | null>((resolve) => {
        processNextTrail(resolve);
      });
    }).then(() => progress.done());
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

  goToDeparture(trail: Trail): void {
    this.injector.get(TrackService).getSimplifiedTrack$(trail.currentTrackUuid, trail.owner).pipe(
      filter(track => !!track),
      timeout({
        first: 10000,
        with: () => of(null)
      }),
      first()
    ).subscribe(track => {
      if (track?.points && track.points.length > 0) {
        const departure = track.points[0];
        if (this.injector.get(Platform).is('capacitor')) {
          const link = document.createElement('A') as HTMLAnchorElement;
          link.style.position = 'fixed';
          link.style.top = '-10000px';
          link.style.left = '-10000px';
          link.href = 'geo:0,0?q=' + departure.lat + ',' + departure.lng;
          link.target = '_blank';
          document.documentElement.appendChild(link);
          link.click();
          document.documentElement.removeChild(link);
        } else {
          const link = document.createElement('A') as HTMLAnchorElement;
          link.style.position = 'fixed';
          link.style.top = '-10000px';
          link.style.left = '-10000px';
          link.target = '_blank';
          link.href = 'https://www.google.com/maps/dir/?api=1&dir_action=navigate&destination=' + departure.lat + ',' + departure.lng;
          document.documentElement.appendChild(link);
          link.click();
          document.documentElement.removeChild(link);
        }
      }
    });
  }

  mergeTrails(trails: Trail[], collectionUuid: string): void {
    const trackService = this.injector.get(TrackService);
    combineLatest(trails.map(
      trail => combineLatest([
        trackService.getFullTrackReady$(trail.originalTrackUuid, trail.owner).pipe(first()),
        trackService.getFullTrackReady$(trail.currentTrackUuid, trail.owner).pipe(first())
      ]).pipe(
        map(([track1, track2]) => ({trail, track1, track2}))
      )
    )).subscribe(trailsAndTracks => {
      trailsAndTracks.sort((t1, t2) => (t1.track1.metadata.startDate ?? 0) - (t2.track1.metadata.startDate ?? 0))
      const owner = this.injector.get(AuthService).email!;
      const preferences = this.injector.get(PreferencesService);
      const originalTrack = new Track({owner}, preferences);
      const editedTrack = new Track({owner}, preferences);
      const merge = new Trail({
        owner,
        collectionUuid,
        name: this.injector.get(I18nService).texts.pages.trail.actions.merged_trail_name,
        originalTrackUuid: originalTrack.uuid,
        currentTrackUuid: editedTrack.uuid
      });
      for (const trail of trailsAndTracks) {
        this.mergeTrack(trail.track1, originalTrack);
        this.mergeTrack(trail.track2, editedTrack);
      }
      trackService.create(editedTrack);
      trackService.create(originalTrack);
      this.injector.get(TrailService).create(merge);
      const router = this.injector.get(Router);
      router.navigateByUrl('/trail/' + encodeURIComponent(owner) + '/' + merge.uuid + '?from=' + encodeURIComponent(router.url));
    });
  }

  private mergeTrack(source: Track, target: Track) {
    for (const segment of source.segments) {
      const st = target.newSegment();
      st.appendMany(segment.points.map(pt => copyPoint(pt)));
    }
    for (const wp of source.wayPoints) {
      target.appendWayPoint(wp.copy());
    }
  }

  public copyTrailsTo(trails: Trail[], toCollection: TrailCollection, email: string, fromTrail: boolean): void {
    const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.pages.trails.actions.copying, 1);
    const trackService = this.injector.get(TrackService);
    const tagService = this.injector.get(TagService);
    const photoService = this.injector.get(PhotoService);
    const trailsCopy$: Observable<{originalTrail: Trail, newTrail: Trail}>[] = [];
    const originalTags$: Observable<{originalTrail: Trail, tags: string[][]}>[] = [];
    const originalPhotos$: Observable<{originalTrail: Trail, photos: Photo[]}>[] = [];
    for (const trail of trails) {
      progress.addWorkToDo(1);
      const originalTrack$ = trackService.getFullTrackReady$(trail.originalTrackUuid, trail.owner);
      progress.addWorkToDo(1);
      let currentTrack$;
      if (trail.originalTrackUuid === trail.currentTrackUuid) {
        currentTrack$ = of(null);
      } else {
        currentTrack$ = trackService.getFullTrackReady$(trail.currentTrackUuid, trail.owner);
        progress.addWorkToDo(1);
      }
      trailsCopy$.push(zip([originalTrack$, currentTrack$]).pipe(
        switchMap(
          tracks => {
            const originalTrack = tracks[0].copy(email);
            const currentTrack = tracks[1] ? undefined : tracks[1]!.copy(email);
            const copy = new Trail({
              ...trail.toDto(),
              uuid: undefined,
              owner: email,
              version: undefined,
              createdAt: undefined,
              updatedAt: undefined,
              collectionUuid: toCollection.uuid,
              originalTrackUuid: originalTrack.uuid,
              currentTrackUuid: currentTrack?.uuid ?? originalTrack.uuid
            });
            const createTrack1$ = new Observable(observer => {
              this.injector.get(TrackService).create(originalTrack, () => {
                progress.addWorkDone(1);
                observer.next(originalTrack);
                observer.complete();
              });
            })
            const createTrack2$ = currentTrack ? new Observable(observer => {
              this.injector.get(TrackService).create(currentTrack, () => {
                progress.addWorkDone(1);
                observer.next(currentTrack);
                observer.complete();
              });
            }) : of(null);
            const createTrail$ = new Observable<Trail>(observer => {
              this.injector.get(TrailService).create(copy, () => {
                progress.addWorkDone(1);
                observer.next(copy);
                observer.complete();
              });
            });
            return combineLatest([createTrack1$, createTrack2$]).pipe(
              switchMap(() => createTrail$.pipe(
                map(newTrail => ({originalTrail: trail, newTrail}))
              ))
            );
          }
        )
      ));
      if (trail.owner === email) {
        progress.addWorkToDo(1);
        originalTags$.push(tagService.getTrailTagsNames$(trail.uuid, true).pipe(map(tags => {
          progress.addWorkDone(1);
          return {originalTrail: trail, tags};
        })));
      }
      progress.addWorkToDo(1);
      originalPhotos$.push(photoService.getPhotosForTrailReady(trail.owner, trail.uuid).pipe(map(photos => {
        progress.addWorkDone(1);
        return {originalTrail: trail, photos};
      })));
    }

    combineLatest([
      zip(trailsCopy$),
      originalTags$.length > 0 ? zip(originalTags$) : of([]),
      originalPhotos$.length > 0 ? zip(originalPhotos$) : of([]),
    ]).pipe(first()).subscribe(
      ([trails, tags, photos]) => {
        tags = tags.filter(t => t.tags.length > 0);
        photos = photos.filter(t => t.photos.length > 0);
        this.handleImportTags(trails, tags, toCollection.uuid)
        .then(() => this.handleImportPhotos(trails, photos))
        .then(() => {
          if (fromTrail) this.injector.get(Router).navigateByUrl('/trail/' + email + '/' + trails[0].newTrail.uuid);
        });
        progress.done();
      }
    );
  }

  private handleImportTags(
    trails: {originalTrail: Trail, newTrail: Trail}[],
    tags: {originalTrail: Trail, tags: string[][]}[],
    collectionUuid: string
  ): Promise<any> {
    if (tags.length === 0) return Promise.resolve();
    const allTags: string[][] = [];
    for (const trail of tags) {
      for (const tag of trail.tags) {
        const exists = allTags.find(t => Arrays.sameContent(t, tag));
        if (!exists) allTags.push(tag);
      }
    }
    return import('../../components/import-tags-popup/import-tags-popup.component')
    .then(module => this.injector.get(ModalController).create({
      component: module.ImportTagsPopupComponent,
      backdropDismiss: false,
      componentProps: {
        collectionUuid,
        tags: allTags,
        toImport: tags.map(t => ({trailUuid: trails.find(trail => trail.originalTrail === t.originalTrail)!.newTrail.uuid, tags: t.tags})),
        type: 'copy'
      }
    }))
    .then(modal => {
      return modal.present()
      .then(() => modal.onDidDismiss());
    });
  }

  private handleImportPhotos(
    trails: {originalTrail: Trail, newTrail: Trail}[],
    photos: {originalTrail: Trail, photos: Photo[]}[],
  ): Promise<any> {
    if (photos.length === 0) return Promise.resolve();
    const i18n = this.injector.get(I18nService);
    return this.injector.get(AlertController).create({
      header: i18n.texts.pages.trails.actions.copy_photos_alert.title,
      message: i18n.texts.pages.trails.actions.copy_photos_alert[trails.length > 1 ? 'message_plural' : 'message_singular'],
      buttons: [
        {
          text: i18n.texts.buttons.yes,
          role: 'success',
          handler: () => {
            const allPhotos = Arrays.flatMap(photos, p => p.photos);
            const progress = this.injector.get(ProgressService).create(i18n.texts.pages.trails.actions.copying_photos, allPhotos.length);
            progress.subTitle = '0/' + allPhotos.length;
            let index = 0;
            const photoService = this.injector.get(PhotoService);
            const copyNext = () => {
              photoService.getFile$(allPhotos[index].owner, allPhotos[index].uuid).subscribe({
                next: blob => {
                  blob.arrayBuffer().then(buffer => { // NOSONAR
                    const originalPhoto = allPhotos[index];
                    const originalTrail = photos.find(p => p.photos.indexOf(originalPhoto) >= 0)!.originalTrail;
                    const trail = trails.find(t => t.originalTrail === originalTrail)!;
                    photoService.addPhoto(
                      trail.newTrail.owner,
                      trail.newTrail.uuid,
                      originalPhoto.description,
                      originalPhoto.index,
                      buffer,
                      originalPhoto.dateTaken,
                      originalPhoto.latitude,
                      originalPhoto.longitude,
                      originalPhoto.isCover
                    ).subscribe({
                      next: p => {
                        progress.subTitle = '' + (index + 1) + '/' + allPhotos.length;
                        progress.addWorkDone(1);
                        if (++index < allPhotos.length) setTimeout(copyNext, 0);
                      },
                      error: err => {
                        this.injector.get(ErrorService).addNetworkError(err, "pages.trails.actions.copy_photo_error", [allPhotos[index].description]);
                        progress.subTitle = '' + (index + 1) + '/' + allPhotos.length;
                        progress.addWorkDone(1);
                        if (++index < allPhotos.length) setTimeout(copyNext, 0);
                      }
                    });
                  });
                },
                error: err => {
                  this.injector.get(ErrorService).addNetworkError(err, "pages.trails.actions.copy_photo_error", [allPhotos[index].description]);
                  progress.subTitle = '' + (index + 1) + '/' + allPhotos.length;
                  progress.addWorkDone(1);
                  if (++index < allPhotos.length) setTimeout(copyNext, 0);
                }
              });
            };
            copyNext();
            return true;
          }
        }, {
          text: i18n.texts.buttons.no,
          role: 'cancel'
        }
      ]
    }).then(alert => {
      return alert.present().then(() => alert.onDidDismiss());
    });
  }

  public moveTrailsTo(trails: Trail[], toCollection: TrailCollection, email: string): void {
    const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.pages.trails.actions.moving, trails.length);
    const originalTags$: Observable<{originalTrail: Trail, tags: string[][]}>[] = [];
    const moves$: Observable<any>[] = [];
    let done = 0;
    const tagService = this.injector.get(TagService);
    progress.subTitle = '0/' + trails.length;
    const trailsPresentOnServer = trails.filter(t => t.version > 0);
    if (trailsPresentOnServer.length > 0)
      moves$.push(this.injector.get(TrailCollectionService).doNotDeleteCollectionWhileTrailsNotSync(trailsPresentOnServer));
    for (const trail of trails) {
      if (trail.owner === email) {
        progress.addWorkToDo(1);
        originalTags$.push(tagService.getTrailTagsNames$(trail.uuid, true).pipe(map(tags => {
          progress.addWorkDone(1);
          return {originalTrail: trail, tags};
        })));
      }
      moves$.push(from(new Promise(resolve => {
        this.injector.get(TrailService).doUpdate(trail, t => t.collectionUuid = toCollection.uuid, () => {
          tagService.deleteTrailTagsForTrail(trail.uuid, () => {
            progress.addWorkDone(1);
            progress.subTitle = (++done) + '/' + trails.length;
            resolve(true);
          });
        });
      })));
    }

    (originalTags$.length > 0 ? zip(originalTags$) : of([])).pipe(
      switchMap(tags => zip(moves$).pipe(map(() => tags))),
      first(),
    ).subscribe(tags => {
      const trailTags = tags.filter(t => t.tags.length > 0);
      const trails = trailTags.map(t => ({originalTrail: t.originalTrail, newTrail: t.originalTrail}));
      this.handleImportTags(trails, trailTags, toCollection.uuid);
      progress.done();
    });
  }

}
