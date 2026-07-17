import { MapTool, MapToolContext, MenuItemConfigProvider } from './tool.interface';
import { distinctUntilChanged, from, map, of, switchMap } from 'rxjs';
import { ScreenLockService } from 'src/app/services/screen-lock/screen-lock.service';
import { MapGeolocationService } from 'src/app/services/map/map-geolocation.service';

export class PhoneLockTool extends MapTool {

  constructor(
    private readonly screenLockService: ScreenLockService,
    private readonly mapGeolocation: MapGeolocationService,
  ) {
    super();
  }

  override menuItemConfig: MenuItemConfigProvider = (ctx: MapToolContext) => ({
    icon: 'phone-lock',
    visible: this.screenLockService.available$.pipe(
      switchMap(available => {
        if (!available) return of(false);
        return this.mapGeolocation.recorder.current$.pipe(
          map(recording => !!recording),
          distinctUntilChanged(),
        );
      })
    ),
    textColor: this.screenLockService.enabled$.pipe(map(enabled => enabled ? 'light' : 'dark')),
    backgroundColor: this.screenLockService.enabled$.pipe(map(enabled => enabled ? 'dark' : '')),
  });

  override execute = () => {
    const newValue = !this.screenLockService.enabled;
    return from(this.screenLockService.set(newValue));
  };

}
