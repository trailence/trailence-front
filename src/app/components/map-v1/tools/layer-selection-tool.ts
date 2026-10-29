import * as L from 'leaflet';
import { ModalController } from '@ionic/angular';
import { MapLayersService } from '@trailence/services/map/map-layers.service';
import { MapTool, MapToolContext } from './tool.interface';
import { Observable } from 'rxjs';
import { latLngBoundsToEarthBBox } from '@trailence/utils/leaflet-utils';

export class MapLayerSelectionTool extends MapTool {

  constructor() {
    super();
    this.icon = 'layers';
    this.execute = (ctx: MapToolContext) => this._execute(ctx);
  }

  private _execute(ctx: MapToolContext): Observable<any> {
    const modalController = ctx.injector.get(ModalController);
    return new Observable(subscriber => {
      void import('../../map-layer-selection/map-layer-selection.component')
      .then(module => modalController.create({
        component: module.MapLayerSelectionComponent,
        componentProps: {
          buttons: true,
          popup: true,
          enableOverlays: true,
          bbox: latLngBoundsToEarthBBox(ctx.map.getBounds()),
          initialSelection: [ctx.mapComponent.getState().tilesName],
          onSelectionChanged: (selection: string[]) => {
            if (selection.length > 0) {
              const service = ctx.injector.get(MapLayersService);
              const layer = service.layers.find(layer => layer.name === selection[0]);
              if (layer) {
                let found: L.Layer | undefined = undefined;
                ctx.map.eachLayer(current => {
                  const id = (current as any)['_trailenceMapLayerId'];
                  if (id) {
                    if (id === layer.name) found = current;
                    else if (service.layers.some(l => l.name === id)) ctx.map.removeLayer(current);
                  }
                });
                if (found) {
                  if (!ctx.map.hasLayer(found)) ctx.map.addLayer(found);
                } else {
                  ctx.map.addLayer(layer.create());
                }
                ctx.mapComponent.getState().tilesName = layer.name;
              }
            }
            void modalController.dismiss();
          },
        }
      }))
      .then(modal => {
        void modal.present();
        void modal.onDidDismiss().then(() => subscriber.complete()); // NOSONAR
      });
    });
  }

}
