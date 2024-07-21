import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';
import { MapLayer, MapLayersService } from './map-layers.service';
import { ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { Observable, combineLatest, from, map, of, zip } from 'rxjs';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { HttpService } from '../http/http.service';
import { BinaryContent } from 'src/app/utils/binary-content';
import { PreferencesService } from '../preferences/preferences.service';
import { TraceRecorderService } from '../trace-recorder/trace-recorder.service';

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
    private layers: MapLayersService,
    private progressService: ProgressService,
    private i18n: I18nService,
    private http: HttpService,
    private preferencesService: PreferencesService,
    private traceRecorder: TraceRecorderService,
  ) {
    auth.auth$.subscribe(
      auth => {
        if (!auth) this.close();
        else this.open(auth.email);
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
    db.version(1).stores(storesV1);
    this._db = db;
    this.cleanExpiredTimeout();
  }

  public save(bounds: L.LatLngBounds[], tiles: L.TileLayer, crs: L.CRS, layer: MapLayer): void {
    const coords: L.Coords[] = [];
    for (const b of bounds) {
      const c = this.computeTilesCoords(b, tiles, crs);
      for (const coord of c) {
        const exists = coords.find(e => e.x === coord.x && e.y === coord.y && e.z === coord.z);
        if (!exists) coords.push(coord);
      }
    }
    if (coords.length === 0) return;
    const progress = this.progressService.create(this.i18n.texts.downloading_map, coords.length);
    const db = this._db!;
    const metaTable = db.table<TileMetadata>(layer.name + '_meta');
    const tilesTables = db.table<TileBlob>(layer.name + '_tiles');
    const existing$: Observable<TileMetadata | undefined>[] = [];
    for (const c of coords) {
      const key = '' + c.z + '_' + c.y + '_' + c.x;
      existing$.push(from(metaTable.get(key)));
    }
    const maxTime = Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000;
    combineLatest(existing$).subscribe(
      result => {
        const coordsToDl = [];
        for (let i = 0; i < coords.length; ++i) {
          const known = result[i];
          if (known && known.date > maxTime) continue;
          coordsToDl.push(coords[i]);
        }
        if (coordsToDl.length === 0) {
          progress.done();
          return;
        }
        progress.subTitle = layer.displayName + ' 0/' + coordsToDl.length;
        progress.workAmount = coordsToDl.length;
        const limiter = new RequestLimiter(layer.maxConcurrentRequests);
        let done = 0;
        for (const c of coordsToDl) {
          const request$ = limiter.add(() => this.http.getBlob(layer.getTileUrl(tiles, c, crs)));
          request$.subscribe({
            next: blob => {
              zip([
                from(metaTable.put({
                  key: '' + c.z + '_' + c.y + '_' + c.x,
                  size: blob.size,
                  date: Date.now()
                })),
                from(tilesTables.put({
                  key: '' + c.z + '_' + c.y + '_' + c.x,
                  blob: blob
                }))
              ]).subscribe(() => {
                progress.workDone = ++done;
                progress.subTitle = layer.displayName + ' ' + done + '/' + coordsToDl.length;
                if (done === coordsToDl.length) progress.done();
              });
            },
            error: e => {
              progress.workDone = ++done;
              progress.subTitle = layer.displayName + ' ' + done + '/' + coordsToDl.length;
              if (done === coordsToDl.length) progress.done();
            }
          });
        }
      }
    );
  }

  public computeTilesCoords(bounds: L.LatLngBounds, layer: L.TileLayer, crs: L.CRS): L.Coords[] {
    const coords: L.Coords[] = [];
    const maxZoom = this.preferencesService.preferences.offlineMapMaxZoom;
    for (let zoom = 1; zoom <= Math.min(layer.options.maxZoom!, maxZoom); zoom++) {
      const area = L.bounds(
        crs.latLngToPoint(bounds.getNorthWest(), zoom),
        crs.latLngToPoint(bounds.getSouthEast(), zoom)
      );
      const points = this.getTilesPoints(area, layer.getTileSize());
      for (const point of points) {
        (point as any)['z'] = zoom;
        coords.push(point as L.Coords);
      }
    }
    return coords;
  }

  public getTilesPoints(area: L.Bounds, tileSize: L.Point): L.Point[] {
    const points: L.Point[] = [];
    if (!area.min || !area.max) {
      return points;
    }
    const topLeftTile = area.min.divideBy(tileSize.x).floor();
    const bottomRightTile = area.max.divideBy(tileSize.x).floor();

    for (let j = topLeftTile.y; j <= bottomRightTile.y; j += 1) {
      for (let i = topLeftTile.x; i <= bottomRightTile.x; i += 1) {
        points.push(new L.Point(i, j));
      }
    }
    return points;
  }

  public getTile(layerName: string, coords: L.Coords): Observable<BinaryContent | undefined> {
    if (!this._db) return of(undefined);
    return from(this._db.table<TileBlob>(layerName + '_tiles').get('' + coords.z + '_' + coords.y + '_' + coords.x)).pipe(
      map(result => {
        const blob = result?.blob;
        if (!blob) return undefined;
        return new BinaryContent(blob);
      })
    );
  }

  public computeContent(): Observable<{items: number, size: number}> {
    return combineLatest(this.layers.layers.map(layer => this.computeLayerContent(layer.name))).pipe(
      map(list => {
        const result = {items: 0, size: 0};
        for (const layer of list) {
          result.items += layer.items;
          result.size += layer.size;
        }
        return result;
      })
    );
  }

  private computeLayerContent(name: string): Observable<{items: number, size: number}> {
    const result = {items: 0, size: 0};
    if (!this._db) return of(result);
    return from(this._db.table<TileMetadata>(name + '_meta').each((item => {
      result.items++;
      result.size += item.size;
    }))).pipe(
      map(() => result)
    );
  }

  private cleanExpiredTimeout() {
    const db = this._db!;
    this._cleanExpiredTimeout = setTimeout(() => {
      if (db !== this._db) return;
      this._cleanExpiredTimeout = undefined;
      if (this.traceRecorder.recording) {
        this.cleanExpiredTimeout();
        return;
      }
      this.cleanExpired(db);
    }, 2 * 60 * 1000);
  }

  private cleanExpired(db: Dexie): void {
    for (let i = 0; i < this.layers.layers.length; ++i) {
      const name = this.layers.layers[i].name;
      setTimeout(() => this.cleanExpiredLayer(db, name), i * 60000);
    }
  }

  private cleanExpiredLayer(db: Dexie, layerName: string): void {
    if (db !== this._db) return;
    let count = 0;
    console.log('Cleaning offline maps: ' + layerName);
    db.table<TileMetadata, string>(layerName + '_meta')
      .where('date')
      .below(Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000)
      .eachPrimaryKey(key => {
        this.cleanExpiredTile(db, layerName, key);
        count++;
      }).then(() => {
        console.log('Offline maps removed: ', layerName, count);
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
      promises.push(from(this._db!.table(layer.name + '_meta').clear()));
      promises.push(from(this._db!.table(layer.name + '_tiles').clear()));
    }
    return zip(promises);
  }

}
