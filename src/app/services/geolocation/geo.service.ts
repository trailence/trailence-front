import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { catchError, map, Observable, of, zip } from 'rxjs';
import { I18nService } from '../i18n/i18n.service';
import { environment } from 'src/environments/environment';
import * as L from 'leaflet';
import { Arrays } from 'src/app/utils/arrays';
import { Place } from './place';
import { Way, WayPermission } from './way';
import { RouteCircuit } from './route';
import { Track } from 'src/app/model/track';
import { Segment } from 'src/app/model/segment';
import { Point } from 'src/app/model/point';

@Injectable({
  providedIn: 'root'
})
export class GeoService {

  constructor(
    private readonly http: HttpService,
    private readonly i18n: I18nService,
  ) {}

  public findNearestPlaces(latitude: number, longitude: number): Observable<string[][]> {
    const bounds = new L.LatLng(latitude, longitude).toBounds(5000);
    const fromOSM = this.http.post<OverpassResponse>('https://overpass-api.de/api/interpreter', "[out:json][timeout:25];node[\"place\"~\"(municipality)|(city)|(borough)|(suburb)|(quarter)|(town)|(village)|(hamlet)\"][\"name\"](" + bounds.getSouth() + "," + bounds.getWest() + "," + bounds.getNorth() + "," + bounds.getEast() + ");out meta;").pipe(
      map(response => {
        return response.elements.map(
          element => element.tags['name']
        ).filter((name: string) => !!name && name.length > 0)
        .map((name: string) => [name]);
      }),
      catchError(() => of([] as string[][]))
    );
    const fromServer = this.http.get<string[][]>(environment.apiBaseUrl + '/place/v1?lat=' + latitude + '&lng=' + longitude + '&lang=' + this.i18n.textsLanguage).pipe(
      catchError(() => of([] as string[][]))
    );
    return zip(fromOSM, fromServer).pipe(
      map(all => ([...all[0], ...all[1]]))
    );
  }

  public findPlacesByName(name: string): Observable<Place[]> {
    return this.http.get<Place[]>(environment.apiBaseUrl + '/place/v1/search?terms=' + encodeURIComponent(name) + '&lang=' + this.i18n.textsLanguage);
  }

  public findWays(bounds: L.LatLngBounds): Observable<Way[]> {
    return this.http.post<OverpassResponse>('https://overpass-api.de/api/interpreter', "[out:json][timeout:25];way[\"highway\"](" + bounds.getSouth() + "," + bounds.getWest() + "," + bounds.getNorth() + "," + bounds.getEast() + ");out tags geom;").pipe(
      map(response => response.elements.filter(e => e.geometry && e.geometry.length > 0).map(e => this.overpassElementToWay(e)))
    );
  }

  private overpassElementToWay(element: OverpassElement): Way {
    return {
      points: element.geometry.map(g => L.latLng(g.lat, g.lon)),
      permission: this.overpassWayPermission(element.tags['foot'])
    };
  }

  private overpassWayPermission(overpassPermission?: string): WayPermission | undefined {
    if (overpassPermission === 'no' || overpassPermission === 'private' || overpassPermission === 'destination')
      return WayPermission.FORBIDDEN;
    if (overpassPermission === 'permissive')
      return WayPermission.PERMISSIVE;
    return overpassPermission ? WayPermission.ALLOWED : undefined;
  }

  public findRoutes(bounds: L.LatLngBounds): Observable<RouteCircuit[]> {
    return this.http.post<OverpassResponse>('https://overpass-api.de/api/interpreter', "[out:json][timeout:25];rel[type=\"route\"][route~\"(mtb)|(hiking)|(foot)|(nordic_walking)|(running)|(fitness_trail)|(inline_skates)\"](" + bounds.getSouth() + "," + bounds.getWest() + "," + bounds.getNorth() + "," + bounds.getEast() + ");out meta geom;").pipe(
      map(response => response.elements.filter(e => {
        if (!e.members) return false;
        e.members = e.members.filter(m => m.geometry && m.geometry.length > 0);
        return e.members.length > 0;
      }).map(e => this.overpassElementToRoute(e)))
    );
  }

