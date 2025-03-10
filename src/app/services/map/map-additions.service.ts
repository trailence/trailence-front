import { Injectable } from '@angular/core';
import { GeoService } from '../geolocation/geo.service';
import { Observable, of } from 'rxjs';
import { Way } from '../geolocation/way';
import { NetworkService } from '../network/network.service';
import { OfflineMapService } from './offline-map.service';

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

}
