import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { distinctUntilChanged, map, Observable, switchMap } from 'rxjs';
import { MapTool } from '../map-tool';
import { MapComponent } from '../map.component';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';

export class ZoomInTool implements MapTool {

  readonly pane = 'left';
  readonly order = -1000002;

  createMenuItem$(_: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setIcon('plus')
      .setAction(() => {
        mapComponent.renderer?.zoomIn();
      });
    return mapComponent.renderer$.pipe(
      filterDefined(),
      switchMap(renderer => renderer.mapState.zoom$.pipe(
        map(zoom => zoom >= renderer.getMaxZoom()),
        distinctUntilChanged(),
        map(disabled => {
          item.setDisabled(disabled);
          return item;
        })
      ))
    )
  }

}

export class ZoomLevelLabel implements MapTool {

  readonly pane = 'left';
  readonly order = -1000001;

    createMenuItem$(_: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setDisabled(true);
    return mapComponent.renderer$.pipe(
      filterDefined(),
      switchMap(renderer => renderer.mapState.zoom$.pipe(
        map(zoom => zoom.toLocaleString('en', {maximumFractionDigits: 1})),
        distinctUntilChanged(),
        map(zoom => {
          item.setFixedLabel(zoom);
          return item;
        })
      ))
    )
  }

}

export class ZoomOutTool implements MapTool {

  readonly pane = 'left';
  readonly order = -1000000;

  createMenuItem$(_: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setIcon('minus')
      .setAction(() => {
        mapComponent.renderer?.zoomOut();
      });
    return mapComponent.renderer$.pipe(
      filterDefined(),
      switchMap(renderer => renderer.mapState.zoom$.pipe(
        map(zoom => zoom <= renderer.getMinZoom()),
        distinctUntilChanged(),
        map(disabled => {
          item.setDisabled(disabled);
          return item;
        })
      ))
    )
  }

}
