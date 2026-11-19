import { ElementRef, Injector } from '@angular/core';
import { MapTool, MapToolGroup } from '../map-tool';
import { MapComponent } from '../map.component';
import { BehaviorSubject, combineLatest, distinctUntilChanged, EMPTY, map, Observable, of, switchMap, tap } from 'rxjs';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { ModalController } from '@ionic/angular';
import { countMapAdditionsOptions, hasForbiddenWaysEnabled, hasPermissiveWaysEnabled, hasPoisEnabled, MapAdditionsOptions, MapAdditionsService } from '@trailence/services/map/map-additions.service';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';
import { AnyMapElement, MapElement } from '../map-element';
import { Subscriptions } from '@trailence/utils/rxjs/subscription-utils';
import { PoisMapElement } from '../elements/pois';
import { POI } from '@trailence/services/map/poi';
import { Way, WayPermission } from '@trailence/services/map/way';
import { WaysMapElement } from '../elements/ways';
import { Color } from '@trailence/utils/color';

export const MapLayersToolsGroup: MapToolGroup = {
  id: 'map-layers',
  pane: 'right',
  order: -1000000,
};

export class MapLayerSelectionTool implements MapTool {
  readonly group = MapLayersToolsGroup.id;
  readonly order = 0;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    return of(new MenuItem()
      .setIcon('layers')
      .setAction(() => {
        const renderer = mapComponent.renderer;
        if (!renderer) return;
        void import('./map-layer-selection/map-layer-selection.component')
        .then(module => injector.get(ModalController).create({
          component: module.MapLayerSelectionComponent,
          componentProps: {
            buttons: true,
            popup: true,
            enableOverlays: true,
            bbox: renderer.getBounds(),
            initialSelection: [renderer.mapState.tilesName],
            onSelectionChanged: (selection: string[]) => {
              if (selection.length > 0) {
                renderer.mapState.tilesName = selection[0];
              }
              void injector.get(ModalController).dismiss();
            },
          }
        }))
        .then(modal => modal.present());
      })
    );
  }
}


export class MapAdditionsTool implements MapTool {
  readonly group = MapLayersToolsGroup.id;
  readonly order = 100;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setIcon('info')
      .setAction(() => void this.openModal(injector, mapComponent));

    const elements$ = new BehaviorSubject<AnyMapElement[]>([]);
    mapComponent.setSource('map-additions-tool', elements$);
    let poisElement: PoisMapElement | undefined = undefined;
    let permissiveWays: WaysMapElement | undefined = undefined;
    let forbiddenWays: WaysMapElement | undefined = undefined;
    const updateElements = () => {
      const elements: AnyMapElement[] = [];
      if (poisElement !== undefined) elements.push(poisElement);
      if (permissiveWays !== undefined) elements.push(permissiveWays);
      if (forbiddenWays !== undefined) elements.push(forbiddenWays);
      elements$.next(elements);
    };
    const setPois = (pois: POI[]) => {
      if (pois.length === 0) {
        if (poisElement !== undefined) {
          poisElement = undefined;
          updateElements();
        }
      } else if (poisElement !== undefined) {
        (poisElement.pois$ as BehaviorSubject<POI[]>).next(pois);
      } else {
        poisElement = new PoisMapElement('map-additions-pois', new BehaviorSubject<POI[]>(pois));
        updateElements();
      }
    };
    const setPermissiveWays = (ways: Way[]) => {
      if (ways.length === 0) {
        if (permissiveWays !== undefined) {
          permissiveWays = undefined;
          updateElements();
        }
      } else if (permissiveWays !== undefined) {
        (permissiveWays.ways$ as BehaviorSubject<Way[]>).next(ways);
      } else {
        permissiveWays = new WaysMapElement(
          'map-additions-permissive-ways',
          new BehaviorSubject<Way[]>(ways),
          Color.fromCssVariable('--way-permissive-color', injector.get(ElementRef).nativeElement).setAlpha(0.75),
          3, [4, 2],
        );
        updateElements();
      }
    };
    const setForbiddenWays = (ways: Way[]) => {
      if (ways.length === 0) {
        if (forbiddenWays !== undefined) {
          forbiddenWays = undefined;
          updateElements();
        }
      } else if (forbiddenWays !== undefined) {
        (forbiddenWays.ways$ as BehaviorSubject<Way[]>).next(ways);
      } else {
        forbiddenWays = new WaysMapElement(
          'map-additions-forbidden-ways',
          new BehaviorSubject<Way[]>(ways),
          Color.fromCssVariable('--way-forbidden-color', injector.get(ElementRef).nativeElement).setAlpha(0.75),
          3, [4, 2],
        );
        updateElements();
      }
    };

    const service = injector.get(MapAdditionsService);

