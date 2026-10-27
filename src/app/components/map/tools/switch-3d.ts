import { of } from 'rxjs';
import { MapTool, MapToolContext } from './tool.interface';

export class Switch3dTool extends MapTool {

  override icon = (ctx: MapToolContext) => ctx.mapComponent.getState().is3d ? '2d' : '3d';
  override execute = (ctx: MapToolContext) => {
    ctx.mapComponent.toggle3d();
    return of(true);
  };

}
