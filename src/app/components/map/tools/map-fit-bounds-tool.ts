import { MapTool, MapToolContext } from './tool.interface';
import { of } from 'rxjs';

export class MapFitBoundsTool extends MapTool {

  constructor() {
    super();
    this.icon = 'zoom-fit-bounds';
    this.execute = (ctx: MapToolContext) => {
      ctx.mapComponent.fitMapBounds(ctx.map);
      return of(true);
    };
    this.disabled = (ctx: MapToolContext) => {
      return !ctx.mapComponent.canFitMapBounds();
    };
  }

}
