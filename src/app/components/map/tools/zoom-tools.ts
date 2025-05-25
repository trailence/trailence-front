import { Injector } from '@angular/core';
import { MapComponent } from '../map.component';
import { MapTool } from './tool.interface';
import { of } from 'rxjs';

export class ZoomInTool extends MapTool {

  constructor() {
    super();
    this.icon = 'plus';
    this.disabled = (map: L.Map, mapComponent: MapComponent, injector: Injector) => map.getZoom() >= map.getMaxZoom();
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      map.zoomIn();
      return of(true);
    }
  }

}

export class ZoomOutTool extends MapTool {

  constructor() {
    super();
    this.icon = 'minus';
    this.disabled = (map: L.Map, mapComponent: MapComponent, injector: Injector) => map.getZoom() <= 1;
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      map.zoomOut();
      return of(true);
    }
  }

}

export class ZoomLevelTool extends MapTool {

  constructor() {
    super();
    this.label = (map: L.Map, mapComponent: MapComponent, injector: Injector) => map.getZoom().toLocaleString('en', {maximumFractionDigits: 1});
    this.disabled = true;
  }
}
