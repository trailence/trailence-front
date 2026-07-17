import { BehaviorSubject, combineLatest, map, Observable, of } from 'rxjs';
import { MapTool, MapToolContext, MenuItemConfigProvider } from './tool.interface';

export class MapToggleBubblesTool extends MapTool {

  constructor(
    private readonly activated$: BehaviorSubject<boolean>,
    private readonly available$: Observable<boolean>,
  ) {
    super();
  }

  override menuItemConfig: MenuItemConfigProvider = (ctx: MapToolContext) => ({
    icon: this.activated$.pipe(map(activated => activated ? 'path' : 'bubbles')),
    visible: combineLatest([this.available$, ctx.mapComponent.canFitMapBounds$()]).pipe(
      map(([available, canFitMapBounds]) => available && canFitMapBounds),
    ),
  });

  override execute = () => {
    this.activated$.next(!this.activated$.value);
    return of(true);
  };

}
