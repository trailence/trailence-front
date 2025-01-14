import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { catchError, map, Observable, of, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import L from 'leaflet';
import { Arrays } from 'src/app/utils/arrays';
import { Place } from './place';
import { Way, WayPermission } from './way';
import { Track } from 'src/app/model/track';
import { Segment } from 'src/app/model/segment';
import { Point } from 'src/app/model/point';
import { PreferencesService } from '../preferences/preferences.service';

@Injectable({
  providedIn: 'root'
})
export class GeoService {

  constructor(
    private readonly http: HttpService,
    private readonly prefService: PreferencesService,
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
    const fromServer = this.http.get<string[][]>(environment.apiBaseUrl + '/place/v1?lat=' + latitude + '&lng=' + longitude + '&lang=' + this.prefService.preferences.lang).pipe(
      catchError(() => of([] as string[][]))
    );
    return zip(fromOSM, fromServer).pipe(
      map(all => ([...all[0], ...all[1]]))
    );
  }

  public findPlacesByName(name: string): Observable<Place[]> {
    return this.http.get<Place[]>(environment.apiBaseUrl + '/place/v1/search?terms=' + encodeURIComponent(name) + '&lang=' + this.prefService.preferences.lang);
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

  public fillTrackElevation(track: Track): Observable<any> {
    return this.fillPointsElevation(Arrays.flatMap(track.segments, s => s.points));
  }

  public fillSegmentElevation(segment: Segment): Observable<any> {
    return this.fillPointsElevation(segment.points);
  }

  public fillPointsElevation(points: Point[]): Observable<any> {
    const missing = points.filter(pt => pt.ele === undefined);
    if (missing.length === 0) return of(true);
    return this.getElevationFromIGN(missing);
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

}

interface OverpassResponse {
  elements: OverpassElement[];
}

interface OverpassElement {
  id: string;
  geometry: OverpassGeometry[];
  tags: {[key:string]: any};
}

interface OverpassGeometry {
  lat: number;
  lon: number;
}
