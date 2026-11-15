import { Injector } from '@angular/core';
import { MapTool, MapToolGroup } from '../map-tool';
import { MapComponent } from '../map.component';
import { EMPTY, map, Observable, of, switchMap } from 'rxjs';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { MapLayersService, WEBGL_SUPPORT } from '@trailence/services/map/map-layers.service';

export const MapDisplayToolsGroup: MapToolGroup = {
  id: 'map-display',
  pane: 'right',
  order: -100000,
};

export class Map3dToggleTool implements MapTool {

  readonly group = MapDisplayToolsGroup.id;
  readonly order = 10;

  createMenuItem$(_: Injector, mapComponent: MapComponent): Observable<MenuItem> {
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

export class DarkToggleTool implements MapTool {
  readonly group = MapDisplayToolsGroup.id;
  readonly order = 100;

  createMenuItem$(injector: Injector, _: MapComponent): Observable<MenuItem> {
    const service = injector.get(MapLayersService);
    const item = new MenuItem()
      .setAction(() => service.toggleDarkMap());
    return service.darkMapEnabled$.pipe(
      map(dark => {
        item.setIcon(dark ? 'theme-light' : 'theme-dark');
        return item;
      }),
    );
  }
}

export class FullScreenTool implements MapTool {
  readonly group = MapDisplayToolsGroup.id;
  readonly order = 10000;

  createMenuItem$(_: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setIcon('full-screen-on')
      .setAction(() => mapComponent.toggleFullScreen());
    return mapComponent.fullscreen$.pipe(
      map(enabled => {
        item.setIcon(enabled ? 'full-screen-off' : 'full-screen-on');
        return item;
      })
    );
  }
}
