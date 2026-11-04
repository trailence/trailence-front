import { Injector } from '@angular/core';
import { MapComponent } from './map.component';
import { Observable } from 'rxjs';
import { MenuItem } from '../menus/menu-item';

export interface MapTool {

  readonly pane: 'left' | 'right' | 'top';
  /** Lowest first. */
  readonly order: number;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem>;

}
