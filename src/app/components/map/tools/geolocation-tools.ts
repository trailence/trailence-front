import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { BehaviorSubject, combineLatest, distinctUntilChanged, EMPTY, filter, map, Observable, of, share, Subscription, switchMap, tap } from 'rxjs';
import { MapTool, MapToolGroup } from '../map-tool';
import { MAP_INSETS, MapComponent } from '../map.component';
import { MapShowMyPositionService } from '@trailence/services/map/map-show-my-position.service';
import { GeolocationService } from '@trailence/services/geolocation/geolocation.service';
import { EarthBBox, earthBBox, EarthPoint, isPointInBBox, sameBbox, sameOptionalPosition, samePosition } from '@trailence/utils/latlng';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';
import { MapRenderer } from '../impl/map-renderer';

export const GeolocationToolGroup: MapToolGroup = {
  id: 'geolocation',
  pane: 'left',
  order: 1000,
};

export class ShowMyGeolocationTool implements MapTool {
  readonly group = 'geolocation';
  readonly order = 0;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const service = injector.get(MapShowMyPositionService);
    const item = new MenuItem()
      .setIcon('pin')
      .setVisible(false)
      .setAction(() => {
        service.toggleShown();
      });
    return service.shown$.pipe(
      map(shown => {
        item.setVisible(shown !== undefined);
        item.setIcon(shown ? 'pin-off' : 'pin');
        return item;
      })
    );
  }
}

const FOLLOW_LOCATION_DEFAULT_ZOOM = 16;
const FOLLOW_LOCATION_MIN_ZOOM = 13;
const FOLLOW_LOCATION_INSETS_PERCENT = 0.6;

export class CenterMapOnMyPositionTool implements MapTool {
  readonly group = 'geolocation';
  readonly order = 100;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const toggle$ = new BehaviorSubject<boolean>(mapComponent.options.autoFollowMyPosition === true);
    const item = new MenuItem()
      .setIcon('center-on-location')
      .setVisible(false)
      .setAction(() => {
        toggle$.next(!toggle$.value);
      });

    const position$ = injector.get(GeolocationService).watched$.pipe(
      map(latestPosition => latestPosition?.l !== undefined && latestPosition.n !== undefined ? {lat: latestPosition.l, lng: latestPosition.n} : undefined),
      distinctUntilChanged(sameOptionalPosition),
      share(),
    );
    const mapState$ = mapComponent.renderer$.pipe(
      filterDefined(),
      switchMap(renderer => combineLatest([renderer.mapState.center$, renderer.mapState.zoom$]).pipe(
        debounceTimeExtended(0, 100),
        map(([center, zoom]) => ({renderer, center, zoom})),
      )),
      share(),
    );
    const insets$ = mapState$.pipe(
      map(state => {
        const size = state.renderer.getViewportSize();
        if (!size) return undefined;
        const topLeft = state.renderer.unprojectFromViewport({
          x: MAP_INSETS.left + size.x,
          y: MAP_INSETS.top + size.y,
        });
        const bottomRight = state.renderer.unprojectFromViewport({
          x: size.x - MAP_INSETS.right,
          y: size.y - MAP_INSETS.bottom,
        });
        const topLeftTolerance = state.renderer.unprojectFromViewport({
          x: Math.round(MAP_INSETS.left + size.x * FOLLOW_LOCATION_INSETS_PERCENT * 0.5),
          y: Math.round(MAP_INSETS.top + size.y * FOLLOW_LOCATION_INSETS_PERCENT * 0.5)
        });
        const bottomRightTolerance = state.renderer.unprojectFromViewport({
          x: Math.round(size.x - MAP_INSETS.right - size.x * FOLLOW_LOCATION_INSETS_PERCENT * 0.5),
          y: Math.round(size.y - MAP_INSETS.bottom - size.y * FOLLOW_LOCATION_INSETS_PERCENT * 0.5)
        });
        return {visible: earthBBox(topLeft, bottomRight), centerArea: earthBBox(topLeftTolerance, bottomRightTolerance)};
      }),
      filterDefined(),
      share(),
    );

    let subscription: Subscription | undefined;
    return position$.pipe(
      map(pos => pos !== undefined),
      switchMap(live => {
        if (!live) {
          // no position live, no item
          subscription?.unsubscribe();
          subscription = undefined;
          item.setVisible(false);
          return of(item);
        }
        // live, listen to toggle
        return toggle$.pipe(
          map(enabled => {
            if (!enabled) {
              subscription?.unsubscribe();
              subscription = undefined;
              item.setTextColor('dark');
              item.setBackgroundColor('');
              return item;
            }
            // enabled
            item.setTextColor('light');
            item.setBackgroundColor('dark');
            if (!subscription) subscription = this.subscribe(position$, insets$, mapState$, toggle$);
            return item;
          })
        );
      })
    );
  }

  private subscribe(
    position$: Observable<EarthPoint | undefined>,
    insets$: Observable<{visible: EarthBBox, centerArea: EarthBBox}>,
    mapState$: Observable<{renderer: MapRenderer, center: EarthPoint, zoom: number}>,
    toggle$: BehaviorSubject<boolean>,
  ): Subscription {
    let previous: {pos: EarthPoint, zoom: number, insets: {visible: EarthBBox, centerArea: EarthBBox}} | undefined;
    return combineLatest([position$.pipe(filterDefined()), insets$, mapState$]).subscribe(
      ([pos, insets, state]) => {
        if (!toggle$.value) return; // just in case...
        if (previous !== undefined) {
          // when going off, toggle off
          if (state.zoom !== previous.zoom && state.zoom < FOLLOW_LOCATION_MIN_ZOOM) {
            toggle$.next(false);
          } else if (!sameBbox(insets.visible, previous.insets.visible) && !isPointInBBox(pos, insets.visible)) {
            toggle$.next(false);
          } else if (!samePosition(pos, previous.pos) && !isPointInBBox(pos, insets.centerArea)) {
            state.renderer.goTo(pos);
          }
        } else {
          state.renderer.goTo(pos, state.zoom < FOLLOW_LOCATION_MIN_ZOOM ? FOLLOW_LOCATION_DEFAULT_ZOOM : undefined);
        }
        previous = {pos, zoom: state.zoom, insets};
      }
    );
  }

}
