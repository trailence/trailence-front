import { Injector } from '@angular/core';
import * as L from 'leaflet';
import { MapAdditionsOptions, MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { Way, WayPermission } from 'src/app/services/geolocation/way';
import { MapTool } from './tool.interface';
import { of } from 'rxjs';
import { MapComponent } from '../map.component';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { ModalController } from '@ionic/angular/standalone';
import { POI } from 'src/app/services/geolocation/geo.service';
import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { BadgesConfig } from '../../menus/menu-item';

export class AdditionsTool extends MapTool {

  private modal?: HTMLIonModalElement;
  private _loading = false;

  constructor(
    private readonly mapId: string,
  ) {
    super();
    this.icon = 'info';
    this.badges = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      let count = 0;
      const state = mapComponent.getState();
      const options = state.additions;
      if (options.guidepost) count++;
      if (options.waterPoint) count++;
      if (options.toilets) count++;
      if (options.forbiddenWays) count++;
      if (options.permissiveWays) count++;
      count += state.overlays.length;
      if (count === 0) return undefined;
      return {
        topRight: {
          text: '' + count,
        }
      } as BadgesConfig;
    },
    this.spinner = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      return this._loading ? 'crescent' : undefined;
    };
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      if (this.modal) {
        this.closeModal();
      } else {
        this.displayModal(map, mapComponent, injector);
      }
      return of(true);
    };
  }

  private closeModal(): void {
    this.modal?.dismiss();
    this.modal = undefined;
  }

  private async displayModal(map: L.Map, mapComponent: MapComponent, injector: Injector) {
    const modalController = injector.get(ModalController);
    const popupModule = await import('./additions-popup/additions-popup.component');
    this.modal = await modalController.create({
      component: popupModule.AdditionsPopupComponent,
      componentProps: {
        options: {...mapComponent.getState().additions},
        onOptionsChange: (options: MapAdditionsOptions) => {
          mapComponent.getState().additions = {...options};
          this.refresh(map, mapComponent, injector);
        },
        selectedOverlays: [...mapComponent.getState().overlays],
        onOverlaysChange: (selection: string[]) => {
          const service = injector.get(MapLayersService);
          const missing = [...selection];
          map.eachLayer(layer => {
            const id = (layer.options as any)['id']; // NOSONAR
            if (id && service.overlays.some(l => l.name === id)) {
              const index = missing.indexOf(id);
              if (index >= 0) missing.splice(index, 1); else map.removeLayer(layer);
            }
          });
          for (let missingId of missing) {
            const layer = service.overlays.find(o => o.name === missingId);
            if (layer) map.addLayer(layer.create());
          }
          mapComponent.getState().overlays = [...selection];
        },
      },
      cssClass: 'small-modal'
    });
    this.modal.onDidDismiss().then(() => this.modal = undefined);
    await this.modal.present();
  }

  private _timeout: any = undefined;

  public refresh(map: L.Map | undefined, mapComponent: MapComponent, injector: Injector): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
    this._timeout = setTimeout(() => this.doRefresh(map, mapComponent, injector), 1000);
  }

  private _refreshCount = 0;
  private _layers: L.Layer[] = [];

  private doRefresh(map: L.Map | undefined, mapComponent: MapComponent, injector: Injector): void {
    let bounds;
    try {
      bounds = map?.getBounds();
    } catch (e) { // NOSONAR
      bounds = undefined;
    }
    if (!bounds) return;
    this._loading = true;
    mapComponent.refreshTools();
    const count = ++this._refreshCount;
    injector.get(MapAdditionsService).getAdditions(bounds, mapComponent.getState().additions).subscribe(additions => {
      if (this._refreshCount !== count) return;
      for (const layer of this._layers) layer.remove();
      this._layers = [];
      for (const poi of additions.pois) {
        this._layers.push(this.poiToTooltip(poi, injector));
      }
      for (const way of additions.ways) {
        this._layers.push(this.wayToPath(way));
      }
      for (const layer of this._layers) layer.addTo(map!);
      this._loading = false;
      mapComponent.refreshTools();
    });
  }

  private poiToTooltip(poi: POI, injector: Injector): L.Tooltip {
    const tooltip = L.tooltip({className: 'poi'}).setLatLng(poi.pos).setContent('');
    if (poi.text) {
      const span = document.createElement('SPAN');
      span.innerText = poi.text;
      tooltip.setContent(span.outerHTML);
    }
    tooltip.setOpacity(0.75);
    injector.get(AssetsService).getIcon('poi-' + poi.type, true).subscribe(svg => {
      tooltip.setContent(svg.outerHTML + tooltip.getContent());
    });
    return tooltip;
  }

  private wayToPath(way: Way): L.Polyline {
    const path = L.polyline(way.points, {
      color: way.permission === WayPermission.FORBIDDEN ? 'var(--way-forbidden-color)' : 'var(--way-permissive-color)',
      dashArray: '4',
      smoothFactor: 1,
      interactive: false
    });
    return path;
  }

}
