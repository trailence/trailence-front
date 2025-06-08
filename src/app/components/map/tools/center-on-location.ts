import * as L from 'leaflet';
import { BehaviorSubject, of } from 'rxjs';
import { Injector } from '@angular/core';
import { MapTool } from './tool.interface';
import { MapComponent } from '../map.component';

export class MapCenterOnPositionTool extends MapTool {

  constructor(
    getVisible: () => boolean,
    following$: BehaviorSubject<boolean>,
  ) {
    super();
    this.visible = (map: L.Map, mapComponent: MapComponent, injector: Injector) => getVisible();
    this.icon = 'center-on-location';
    this.color = () => following$.value ? 'light' : 'dark';
    this.backgroundColor = () => following$.value ? 'dark' : '';
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      mapComponent.toggleCenterOnLocation();
      return of(true);
    };
  }

}
