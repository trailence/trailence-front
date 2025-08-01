import { Observable } from 'rxjs';
import { MapComponent } from '../map.component';
import { Injector } from '@angular/core';
import * as L from 'leaflet';

export type MapToolStringUndefinedFunction = string | undefined | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => string | undefined);
export type MapToolStringFunction = string | undefined | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => string);
export type MapToolBooleanFunction = boolean | ((map: L.Map, mapComponent: MapComponent, injector: Injector) => boolean);

export abstract class MapTool {

  icon: MapToolStringUndefinedFunction;
  label: MapToolStringFunction;
  i18n: MapToolStringFunction;
  color: MapToolStringUndefinedFunction;
  backgroundColor: MapToolStringUndefinedFunction = undefined;
  disabled: MapToolBooleanFunction = false;
  visible: MapToolBooleanFunction = true;

  execute?: (map: L.Map, mapComponent: MapComponent, injector: Injector) => Observable<any>;

}
