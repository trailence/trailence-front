import { Injector } from '@angular/core';
import L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { WayPermission } from 'src/app/services/geolocation/way';
import { I18nService } from 'src/app/services/i18n/i18n.service';

const FORBIDDEN_COLOR = '#B03030FF';
const PERMISSIVE_COLOR = '#FFA000FF';

export class RestrictedWaysTool extends L.Control {

  constructor(
    private readonly injector: Injector,
    private readonly mapId: string,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  private _show = false;
  private _map: L.Map | undefined;
  private _button: HTMLDivElement | undefined;
  private _paths: L.Polyline[] = [];
  private _refreshCount = 0;
  private _timeout: any = undefined;
  private _hasPermissive = false;
  private _hasForbidden = false;

  override onAdd(map: L.Map): HTMLElement {
    this._map = map;
    this._button = MapToolUtils.createButton('restricted-ways-map-tool');
    this._button.style.color = '#FF8000';
    const assets = this.injector.get(AssetsService);
    assets.loadSvg(assets.icons['warning']).subscribe(
      svg => {
        svg.style.width = '32px';
        svg.style.height = '32px';
        svg.style.margin = '3px 3px -2px 3px';
        this._button!.appendChild(svg);
      }
    );
    this.refresh(false);
    this._button.onclick = () => {
      if (this._show) {
        this._show = false;
        this._button!.style.background = 'padding-box white';
        this._button!.style.color = '#FF8000';
        this.removePathsFromMap();
      } else {
        this._show = true;
        this._button!.style.background = '#FF8000';
        this._button!.style.color = 'black';
        this.addPathsToMap();
      }
    };
    map.on('zoom', () => this.refresh(true));
    map.on('move', () => this.refresh(true));
    return this._button;
  }

  private refresh(withTimeout: boolean): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
    if (withTimeout) {
      this._timeout = setTimeout(() => this.refresh(false), 1000);
      return;
    }
    if (this._show)
      this.removePathsFromMap();
    this._paths = [];
    this._hasPermissive = false;
    this._hasForbidden = false;
    this._button!.style.display = 'none';
    if (!this._map || this._map.getZoom() < 12) {
      return;
    }
    const count = ++this._refreshCount;
    this.injector.get(MapAdditionsService).findRestrictedWays(this._map.getBounds()).subscribe(
      ways => {
        if (this._refreshCount !== count) return;
        for (const way of ways) {
          const path = L.polyline(way.points, {
            color: way.permission === WayPermission.FORBIDDEN ? FORBIDDEN_COLOR : PERMISSIVE_COLOR,
            smoothFactor: 1,
            interactive: false
          });
          if (way.permission === WayPermission.FORBIDDEN) this._hasForbidden = true; else this._hasPermissive = true;
          this._paths.push(path);
        }
        if (this._paths.length === 0) {
          this._button!.style.display = 'none';
          this._show = false;
        } else {
          this._button!.style.display = '';
          if (this._show && this._map) this.addPathsToMap();
        }
      }
    );
  }

  private removePathsFromMap(): void {
    for (const path of this._paths)
      path.remove();
    this.updateLegend();
  }

  private addPathsToMap(): void {
    for (const path of this._paths) {
      path.addTo(this._map!); // NOSONAR
      path.bringToFront();
    }
    this.updateLegend();
  }

  private updateLegend(): void {
      const legend = document.getElementById(this.mapId + '-legend');
      if (!legend) return;
      if (!this._show || this._paths.length === 0) legend.innerHTML = '';
      else {
        let html = '';
        const i18n = this.injector.get(I18nService);
        if (this._hasPermissive)
          html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid ' + PERMISSIVE_COLOR + '"></div><div>' + i18n.texts.pages.trailplanner.legend.permissive + '</div></div>';
        if (this._hasForbidden)
          html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid ' + FORBIDDEN_COLOR + '"></div><div>' + i18n.texts.pages.trailplanner.legend.forbidden + '</div></div>';
        legend.innerHTML = html;
      }
    }
}
