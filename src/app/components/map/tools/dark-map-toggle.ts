import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { MapTool, MapToolContext } from './tool.interface';
import { map, of } from 'rxjs';

export class DarkMapToggleTool extends MapTool {

  override menuItemConfig = (context: MapToolContext) => ({
    icon: context.injector.get(MapLayersService).darkMapEnabled$.pipe(map(enabled => enabled ? 'theme-light' : 'theme-dark')),
  });

  override execute = (ctx: MapToolContext) => {
    ctx.injector.get(MapLayersService).toggleDarkMap();
    return of(true);
  }

}
