import * as L from 'leaflet';
import { MapTool } from './tool.interface';
import { MapComponent } from '../map.component';
import { Injector } from '@angular/core';
import { of } from 'rxjs';

export class MapFitBoundsTool extends MapTool {

  constructor() {
    super();
    this.icon = 'zoom-fit-bounds';
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      mapComponent.fitMapBounds(map);
      return of(true);
    };
    this.disabled = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      return !mapComponent.canFitMapBounds();
    };
  }

}
