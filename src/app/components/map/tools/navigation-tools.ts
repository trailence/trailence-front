import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { combineLatest, debounceTime, distinctUntilChanged, map, Observable, switchMap, tap } from 'rxjs';
import { MapTool, MapToolGroup } from '../map-tool';
import { MapComponent } from '../map.component';
import { bboxFromList, EarthBBox, sameOptionalBbox } from '@trailence/utils/latlng';
import { MapStateHistoryEntry, MapStateHistoryService } from '@trailence/services/map/map-state-history.service';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { combineLatestSafe } from '@trailence/utils/rxjs/combineLatestSafe';

export const NavigationToolGroup: MapToolGroup = {
  id: 'navigation',
  pane: 'left',
  order: 0,
};

export class FitBoundsTool implements MapTool {
  readonly group = 'navigation';
  readonly order = 0;

  createMenuItem$(_: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    let bounds: EarthBBox | undefined = undefined;
    const item = new MenuItem()
      .setIcon('zoom-fit-bounds')
      .setDisabled(true)
      .setAction(() => {
        mapComponent.renderer?.fitBounds(bounds!, true);
      });
    return mapComponent.mapElements$.pipe(
      switchMap(elements => combineLatestSafe(elements.map(e => e.fitBounds$))),
      map(elementsBounds => bboxFromList(elementsBounds.filter(b => !!b))),
      distinctUntilChanged(sameOptionalBbox),
      map(bbox => {
        bounds = bbox;
        item.setDisabled(bbox === undefined);
        return item;
      })
    );
  }
}

export class GoBackTool implements MapTool {
  readonly group = 'navigation';
  readonly order = 1;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const service = injector.get(MapStateHistoryService);
    let entry: MapStateHistoryEntry | undefined = undefined;
    const item = new MenuItem()
      .setIcon('undo')
      .setDisabled(true)
      .setAction(() => {
        if (entry !== undefined) {
          service.popState(entry);
          mapComponent.renderer?.goTo(entry.center, entry.zoom, false);
        }
      });
    return mapComponent.renderer$.pipe(
      filterDefined(),
      switchMap(renderer => combineLatest([renderer.mapState.center$, renderer.mapState.zoom$])),
      debounceTime(100),
      switchMap(([center, zoom]) => service.canGoBack$(center, zoom)),
      tap(e => { entry = e; }),
      distinctUntilChanged((e1, e2) => (e1 === undefined) === (e2 === undefined)),
      map(e => {
        item.setDisabled(e === undefined);
        return item;
      }),
    );
  }
}
