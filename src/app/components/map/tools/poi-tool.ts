import { Injector } from '@angular/core';
import * as L from 'leaflet';
import { MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { WayPermission } from 'src/app/services/geolocation/way';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapTool } from './tool.interface';
import { of } from 'rxjs';
import { MapComponent } from '../map.component';
import { environment } from 'src/environments/environment';
import { AssetsService } from 'src/app/services/assets/assets.service';

export class POITool extends MapTool {

  constructor(
    private readonly mapId: string,
  ) {
    super();
    this.icon = 'info';
    this.color = () => this._show ? 'light' : 'dark';
    this.backgroundColor = () => this._show ? 'dark' : '';
    this.visible = () => this._items.length > 0;
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      if (this._show) {
        this._show = false;
        this.removeFromMap(injector);
      } else {
        this._show = true;
        this.addToMap(map, injector);
      }
      return of(true);
    };
  }

  private _show = false;
  private _refreshCount = 0;
  private _timeout: any = undefined;
  private _items: L.Tooltip[] = [];

  public refresh(map: L.Map | undefined, injector: Injector, ondone: () => void): void {
    this._refresh(true, map, injector, ondone);
  }

  private _refresh(withTimeout: boolean, map: L.Map | undefined, injector: Injector, ondone: () => void): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
    if (withTimeout) {
      this._timeout = setTimeout(() => this._refresh(false, map, injector, ondone), 1000);
      return;
    }
    if (this._show)
      this.removeFromMap(injector);
    this._items = [];
    if (!map || map.getZoom() < 12) {
      ondone();
      return;
    }
    let bounds;
    try {
      bounds = map.getBounds();
    } catch (e) { // NOSONAR
      bounds = undefined;
    }
    if (!bounds) {
      ondone();
      return;
    }
    const count = ++this._refreshCount;
    injector.get(MapAdditionsService).findPOI(bounds).subscribe(
      pois => {
        if (this._refreshCount !== count) return;
        for (const poi of pois) {
          const item = L.tooltip({className: 'poi'}).setLatLng(poi.pos).setContent('');
          if (poi.text) {
            const span = document.createElement('SPAN');
            span.innerText = poi.text;
            item.setContent(span.outerHTML);
          }
          item.setOpacity(0.75);
          injector.get(AssetsService).getIcon('poi-' + poi.type, true).subscribe(svg => {
            item.setContent(svg.outerHTML + item.getContent());
          })
          this._items.push(item);
        }
        if (this._items.length === 0) {
          this._show = false;
        } else if (this._show) {
          this.addToMap(map, injector);
        }
        ondone();
      }
    );
  }

  private removeFromMap(injector: Injector): void {
    for (const item of this._items)
      item.remove();
  }

  private addToMap(map: L.Map, injector: Injector): void {
    for (const item of this._items) {
      item.addTo(map); // NOSONAR
      item.bringToFront();
    }
  }
}
