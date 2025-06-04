import { Observable } from 'rxjs';
import { MapComponent } from '../map.component';
import { Injector } from '@angular/core';
import * as L from 'leaflet';

export abstract class MapTool {

  icon: string | undefined | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => string | undefined);
  label: string | undefined | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => string);
  i18n: string | undefined | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => string);
  color: string | undefined | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => string | undefined);
  backgroundColor: string | undefined | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => string | undefined) = undefined;
  disabled: boolean | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => boolean) = false;
  visible: boolean | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => boolean) = true;

  execute?: (map: L.Map, mapComponent: MapComponent, injector: Injector) => Observable<any>;

}
