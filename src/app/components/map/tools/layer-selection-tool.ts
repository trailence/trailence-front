import { Injector } from '@angular/core';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { Observable, of } from 'rxjs';
import { MapTool } from '../map-tool';
import { MapComponent } from '../map.component';
import { ModalController } from '@ionic/angular';
import { MapLayersService } from '@trailence/services/map/map-layers.service';

export class MapLayerSelectionTool implements MapTool {
  readonly group = 'map-config';
  readonly order = 0;

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    return of(new MenuItem()
      .setIcon('layers')
      .setAction(() => {
        const renderer = mapComponent.renderer;
        if (!renderer) return;
        void import('../../map-layer-selection/map-layer-selection.component')
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
