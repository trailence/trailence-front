import { from, Observable } from 'rxjs';
import { RotateMode } from '../map-state';
import { MapTool, MapToolContext, MapToolFunction } from './tool.interface';

export class RotateTool extends MapTool {

  override icon: MapToolFunction<string | undefined> = 'compass';
  override color: MapToolFunction<string | undefined> = (ctx: MapToolContext) => {
    switch (ctx.mapComponent.getState().rotateMode) {
      case RotateMode.NORTH: return '';
      case RotateMode.HEADING: return 'tertiary';
      case RotateMode.DEVICE_ORIENTATION: return 'primary';
      case RotateMode.CUSTOM: return 'secondary';
    }
  };
  override cssVariables: MapToolFunction<any> = (ctx: MapToolContext) => {
    switch (ctx.mapComponent.getState().rotateMode) {
      case RotateMode.NORTH: return undefined;
      case RotateMode.HEADING:
      case RotateMode.DEVICE_ORIENTATION:
      case RotateMode.CUSTOM: return {'--icon-rotate': ctx.mapComponent.getState().bearing + 'deg'};
    }
  };

  override execute: ((ctx: MapToolContext, event: Event) => Observable<any>) | undefined = (ctx: MapToolContext, event: Event) => {
    return from(import('./rotate-popover/rotate-popover.component').then(rotate => rotate.openRotatePopover(ctx.injector, event, ctx.mapComponent)));
  };

}
