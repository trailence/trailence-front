import { Injector } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { AuthService } from '../auth/auth.service';
import { FileService } from '../file/file.service';
import { Progress, ProgressService } from '../progress/progress.service';
import { I18nError } from '../i18n/i18n-string';
import { ErrorService } from '../progress/error.service';
import { Arrays } from 'src/app/utils/arrays';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';
import { PreferencesService } from '../preferences/preferences.service';
import { TrackEditionService } from '../track-edition/track-edition.service';
import { TrackService } from '../database/track.service';
import { TrailService } from '../database/trail.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { PhotoService } from '../database/photo.service';
import { firstValueFrom } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';
import { filterItemsDefined } from 'src/app/utils/rxjs/filter-defined';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { DatabaseService } from '../database/database.service';

export function openImportTrailsDialog(injector: Injector, collectionUuid: string): void {
  const i18n = injector.get(I18nService);
  const email = injector.get(AuthService).email!;
  let zipEntries = 0;
  let zipErrors: any[] = [];
  const allDone: Promise<any>[] = [];
  injector.get(FileService).openFileDialog({
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
      const progress = injector.get(ProgressService).create(i18n.texts.tools.importing, nbFiles);
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
            injector.get(DatabaseService).pauseSync();
            return new Promise<({trailUuid: string, tags: string[][]})[]>((resolve, reject) => {
              const previousZipEntries = zipEntries;
              zipEntries += gpxFiles.length;
              progress.addWorkToDo(gpxFiles.length);
              progress.subTitle = '' + (index + 1 + previousZipEntries) + '/' + (nbFiles + zipEntries);
              progress.addWorkDone(1);
              const done: ({trailUuid: string, tags: string[][], source?: string})[] = [];
              const readNextZipEntry = (entryIndex: number) => {
                const gpxFile = gpxFiles[entryIndex];
                return gpxFile.async('arraybuffer')
                .then(arraybuffer => {
                  const r = importGpx(injector, arraybuffer, email, collectionUuid, zip);
                  allDone.push(r.allDone.catch(e => null));
                  r.allDone.then(() => {
                    progress.subTitle = '' + (index + 1 + previousZipEntries + entryIndex + 1) + '/' + (nbFiles + zipEntries);
                    progress.addWorkDone(1);
                  });
                  return r.imported;
                })
                .then(result => {
                  done.push(result);
                  if (entryIndex === gpxFiles.length - 1) {
                    injector.get(DatabaseService).resumeSync();
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
                    injector.get(DatabaseService).resumeSync();
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
      return importGpx(injector, file, email, collectionUuid).allDone
      .then(result => {
        allDone.push(Promise.resolve(result));
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
      Promise.all(allDone).then(() => {
        progress?.done();
        if (errors.length > 0)
          injector.get(ErrorService).addErrors(errors);
        if (zipErrors.length > 0)
          injector.get(ErrorService).addErrors(zipErrors);
        const importedTrails = Arrays.flatMap(imported, a => a);
        finishImport(injector, importedTrails, collectionUuid);
      });
    }
  });
}

export function importGpx(injector: Injector, file: ArrayBuffer, owner: string, collectionUuid: string, zip?: any): {
  imported: Promise<{trailUuid: string, tags: string[][], source?: string}>,
  allDone: Promise<{trailUuid: string, tags: string[][], source?: string}>
} {
  try {
    const imported = GpxFormat.importGpx(file, owner, collectionUuid, injector.get(PreferencesService));
    if (imported.tracks.length === 1) {
      const improved = injector.get(TrackEditionService).applyDefaultImprovments(imported.tracks[0]);
      if (!improved.isEquals(imported.tracks[0])) {
        imported.trail.currentTrackUuid = improved.uuid;
        imported.tracks.push(improved);
      }
    }
    let result$: Promise<any> = Promise.resolve(true);
    injector.get(TrackEditionService).computeFinalMetadata(imported.trail, imported.tracks[imported.tracks.length - 1]);
    const dbDone = new Promise<any>(resolve => {
      const done = new CompositeOnDone(() => resolve(true));
      injector.get(TrackService).create(imported.tracks[0], done.add());
      if (imported.tracks.length > 1)
        injector.get(TrackService).create(imported.tracks[imported.tracks.length - 1], done.add());
      injector.get(TrailService).create(imported.trail, done.add());
      done.start();
    });
    const result = {trailUuid: imported.trail.uuid, tags: imported.tags, source: imported.source};
    // photos
    if (imported.photos.length > 0 && zip) {
      const photoService = injector.get(PhotoService);
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
    return { imported: result$.then(() => result), allDone: result$.then(() => dbDone.then(() => result)) };
  } catch (e) {
    return { imported: Promise.reject(e), allDone: Promise.reject(e) };
  }
}

export function finishImport(injector: Injector, imported: {trailUuid: string, tags: string[][], source?: string}[], collectionUuid: string): Promise<any> {
  if (imported.length === 0) return Promise.resolve(true);
  return importTags(injector, imported, collectionUuid)
  .then(() => importFromSources(injector, imported));
}

function importTags(injector: Injector, imported: ({trailUuid: string, tags: string[][]} | undefined)[], collectionUuid: string): Promise<any> {
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
  .then(module => injector.get(ModalController).create({
    component: module.ImportTagsPopupComponent,
    backdropDismiss: false,
    componentProps: {
      collectionUuid,
      tags: allTags,
      toImport: filterItemsDefined(imported),
    }
  }))
  .then(modal => {
    modal.present();
    return modal.onDidDismiss();
  });
}

function importFromSources(injector: Injector, imported: {trailUuid: string, tags: string[][], source?: string}[]): Promise<any> {
  let toImport = imported.filter(t => !!t.source);
  if (toImport.length === 0) return Promise.resolve(true);
  const fetchService = injector.get(FetchSourceService);
  return new Promise(resolve => {
    fetchService.waitReady$().subscribe(r => {
      if (!r) {
        resolve(true);
        return;
      }
      toImport = toImport.filter(t => fetchService.canFetchTrailInfo(t.source!));
      if (toImport.length === 0) {
        resolve(true);
        return;
      }
      import('../../components/fetch-source-popup/fetch-source-popup.component')
      .then(module => injector.get(ModalController).create({
        component: module.FetchSourcePopupComponent,
        backdropDismiss: false,
        componentProps: {
          trails: toImport.map(t => ({trailUuid: t.trailUuid, source: t.source!})),
        }
      }))
      .then(modal => {
        modal.present();
        return modal.onDidDismiss();
      })
      .then(resolve);
    });
  });
}
