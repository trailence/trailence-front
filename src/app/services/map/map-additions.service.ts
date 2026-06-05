import { Injectable } from '@angular/core';
import { concat, map, merge, Observable, of } from 'rxjs';
import { OfflineMapService } from './offline-map.service';
import * as L from 'leaflet';
import { POI, POIType } from './poi';
import { Way, WayPermission } from './way';

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

  private readonly END = of({pois: [] as POI[], ways: [] as Way[], done: true});

  public getAdditions(bounds: L.LatLngBounds, options: MapAdditionsOptions): Observable<{pois: POI[], ways: Way[], done: boolean}> {
    const requests: Observable<{pois: POI[], ways: Way[], done: boolean}>[] = [];
    const poiTypes: POIType[] = [];
    if (options.waterPoint) poiTypes.push('water');
    if (options.toilets) poiTypes.push('toilets');
    if (options.guidepost) poiTypes.push('guidepost');
    if (poiTypes.length > 0)
      requests.push(this.mapOffline.pois.getPois(bounds, poiTypes).pipe(map(r => ({pois: r.pois, ways: [] as Way[], done: false}))));
    if (options.forbiddenWays || options.permissiveWays) {
      const wayFilter: (way: Way) => boolean = way => {
        if (options.forbiddenWays && way.footPermission === WayPermission.FORBIDDEN) return true;
        if (options.permissiveWays && way.footPermission === WayPermission.PERMISSIVE) return true;
        return false;
      };
      requests.push(this.mapOffline.ways.getWays(bounds).pipe(map(r => ({pois: [] as POI[], ways: r.ways.filter(wayFilter), done: false}))));
    }
    if (requests.length === 0) return this.END;
    return concat(merge(...requests), this.END);
  }

}

export interface MapAdditionsOptions {
  guidepost?: boolean;
  waterPoint?: boolean;
  toilets?: boolean;
  forbiddenWays?: boolean;
  permissiveWays?: boolean;
}
