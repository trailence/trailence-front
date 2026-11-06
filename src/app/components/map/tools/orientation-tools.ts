import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { distinctUntilChanged, map, Observable, of, switchMap } from 'rxjs';
import { MapTool, MapToolGroup } from '../map-tool';
import { MapComponent } from '../map.component';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { RotateMode } from '../map-state';

export const OrientationToolGroup: MapToolGroup = {
  id: 'orientation',
  pane: 'left',
  order: -1000,
};

export class RotationTool implements MapTool {
  readonly group = 'orientation';
  readonly order = 0;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setIcon('compass')
      .setAction(event => {
        void import('./rotate-popover/rotate-popover.component')
        .then(rotate => rotate.openRotatePopover(injector, event, mapComponent));
      });
    return mapComponent.renderer$.pipe(
      filterDefined(),
      switchMap(renderer => renderer.mapState.rotateMode$.pipe(
        map(rotateMode => {
          switch(rotateMode) {
            case RotateMode.NORTH: return '';
            case RotateMode.HEADING: return 'tertiary';
            case RotateMode.DEVICE_ORIENTATION: return 'primary';
            case RotateMode.CUSTOM: return 'secondary';
          }
        }),
        distinctUntilChanged(),
        switchMap(color => {
          item.setTextColor(color);
          const cssVariables$: Observable<{[key: string]: string} | undefined> = color === '' ? of(undefined) : renderer.mapState.bearing$.pipe(map(bearing => ({'--icon-rotate': bearing + 'deg'} as {[key: string]: string})));
          return cssVariables$.pipe(
            map(cssVariables => {
              item.setCssVariables(cssVariables);
              return item;
            })
          );
        }),
      )),
    )
  }
}
