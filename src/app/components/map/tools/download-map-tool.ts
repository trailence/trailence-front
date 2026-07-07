import { Trail } from 'src/app/model/trail';
import { MapTool, MapToolContext } from './tool.interface';
import { of } from 'rxjs';

export class DownloadMapTool extends MapTool {

  constructor(
    trail: Trail | undefined,
  ) {
    super();
    this.icon = 'download';
    this.disabled = (ctx: MapToolContext) => ctx.map.getZoom() < 12;
    this.execute = (ctx: MapToolContext) => {
      import('../../../services/functions/map-download')
      .then(m => m.openMapDownloadDialog(ctx.injector, trail ? [trail] : [], ctx.map.getBounds(), ctx.mapComponent.getState().tilesName));
      return of(true);
    };
  }

}
