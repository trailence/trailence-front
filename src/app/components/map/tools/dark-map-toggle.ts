import { Injector } from '@angular/core';
import L from 'leaflet';
import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { MapTool } from './tool.interface';
import { Observable, of } from 'rxjs';
import { MapComponent } from '../map.component';

export class DarkMapToggleTool extends MapTool {

  constructor() {
    super();
    this.icon = (map: L.Map, mapComponent: MapComponent, injector: Injector) => injector.get(MapLayersService).darkMapEnabled ? 'theme-light' : 'theme-dark';
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      injector.get(MapLayersService).toggleDarkMap();
      return of(true);
    };
  }

}
