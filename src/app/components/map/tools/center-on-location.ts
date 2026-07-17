import { map, Observable, of } from 'rxjs';
import { MapTool, MapToolContext } from './tool.interface';
import { MenuItemConfig } from '../../menus/menu-item';

export class MapCenterOnPositionTool extends MapTool {

  constructor(
    private readonly visible$: Observable<boolean>,
    private readonly following$: Observable<boolean>,
  ) {
    super();
  }

  override menuItemConfig: MenuItemConfig = {
    icon: 'center-on-location',
    visible: this.visible$,
    textColor: this.following$.pipe(map(following => following ? 'light' : 'dark')),
    backgroundColor: this.following$.pipe(map(following => following ? 'dark' : '')),
  };

  override execute = (ctx: MapToolContext) => {
    ctx.mapComponent.toggleCenterOnLocation();
    return of(true);
  };

}
