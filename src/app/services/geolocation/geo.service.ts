import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { catchError, map, Observable, of, switchMap, tap, timer, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import * as L from 'leaflet';
import { Place } from './place';
import { Way, WayPermission } from './way';
import { Track } from 'src/app/model/track';
import { Segment } from 'src/app/model/segment';
import { samePositionRound } from 'src/app/model/point';
import { PointDescriptor } from 'src/app/model/point-descriptor';
import { PreferencesService } from '../preferences/preferences.service';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { Progress, ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { parseCoordinates } from 'src/app/utils/coordinates-parser';
import { OverpassClient } from './overpass-client.service';

@Injectable({
  providedIn: 'root'
})
export class GeoService {

  constructor(
    private readonly http: HttpService,
    private readonly prefService: PreferencesService,
    private readonly progressService: ProgressService,
    private readonly i18n: I18nService,
    private readonly overpass: OverpassClient,
  ) {}

  public findNearestPlaces(latitude: number, longitude: number, metersRadius: number): Observable<string[][]> {
    const bounds = new L.LatLng(latitude, longitude).toBounds(metersRadius);
    const fromOSM = this.overpass.request<OverpassResponse>(
      "node[\"place\"~\"(municipality)|(city)|(borough)|(suburb)|(quarter)|(town)|(village)|(hamlet)\"][\"name\"](" + bounds.getSouth() + "," + bounds.getWest() + "," + bounds.getNorth() + "," + bounds.getEast() + ");out meta;",
      15
    ).pipe(
      map(response => {
        return response.elements.map(
          element => element.tags['name']
        ).filter((name: string) => !!name && name.length > 0)
        .map((name: string) => [name]);
      }),
      catchError(() => of([] as string[][]))
    );
    const fromServer = this.http.get<string[][]>(environment.apiBaseUrl + '/place/v1?lat=' + latitude + '&lng=' + longitude + '&radius=' + metersRadius + '&lang=' + this.prefService.preferences.lang).pipe(
      catchError(() => of([] as string[][]))
    );
    return zip(fromOSM, fromServer).pipe(
      map(all => ([...all[0], ...all[1]]))
    );
  }

  public findPlacesByName(name: string): Observable<Place[]> {
    const pos = parseCoordinates(name);
    if (pos !== undefined) return of([{...pos, north: undefined, south: undefined, east: undefined, west: undefined, names: [name, this.i18n.texts.go_to_position]}]);
    return this.http.get<Place[]>(environment.apiBaseUrl + '/place/v1/search?terms=' + encodeURIComponent(name) + '&lang=' + this.prefService.preferences.lang);
  }

  public findPOI(bounds: L.LatLngBounds): Observable<POI[]> {
    const filterBounds = '(' + bounds.getSouth() + ',' + bounds.getWest() + ',' + bounds.getNorth() + ',' + bounds.getEast() + ')';
    let request = '\n(';
    request += 'node["tourism"="information"]["information"="guidepost"]' + filterBounds + ';';
    request += 'node["amenity"~"(drinking_water)|(toilets)|(water_point)"]' + filterBounds + ';';
    request += ');\nout meta geom;';
    return this.overpass.request<OverpassResponse>(request, 25).pipe(
      map(response => response.elements.map(element => {
        if (!element.lat || !element.lon) return null;
        if (element.tags['information'] === 'guidepost') {
          let s = element.tags['name'] ?? '';
          let s2 = element.tags['ref'] ?? '';
          if (s.length > 0) {
            if (s2.length > 0) s += ' (' + s2 + ')';
          } else s = s2;
          if (s.length === 0) return null;
          return {id: element.id, type: 'guidepost', pos: {lat: element.lat, lng: element.lon}, text: s} as POI;
        }
        if (element.tags['amenity'] === 'drinking_water' || element.tags['amenity'] === 'water_point') {
          return {id: element.id, type: 'water', pos: {lat: element.lat, lng: element.lon}} as POI;
        }
        if (element.tags['amenity'] === 'toilets') {
          return {id: element.id, type: 'toilets', pos: {lat: element.lat, lng: element.lon}} as POI;
        }
        return null;
      }).filter(e => !!e))
    );
  }

  public findWays(bounds: L.LatLngBounds, onlyRestricted: boolean = false): Observable<Way[]> {
    const filterWays = 'way["highway"]';
    const filterRestricted = onlyRestricted ? '["foot"~"(no)|(private)|(destination)|(permissive)"]' : '';
    const filterBounds = '(' + bounds.getSouth() + ',' + bounds.getWest() + ',' + bounds.getNorth() + ',' + bounds.getEast() + ')';
    const output = 'out tags geom;';

    const request = filterWays + filterRestricted + filterBounds + ';' + output;

    return this.overpass.request<OverpassResponse>(request, 25).pipe(
      map(response => response.elements.filter(e => e.geometry && e.geometry.length > 1).map(e => this.overpassElementToWay(e)))
    );
  }

  private overpassElementToWay(element: OverpassElement): Way {
    return {
      id: element.id,
      bounds: element.bounds,
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

  public fillTrackElevation(track: Track, showProgress = false, onlyGoodProviders = false): Observable<any> {
    return this.fillPointsElevation(track.segments.flatMap(s => s.points), showProgress, onlyGoodProviders);
  }

  public fillSegmentElevation(segment: Segment, showProgress = false, onlyGoodProviders = false): Observable<any> {
    return this.fillPointsElevation(segment.points, showProgress, onlyGoodProviders);
  }

  public fillPointsElevation(points: PointDescriptor[], showProgress = false, onlyGoodProviders = false): Observable<any> {
    const missing = points.filter(pt => pt.ele === undefined);
    if (missing.length === 0) return of(true);
    let progress: Progress | undefined = undefined;
    if (showProgress) {
      progress = this.progressService.create(this.i18n.texts.downloading_elevation, missing.length);
    }
    const providers = [
      (pts: PointDescriptor[], prog?: Progress) => this.getElevationFromIGN(pts, prog),
      (pts: PointDescriptor[], prog?: Progress) => this.getElevationFromTiles(pts, 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', 15, prog),
    ];
    if (!onlyGoodProviders)
      providers.push(
        (pts: PointDescriptor[], prog?: Progress) => this.fillPointsElevationWithRestrictedApi(pts, (pts2, prog2) => this.getElevationFromOpenMeteo(pts2, prog2), prog),
        // currently opentopodata does not allow cors requests
        //(pts: Point[], prog?: Progress) => this.fillPointsElevationWithRestrictedApi(pts, (pts2, prog2) => this.getElevationFromOpenTopo(pts2, 'srtm30m', prog2), prog),
        //(pts: Point[], prog?: Progress) => this.fillPointsElevationWithRestrictedApi(pts, (pts2, prog2) => this.getElevationFromOpenTopo(pts2, 'aster30m', prog2), prog),
        (pts: PointDescriptor[], prog?: Progress) => this.fillPointsElevationWithRestrictedApi(pts, (pts2, prog2) => this.getElevationFromOpenElevation(pts2, prog2), prog),
      );
    const nextProvider: (index: number, pts: PointDescriptor[]) => Observable<any> = (index, pts) =>
      providers[index](pts, progress).pipe(
        switchMap(() => {
          if (index === providers.length - 1) return of(false);
          const missing2 = points.filter(pt => pt.ele === undefined);
          if (missing2.length === 0) return of(true);
          return nextProvider(index + 1, missing2);
        })
      );
    return nextProvider(0, missing).pipe(
      tap(() => progress?.done()),
    );
  }

  public fillPointsElevationWithRestrictedApi(
    points: PointDescriptor[],
    api: (points: L.LatLngLiteral[], progress?: Progress) => Observable<(number|undefined)[] | undefined>,
    progress?: Progress
  ): Observable<any> {
    let coordinates: L.LatLngLiteral[] = [];
    let minDistance = 10;
    let skipped = 0;
    do {
      skipped = 0;
      coordinates = [];
      for (const point of points) {
        const pos = point.pos;
        const c = {lat: Math.floor(pos.lat * 100000) / 100000, lng: Math.floor(pos.lng * 100000) / 100000};
        const i = coordinates.findIndex(c2 => L.latLng(c2.lat, c2.lng).distanceTo(c) < minDistance);
        if (i >= 0) {
          skipped++;
          continue;
        }
        coordinates.push(c);
      }
      if (coordinates.length > 500) minDistance += 5;
      else break;
    } while (minDistance < 50);
    if (coordinates.length === 0) return of(false);
    if (skipped > 0) progress?.addWorkToDo(-skipped);
    return api(coordinates, progress).pipe(
      map(result => {
        if (!result) return false;
        for (const point of points) {
          const pos = point.pos;
          const c = L.latLng(Math.floor(pos.lat * 100000) / 100000, Math.floor(pos.lng * 100000) / 100000);
          const i = coordinates.findIndex(c2 => L.latLng(c2.lat, c2.lng).distanceTo(c) < minDistance);
          if (result.length < i || !result[i]) continue;
          point.ele = result[i];
        }
        return true;
      })
    );
  }

  private getElevationFromIGN(points: PointDescriptor[], progress?: Progress): Observable<any> {
    const requests: Observable<any>[] = [];
    const limiter = new RequestLimiter(1);
    let positions: number[][] = [];
    for (let i = 0; i < points.length; i += 100) {
      let lat = '';
      let lon = '';
      let count = 0;
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
        count++;
      }
      const request = this.http.get('https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_par_territoires&delimiter=' + encodeURIComponent('|') + '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon)).pipe(
        catchError(e => of({elevations: []})),
        tap(() => progress?.addWorkDone(count)),
      );
      requests.push(limiter.add(() => request));
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

  private getElevationFromOpenMeteo(points: L.LatLngLiteral[], progress?: Progress): Observable<(number | undefined)[] | undefined> {
    const requests: Observable<any>[] = [];
    const limiter = new RequestLimiter(1);
    for (let i = 0; i < points.length; i += 100) {
      let lat = '';
      let lon = '';
      let count = 0;
      for (let j = 0; j < 100 && i + j < points.length; ++j) {
        const point = points[i + j];
        if (lat.length > 0) {
          lat += ',';
          lon += ',';
        }
        const plat = Math.floor(point.lat * 1000000);
        const plng = Math.floor(point.lng * 1000000);
        lat += (plat / 1000000).toFixed(6);
        lon += (plng / 1000000).toFixed(6);
        count++;
      }
      const request = this.http.get('https://api.open-meteo.com/v1/elevation?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon)).pipe(
        catchError(e => of({elevation:[]})),
        tap(() => progress?.addWorkDone(count)),
      );
      requests.push(limiter.add(() => request));
    }
    return (requests.length === 0 ? of([]) : zip(requests)).pipe(
      map(responses => {
        const result: (number|undefined)[] = new Array(points.length);
        for (let responseIndex = 0; responseIndex < responses.length; ++responseIndex) {
          for (let i = 0; i < responses[responseIndex].elevation.length; ++i) {
            result[responseIndex * 100 + i] = responses[responseIndex].elevation[i];
          }
          for (let i = responses[responseIndex].elevation.length; i < 100 && responseIndex * 100 + i < result.length; i++)
            result[responseIndex * 100 + i] = undefined;
        }
        return result;
      }),
      catchError(e => of(undefined))
    );
  }

  /* NOSONAR
  private getElevationFromOpenTopo(points: L.LatLngLiteral[], dataset: string, progress?: Progress): Observable<(number | undefined)[] | undefined> {
    const requests: Observable<any>[] = [];
    const limiter = new RequestLimiter(1);
    let locations = '';
    const addRequest = (loc: string, nb: number) => {
      const req = this.http.get('https://api.opentopodata.org/v1/' + dataset + '?locations=' + encodeURIComponent(loc)).pipe(
        catchError(e => of({results: []})),
        tap(() => progress?.addWorkDone(nb)),
      );
      if (requests.length === 0) return limiter.add(() => req);
      return limiter.add(() => timer(1000).pipe(switchMap(() => req)));
    }
    let nb = 0;
    for (const point of points) {
      const newLoc = (Math.floor(point.lat * 100000) / 100000).toFixed(5) + ',' + (Math.floor(point.lng * 100000) / 100000).toFixed(5);
      if (encodeURIComponent(locations + '|' + newLoc).length > 950) {
        requests.push(addRequest(locations, nb));
        locations = '';
        nb = 0;
      }
      if (locations.length > 0) locations += '|';
      locations += newLoc;
      nb++;
    }
    if (locations.length > 0)
      requests.push(addRequest(locations, nb));
    return (requests.length === 0 ? of([]) : zip(requests)).pipe(
      map(responses => {
        const results: (number | undefined)[] = new Array(points.length);
        for (let i = 0; i < results.length; ++i) results[i] = undefined;
        for (const response of responses) {
          for (const result of response.results) {
            const e = result['elevation'];
            if (!e) continue;
            const lat = result['location']['lat'];
            const lng = result['location']['lng'];
            for (let i = 0; i < points.length; ++i) {
              if (results[i] !== undefined) continue;
              if (samePositionRound(points[i], {lat, lng}, 100000))
                results[i] = e;
            }
          }
        }
        return results;
      }),
      catchError(e => of(undefined))
    );
  } */

  private getElevationFromOpenElevation(points: L.LatLngLiteral[], progress?: Progress): Observable<(number | undefined)[] | undefined> {
    const requests: Observable<any>[] = [];
    const limiter = new RequestLimiter(1);
    let locations = '';
    const addRequest = (loc: string, nb: number) => {
      const req = this.http.get('https://api.open-elevation.com/api/v1/lookup?locations=' + encodeURIComponent(loc)).pipe(
        catchError(e => of({results: []})),
        tap(() => progress?.addWorkDone(nb)),
      );
      if (requests.length < 2) return limiter.add(() => req);
      return limiter.add(() => timer(250).pipe(switchMap(() => req)));
    }
    let nb = 0;
    for (const point of points) {
      const newLoc = (Math.floor(point.lat * 100000) / 100000).toFixed(5) + ',' + (Math.floor(point.lng * 100000) / 100000).toFixed(5);
      if (encodeURIComponent(locations + '|' + newLoc).length > 950) {
        requests.push(addRequest(locations, nb));
        locations = '';
        nb = 0;
      }
      if (locations.length > 0) locations += '|';
      locations += newLoc;
      nb++;
    }
    if (locations.length > 0)
      requests.push(addRequest(locations, nb));
    return (requests.length === 0 ? of([]) : zip(requests)).pipe(
      map(responses => {
        const results: (number | undefined)[] = new Array(points.length);
        for (let i = 0; i < results.length; ++i) results[i] = undefined;
        for (const response of responses) {
          for (const result of response.results) {
            const e = result['elevation'];
            if (!e) continue;
            const lat = result['latitude'];
            const lng = result['longitude'];
            for (let i = 0; i < points.length; ++i) {
              if (results[i] !== undefined) continue;
              if (samePositionRound(points[i], {lat, lng}, 100000))
                results[i] = e;
            }
          }
        }
        return results;
      }),
      catchError(e => of(undefined))
    );
  }

  private getElevationFromTiles(points: PointDescriptor[], url: string, maxZoom: number, progress?: Progress): Observable<any> {
    const tiles: {x: number, y: number, nb: number}[] = [];
    for (const point of points) {
      const crsPt = L.CRS.EPSG3857.latLngToPoint(point.pos, maxZoom);
      const tile = {x: Math.floor(crsPt.x / 256), y: Math.floor(crsPt.y / 256)};
      const t = tiles.find(t => t.x === tile.x && t.y === tile.y);
      if (t) t.nb++; else tiles.push({...tile, nb: 1});
    }
    const requests = tiles.map(tile =>
      this.http.getBlob(url.replace('{z}', '' + maxZoom).replace('{y}', '' + tile.y).replace('{x}', '' + tile.x)).pipe(
        switchMap(blob => new Observable<ImageData>(subscriber => {
          const img = new Image();
          const urlCreator = globalThis.URL || globalThis.webkitURL;
          img.onload = () => {
            const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
            canvas.width = 256;
            canvas.height = 256;
            canvas.style.position = 'fixed';
            canvas.style.top = '-1000px';
            canvas.style.left = '-1000px';
            document.documentElement.appendChild(canvas);
            const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
            ctx.drawImage(img, 0, 0, 256, 256, 0, 0, 256, 256);
            urlCreator.revokeObjectURL(img.src);
            const data = ctx.getImageData(0, 0, 256, 256);
            canvas.remove();
            subscriber.next(data);
            subscriber.complete();
          };
          img.onerror = err => subscriber.error(err);
          img.src = urlCreator.createObjectURL(blob);
        })),
        catchError(e => of(undefined)),
        tap(() => progress?.addWorkDone(tile.nb)),
      )
    );
    return (requests.length === 0 ? of([]) : zip(requests)).pipe(
      map(images => {
        for (const point of points) {
          const crsPt = L.CRS.EPSG3857.latLngToPoint(point.pos, maxZoom);
          const tile = {x: Math.floor(crsPt.x / 256), y: Math.floor(crsPt.y / 256)};
          const index = tiles.findIndex(t => t.x === tile.x && t.y === tile.y);
          if (index < 0 || !images[index]) continue;
          const data = images[index];
          const x = Math.floor(crsPt.x) % 256;
          const y = Math.floor(crsPt.y) % 256;
          const offset = (y * 256 + x) * 4;
          const r = data.data[offset];
          const g = data.data[offset + 1];
          const b = data.data[offset + 2];
          // ignore alpha at offset + 3
          const e = ((r * 256) + g + (b / 256)) - 32768;
          point.ele = e;
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
  bounds?: {minlat: number, minlon: number, maxlat: number, maxlon: number};
  lat?: number;
  lon?: number;
  geometry: OverpassGeometry[];
  tags: {[key:string]: any};
}

interface OverpassGeometry {
  lat: number;
  lon: number;
}

export interface POI {
  id: string;
  type: 'guidepost' | 'water' | 'toilets';
  pos: L.LatLngLiteral;
  text?: string;
};
