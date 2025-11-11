import { Injectable, Injector, NgZone } from '@angular/core';
import * as L from 'leaflet';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';
import { MapLayer, MapLayersService } from './map-layers.service';
import { Progress, ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { Observable, bufferCount, catchError, combineLatest, from, map, merge, of, switchMap, tap, zip } from 'rxjs';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { BinaryContent } from 'src/app/utils/binary-content';
import { PreferencesService } from '../preferences/preferences.service';
import { TraceRecorderService } from '../trace-recorder/trace-recorder.service';
import { ErrorService } from '../progress/error.service';
import { I18nError, TranslatedString } from '../i18n/i18n-string';
import { Console } from 'src/app/utils/console';
import { GeoService, POI } from '../geolocation/geo.service';
import { Way } from '../geolocation/way';

interface TileMetadata {
  key: string;
  size: number;
  date: number;
}

interface TileBlob {
  key: string;
  blob: Blob;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineMapService {

  private _db?: Dexie;
  private _openEmail?: string;
  private _cleanExpiredTimeout?: any;

  constructor(
    auth: AuthService,
    private readonly layers: MapLayersService,
    private readonly preferencesService: PreferencesService,
    private readonly traceRecorder: TraceRecorderService,
    private readonly ngZone: NgZone,
    private readonly geoService: GeoService,
    private readonly injector: Injector,
  ) {
    auth.auth$.subscribe(
      auth => {
        if (auth) this.open(auth.email);
        else this.close();
      }
    );
  }

  private close() {
    if (this._db) {
      this._db.close();
      this._openEmail = undefined;
      this._db = undefined;
      if (this._cleanExpiredTimeout) clearTimeout(this._cleanExpiredTimeout);
      this._cleanExpiredTimeout = undefined;
    }
  }

  private open(email: string): void {
    if (this._openEmail === email) return;
    this.close();
    this._openEmail = email;
    const db = new Dexie('trailence_offline_map_' + email);
    const storesV1: any = {};
    for (const layer of this.layers.possibleLayers) {
      storesV1[layer + '_meta'] = 'key, date';
      storesV1[layer + '_tiles'] = 'key';
    }
    storesV1['osm_restricted_ways'] = 'id, date';
    storesV1['osm_poi'] = 'id, date';
    db.version(1).stores(storesV1);
    this._db = db;
    this.cleanExpiredTimeout();
  }

  public save( // NOSONAR
    layer: MapLayer, crs: L.CRS, tileLayer: L.TileLayer, minZoom: number, maxZoom: number, bounds: L.LatLngBounds[], paths: L.LatLngExpression[], pathAroundMeters: number
  ): void {
    if (!this._db) return;
    new Saver(this._db, layer, crs, tileLayer, minZoom, maxZoom, bounds, paths, pathAroundMeters, this.injector).start();
    for (const b of bounds) {
      this.saveRestrictedWays(b);
      this.savePOIs(b);
    }
  }

  public getTile(layerName: string, coords: L.Coords): Observable<BinaryContent | undefined> {
    return this.ngZone.runOutsideAngular(() => {
      if (!this._db) return of(undefined);
      return from(this._db.table<TileBlob>(layerName + '_tiles').get('' + coords.z + '_' + coords.y + '_' + coords.x)).pipe(
        map(result => {
          const blob = result?.blob;
          if (!blob) return undefined;
          return new BinaryContent(blob);
        })
      );
    });
  }

  public computeContent(): Observable<{items: number, size: number}> {
    const startTime = Date.now();
    return combineLatest(this.layers.layers.map(layer => this.computeLayerContent(layer.name))).pipe(
      map(list => {
        const result = {items: 0, size: 0};
        for (const layer of list) {
          result.items += layer.items;
          result.size += layer.size;
        }
        Console.info('Offline map counters computed in ' + (Date.now() - startTime) + 'ms.', result);
        return result;
      })
    );
  }

  private computeLayerContent(name: string): Observable<{items: number, size: number}> {
    const result = {items: 0, size: 0};
    if (!this._db) return of(result);
    const t = this._db.table<TileMetadata>(name + '_meta');
    return from(t.count().then(count => {
      result.items = count;
      if (count === 0) return result;
      const next = (i: number): Promise<void> => {
        const next$ = t.offset(i).limit(i + 50000 > count ? count - i : 50000).toArray()
          .then(items => {
            for (const item of items) result.size += item.size;
          });
        return i + 50000 > count ? next$ : next$.then(() => next(i + 50000));
      };
      return next(0).then(() => result);
    }));
  }

  private saveRestrictedWays(bounds: L.LatLngBounds): void {
    this.geoService.findWays(bounds, true).subscribe(
      ways => {
        if (!this._db) return;
        this._db.table('osm_restricted_ways').bulkPut(ways.map(w => ({...w, date: Date.now()})));
      }
    );
  }

  private savePOIs(bounds: L.LatLngBounds): void {
    this.geoService.findPOI(bounds).subscribe(
      pois => {
        if (!this._db) return;
        this._db.table('osm_poi').bulkPut(pois.map(p => ({...p, date: Date.now()})));
      }
    );
  }

  public getRestrictedWays(bounds: L.LatLngBounds): Observable<Way[]> {
    if (!this._db) return of([]);
    return from(this._db.table('osm_restricted_ways').toArray()).pipe(
      map(ways => ways.filter(way => {
        if (!way.bounds) return false;
        if (!way.bounds.minlat || !way.bounds.maxlat || !way.bounds.minlon || !way.bounds.maxlon) return false;
        if (way.bounds.minlat < bounds.getSouth()) return false;
        if (way.bounds.maxlat > bounds.getNorth()) return false;
        if (way.bounds.minlon < bounds.getWest()) return false;
        if (way.bounds.maxlon > bounds.getEast()) return false;
        return true;
      }))
    );
  }

  public getPOIs(bounds: L.LatLngBounds): Observable<POI[]> {
    if (!this._db) return of([]);
    return from(this._db.table('osm_poi').toArray()).pipe(
      map(pois => pois.filter(p => {
        return bounds.contains(p.pos);
      }))
    );
  }

  private cleanExpiredRestrictedWays(db: Dexie): void {
    if (db !== this._db) return;
    let count = 0;
    Console.info('Cleaning restricted ways');
    db.transaction('rw', ['osm_restricted_ways'], () => {
      db.table('osm_restricted_ways')
      .where('date')
      .below(Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000)
      .eachPrimaryKey(key => {
        db.table('osm_restricted_ways').delete(key);
        count++;
      }).then(() => {
        Console.info('Restricted ways removed: ', count);
      });
    });
  }

  private cleanExpiredTimeout() {
    const db = this._db!;
    const lastClean = localStorage.getItem('trailence.map-offline.last-cleaning.' + this._openEmail);
    const lastCleanTime = lastClean ? Number.parseInt(lastClean) : undefined;
    const nextClean = lastCleanTime && !Number.isNaN(lastCleanTime) ? lastCleanTime + 24 * 60 * 60 * 1000 : Date.now() + 60000;
    this._cleanExpiredTimeout = setTimeout(() => {
      if (db !== this._db) return;
      this._cleanExpiredTimeout = undefined;
      if (this.traceRecorder.recording) {
        this.cleanExpiredTimeout();
        return;
      }
      this.cleanExpired(db);
    }, Math.max(nextClean - Date.now(), 60000));
  }

  private cleanExpired(db: Dexie): void {
    for (let i = 0; i < this.layers.layers.length; ++i) {
      const name = this.layers.layers[i].name;
      setTimeout(() => this.cleanExpiredLayer(db, name), 60000 + i * 15000);
    }
    this.cleanExpiredRestrictedWays(db);
    setTimeout(() => {
      if (this._db === db) {
        localStorage.setItem('trailence.map-offline.last-cleaning.' + this._openEmail, '' + Date.now());
        Console.info('All offline maps cleaned, next cleaning in 24 hours');
      }
    }, 60000 + this.layers.layers.length * 15000 + 30000);
  }

  private cleanExpiredLayer(db: Dexie, layerName: string): void {
    if (db !== this._db) return;
    let count = 0;
    Console.info('Cleaning offline maps: ' + layerName);
    db.transaction('rw', [layerName + '_meta', layerName + '_tiles'], () => {
      db.table<TileMetadata, string>(layerName + '_meta')
      .where('date')
      .below(Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000)
      .eachPrimaryKey(key => {
        this.cleanExpiredTile(db, layerName, key);
        count++;
      }).then(() => {
        Console.info('Offline maps removed: ', layerName, count);
      });
    });
  }

  private cleanExpiredTile(db: Dexie, layerName: string, key: string): void {
    if (db !== this._db) return;
    db.table<TileMetadata, string>(layerName + '_meta').delete(key);
    db.table<TileBlob, string>(layerName + '_tiles').delete(key);
  }

  public removeAll(): Observable<any> {
    const promises = [];
    for (const layer of this.layers.layers) {
      promises.push(
        from(this._db!.table(layer.name + '_meta').clear()),
        from(this._db!.table(layer.name + '_tiles').clear()),
      );
    }
    if (promises.length === 0) return of(null);
    return zip(promises);
  }

}

class Saver {

  constructor(
    private readonly db: Dexie,
    private readonly layer: MapLayer,
    private readonly crs: L.CRS,
    private readonly tileLayer: L.TileLayer,
    private readonly minZoom: number,
    private readonly maxZoom: number,
    private readonly bounds: L.LatLngBounds[],
    private readonly paths: L.LatLngExpression[],
    private readonly pathAroundMeters: number,
    private readonly injector: Injector,
  ) {
    this.limiter = new RequestLimiter(layer.maxConcurrentRequests);
    this.i18n = injector.get(I18nService);
    this.mapLayerService = injector.get(MapLayersService);
    this.progress = injector.get(ProgressService).create(new TranslatedString('offline_map.downloading.progress_title', [layer.displayName]).translate(this.i18n), 1, () => {
      this.cancelled = true;
      this.limiter.cancel();
      this.progress.done();
    });
    this.currentZoom = minZoom;
    this.maxCacheValidDate = Date.now() - injector.get(PreferencesService).preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000;
  }

  public start(): void {
    setTimeout(() => {
      this.process(this.minZoom)
      .then(() => {
        // TODO retry errors
        this.progress.done();
        let nbErrors = 0;
        for (const [zoom, tiles] of this.errorsByZoom) {
          nbErrors += tiles.length;
        }
        if (nbErrors > 0) this.injector.get(ErrorService).addError(new I18nError('errors.download_offline_map', [nbErrors]));
      })
    }, 0);
  }

  private readonly limiter: RequestLimiter;
  private readonly progress: Progress;
  private readonly i18n: I18nService;
  private readonly mapLayerService: MapLayersService;

  private cancelled = false;
  private currentZoom: number;
  private readonly maxCacheValidDate: number;
  private readonly errorsByZoom = new Map<number, L.Point[]>();

  private process(zoomLevel: number): Promise<any> {
    this.currentZoom = zoomLevel;
    return this.processCurrentZoom()
    .then(() => {
      if (this.currentZoom === this.maxZoom || this.cancelled) return;
      return this.process(this.currentZoom + 1);
    })
  }

  private processCurrentZoom(): Promise<any> {
    return this.calculateTilesCurrentZoom()
    .then(tiles => {
      if (tiles.length === 0) return Promise.resolve();
      return this.downloadTiles(this.currentZoom, tiles);
    })
  }

  private calculateTilesCurrentZoom(): Promise<L.Point[]> {
    const workAmount = this.getCalculationWorkAmount(this.currentZoom) + this.getCheckExistingsWorkAmount(this.currentZoom);
    this.progress.workDone = 0;
    this.progress.workAmount = workAmount + 1;
    this.progress.subTitle = 'Zoom ' + this.currentZoom + ': ' + this.i18n.texts.offline_map.downloading.calculating;
    const calculation$ = this.currentZoom <= 17 || this.paths.length === 0 ? this.calculateTilesFromBounds(this.currentZoom, this.bounds) : this.calculateTilesFromPaths(this.currentZoom, this.paths);
    return calculation$.then(tiles => {
      if (this.cancelled) return [];
      return this.checkExistingTiles(tiles, this.currentZoom);
    });
  }

  private getCalculationWorkAmount(zoomLevel: number): number {
    return zoomLevel <= 17 ? zoomLevel * zoomLevel + 1 : zoomLevel * zoomLevel * 2;
  }

  private addPoints(points: L.Point[], area: L.Bounds): void {
    if (area.min && area.max) {
      const topLeftTile = area.min.divideBy(this.layer.tileSize).floor();
      const bottomRightTile = area.max.divideBy(this.layer.tileSize).floor();

      for (let y = topLeftTile.y; y <= bottomRightTile.y; ++y) {
        for (let x = topLeftTile.x; x <= bottomRightTile.x; ++x) {
          if (!points.some(p => p.x === x && p.y === y))
            points.push(new L.Point(x, y));
        }
      }
    }
  }

  private calculateTilesFromBounds(zoomLevel: number, bounds: L.LatLngBounds[]): Promise<L.Point[]> {
    const points: L.Point[] = [];
    let work = this.getCalculationWorkAmount(zoomLevel);
    const nextBound = (boundIndex: number) => new Promise<L.Point[]>(resolve => {
      if (this.cancelled) {
        resolve([]);
        return;
      }
      if (boundIndex >= bounds.length) {
        this.progress.addWorkDone(work);
        resolve(points);
        return;
      }
      const bound = bounds[boundIndex];
      const area = L.bounds(
        this.crs.latLngToPoint(bound.getNorthWest(), zoomLevel),
        this.crs.latLngToPoint(bound.getSouthEast(), zoomLevel)
      );
      this.addPoints(points, area);
      const amountDone = Math.floor(work / (bounds.length - boundIndex));
      this.progress.addWorkDone(amountDone);
      work -= amountDone;
      setTimeout(() => nextBound(boundIndex + 1).then(resolve), 0);
    });
    return nextBound(0);
  }

  private calculateTilesFromPaths(zoomLevel: number, paths: L.LatLngExpression[]): Promise<L.Point[]> {
    let work = this.getCalculationWorkAmount(zoomLevel);
    const points: L.Point[] = [];
    const samplePoint = this.crs.latLngToPoint(paths[0], zoomLevel);
    const pixelLatDistance = this.crs.pointToLatLng(L.point(samplePoint.x, samplePoint.y + 1), zoomLevel).distanceTo(paths[0]);
    const pixelLngDistance = this.crs.pointToLatLng(L.point(samplePoint.x + 1, samplePoint.y), zoomLevel).distanceTo(paths[0]);
    const latPixels = Math.round(this.pathAroundMeters / pixelLatDistance) + 1;
    const lngPixels = Math.round(this.pathAroundMeters / pixelLngDistance) + 1;

    const computeNextPoints = (index: number) => new Promise<L.Point[]>(resolve => {
      if (this.cancelled) {
        resolve([]);
        return;
      }
      const nbPoints = Math.min(100, paths.length - index);
      const workAmount = index + nbPoints === paths.length ? work : nbPoints * work / (paths.length - index);
      work -= workAmount;
      for (let i = index; i < index + nbPoints; ++i) {
        const pos = paths[i];
        const point = this.crs.latLngToPoint(pos, zoomLevel);
        const northWest = L.point(point.x - lngPixels, point.y - latPixels);
        const southEast = L.point(point.x + lngPixels, point.y + latPixels);
        const area = L.bounds(northWest, southEast);
        this.addPoints(points, area);
      }
      this.progress.addWorkDone(workAmount);
      if (index + nbPoints === paths.length) {
        resolve(points);
      } else {
        setTimeout(() => computeNextPoints(index + nbPoints).then(resolve), 0);
      }
    });
    return computeNextPoints(0);
  }

  private getCheckExistingsWorkAmount(zoomLevel: number) {
    return zoomLevel * zoomLevel + 1;
  }

  private checkExistingTiles(tiles: L.Point[], zoomLevel: number): Promise<L.Point[]> {
    const metaTable = this.db.table<TileMetadata>(this.layer.name + '_meta');
    return metaTable.bulkGet(tiles.map(tile => this.getDbKey(tile.x, tile.y, zoomLevel)))
    .then(metas => {
      if (this.cancelled) return [];
      const result: L.Point[] = [];
      for (let i = 0; i < tiles.length; ++i) {
        const meta = metas[i];
        if (meta && meta.date > this.maxCacheValidDate) continue; // already there
        result.push(tiles[i]);
      }
      this.progress.addWorkDone(this.getCheckExistingsWorkAmount(zoomLevel));
      return result;
    })
  }

  private getDbKey(x: number, y: number, z: number): string {
    return '' + z + '_' + y + '_' + x;
  }

  private downloadTiles(zoomLevel: number, tiles: L.Point[]): Promise<any> {
    this.progress.workDone = 0;
    this.progress.workAmount = tiles.length + 1;
    this.progress.subTitle = 'Zoom ' + zoomLevel + ': 0/' + tiles.length;
    let done = 0;
    const metaTable = this.db.table<TileMetadata>(this.layer.name + '_meta');
    const tilesTables = this.db.table<TileBlob>(this.layer.name + '_tiles');
    const processNext1000 = (startIndex: number) => new Promise(resolve => {
      const requests: Observable<{blob: Blob | undefined, key: string, tile: L.Point, error: any}>[] = [];
      for (let i = startIndex; i < startIndex + 1000 && i < tiles.length; ++i) {
        const c = tiles[i];
        (c as any)['z'] = zoomLevel;
        const key = this.getDbKey(c.x, c.y, zoomLevel);
        requests.push(this.limiter.add(() =>
          this.mapLayerService.getBlob(this.layer, this.layer.getTileUrl(this.tileLayer, c as L.Coords, this.crs))
          .pipe(
            map(blob => ({blob, key, tile: c, error: undefined})),
            catchError(e => of({blob: undefined, key, tile: c, error: e})),
          )
        ));
      }
      merge(...requests).pipe(
        bufferCount(50),
        switchMap(bunch => {
          const metadata: TileMetadata[] = [];
          const tiles: TileBlob[] = [];
          for (const response of bunch) {
            if (response.error === undefined) {
              metadata.push({
                key: response.key,
                size: response.blob!.size,
                date: Date.now(),
              });
              tiles.push({
                key: response.key,
                blob: response.blob!,
              });
            } else {
              Console.error('Error loading map tile', response.error);
              const errors = this.errorsByZoom.get(zoomLevel);
              if (errors) errors.push(response.tile);
              else this.errorsByZoom.set(zoomLevel, [response.tile]);
            }
          }
          return metadata.length === 0 ? of(bunch.length) : zip([
            from(metaTable.bulkPut(metadata)),
            from(tilesTables.bulkPut(tiles))
          ]).pipe(
            map(() => bunch.length),
            catchError(e => {
              Console.error('Error storing map tiles', e);
              const errors = this.errorsByZoom.get(zoomLevel);
              if (errors) errors.push(...bunch.map(r => r.tile));
              else this.errorsByZoom.set(zoomLevel, bunch.map(r => r.tile));
              return of(bunch.length);
            })
          );
        }),
        tap(bunch => {
          done += bunch;
          this.progress.subTitle = 'Zoom ' + zoomLevel + ': ' + done + '/' + tiles.length;
          this.progress.addWorkDone(bunch);
        })
      ).subscribe({
        complete: () => {
          if (this.cancelled) {
            resolve(false);
            return;
          }
          if (startIndex + 1000 >= tiles.length) {
            resolve(true);
          } else {
            processNext1000(startIndex + 1000).then(resolve);
          }
        }
      });
    });
    return processNext1000(0);
  }

}
