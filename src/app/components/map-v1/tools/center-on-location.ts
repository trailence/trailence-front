import { BehaviorSubject, of } from 'rxjs';
import { MapTool, MapToolContext } from './tool.interface';

export class MapCenterOnPositionTool extends MapTool {

  constructor(
    getVisible: () => boolean,
    following$: BehaviorSubject<boolean>,
  ) {
    super();
    this.visible = (ctx: MapToolContext) => getVisible();
    this.icon = 'center-on-location';
    this.color = () => following$.value ? 'light' : 'dark';
    this.backgroundColor = () => following$.value ? 'dark' : '';
    this.execute = (ctx: MapToolContext) => {
      ctx.mapComponent.toggleCenterOnLocation();
      return of(true);
    };
  }

}
