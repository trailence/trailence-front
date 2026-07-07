import { BehaviorSubject, of } from 'rxjs';
import { MapTool, MapToolContext } from './tool.interface';

export class MapToggleBubblesTool extends MapTool {

  constructor(
    activated: BehaviorSubject<boolean>,
    available: () => boolean,
  ) {
    super();
    this.icon = () => activated.value ? 'path' : 'bubbles';
    this.visible = (ctx: MapToolContext) => available() && ctx.mapComponent.canFitMapBounds();
    this.execute = () => {
      activated.next(!activated.value);
      return of(true);
    };
  }

}
