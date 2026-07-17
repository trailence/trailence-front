import { MapTool, MapToolContext, MenuItemConfigProvider } from './tool.interface';
import { map, of } from 'rxjs';

export class ZoomInTool extends MapTool {

  override menuItemConfig: MenuItemConfigProvider = ctx => ({
    icon: 'plus',
    disabled: ctx.mapComponent.getState().zoomInt$.pipe(map(zoom => zoom >= ctx.map.getMaxZoom())),
  });

  override execute = (ctx: MapToolContext) => {
    ctx.map.zoomIn();
    ctx.mapComponent.zoomed();
    return of(true);
  };

}

export class ZoomOutTool extends MapTool {

  override menuItemConfig: MenuItemConfigProvider = ctx => ({
    icon: 'minus',
    disabled: ctx.mapComponent.getState().zoomInt$.pipe(map(zoom => zoom <= 0)),
  });

  override execute = (ctx: MapToolContext) => {
    ctx.map.zoomOut();
    ctx.mapComponent.zoomed();
    return of(true);
  };

}

export class ZoomLevelTool extends MapTool {

  override menuItemConfig: MenuItemConfigProvider = ctx => ({
    label: ctx.mapComponent.getState().zoom$.pipe(map(zoom => zoom.toLocaleString('en', {maximumFractionDigits: 1}))),
    disabled: true,
  });

  override execute = () => of(true);
}
