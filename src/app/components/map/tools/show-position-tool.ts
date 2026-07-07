import { of } from 'rxjs';
import { MapTool, MapToolContext } from './tool.interface';
import { MapGeolocationService } from 'src/app/services/map/map-geolocation.service';

export class MapShowPositionTool extends MapTool {

  constructor() {
    super();
    this.visible = false;
    this.icon = 'pin';
    this.execute = (ctx: MapToolContext) => {
      ctx.injector.get(MapGeolocationService).toggleShowPosition();
      return of(true);
    };
  }

}
