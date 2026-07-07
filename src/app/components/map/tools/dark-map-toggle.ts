import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { MapTool, MapToolContext } from './tool.interface';
import { of } from 'rxjs';

export class DarkMapToggleTool extends MapTool {

  constructor() {
    super();
    this.icon = (ctx: MapToolContext) => ctx.injector.get(MapLayersService).darkMapEnabled ? 'theme-light' : 'theme-dark';
    this.execute = (ctx: MapToolContext) => {
      ctx.injector.get(MapLayersService).toggleDarkMap();
      return of(true);
    };
  }

}
