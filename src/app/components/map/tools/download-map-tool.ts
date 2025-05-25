import { Injector } from '@angular/core';
import L from 'leaflet';
import { Trail } from 'src/app/model/trail';
import { MapTool } from './tool.interface';
import { MapComponent } from '../map.component';
import { of } from 'rxjs';

export class DownloadMapTool extends MapTool {

  constructor(
    trail: Trail | undefined,
  ) {
    super();
    this.icon = 'download';
    this.disabled = (map: L.Map, mapComponent: MapComponent, injector: Injector) => map.getZoom() < 12;
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      import('../../../services/functions/map-download')
      .then(m => m.openMapDownloadDialog(injector, trail ? [trail] : [], map.getBounds()));
      return of(true);
    };
  }

}
