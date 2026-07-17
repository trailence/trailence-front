import { Trail } from 'src/app/model/trail';
import { MapTool, MapToolContext, MenuItemConfigProvider } from './tool.interface';
import { map, of } from 'rxjs';

export class DownloadMapTool extends MapTool {

  constructor(
    private readonly trail: Trail | undefined,
  ) {
    super();
  }

  override menuItemConfig: MenuItemConfigProvider = (ctx: MapToolContext) => ({
    icon: 'download',
    disabled: ctx.mapComponent.getState().zoomInt$.pipe(map(zoom => zoom < 12)),
  })

  override execute = (ctx: MapToolContext) => {
    import('../../../services/functions/map-download')
    .then(m => m.openMapDownloadDialog(ctx.injector, this.trail ? [this.trail] : [], ctx.map.getBounds(), ctx.mapComponent.getState().tilesName));
    return of(true);
  };

}