  private overpassElementToRoute(element: OverpassElement): RouteCircuit {
    return {
      id: 'overpass-' + element.id,
      segments: element.members.map(m => m.geometry.map(g => L.latLng(g.lat, g.lon))),
      positiveElevation: parseInt(element.tags['ascent']) || undefined,
      negativeElevation: parseInt(element.tags['descent']) || undefined,
      distance: (parseInt(element.tags['distance']) * 1000) || undefined,
      name: element.tags['name'] ||
        (element.tags['from'] && element.tags['to'] ? this.i18n.texts.pages.trailplanner.meta.from + ' ' + element.tags['from'] + ' ' + this.i18n.texts.pages.trailplanner.meta.to + ' ' + element.tags['to'] : undefined),
      description: element.tags['description'],
      oscmSymbol: element.tags['osmc:symbol']
    }
  }

  public fillTrackElevation(track: Track): Observable<any> {
    return this.fillPointsElevation(Arrays.flatMap(track.segments, s => s.points));
  }

  public fillSegmentElevation(segment: Segment): Observable<any> {
    return this.fillPointsElevation(segment.points);
  }

  public fillPointsElevation(points: Point[]): Observable<any> {
    const missing = points.filter(pt => pt.ele === undefined);
    if (missing.length === 0) return of(true);
    /*
    return this.getElevationFromIGN(missing).pipe(
      switchMap(() => {
        const missing2 = points.filter(pt => pt.ele === undefined);
        if (missing2.length === 0) return of(true);
        return this.getElevationFromOpenMeteo(missing2).pipe(
          switchMap(() => {
            const missing3 = points.filter(pt => pt.ele === undefined);
            if (missing3.length === 0) return of(true);
            return this.getElevationFromOpenElevation(missing3);
          })
        );
      })
    );*/
    return this.getElevationFromIGN(missing);
    //return this.getElevationFromOpenElevation(missing);
    //return this.getElevationFromOpenTopo(missing);
    //return this.getElevationFromOpenTopo2(missing);
    //return this.getElevationFromOpenMeteo(missing);
  }

