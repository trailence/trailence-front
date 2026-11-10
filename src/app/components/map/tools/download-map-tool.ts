import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { distinctUntilChanged, filter, map, Observable, switchMap } from 'rxjs';
import { MapTool, MapToolGroup } from '../map-tool';
import { MapComponent } from '../map.component';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';

export const DownloadMapGroup: MapToolGroup = {
  id: 'download',
  pane: 'right',
  order: 100,
};

export class DownloadMapTool implements MapTool {
  readonly group = 'download';
  readonly order = 0;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setIcon('download')
      .setDisabled(true)
      .setAction(() => {
        const trail = mapComponent.downloadMapTrail;
        const renderer = mapComponent.renderer;
        if (!renderer) return;
        void import('../../../services/functions/map-download')
        .then(m => m.openMapDownloadDialog(injector, trail ? [trail] : [], renderer.getBounds(), renderer.mapState.tilesName));
      });
    return mapComponent.renderer$.pipe(
      filterDefined(),
      switchMap(renderer => renderer.mapState.zoom$),
      map(zoom => zoom >= 12),
      distinctUntilChanged(),
      map(enabled => {
        item.setDisabled(!enabled);
        return item;
      })
    );
  }
}
