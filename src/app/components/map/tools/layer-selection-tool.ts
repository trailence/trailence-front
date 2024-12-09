import L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { Injector } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { MapState } from '../map-state';
import { MapLayersService } from 'src/app/services/map/map-layers.service';

export class MapLayerSelectionTool extends L.Control {

  constructor(
    private readonly injector: Injector,
    private readonly mapState: MapState,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  public override onAdd(map: L.Map) {
    const button = MapToolUtils.createButton('layer-tool');
    button.style.color = 'black';
    const assets = this.injector.get(AssetsService);
    assets.loadSvg(assets.icons['layers']).subscribe(
      svg => {
        svg.style.width = '32px';
        svg.style.height = '32px';
        svg.style.margin = '3px 3px -2px 3px';
        button.appendChild(svg);
      }
    );
    button.onclick = async (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const modalController = this.injector.get(ModalController);
      const module = await import('../../map-layer-selection/map-layer-selection.component');
      const modal = await modalController.create({
        component: module.MapLayerSelectionComponent,
        componentProps: {
          buttons: true,
          popup: true,
          initialSelection: [this.mapState.tilesName],
          onSelectionChanged: (selection: string[]) => {
            modal.dismiss();
            if (selection.length > 0) {
              const layer = this.injector.get(MapLayersService).layers.find(layer => layer.name === selection[0]);
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
                  this.mapState.tilesName = layer.name;
                }
              }
            }
          },
        }
      });
      modal.present();
    };
    return button;
  }

}
