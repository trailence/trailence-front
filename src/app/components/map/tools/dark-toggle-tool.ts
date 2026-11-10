import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { map, Observable } from 'rxjs';
import { MapTool } from '../map-tool';
import { MapComponent } from '../map.component';
import { MapLayersService } from '@trailence/services/map/map-layers.service';

export class DarkToggleTool implements MapTool {
  readonly group = 'map-config';
  readonly order = 100;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
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