  private getElevationFromIGN(points: Point[]): Observable<any> {
    const requests: Observable<any>[] = [];
    let positions: number[][] = [];
    for (let i = 0; i < points.length; i += 100) {
      let lat = '';
      let lon = '';
      for (let j = 0; j < 100 && i + j < points.length; ++j) {
        const point = points[i + j];
        if (lat.length > 0) {
          lat += '|';
          lon += '|';
        }
        const plat = Math.floor(point.pos.lat * 1000000);
        const plng = Math.floor(point.pos.lng * 1000000);
        lat += (plat / 1000000).toFixed(6);
        lon += (plng / 1000000).toFixed(6);
        positions.push([plat, plng])
      }
      requests.push(this.http.get('https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_par_territoires&delimiter=' + encodeURIComponent('|') + '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon)));
    }
    return (requests.length === 0 ? of([]) : zip(requests)).pipe(
      map(responses => {
        for (const response of responses) {
          for (const elevation of response.elevations) {
            if (elevation.z < -1000) continue;
            const lat = Math.floor(elevation.lat * 1000000);
            const lng = Math.floor(elevation.lon * 1000000);
            for (let i = 0; i < points.length; ++i) {
              const point = points[i];
              const pos = positions[i];
              if (point.ele === undefined && pos[0] === lat && pos[1] === lng) {
                point.ele = elevation.z;
              }
            }
          }
        }
      })
    );
  }

  /*
  private getElevationFromOpenElevation(points: Point[]): Observable<any> {
    const body = {
      locations: points.map(p => ({latitude: p.pos.lat, longitude: p.pos.lng}))
    };
    return this.http.post('https://api.open-elevation.com/api/v1/lookup', body).pipe(
      map((response: any) => {
        for (const result of response.results) {
          const e = result['elevation'];
          if (!e) continue;
          const lat = result['latitude'] as number;
          const lng = result['longitude'] as number;
          for (const p of points) {
            if (p.ele !== undefined) continue;
            if (p.samePositionRound({lat, lng})) {
              p.ele = e;
            }
          }
        }
      }),
      catchError(e => of(false))
    )
  }

  private getElevationFromOpenTopo(points: Point[]): Observable<any> {
    const requests: Observable<any>[] = [];
    for (let i = 0; i < points.length; i += 100) {
      let locations = '';
      for (let j = 0; j < 100 && i + j < points.length; ++j) {
        const point = points[i + j];
        if (locations.length > 0) locations += '|';
        locations += point.pos.lat + ',' + point.pos.lng;
      }
      requests.push(this.http.post('https://api.opentopodata.org/v1/srtm30m', {locations}));
    }
    return (requests.length === 0 ? of([]) : zip(requests)).pipe(
      map(responses => { // NOSONAR
        for (const response of responses) {
          for (const result of response.results) {
            const e = result['elevation'];
            if (!e) continue;
            const lat = result['location']['lat'];
            const lng = result['location']['lng'];
            for (const p of points) {
              if (p.ele !== undefined) continue;
              if (p.samePositionRound({lat, lng})) {
                p.ele = e;
              }
            }
          }
        }
      }),
      catchError(e => of(false))
    );
  }

  private getElevationFromOpenTopo2(points: Point[]): Observable<any> {
    const requests: Observable<any>[] = [];
    let locations = '';
    for (const point of points) {
      const newLoc = (Math.floor(point.pos.lat * 1000000) / 1000000).toFixed(6) + ',' + (Math.floor(point.pos.lng * 1000000) / 1000000).toFixed(6);
      if (encodeURIComponent(locations + '|' + newLoc).length > 950) {
        requests.push(this.http.get('https://api.opentopodata.org/v1/srtm30m?locations=' + encodeURIComponent(locations)));
        locations = '';
      }
      if (locations.length > 0) locations += '|';
      locations += newLoc;
    }
    if (locations.length > 0)
      requests.push(this.http.get('https://api.opentopodata.org/v1/srtm30m?locations=' + encodeURIComponent(locations)));
    return (requests.length === 0 ? of([]) : zip(requests)).pipe(
      map(responses => { // NOSONAR
        for (const response of responses) {
          for (const result of response.results) {
            const e = result['elevation'];
            if (!e) continue;
            const lat = result['location']['lat'];
            const lng = result['location']['lng'];
            for (const p of points) {
              if (p.ele !== undefined) continue;
              if (p.samePositionRound({lat, lng})) {
                p.ele = e;
              }
            }
          }
        }
      }),
      catchError(e => of(false))
    );
  }

  private getElevationFromOpenMeteo(points: Point[]): Observable<any> {
    const requests: Observable<any>[] = [];
    for (let i = 0; i < points.length; i += 100) {
      let lat = '';
      let lon = '';
      for (let j = 0; j < 100 && i + j < points.length; ++j) {
        const point = points[i + j];
        if (lat.length > 0) {
          lat += ',';
          lon += ',';
        }
        const plat = Math.floor(point.pos.lat * 1000000);
        const plng = Math.floor(point.pos.lng * 1000000);
        lat += (plat / 1000000).toFixed(6);
        lon += (plng / 1000000).toFixed(6);
      }
      requests.push(this.http.get('https://api.open-meteo.com/v1/elevation?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon)).pipe(
        catchError(e => of({elevation:[]}))
      ));
    }
    return (requests.length === 0 ? of([]) : zip(requests)).pipe(
      map(responses => {
        for (let responseIndex = 0; responseIndex < responses.length; ++responseIndex) {
          for (let i = 0; i < responses[responseIndex].elevation.length; ++i) {
            const point = points[responseIndex * 100 + i];
            point.ele = responses[responseIndex].elevation[i];
          }
        }
      }),
      catchError(e => of(false))
    );
  }
  */

}

interface OverpassResponse {
  elements: OverpassElement[];
}

interface OverpassElement {
  id: string;
  geometry: OverpassGeometry[];
  tags: {[key:string]: any};
  members: OverpassElementMember[];
}

interface OverpassElementMember {
  geometry: OverpassGeometry[];
}

interface OverpassGeometry {
  lat: number;
  lon: number;
}
