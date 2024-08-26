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
import { downloadZip } from 'client-zip';
import { TrackEditionService } from '../track-edition/track-edition.service';
import { Arrays } from 'src/app/utils/arrays';
import { PreferencesService } from '../preferences/preferences.service';
import { Trail } from 'src/app/model/trail';
import { Progress, ProgressService } from '../progress/progress.service';
import { TrackService } from './track.service';
import { catchError, combineLatest, debounceTime, filter, first, forkJoin, from, map, Observable, of, switchMap, timeout, zip } from 'rxjs';
import { TrailService } from './trail.service';
import { TrailCollectionService } from './trail-collection.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { TagService } from './tag.service';

@Injectable({providedIn: 'root'})
export class TrailMenuService {

  constructor(
    private injector: Injector
  ) {}

  public trailToCompare: Trail | undefined;

  public getTrailsMenu(trails: Trail[], fromTrail: boolean = false, fromCollection: string | undefined = undefined): MenuItem[] {
    if (trails.length === 0) return [];
    const menu: MenuItem[] = [];
    const email = this.injector.get(AuthService).email!;

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
      menu.push(new MenuItem().setIcon('compare').setI18nLabel('pages.trail.actions.compare')
        .setAction(() => {
          this.trailToCompare = undefined;
          const router = this.injector.get(Router);
          router.navigateByUrl('/trail/' + encodeURIComponent(trails[0].owner) + '/' + trails[0].uuid + '/' + encodeURIComponent(trails[1].owner) + '/' + trails[1].uuid + '?from=' + encodeURIComponent(router.url));
        })
      );
      menu.push(new MenuItem());
    }
    if (trails.length === 1) {
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
      menu.push(new MenuItem());
    }

    menu.push(new MenuItem());
    menu.push(new MenuItem().setIcon('export').setI18nLabel('pages.trails.actions.export').setAction(() => this.exportGpx(trails)));

    menu.push(new MenuItem());
    menu.push(
      new MenuItem().setIcon('collection-copy').setI18nLabel('pages.trails.actions.copy_to_collection')
      .setChildrenProvider(() => this.getCollectionsMenuItems(this.getAllCollectionsUuids(trails, email), (col) => {
        const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.pages.trails.actions.copying, trails.length);
        for (const trail of trails) {
          const originalTrack$ = this.injector.get(TrackService).getFullTrackReady$(trail.originalTrackUuid, trail.owner);
          const currentTrack$ = trail.originalTrackUuid === trail.currentTrackUuid ? originalTrack$ : this.injector.get(TrackService).getFullTrackReady$(trail.currentTrackUuid, trail.owner);
          zip([originalTrack$, currentTrack$])
          .subscribe(
            tracks => {
              const originalTrack = tracks[0].copy(email);
              const currentTrack = tracks[1].uuid === tracks[0].uuid ? undefined : tracks[1].copy(email);
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
              this.injector.get(TrailService).create(copy);
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
                this.injector.get(TrailService).update(trail);
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
            this.injector.get(TrailService).update(trail);
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
      this.injector.get(TrackService).getFullTrackReady$(trail.currentTrackUuid, trail.owner).pipe(catchError(() => of(null)))
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
    this.injector.get(TrackEditionService).computeFinalMetadata(imported.trail, imported.tracks[imported.tracks.length - 1]);
    this.injector.get(TrackService).create(imported.tracks[0]);
    this.injector.get(TrackService).create(imported.tracks[imported.tracks.length - 1]);
    this.injector.get(TrailService).create(imported.trail);
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
          if (existingFilenames.indexOf(file.filename.toLowerCase()) >= 0) {
            let i = 2;
            while (existingFilenames.indexOf(file.filename.toLowerCase() + '_' + i) >= 0) i++;
            file.filename = file.filename + '_' + i;
          }
          existingFilenames.push(file.filename.toLowerCase());
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

}
