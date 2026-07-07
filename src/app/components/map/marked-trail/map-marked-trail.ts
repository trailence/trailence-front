import { Track } from 'src/app/model/track';
import { Route } from 'src/app/services/map/way';
import { EarthPoint } from 'src/app/utils/latlng';
import { OsmWayMatchResponse } from 'src/app/utils/track-computed-data/track-computed-data';
import * as L from 'leaflet';
import { Injector } from '@angular/core';
import { OsmcSymbolService } from 'src/app/services/geolocation/osmc-symbol.service';

export function buildMapMarkedTrails(injector: Injector, baseTrack: Track, osm: OsmWayMatchResponse) {
  const marks: MapMarkedTrail[] = [];
  for (const way of osm.waysOnTrack.values()) {
    const routes = way.routes.filter(route => !!route.symbol);
    if (routes.length === 0) continue;
    for (const segment of osm.osmTrackPoints) {
      for (let i = 0; i < segment.length; ++i) {
        if (segment[i].osm?.wayId !== way.id) continue;
        let j = i + 1;
        while (j < segment.length && segment[j].osm?.wayId === way.id) j++;
        const points: EarthPoint[] = [];
        for (let k = i; k < j; ++k) points.push(segment[k].osm!.point)
        marks.push(new MapMarkedTrail(injector, routes, points));
      }
    }
  }
  return marks;
}

export class MapMarkedTrail {

  constructor(
    private readonly injector: Injector,
    private readonly routes: Route[],
    private readonly points: EarthPoint[],
  ) {}

  private _oscm?: L.Marker;

  public add(map: L.Map): void {
    if (!this._oscm)
      this._oscm = L.marker(this.points[0]!, {
        icon: L.icon({
          iconUrl: this.injector.get(OsmcSymbolService).generateSymbolDataUrl(this.routes[0]!.symbol!),
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })
      });
    this._oscm.addTo(map);
  }

}
