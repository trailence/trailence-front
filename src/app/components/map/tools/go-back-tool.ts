import { MapTool, MapToolContext } from './tool.interface';
import { MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { of } from 'rxjs';

export class GoBackTool extends MapTool {

  constructor() {
    super();
    this.icon = 'undo';
    this.disabled = (ctx: MapToolContext) => {
      const state = ctx.mapComponent.getState();
      return !ctx.injector.get(MapAdditionsService).canPopState(state.center, state.zoom)
    };
    this.execute = (ctx: MapToolContext) => {
      const mapState = ctx.mapComponent.getState();
      const state = ctx.injector.get(MapAdditionsService).popState(mapState.center, mapState.zoom);
      if (state) ctx.mapComponent.goTo(state.center.lat, state.center.lng, state.zoom);
      return of(true);
    };
  }

}
