import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { distinctUntilChanged, map, Observable, of, switchMap } from 'rxjs';
import { MapTool, MapToolGroup } from '../map-tool';
import { MapComponent } from '../map.component';
import { ScreenLockService } from '@trailence/services/screen-lock/screen-lock.service';
import { TraceRecorderService } from '@trailence/services/trace-recorder/trace-recorder.service';

export const PhoneLockGroup: MapToolGroup = {
  id: 'phone-lock',
  pane: 'right',
  order: 250,
}

export class PhoneLockTool implements MapTool {
  readonly group = 'phone-lock';
  readonly order = 0;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const service = injector.get(ScreenLockService);
    const recorder = injector.get(TraceRecorderService);
    const item = new MenuItem()
      .setIcon('phone-lock')
      .setVisible(false)
      .setAction(() => {
        service.toggle();
      });
    return service.available$.pipe(
      distinctUntilChanged(),
      switchMap(available => {
        if (!available) {
          item.setVisible(false);
          return of(item);
        }
        return recorder.current$.pipe(
          map(recording => !!recording),
          distinctUntilChanged(),
          switchMap(recording => {
            if (!recording) {
              item.setVisible(false);
              return of(item);
            }
            return service.enabled$.pipe(
              map(enabled => {
                item.setTextColor(enabled ? 'light' : 'dark');
                item.setBackgroundColor(enabled ? 'dark' : '');
                return item;
              })
            );
          })
        );
      })
    );
  }
}
