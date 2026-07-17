import { MapTool, MapToolContext, MenuItemConfigProvider } from './tool.interface';
import { map, of } from 'rxjs';

export class MapFitBoundsTool extends MapTool {

  override menuItemConfig: MenuItemConfigProvider = (ctx: MapToolContext) => ({
    icon: 'zoom-fit-bounds',
    disabled: ctx.mapComponent.canFitMapBounds$().pipe(map(can => !can)),
  });

  override execute = (ctx: MapToolContext) => {
    ctx.mapComponent.fitMapBounds(ctx.map);
    return of(true);
  };

}
