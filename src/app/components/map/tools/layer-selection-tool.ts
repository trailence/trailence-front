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
          initialSelection: [mapComponent.getState().tilesName],
          onSelectionChanged: (selection: string[]) => {
            if (selection.length > 0) {
              const layer = injector.get(MapLayersService).layers.find(layer => layer.name === selection[0]);
              if (layer) {
                let found = false;
                map.eachLayer(current => {
                  if ((current.options as any)['id'] === layer.name) { // NOSONAR
                    found = true;
                  }
                });
                if (!found) {
                  map.eachLayer(current => {
                    if ((current as any)['_url']) current.remove(); // NOSONAR
                  });
                  map.addLayer(layer.create());
                  mapComponent.getState().tilesName = layer.name;
                }
              }
            }
            modalController.dismiss();
          },
        }
      }))
      .then(modal => {
        modal.onDidDismiss().then(() => subscriber.complete());
        modal.present();
      });
    });
  }

}
