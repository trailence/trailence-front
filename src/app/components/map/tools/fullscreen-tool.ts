import { of } from 'rxjs';
import { MapTool, MapToolContext } from './tool.interface';

export class FullScreenTool extends MapTool {

  override icon = (ctx: MapToolContext) => ctx.mapComponent.isFullScreen ? 'full-screen-off' : 'full-screen-on';
  override execute = (ctx: MapToolContext) => {
    ctx.mapComponent.toggleFullScreen();
    return of(true);
  };

}
