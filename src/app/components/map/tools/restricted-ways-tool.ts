import { Injector } from '@angular/core';
import L from 'leaflet';
import { MapAdditionsService } from 'src/app/services/map/map-additions.service';
import { WayPermission } from 'src/app/services/geolocation/way';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapTool } from './tool.interface';
import { of } from 'rxjs';
import { MapComponent } from '../map.component';

const FORBIDDEN_COLOR = '#B03030FF';
const PERMISSIVE_COLOR = '#FFA000FF';

export class RestrictedWaysTool extends MapTool {

  constructor(
    private readonly mapId: string,
  ) {
    super();
    this.icon = 'warning';
    this.color = () => this._show ? 'light' : 'dark';
    this.backgroundColor = () => this._show ? 'dark' : '';
    this.visible = () => this._paths.length > 0;
    this.execute = (map: L.Map, mapComponent: MapComponent, injector: Injector) => {
      if (this._show) {
        this._show = false;
        this.removePathsFromMap(injector);
      } else {
        this._show = true;
        this.addPathsToMap(map, injector);
      }
      return of(true);
    };
  }

  private _show = false;
  private _paths: L.Polyline[] = [];
  private _refreshCount = 0;
  private _timeout: any = undefined;
  private _hasPermissive = false;
  private _hasForbidden = false;

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
      this.removePathsFromMap(injector);
    this._paths = [];
    this._hasPermissive = false;
    this._hasForbidden = false;
    if (!map || map.getZoom() < 12) {
      this.updateLegend(injector);
      ondone();
      return;
    }
    const count = ++this._refreshCount;
    injector.get(MapAdditionsService).findRestrictedWays(map.getBounds()).subscribe(
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
          this._show = false;
          this.updateLegend(injector);
        } else if (this._show) {
          this.addPathsToMap(map, injector);
        } else {
          this.updateLegend(injector);
        }
        ondone();
      }
    );
  }

  private removePathsFromMap(injector: Injector): void {
    for (const path of this._paths)
      path.remove();
    this.updateLegend(injector);
  }

  private addPathsToMap(map: L.Map, injector: Injector): void {
    for (const path of this._paths) {
      path.addTo(map); // NOSONAR
      path.bringToFront();
    }
    this.updateLegend(injector);
  }

  private updateLegend(injector: Injector): void {
      const legend = document.getElementById(this.mapId + '-legend');
      if (!legend) return;
      if (!this._show || this._paths.length === 0) legend.innerHTML = '';
      else {
        let html = '';
        const i18n = injector.get(I18nService);
        if (this._hasPermissive)
          html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid ' + PERMISSIVE_COLOR + '"></div><div>' + i18n.texts.pages.trailplanner.legend.permissive + '</div></div>';
        if (this._hasForbidden)
          html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid ' + FORBIDDEN_COLOR + '"></div><div>' + i18n.texts.pages.trailplanner.legend.forbidden + '</div></div>';
        legend.innerHTML = html;
      }
    }
}
