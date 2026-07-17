import { distinctUntilChanged, map, Observable, of, switchMap } from 'rxjs';
import { MapTool, MapToolContext, MenuItemConfigProvider } from './tool.interface';
import { MapGeolocationService } from 'src/app/services/map/map-geolocation.service';

export class MapShowPositionTool extends MapTool {

  constructor(
    private readonly mapGeolocation: MapGeolocationService,
    private readonly disableShowPosition$: Observable<number>,
  ) {
    super();
  }

  override menuItemConfig: MenuItemConfigProvider = (ctx: MapToolContext) => ({
    icon: this.mapGeolocation.showPosition$.pipe(map(show => show ? 'pin-off' : 'pin')),
    visible: this.mapGeolocation.recorder.current$.pipe(
      map(recording => !recording),
      distinctUntilChanged(),
      switchMap(visible => {
        if (!visible) return of(false);
        return this.disableShowPosition$.pipe(map(nb => nb === 0));
      }),
    ),
  });

  override execute = (ctx: MapToolContext) => {
    ctx.injector.get(MapGeolocationService).toggleShowPosition();
    return of(true);
  };

}
