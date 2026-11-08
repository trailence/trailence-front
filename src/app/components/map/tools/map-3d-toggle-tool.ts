import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { EMPTY, map, Observable, switchMap } from 'rxjs';
import { MapTool } from '../map-tool';
import { MapComponent } from '../map.component';

export class Map3dToggleTool implements MapTool {

  readonly group = 'map-config';
  readonly order = 10;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setIcon('3d')
      .setAction(() => {
        const state = mapComponent.renderer?.mapState;
        if (state) state.is3d = !state.is3d;
      });
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
