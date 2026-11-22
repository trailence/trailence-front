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
    private readonly component: AbstractComponent<any>,
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
            this.launchInit(currentMap, map$, expectedType);
            mapState.pitch3d = pitch;
          }, 1000);
        } else {
          setTimeout(() => this.launchInit(currentMap, map$, expectedType), 0);
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

  private launchInit(currentMap: MapRenderer | undefined, map$: BehaviorSubject<MapRenderer | undefined>, type: MapRendererType): void {
    void this.init(0, currentMap, type)
    .then(newMap => {
      this.initializing$.next(false);
      if (!newMap) return;
      map$.next(newMap);
    });
  }

  private async init(trial: number, previous: MapRenderer | undefined, type: MapRendererType): Promise<MapRenderer | undefined> {
    if (this.destroyed || !this.component.visible) return undefined;
    const container = document.getElementById(this.containerId + '-' + type);
    if (container) container.style.display = 'block';
    if (!container?.clientHeight) {
      return new Promise(resolve => {
        setTimeout(() => this.init(trial + 1, previous, type).then(resolve), trial < 10 ? trial * 10 : 250);
      });
    }
    const previousContainer = previous ? document.getElementById(this.containerId + '-' + previous.type) : undefined;
    if (previousContainer) previousContainer.style.zIndex = '10000';
    container.style.zIndex = '';
    if (previous) container.style.opacity = '0.01';
    const switchType = () => {
      if (previous) {
        setTimeout(() => {
          if (previousContainer) {
            previousContainer.style.zIndex = '';
            previousContainer.style.opacity = '0.01';
          }
          container.style.opacity = '1';
          setTimeout(() => {
            previous.destroy();
            if (previousContainer) previousContainer.style.display = 'none';
          }, 125);
        }, 100);
      }
    };
    switch (type) {
      case 'leaflet':
        return import('./leaflet/leaflet')
          .then(module => new module.Leaflet(this.injector, this.containerId + '-leaflet', this.mapState, this.events))
          .then(leaflet => leaflet.init().then(() => {
            switchType();
            return leaflet;
          }));
      case 'maplibre':
        return import('./maplibre/maplibre')
          .then(module => new module.MapLibre(this.injector, this.containerId + '-maplibre', this.mapState, this.events))
          .then(maplibre => maplibre.init(this.component, previous !== undefined).then(() => {
            switchType();
            return maplibre;
          }));
    }
  }

}
