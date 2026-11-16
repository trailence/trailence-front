import { ApplicationRef, ComponentRef, createComponent, ElementRef, EnvironmentInjector, Injector, ViewContainerRef } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { distinctUntilChanged, map, Observable, of, switchMap } from 'rxjs';
import { MapTool, MapToolGroup } from '../map-tool';
import { MapComponent } from '../map.component';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { MAX_PITCH_3D, MIN_PITCH_3D, RotateMode } from '../map-state';
import { IonRange } from '@ionic/angular';
import { MapLayersService } from '@trailence/services/map/map-layers.service';

export const OrientationToolGroup: MapToolGroup = {
  id: 'orientation',
  pane: 'left',
  order: -1000,
};

export class RotationTool implements MapTool {
  readonly group = OrientationToolGroup.id;
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

export class PitchTool implements MapTool {
  readonly group = OrientationToolGroup.id;
  readonly order = 1;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    let container: HTMLElement | undefined;
    const item = new MenuItem()
      .setIcon('altitude')
      .setVisible(mapComponent.renderer?.mapState?.is3d === true)
      .setAction(e => {
        if (container) {
          container.remove();
          container = undefined;
          return;
        }
        container = document.createElement('DIV');
        container.style.position = 'absolute';
        container.style.left = '40px';
        container.style.top = '50px';
        container.style.width = '40px';
        container.style.height = '200px';
        container.style.zIndex = '10000';
        container.style.backgroundColor = 'var(--ion-background-color)';
        const range = document.createElement('INPUT') as HTMLInputElement;
        range.type = 'range';
        range.min = '' +  MIN_PITCH_3D;
        range.max = '' + MAX_PITCH_3D;
        range.value = '' + mapComponent.renderer!.mapState.pitch3d;
        range.addEventListener('input', () => {
          mapComponent.renderer?.setPitch(range.valueAsNumber, undefined);
        });
        range.style.width = '180px';
        range.style.height = '40px';
        range.style.transform = 'rotate(90deg)';
        range.style.transformOrigin = '0 0';
        range.style.marginLeft = '40px';
        range.style.marginTop = '10px';
        container.appendChild(range);
        injector.get(ElementRef).nativeElement.appendChild(container);
      });
    return mapComponent.renderer$.pipe(
      switchMap(renderer => {
        if (!renderer) {
          item.setVisible(false);
          return of(item);
        }
        return renderer.mapState.is3d$.pipe(
          switchMap(is3d => {
            if (!is3d) {
              item.setVisible(false);
              return of(item);
            }
            item.setVisible(true);
            return renderer.mapState.pitch3d$.pipe(
              map(pitch => {
                item.setCssVariables({'--icon-rotate': (-90 + pitch) + 'deg'});
                return item;
              }),
            );
          })
        );
      })
    );
  }
}
