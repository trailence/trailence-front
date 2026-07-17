import { MapTool, MapToolContext, MenuItemConfigProvider } from './tool.interface';
import { MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { combineLatest, map, of } from 'rxjs';

export class GoBackTool extends MapTool {

  override menuItemConfig: MenuItemConfigProvider = (ctx: MapToolContext) => ({
    icon: 'undo',
    disabled: combineLatest([ctx.mapComponent.getState().center$, ctx.mapComponent.getState().zoomInt$]).pipe(
      map(([center, zoom]) => !ctx.injector.get(MapAdditionsService).canPopState(center, zoom)),
    ),
  });

  override execute = (ctx: MapToolContext) => {
    const mapState = ctx.mapComponent.getState();
    const state = ctx.injector.get(MapAdditionsService).popState(mapState.center, mapState.zoom);
    if (state) ctx.mapComponent.goTo(state.center.lat, state.center.lng, state.zoom);
    return of(true);
  };

}
