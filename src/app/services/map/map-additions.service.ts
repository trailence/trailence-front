import { Injectable } from '@angular/core';
import { GeoService } from '../geolocation/geo.service';
import { Observable } from 'rxjs';
import { Way } from '../geolocation/way';
import { NetworkService } from '../network/network.service';
import { OfflineMapService } from './offline-map.service';
import * as L from 'leaflet';

@Injectable({providedIn: 'root'})
export class MapAdditionsService {

  constructor(
    private readonly geoService: GeoService,
    private readonly network: NetworkService,
    private readonly mapOffline: OfflineMapService,
  ) {}

  public findRestrictedWays(bounds: L.LatLngBounds): Observable<Way[]> {
    if (this.network.internet)
      return this.geoService.findWays(bounds, true);
    return this.mapOffline.getRestrictedWays(bounds);
  }

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

}
