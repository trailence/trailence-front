import { Injectable, Injector } from '@angular/core';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { AuthService } from '../auth/auth.service';
import { ModalController } from '@ionic/angular/standalone';
import { TrailCollection } from 'src/app/model/trail-collection';
import { Router } from '@angular/router';
import { Trail } from 'src/app/model/trail';
import { combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { TrailCollectionService } from './trail-collection.service';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { TraceRecorderService } from '../trace-recorder/trace-recorder.service';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';

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
      menu.push(new MenuItem().setIcon('download').setI18nLabel('pages.trail.actions.download_map')
        .setAction(() => import('../functions/map-download').then(m => m.openMapDownloadDialog(this.injector, trails))));
      if (trails.length === 1) {
        menu.push(new MenuItem().setIcon('car').setI18nLabel('pages.trail.actions.go_to_departure')
        .setAction(() => import('../functions/go-to-departure').then(m => m.goToDeparture(this.injector, trails[0]))));
        menu.push(new MenuItem().setIcon('play-circle').setI18nLabel('trace_recorder.start_this_trail')
        .setAction(() => {
          this.injector.get(TraceRecorderService).start(trails[0]);
          const url = '/trail/' + trails[0].owner + '/' + trails[0].uuid;
          const router = this.injector.get(Router);
          if (router.url.indexOf(url) < 0) router.navigateByUrl(url);
        }));
      }

      if (trails.every(t => t.owner === email)) {
        const collectionUuid = this.getUniqueCollectionUuid(trails);
        if (collectionUuid) {
          menu.push(new MenuItem());
          if (trails.length === 1) {
            menu.push(new MenuItem().setIcon('edit').setI18nLabel('pages.trails.actions.rename')
              .setAction(() => import('../functions/trail-rename').then(m => m.openRenameTrailDialog(this.injector, trails[0]))));
            menu.push(new MenuItem().setIcon('location').setI18nLabel('pages.trails.actions.edit_location')
              .setAction(() => import('../../components/location-popup/location-popup.component').then(m => m.openLocationDialog(this.injector, trails[0]))));
          }
          menu.push(new MenuItem().setIcon('tags').setI18nLabel('pages.trails.tags.menu_item')
            .setAction(() => import('../../components/tags/tags.component').then(m => m.openTagsDialog(this.injector, trails, collectionUuid))));
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
        menu.push(new MenuItem().setIcon('merge').setI18nLabel('pages.trail.actions.merge_trails')
          .setAction(() => import('../functions/merge-trails').then(m => m.mergeTrails(this.injector, trails, fromCollection))));
      }
    }

    let inImportExportSection = false;

    if (onlyGlobal && fromCollection) {
      menu.push(new MenuItem().setIcon('tags').setI18nLabel('pages.trails.tags.menu_item')
        .setAction(() => import('../../components/tags/tags.component').then(m => m.openTagsDialog(this.injector, null, fromCollection))));
      menu.push(new MenuItem());
      inImportExportSection = true;
      menu.push(new MenuItem().setIcon('add-circle').setI18nLabel('tools.import')
        .setAction(() => import('../functions/import').then(m => m.openImportTrailsDialog(this.injector, fromCollection))));
      if (this.injector.get(FetchSourceService).canImportFromUrl) {
        menu.push(new MenuItem().setIcon('add-circle').setI18nLabel('pages.import_from_url.title').setAction(() => this.importFromUrl(fromCollection)));
      }
    }

    if (trails.length > 0) {
      if (menu.length > 0 && !inImportExportSection)
        menu.push(new MenuItem());
      menu.push(new MenuItem().setIcon('export').setI18nLabel('pages.trails.actions.export')
        .setAction(() => import('../functions/export').then(m => m.exportTrails(this.injector, trails))));

      menu.push(new MenuItem());
      menu.push(
        new MenuItem().setIcon('collection-copy').setI18nLabel('pages.trails.actions.copy_to_collection')
        .setChildrenProvider(() => this.getCollectionsMenuItems(this.getAllCollectionsUuids(trails, email),
          (col) => import('../functions/copy-trails').then(m => m.copyTrailsTo(this.injector, trails, col, email, fromTrail)))
        ));
    }

    if (trails.length > 0 && fromCollection && onlyGlobal) {
      menu.push(new MenuItem());
      menu.push(new MenuItem().setIcon('share').setI18nLabel('tools.share')
        .setAction(() => import('../../components/share-popup/share-popup.component').then(m => m.openSharePopup(this.injector, fromCollection, []))));
    }

    if (fromCollection !== undefined && !onlyGlobal && trails.length > 0) {
      if (trails.every(t => t.owner === email)) {
        const collectionUuid = this.getUniqueCollectionUuid(trails);
        if (fromCollection === collectionUuid) {
          menu.push(
            new MenuItem().setIcon('collection-move').setI18nLabel('pages.trails.actions.move_to_collection')
            .setChildrenProvider(() => this.getCollectionsMenuItems([collectionUuid],
              (col) => import('../functions/copy-trails').then(m => m.moveTrailsTo(this.injector, trails, col, email)))
            ));
          menu.push(new MenuItem());
          menu.push(new MenuItem().setIcon('share').setI18nLabel('tools.share')
            .setAction(() => import('../../components/share-popup/share-popup.component').then(m => m.openSharePopup(this.injector, collectionUuid, trails))));
        }
        menu.push(new MenuItem());
        menu.push(new MenuItem().setIcon('trash').setI18nLabel('buttons.delete').setColor('danger')
          .setAction(() => import('../functions/delete-trails').then(m => m.confirmDeleteTrails(this.injector, trails, fromTrail))));
      }
    }

    if (fromCollection && onlyGlobal && trails.length > 0) {
      menu.push(new MenuItem());
      menu.push(new MenuItem().setIcon('compare').setI18nLabel('pages.find_duplicates.title')
        .setAction(() => import('../../components/find-duplicates/find-duplicates.component').then(m => m.openFindDuplicates(this.injector, fromCollection))));
    }
    return menu;
  }

  private getCollectionsMenuItems(excludeUuids: string[], action: (col: TrailCollection) => void): Observable<MenuItem[]> {
    const collectionService = this.injector.get(TrailCollectionService);
    return collectionService.getAll$().pipe(
      switchMap(cols => cols.length === 0 ? of([]) : combineLatest(cols)),
      map(cols => {
        const list = cols.filter(col => !!col && excludeUuids.indexOf(col.uuid) < 0) as TrailCollection[];
        collectionService.sort(list);
        return list.map(
          col => {
            const item = new MenuItem();
            if (col.name === '' && col.type === TrailCollectionType.MY_TRAILS)
              item.setI18nLabel('my_trails');
            else
              item.setFixedLabel(col.name);
            item.setAction(() => action(col));
            return item;
          }
        );
      }),
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

  public async importFromUrl(collectionUuid: string) {
    const module = await import('../../components/import-from-url/import-from-url.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.ImportFromUrlComponent,
      componentProps: {
        collectionUuid,
      },
      backdropDismiss: true,
    });
    modal.present();
  }

}
