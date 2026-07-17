import { Observable } from 'rxjs';
import { MapComponent } from '../map.component';
import { Injector } from '@angular/core';
import * as L from 'leaflet';
import { MenuItemConfig } from '../../menus/menu-item';

export interface MapToolContext {
  injector: Injector;
  mapComponent: MapComponent;
  map: L.Map;
}

export type MenuItemConfigProvider = (context: MapToolContext) => MenuItemConfig;

export abstract class MapTool {

  abstract menuItemConfig: MenuItemConfig | MenuItemConfigProvider;

  abstract execute: (ctx: MapToolContext) => Observable<any>;

  toMenuItemConfig(context: MapToolContext): MenuItemConfig {
    return {
      ...(typeof this.menuItemConfig === 'function' ? this.menuItemConfig(context) : this.menuItemConfig),
      action: this.execute ? () => this.execute!(context).subscribe() : undefined,
    };
  }

}
