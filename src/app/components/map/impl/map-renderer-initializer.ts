import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { MapState } from '../map-state';
import { Injector, NgZone } from '@angular/core';
import { MapRenderer, MapRendererType } from './map-renderer';
import { AbstractComponent } from '@trailence/utils/component-utils';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';

export class MapRendererInitializer {

  constructor(
    private readonly injector: Injector,
    private readonly containerId: string,
    private readonly mapState: MapState,
    private readonly component: AbstractComponent,
    map$: BehaviorSubject<MapRenderer | undefined>,
  ) {
    this.subscription = injector.get(NgZone).runOutsideAngular(() => {
      return combineLatest([component.visible$, mapState.is3d$, map$, this.initializing$])
      .pipe(
        debounceTimeExtended(1, 100),
      )
      .subscribe(([visible, is3d, currentMap, initializing]) => {
        if (!visible || initializing) return;
        const expectedType: MapRendererType = is3d ? 'maplibre' : 'leaflet';
        if (currentMap?.type === expectedType) return;
        this.initializing$.next(true);
        map$.next(undefined);
        currentMap?.destroy();
        setTimeout(() => {
          void this.init(0)
          .then(newMap => {
            this.initializing$.next(false);
            if (!newMap) return;
            map$.next(newMap);
          });
        }, 0);
      });
    });
  }

  private readonly subscription: Subscription;
  private readonly initializing$ = new BehaviorSubject<boolean>(false);
  private destroyed = false;

  public destroy(): void {
    this.destroyed = true;
    this.subscription.unsubscribe();
  }

  private async init(trial: number): Promise<MapRenderer | undefined> {
    if (this.destroyed || !this.component.visible) return undefined;
    const container = document.getElementById(this.containerId);
    if (!container?.clientHeight) {
      return new Promise(resolve => {
        setTimeout(() => this.init(trial + 1).then(resolve), trial < 10 ? trial * 10 : 250);
      });
    }
    const map$: Promise<MapRenderer> =
      this.mapState.is3d ?
        import('./maplibre/maplibre')
        .then(module => new module.MapLibre(this.injector, this.containerId, this.mapState))
      :
        import('./leaflet/leaflet')
        .then(module => new module.Leaflet(this.injector, this.containerId, this.mapState))
      ;
    return map$.then(impl => impl.init().then(() => impl));
  }

}
