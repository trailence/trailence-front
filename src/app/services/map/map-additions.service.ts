import { Injectable } from '@angular/core';
import { POI } from '../geolocation/geo.service';
import { Observable, of } from 'rxjs';
import { Way } from '../geolocation/way';
import { OfflineMapService } from './offline-map.service';
import * as L from 'leaflet';

@Injectable({providedIn: 'root'})
export class MapAdditionsService {

  constructor(
    private readonly mapOffline: OfflineMapService,
  ) {}

  // --- State

  private readonly _states: {center: L.LatLngLiteral, zoom: number}[] = [];

  public pushState(center: L.LatLngLiteral, zoom: number): void {
    if (this._states.length === 0 || this._states.at(-1)!.zoom !== zoom || L.latLng(center).distanceTo(this._states.at(-1)!.center) > 500) {
      this._states.push({center, zoom});
      if (this._states.length > 100) this._states.splice(0, 1);
    }
  }

  public canPopState(center: L.LatLngLiteral, zoom: number): boolean {
    const pos = L.latLng(center);
    for (let i = this._states.length - 1; i >= 0; --i) {
      const state = this._states[i];
      if (state.zoom !== zoom || pos.distanceTo(state.center) > 500) return true;
    }
    return false;
  }

  public popState(center: L.LatLngLiteral, zoom: number): {center: L.LatLngLiteral, zoom: number} | undefined {
    const pos = L.latLng(center);
    for (let i = this._states.length - 1; i >= 0; --i) {
      const state = this._states[i];
      if (state.zoom !== zoom || pos.distanceTo(state.center) > 500) {
        return this._states.splice(i, this._states.length - i)[0];
      }
    }
    return undefined;
  }

  // -- Additions

  public getAdditions(bounds: L.LatLngBounds, options: MapAdditionsOptions): Observable<{pois: POI[], ways: Way[]}> {
    if (!options.guidepost && !options.waterPoint && !options.toilets && !options.forbiddenWays && !options.permissiveWays) return of({pois: [], ways: []});
    return this.mapOffline.getAdditions(bounds, !!options.guidepost, !!options.waterPoint, !!options.toilets, !!options.forbiddenWays, !!options.permissiveWays);
  }

}

export interface MapAdditionsOptions {
  guidepost?: boolean;
  waterPoint?: boolean;
  toilets?: boolean;
  forbiddenWays?: boolean;
  permissiveWays?: boolean;
}