    return mapComponent.renderer$.pipe(
      switchMap(renderer => {
        if (!renderer) {
          item.setBadges(undefined);
          item.setSpinner(undefined);
          setPois([]);
          setPermissiveWays([]);
          setForbiddenWays([]);
          return of(item);
        }
        const getCount = () => renderer.mapState.overlays.length + countMapAdditionsOptions(renderer.mapState.additions);
        const updateBadge = () => {
          const count = getCount();
          if (count === 0) {
            if (item.getBadges().topRight !== undefined) {
              item.setBadgeTopRight(undefined);
              return true;
            }
            return false;
          }
          const newBadge = '' + getCount();
          if (item.getBadges().topRight?.text !== newBadge) {
            item.setBadgeTopRight({text: newBadge, color: undefined, fill: undefined});
            return true;
          }
          return false;
        };
        updateBadge();
        item.setSpinner(undefined);
        const item$ = new BehaviorSubject<MenuItem>(item);

        const overlays$ = renderer.mapState.overlays$.pipe(
          tap(() => {
            if (updateBadge()) item$.next(item);
          })
        );

        const additions$ = renderer.mapState.additions$.pipe(
          switchMap(additions => {
            let updated = updateBadge();
            if (countMapAdditionsOptions(additions) === 0) {
              if (item.getSpinner() !== undefined) {
                item.setSpinner(undefined);
                updated = true;
              }
              if (updated) item$.next(item);
              setPois([]);
              setPermissiveWays([]);
              setForbiddenWays([]);
              return EMPTY;
            }
            if (item.getSpinner() === undefined) {
              item.setSpinner('crescent');
              updated = true;
            }
            if (updated) item$.next(item);
            if (!hasPoisEnabled(additions)) setPois([]);
            if (!hasPermissiveWaysEnabled(additions)) setPermissiveWays([]);
            if (!hasForbiddenWaysEnabled(additions)) setForbiddenWays([]);
            return combineLatest([
              renderer.mapState.center$,
              renderer.mapState.zoom$.pipe(map(zoom => Math.floor(zoom)), distinctUntilChanged()),
            ]).pipe(
              debounceTimeExtended(0, 250, 100),
              switchMap(([center, zoom]) => {
                const bounds = renderer.getBounds();
                if (!bounds || zoom < 10) {
                  if (item.getSpinner() !== undefined) {
                    item.setSpinner(undefined);
                    item$.next(item);
                  }
                  setPois([]);
                  setPermissiveWays([]);
                  setForbiddenWays([]);
                  return EMPTY;
                }
                if (item.getSpinner() === undefined) {
                  item.setSpinner('crescent');
                  item$.next(item);
                }
                let pois: POI[] = [];
                let permissiveWays: Way[] = [];
                let forbiddenWays: Way[] = [];
                return service.getAdditions(bounds, additions).pipe(
                  tap(result => {
                    pois.push(...result.pois);
                    permissiveWays.push(...result.ways.filter(w =>
                      (w.footPermission === WayPermission.PERMISSIVE && !!additions.permissiveWays) ||
                      ((w.bicyclePermission === WayPermission.PERMISSIVE || w.bicyclePermission === WayPermission.DISMOUNT) && !!additions.permissiveBicycleWays)
                    ));
                    forbiddenWays.push(...result.ways.filter(w =>
                      (w.footPermission === WayPermission.FORBIDDEN && !!additions.forbiddenWays) ||
                      (w.bicyclePermission === WayPermission.FORBIDDEN && !!additions.forbiddenBicycleWays)
                    ));
                  }),
                  debounceTimeExtended(100, 100, undefined, (p,n) => n.done),
                  tap(result => {
                    setPois(pois);
                    setPermissiveWays(permissiveWays);
                    setForbiddenWays(forbiddenWays);
                    item.setSpinner(undefined);
                    item$.next(item);
                    // TODO partial
                  }),
                );
              }),
            );
          })
        );

        return new Observable<MenuItem>(subscriber => {
          const subscriptions = new Subscriptions();
          subscriptions.add(item$.subscribe(item => subscriber.next(item)));
          subscriptions.add(overlays$.subscribe());
          subscriptions.add(additions$.subscribe());
          return () => subscriptions.unsubscribe();
        });
      }),
    );
  }

  private async openModal(injector: Injector, mapComponent: MapComponent) {
    const modalController = injector.get(ModalController);
    const popupModule = await import('./additions-popup/additions-popup.component');
    const mapState = mapComponent.renderer?.mapState;
    if (!mapState) return;
    const modal = await modalController.create({
      component: popupModule.AdditionsPopupComponent,
      componentProps: {
        options: {...mapState.additions},
        onOptionsChange: (options: MapAdditionsOptions) => { mapState.additions = {...options}; },
        selectedOverlays: [...mapState.overlays],
        onOverlaysChange: (selection: string[]) => { mapState.overlays = selection; },
      },
      cssClass: 'small-modal'
    });
    await modal.present();
  }


}
