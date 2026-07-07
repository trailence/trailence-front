import * as L from 'leaflet';
import { ModalController } from '@ionic/angular/standalone';
import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { MapTool, MapToolContext } from './tool.interface';
import { Observable } from 'rxjs';

export class MapLayerSelectionTool extends MapTool {

  constructor() {
    super();
    this.icon = 'layers';
    this.execute = (ctx: MapToolContext) => this._execute(ctx);
  }


  private _execute(ctx: MapToolContext): Observable<any> {
    const modalController = ctx.injector.get(ModalController);
    return new Observable(subscriber => {
      import('../../map-layer-selection/map-layer-selection.component')
      .then(module => modalController.create({
        component: module.MapLayerSelectionComponent,
        componentProps: {
          buttons: true,
          popup: true,
          enableOverlays: true,
          initialSelection: [ctx.mapComponent.getState().tilesName],
          onSelectionChanged: (selection: string[]) => {
            if (selection.length > 0) {
              const service = ctx.injector.get(MapLayersService);
              const layer = service.layers.find(layer => layer.name === selection[0]);
              if (layer) {
                let found: L.Layer | undefined = undefined;
                ctx.map.eachLayer(current => {
                  const id = (current.options as any)['id']; //NOSONAR
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
