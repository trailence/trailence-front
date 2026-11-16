import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { MapState } from '../map-state';
import { Injector, NgZone } from '@angular/core';
import { MapRenderer, MapRendererType } from './map-renderer';
import { AbstractComponent } from '@trailence/utils/component-utils';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';
import { MapEvents } from '../map-events';
import { WEBGL_SUPPORT } from '@trailence/services/map/map-layers.service';

export class MapRendererInitializer {

  constructor(
    private readonly injector: Injector,
    private readonly containerId: string,
    private readonly mapState: MapState,
    private readonly component: AbstractComponent,
    private readonly events: MapEvents,
    map$: BehaviorSubject<MapRenderer | undefined>,
  ) {
    this.subscription = injector.get(NgZone).runOutsideAngular(() => {
      return combineLatest([component.visible$, mapState.is3d$, map$, this.initializing$])
      .pipe(
        debounceTimeExtended(1, 100),
      )
      .subscribe(([visible, is3d, currentMap, initializing]) => {
        if (!visible || initializing) return;
        const expectedType: MapRendererType = is3d && WEBGL_SUPPORT ? 'maplibre' : 'leaflet';
        if (currentMap?.type === expectedType) return;
        this.initializing$.next(true);
        map$.next(undefined);
        if (currentMap?.type === 'maplibre' && mapState.pitch3d > 0) {
          const pitch = mapState.pitch3d;
          currentMap.setPitch(0, 900);
          setTimeout(() => {
            this.launchInit(currentMap, map$);
            mapState.pitch3d = pitch;
          }, 1000);
        } else {
          this.launchInit(currentMap, map$);
        }
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

  private launchInit(currentMap: MapRenderer | undefined, map$: BehaviorSubject<MapRenderer | undefined>): void {
    currentMap?.destroy();
    setTimeout(() => {
      void this.init(0, currentMap)
      .then(newMap => {
        this.initializing$.next(false);
        if (!newMap) return;
        map$.next(newMap);
      });
    }, 0);
  }

  private async init(trial: number, previous: MapRenderer | undefined): Promise<MapRenderer | undefined> {
    if (this.destroyed || !this.component.visible) return undefined;
    const container = document.getElementById(this.containerId);
    if (!container?.clientHeight) {
      return new Promise(resolve => {
        setTimeout(() => this.init(trial + 1, previous).then(resolve), trial < 10 ? trial * 10 : 250);
      });
    }
    return this.mapState.is3d ?
        import('./maplibre/maplibre')
        .then(module => new module.MapLibre(this.injector, this.containerId, this.mapState, this.events))
        .then(maplibre => maplibre.init(this.component, previous !== undefined).then(() => maplibre))
      :
        import('./leaflet/leaflet')
        .then(module => new module.Leaflet(this.injector, this.containerId, this.mapState, this.events))
        .then(leaflet => leaflet.init().then(() => leaflet))
      ;
  }

}
