import { Injector } from '@angular/core';
import { catchError, defaultIfEmpty, EMPTY, first, forkJoin, map, Observable, of, switchMap, zip } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { PhotoService } from '../database/photo.service';
import { ModalController } from '@ionic/angular/standalone';
import { Arrays } from 'src/app/utils/arrays';
import { Photo } from 'src/app/model/photo';
import { ProgressService } from '../progress/progress.service';
import { AuthService } from '../auth/auth.service';
import { I18nService } from '../i18n/i18n.service';
import { Track } from 'src/app/model/track';
import { TrackService } from '../database/track.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { filterItemsDefined } from 'src/app/utils/rxjs/filter-defined';
import { TagService } from '../database/tag.service';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';
import { FileService } from '../file/file.service';
import { StringUtils } from 'src/app/utils/string-utils';
import { BinaryContent } from 'src/app/utils/binary-content';
import { ModerationService } from '../moderation/moderation.service';

export function exportTrails(injector: Injector, trails: Trail[]) {
  if (trails.length === 0) return;
  zip(trails.map(trail => injector.get(PhotoService).getPhotosForTrailReady$(trail).pipe(map(photos => ({trail, photos})))))
  .pipe(first(), map(tp => tp.filter(e => e.photos.length > 0)))
  .subscribe(trailsPhotos => {
    if (trailsPhotos.length === 0 && trails.every(t => t.originalTrackUuid === t.currentTrackUuid)) {
      doExport(injector, trails, 'original', false, []);
      return;
    }
    import('../../components/export-popup/export-popup.component').then(module => {
      injector.get(ModalController).create({
        component: module.ExportPopupComponent,
        componentProps: {
          trails: trails,
          trailsPhotos,
        }
      })
      .then(modal => modal.present().then(() => modal.onWillDismiss()))
      .then(modalResult => {
        if (!modalResult.data?.what) return;
        doExport(injector, trails, modalResult.data.what, modalResult.data.includePhotos, trailsPhotos);
      })
    })
  });
}

function doExport(injector: Injector, trails: Trail[], what: 'original' | 'current' | 'both', includePhotos: boolean, trailsPhotos: {trail: Trail, photos: Photo[]}[]): void {
  const photosToExport = includePhotos ? Arrays.flatMap(trailsPhotos, e => e.photos) : [];

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

  const progress = injector.get(ProgressService).create(injector.get(I18nService).texts.pages.trails.actions.export, trails.length * 2 + photosToExport.length * 10 + 1);
  const email = injector.get(AuthService).email!;
  const trailToData$ = (trail: Trail) => {
    const tracks: Observable<Track | null>[] = [];
    if (what === 'original' || what === 'both')
      tracks.push(
        trail.fromModeration ? injector.get(ModerationService).getFullTrack$(trail.uuid, trail.owner, trail.originalTrackUuid) :
        injector.get(TrackService).getFullTrack$(trail.originalTrackUuid, trail.owner)
      );
    if (what === 'current' || (what === 'both' && trail.currentTrackUuid !== trail.originalTrackUuid))
      tracks.push(
        trail.fromModeration ? injector.get(ModerationService).getFullTrack$(trail.uuid, trail.owner, trail.currentTrackUuid) :
        injector.get(TrackService).getFullTrack$(trail.currentTrackUuid, trail.owner)
      );
    return forkJoin(tracks.map(track$ => track$.pipe(firstTimeout(track => !!track, 15000, () => null as (Track | null))))).pipe(
      map(tracks => ({trail, tracks: filterItemsDefined(tracks)})),
      switchMap(t => {
        if (t.tracks.length === 0) return of(null);
        const tags$ = t.trail.owner !== email ? of([]) : injector.get(TagService).getTrailTagsNames$(t.trail.uuid, true);
        return tags$.pipe(
          map(tags => ({
            name: t.trail.name,
            gpx: GpxFormat.exportGpx(
              t.trail,
              t.tracks,
              tags,
              photosToExport.filter(p => p.owner === trail.owner && p.trailUuid === trail.uuid),
              photoFilenameMap,
            )
          }))
        );
      }),
    );
  };
  const fileService = injector.get(FileService);
  if (trails.length === 1 && photosToExport.length === 0) {
    trailToData$(trails[0]).subscribe(data => {
      if (!data) {
        progress.done();
        return;
      }
      progress.addWorkDone(2);
      fileService.saveBinaryData(StringUtils.toFilename(data.name) + '.gpx', data.gpx).then(() => progress.done());
    });
    return;
  }
  const i18n = injector.get(I18nService);
  progress.subTitle = i18n.texts.export.trail + ' 1/' + trails.length;
  const existingGpxFilenames: string[] = [];
  let photoIndex = 0;
  const photoService = injector.get(PhotoService);
  const processNextPhoto = (resolve: (result: { filename: string; data: BinaryContent; } | null) => void) => {
    progress.workDone = trails.length * 2 + photoIndex * 10;
    if (photoIndex === photosToExport.length) {
      progress.subTitle = '';
      resolve(null);
      return;
    }
    progress.subTitle = i18n.texts.export.photo + ' ' + (photoIndex + 1) + '/' + photosToExport.length;
    const photo = photosToExport[photoIndex++];
    photoService.getFile$(photo)
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
