import * as L from 'leaflet';
import { Injector } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { MapTool } from './tool.interface';
import { Observable } from 'rxjs';
import { MapComponent } from '../map.component';

export class MapLayerSelectionTool extends MapTool {

  constructor() {
    super();
    this.icon = 'layers';
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => this._execute(map, mapComponent, injector);
  }


  private _execute(map: L.Map, mapComponent: MapComponent, injector: Injector): Observable<any> {
    const modalController = injector.get(ModalController);
    return new Observable(subscriber => {
      import('../../map-layer-selection/map-layer-selection.component')
      .then(module => modalController.create({
        component: module.MapLayerSelectionComponent,
        componentProps: {
          buttons: true,
          popup: true,
          enableOverlays: true,
          initialSelection: [mapComponent.getState().tilesName],
          initialOverlaysSelection: mapComponent.getState().overlays,
          onSelectionChanged: (selection: string[]) => {
            if (selection.length > 0) {
              const service = injector.get(MapLayersService);
              const layer = service.layers.find(layer => layer.name === selection[0]);
              if (layer) {
                let found: L.Layer | undefined = undefined;
                map.eachLayer(current => {
                  const id = (current.options as any)['id'];
                  if (id) {
                    if (id === layer.name) found = current;
                    else if (service.layers.find(l => l.name === id)) map.removeLayer(current);
                  }
                });
                if (found) {
                  if (!map.hasLayer(found)) map.addLayer(found);
                } else {
                  map.addLayer(layer.create());
                }
                mapComponent.getState().tilesName = layer.name;
              }
            }
            modalController.dismiss();
          },
          onOverlaysSelectionChanged: (selection: string[]) => {
            const service = injector.get(MapLayersService);
            const missing = [...selection];
            map.eachLayer(layer => {
              const id = (layer.options as any)['id'];
              if (id && !!service.overlays.find(l => l.name === id)) {
                const index = missing.indexOf(id);
                if (index >= 0) missing.splice(index, 1); else map.removeLayer(layer);
              }
            });
            for (let missingId of missing) {
              const layer = service.overlays.find(o => o.name === missingId);
              if (layer) map.addLayer(layer.create());
            }
            mapComponent.getState().overlays = [...selection];
          }
        }
      }))
      .then(modal => {
        modal.onDidDismiss().then(() => subscriber.complete());
        modal.present();
      });
    });
  }

}
