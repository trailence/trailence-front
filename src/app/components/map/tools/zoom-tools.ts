import { Injector } from '@angular/core';
import { MapComponent } from '../map.component';
import { MapTool, MapToolContext } from './tool.interface';
import { of } from 'rxjs';

export class ZoomInTool extends MapTool {

  constructor() {
    super();
    this.icon = 'plus';
    this.disabled = (ctx: MapToolContext) => ctx.map.getZoom() >= ctx.map.getMaxZoom();
    this.execute = (ctx: MapToolContext) => {
      ctx.map.zoomIn();
      ctx.mapComponent.zoomed();
      return of(true);
    }
  }

}

export class ZoomOutTool extends MapTool {

  constructor() {
    super();
    this.icon = 'minus';
    this.disabled = (ctx: MapToolContext) => ctx.map.getZoom() <= 0;
    this.execute = (ctx: MapToolContext) => {
      ctx.map.zoomOut();
      ctx.mapComponent.zoomed();
      return of(true);
    }
  }

}

export class ZoomLevelTool extends MapTool {

  constructor() {
    super();
    this.label = (ctx: MapToolContext) => ctx.map.getZoom().toLocaleString('en', {maximumFractionDigits: 1});
    this.disabled = true;
  }
}
