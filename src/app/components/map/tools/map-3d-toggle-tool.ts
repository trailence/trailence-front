import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { EMPTY, map, Observable, of, switchMap } from 'rxjs';
import { MapTool } from '../map-tool';
import { MapComponent } from '../map.component';
import { WEBGL_SUPPORT } from '@trailence/services/map/map-layers.service';

export class Map3dToggleTool implements MapTool {

  readonly group = 'map-config';
  readonly order = 10;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setIcon('3d')
      .setVisible(WEBGL_SUPPORT)
      .setAction(() => {
        const state = mapComponent.renderer?.mapState;
        if (state) state.is3d = !state.is3d;
      });
    if (!WEBGL_SUPPORT) return of(item);
    return mapComponent.renderer$.pipe(
      switchMap(renderer => {
        if (!renderer) return EMPTY;
        return renderer.mapState.is3d$.pipe(
          map(is3d => {
            item.setIcon(is3d ? '2d' : '3d');
            return item;
          })
        );
      }),
    );
  }

}
