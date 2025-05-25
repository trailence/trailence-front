import { Injector } from '@angular/core';
import { MapComponent } from '../map.component';
import { MapTool } from './tool.interface';
import { MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { of } from 'rxjs';

export class GoBackTool extends MapTool {

  constructor() {
    super();
    this.icon = 'undo';
    this.disabled = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      const state = mapComponent.getState();
      return !injector.get(MapAdditionsService).canPopState(state.center, state.zoom)
    };
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      const mapState = mapComponent.getState();
      const state = injector.get(MapAdditionsService).popState(mapState.center, mapState.zoom);
      if (state) mapComponent.goTo(state.center.lat, state.center.lng, state.zoom);
      return of(true);
    };
  }

}
