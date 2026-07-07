import { Injector } from '@angular/core';
import * as L from 'leaflet';
import { countMapAdditionsOptions, MapAdditionsOptions, MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { MapTool, MapToolContext } from './tool.interface';
import { of } from 'rxjs';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { BadgesConfig } from '../../menus/menu-item';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { Way, WayPermission } from 'src/app/services/map/way';
import { POI } from 'src/app/services/map/poi';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';

export class AdditionsTool extends MapTool {

  private modal?: HTMLIonModalElement;
  private _loading = false;

  constructor(
    private readonly mapId: string,
  ) {
    super();
    this.icon = 'info';
    this.visible = (ctx: MapToolContext) => true;
    this.badges = (ctx: MapToolContext) => {
      let count = 0;
      const state = ctx.mapComponent.getState();
      const options = state.additions;
      if (state.zoom > 10) count += countMapAdditionsOptions(options);
      count += state.overlays.length;
      if (count === 0) return undefined;
      return {
        topRight: {
          text: '' + count,
        }
      } as BadgesConfig;
    };
    this.spinner = (ctx: MapToolContext) => {
      return this._loading ? 'crescent' : undefined;
    };
    this.execute = (ctx: MapToolContext) => {
      if (this.modal) {
        this.closeModal();
      } else {
        this.displayModal(ctx);
      }
      return of(true);
    };
  }

  private closeModal(): void {
    this.modal?.dismiss();
    this.modal = undefined;
  }

  private async displayModal(ctx: MapToolContext) {
    const modalController = ctx.injector.get(ModalController);
    const popupModule = await import('./additions-popup/additions-popup.component');
    this.modal = await modalController.create({
      component: popupModule.AdditionsPopupComponent,
      componentProps: {
        options: {...ctx.mapComponent.getState().additions},
        onOptionsChange: (options: MapAdditionsOptions) => {
          ctx.mapComponent.getState().additions = {...options};
          this.refresh(ctx);
        },
        selectedOverlays: [...ctx.mapComponent.getState().overlays],
        onOverlaysChange: (selection: string[]) => {
          const service = ctx.injector.get(MapLayersService);
          const missing = [...selection];
          ctx.map.eachLayer(layer => {
            const id = (layer.options as any)['id']; // NOSONAR
            if (id && service.overlays.some(l => l.name === id)) {
              const index = missing.indexOf(id);
              if (index >= 0) missing.splice(index, 1); else ctx.map.removeLayer(layer);
            }
          });
          for (let missingId of missing) {
            const layer = service.overlays.find(o => o.name === missingId);
            if (layer) ctx.map.addLayer(layer.create());
          }
          ctx.mapComponent.getState().overlays = [...selection];
        },
      },
      cssClass: 'small-modal'
    });
    this.modal.onDidDismiss().then(() => this.modal = undefined);
    await this.modal.present();
  }

  private _timeout: any = undefined;

  public refresh(ctx: MapToolContext | undefined): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
    this._timeout = setTimeout(() => { if (ctx) this.doRefresh(ctx); }, 250);
  }

  private _refreshCount = 0;
  private _layers: L.Layer[] = [];

  private doRefresh(ctx: MapToolContext): void {
    let bounds;
    try {
      bounds = ctx.map.getBounds();
    } catch (e) { // NOSONAR
      bounds = undefined;
    }
    if (!bounds) return;
    if (ctx.map.getZoom() < 10) {
      for (const layer of this._layers) layer.remove();
      this._layers = [];
      return;
    }
    this._loading = true;
    ctx.mapComponent.refreshTools();
    const count = ++this._refreshCount;
    for (const layer of this._layers) layer.remove();
    this._layers = [];
    const options = ctx.mapComponent.getState().additions;
    ctx.injector.get(MapAdditionsService).getAdditions(bounds, options).subscribe(additions => {
      if (this._refreshCount !== count) return;
      for (const poi of additions.pois) {
        const tooltip = this.poiToTooltip(poi, ctx.injector);
        this._layers.push(tooltip);
        tooltip.addTo(ctx.map);
      }
      for (const way of additions.ways) {
        const path = this.wayToPath(way, options);
        this._layers.push(path);
        path.addTo(ctx.map);
      }
      if (additions.done) {
        this._loading = false;
        console.log(additions)
        if (additions.partial && !ctx.injector.get(NetworkService).server) {
          ctx.injector.get(ToastController).create({
            message: ctx.injector.get(I18nService).texts.mapAdditions.errors.no_net,
            color: 'warning',
            duration: 5000,
          }).then(t => t.present());
        }
        ctx.mapComponent.refreshTools();
      }
    });
  }

  private poiToTooltip(poi: POI, injector: Injector): L.Tooltip {
    const tooltip = L.tooltip({className: 'poi', permanent: true}).setLatLng(poi.pos).setContent('');
    if (poi.text) {
      const span = document.createElement('SPAN');
      span.innerText = poi.text;
      tooltip.setContent(span.outerHTML);
    }
    tooltip.setOpacity(0.75);
    injector.get(OfflineMapService).getPoiIcon$(poi.type).subscribe(svg => {
      tooltip.setContent(svg.outerHTML + tooltip.getContent());
    });
    return tooltip;
  }

  private wayToPath(way: Way, options: MapAdditionsOptions): L.Polyline {
    const path = L.polyline(way.points, {
      color:
        (options.forbiddenWays && way.footPermission === WayPermission.FORBIDDEN) || (options.forbiddenBicycleWays && way.bicyclePermission === WayPermission.FORBIDDEN)
        ? 'var(--way-forbidden-color)'
        : 'var(--way-permissive-color)',
      weight: 3,
      dashArray: '4',
      smoothFactor: 1,
      interactive: false,
      pane: 'overTracksPane',
    });
    return path;
  }

}
