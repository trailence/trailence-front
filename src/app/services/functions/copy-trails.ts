import { Injector } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { TrailCollection } from 'src/app/model/trail-collection';
import { I18nService } from '../i18n/i18n.service';
import { ProgressService } from '../progress/progress.service';
import { TrackService } from '../database/track.service';
import { TagService } from '../database/tag.service';
import { PhotoService } from '../database/photo.service';
import { combineLatest, first, from, map, Observable, of, switchMap, tap, zip } from 'rxjs';
import { Photo } from 'src/app/model/photo';
import { TrailService } from '../database/trail.service';
import { Router } from '@angular/router';
import { Arrays } from 'src/app/utils/arrays';
import { ErrorService } from '../progress/error.service';
import { IdGenerator } from 'src/app/utils/component-utils';
import { TrailCollectionService } from '../database/trail-collection.service';
import { DependenciesService } from '../database/dependencies.service';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { TrailDto } from 'src/app/model/dto/trail';

export function copyTrailsTo( // NOSONAR
  injector: Injector, trails: Trail[], toCollection: TrailCollection, email: string,
  fromTrail: boolean, autoImportPhotos?: boolean, skipTags?: boolean,
  trailDtoProvider?: (trail: Trail) => Partial<TrailDto>,
  onDone?: (newTrails: Trail[]) => void
): void {
  const progress = injector.get(ProgressService).create(injector.get(I18nService).texts.pages.trails.actions.copying, 1);
  const trackService = injector.get(TrackService);
  const tagService = injector.get(TagService);
  const photoService = injector.get(PhotoService);
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
          const currentTrack = tracks[1] ? tracks[1].copy(email) : undefined;
          const copy = new Trail({
            ...trail.toDto(),
            ...(trailDtoProvider ? trailDtoProvider(trail) : {}),
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
            injector.get(TrackService).create(originalTrack, () => {
              progress.addWorkDone(1);
              observer.next(originalTrack);
              observer.complete();
            });
          })
          const createTrack2$ = currentTrack ? new Observable(observer => {
            injector.get(TrackService).create(currentTrack, () => {
              progress.addWorkDone(1);
              observer.next(currentTrack);
              observer.complete();
            });
          }) : of(null);
          const createTrail$ = new Observable<Trail>(observer => {
            injector.get(TrailService).create(copy, () => {
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
      if (!skipTags)
        originalTags$.push(tagService.getTrailTagsNames$(trail.uuid, true).pipe(map(tags => {
          progress.addWorkDone(1);
          return {originalTrail: trail, tags};
        })));
      else
        progress.addWorkToDo(1);
    }
    progress.addWorkToDo(1);
    originalPhotos$.push(photoService.getPhotosForTrailReady$(trail).pipe(map(photos => {
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
      handleImportTags(injector, trails, tags, toCollection.uuid)
      .then(() => handleImportPhotos(injector, trails, photos, autoImportPhotos))
      .then(() => {
        if (fromTrail) injector.get(Router).navigateByUrl('/trail/' + email + '/' + trails[0].newTrail.uuid);
        if (onDone) onDone(trails.map(t => t.newTrail));
      });
      progress.done();
    }
  );
}

function handleImportTags(
  injector: Injector,
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
  .then(module => injector.get(ModalController).create({
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

function handleImportPhotos(
  injector: Injector,
  trails: {originalTrail: Trail, newTrail: Trail}[],
  photos: {originalTrail: Trail, photos: Photo[]}[],
  autoImport?: boolean,
): Promise<any> {
  if (photos.length === 0 || autoImport === false) return Promise.resolve();
  if (autoImport === true) {
    doImportPhotos(injector, trails, photos);
    return Promise.resolve(true);
  }
  const i18n = injector.get(I18nService);
  return injector.get(AlertController).create({
    header: i18n.texts.pages.trails.actions.copy_photos_alert.title,
    message: i18n.texts.pages.trails.actions.copy_photos_alert[trails.length > 1 ? 'message_plural' : 'message_singular'],
    buttons: [
      {
        text: i18n.texts.buttons.yes,
        role: 'success',
        handler: () => {
          doImportPhotos(injector, trails, photos);
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

function doImportPhotos(
  injector: Injector,
  trails: {originalTrail: Trail, newTrail: Trail}[],
  photos: {originalTrail: Trail, photos: Photo[]}[]
): void {
  const allPhotos = Arrays.flatMap(photos, p => p.photos);
  const progress = injector.get(ProgressService).create(injector.get(I18nService).texts.pages.trails.actions.copying_photos, allPhotos.length);
  progress.subTitle = '0/' + allPhotos.length;
  let index = 0;
  const photoService = injector.get(PhotoService);
  const copyNext = () => {
    photoService.getFile$(allPhotos[index]).subscribe({
      next: blob => {
        blob.arrayBuffer().then(buffer => {
          const originalPhoto = allPhotos[index];
          const originalTrail = photos.find(p => p.photos.indexOf(originalPhoto) >= 0)!.originalTrail; // NOSONAR
          const trail = trails.find(t => t.originalTrail === originalTrail)!; // NOSONAR
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
            next: () => {
              progress.subTitle = '' + (index + 1) + '/' + allPhotos.length;
              progress.addWorkDone(1);
              if (++index < allPhotos.length) setTimeout(copyNext, 0);
            },
            error: err => {
              injector.get(ErrorService).addNetworkError(err, "pages.trails.actions.copy_photo_error", [allPhotos[index].description]);
              progress.subTitle = '' + (index + 1) + '/' + allPhotos.length;
              progress.addWorkDone(1);
              if (++index < allPhotos.length) setTimeout(copyNext, 0);
            }
          });
        });
      },
      error: err => {
        injector.get(ErrorService).addNetworkError(err, "pages.trails.actions.copy_photo_error", [allPhotos[index].description]);
        progress.subTitle = '' + (index + 1) + '/' + allPhotos.length;
        progress.addWorkDone(1);
        if (++index < allPhotos.length) setTimeout(copyNext, 0);
      }
    });
  };
  copyNext();
}

export function moveTrailsTo(injector: Injector, trails: Trail[], toCollection: TrailCollection, email: string, additionalUpdate: ((trail: Trail) => void) | undefined = undefined, isPublishing: boolean = false): void {
  const i18n = injector.get(I18nService);
  const progress = injector.get(ProgressService).create(isPublishing ? i18n.texts.publications.publish : i18n.texts.pages.trails.actions.moving, trails.length);
  const originalTags$: Observable<{originalTrail: Trail, tags: string[][]}>[] = [];
  const moves$: Observable<any>[] = [];
  let done = 0;
  const tagService = injector.get(TagService);
  progress.subTitle = '0/' + trails.length;
  const eventId = IdGenerator.generateId();
  injector.get(TrailCollectionService).doNotDeleteCollectionUntilEvent(trails[0].collectionUuid, trails[0].owner, eventId);
  for (const trail of trails) {
    if (trail.owner === email) {
      progress.addWorkToDo(1);
      originalTags$.push(tagService.getTrailTagsNames$(trail.uuid, true).pipe(map(tags => {
        progress.addWorkDone(1);
        return {originalTrail: trail, tags};
      })));
    }
    const originalCollection = trail.collectionUuid;
    moves$.push(from(new Promise(resolve => {
      tagService.deleteTrailTagsForTrail(trail.uuid, () => {
        injector.get(TrailService).doUpdate(
          trail,
          t => {
            t.collectionUuid = toCollection.uuid;
            if (additionalUpdate) additionalUpdate(t);
          },
          t => {
            (t.version > 0 ? injector.get(TrailCollectionService).doNotDeleteCollectionWhileTrailNotSync(originalCollection, t) : Promise.resolve())
            .then(() => {
              progress.addWorkDone(1);
              progress.subTitle = (++done) + '/' + trails.length;
              resolve(true);
            });
          }
        );
      });
    })));
  }
  const movesDone$ = zip(moves$).pipe(
    tap(() => injector.get(DependenciesService).fireEvent(eventId))
  );

  (originalTags$.length > 0 ? zip(originalTags$) : of([])).pipe(
    switchMap(tags => movesDone$.pipe(map(() => tags))),
    first(),
  ).subscribe(tags => {
    const trailTags = tags.filter(t => t.tags.length > 0);
    const trails = trailTags.map(t => ({originalTrail: t.originalTrail, newTrail: t.originalTrail}));
    handleImportTags(injector, trails, trailTags, toCollection.uuid);
    progress.done();
  });
}
