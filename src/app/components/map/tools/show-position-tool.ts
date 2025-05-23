import L from 'leaflet';
import { of } from 'rxjs';
import { Injector } from '@angular/core';
import { MapTool } from './tool.interface';
import { MapGeolocationService } from 'src/app/services/map/map-geolocation.service';
import { MapComponent } from '../map.component';

export class MapShowPositionTool extends MapTool {

  constructor() {
    super();
    this.visible = false;
    this.icon = 'pin';
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      injector.get(MapGeolocationService).toggleShowPosition();
      return of(true);
    };
  }

}
