import * as L from 'leaflet';
import { BehaviorSubject, of } from 'rxjs';
import { Injector } from '@angular/core';
import { MapTool } from './tool.interface';
import { MapComponent } from '../map.component';

export class MapToggleBubblesTool extends MapTool {

  constructor(
    activated$: BehaviorSubject<boolean>,
    available$: BehaviorSubject<boolean>,
  ) {
    super();
    this.icon = (map: L.Map, mapComponent: MapComponent, injector: Injector) => activated$.value ? 'path' : 'bubbles';
    this.visible = () => available$.value;
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      activated$.next(!activated$.value);
      return of(true);
    };
  }

}
